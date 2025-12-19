from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen
from typing import List, Optional

from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .update_manager import UpdateManager


# ======================================================================================
# Utilidades de caminho / binários (funciona em dev e empacotado)
# ======================================================================================

ROOT_DIR = Path(__file__).resolve().parents[1]  # ./my-app
BACKEND_DIR = Path(__file__).resolve().parent   # ./my-app/backend
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
APP_VERSION = os.environ.get("APP_VERSION", "4.2")


def resource_path(rel: str | Path) -> Path:
    """
    Quando empacotado (PyInstaller --onefile), os arquivos adicionados com --add-binary
    são extraídos em sys._MEIPASS. No dev, usa a pasta do arquivo.
    """
    base = Path(getattr(sys, "_MEIPASS", BACKEND_DIR))
    return (base / rel).resolve()


def safe_bin(name: str) -> Path:
    """
    Procura executáveis tanto dentro do backend empacotado quanto
    na pasta ../bin ao lado do executável (modo distribuição).
    """
    base_dir = Path(getattr(sys, "_MEIPASS", BACKEND_DIR))
    # Quando empacotado, os binários estão em base_dir / 'bin'
    packaged_path = base_dir / "bin" / name
    # No modo dev, ou se o binário estiver ao lado do executável
    fallback_path = base_dir.parent / "bin" / name

    if packaged_path.exists():
        return packaged_path
    if fallback_path.exists():
        return fallback_path
    print(f"[WARN] Executável não encontrado: {name}")
    return Path(name)


FFMPEG_EXE  = safe_bin("ffmpeg.exe")
FFPROBE_EXE = safe_bin("ffprobe.exe")
YTDLP_EXE   = safe_bin("yt-dlp.exe")

AUDIO_FORMATS = {"mp3", "m4a", "wav", "flac"}
DISCORD_TARGET_BYTES = 9 * 1024 * 1024
INSTAGRAM_HOST_RE = re.compile(r"(?:https?://)?(?:www\.|m\.)?instagram\.com/", re.IGNORECASE)
FACEBOOK_HOST_RE = re.compile(r"(?:https?://)?(?:www\.|m\.)?(facebook\.com|fb\.watch)/", re.IGNORECASE)
TWITTER_HOST_RE = re.compile(r"(?:https?://)?(?:www\.)?(twitter\.com|x\.com)/", re.IGNORECASE)
VIDEO_EXTS = {"mp4", "mkv", "mov", "webm", "avi"}
IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}

# Ordem preferida de encoders acelerados por hardware (GPU) suportados.
HW_ENCODER_ORDER = [
    ("nvidia", "h264_nvenc"),
    ("intel", "h264_qsv"),
    ("amd", "h264_amf"),
    ("apple", "h264_videotoolbox"),
]
# Ajustes extras aplicados a cada encoder, quando necessǭrio.
HW_ENCODER_EXTRA_ARGS: dict[str, list[str]] = {
    "h264_nvenc": ["-preset", "p5"],
    "h264_qsv": ["-preset", "medium"],
    "h264_amf": ["-quality", "balanced"],
    "h264_videotoolbox": [],
}

_HW_ENCODER_DETECTED: list[str] | None = None
_HW_ENCODER_LOCK = threading.Lock()


# ======================================================================================
# App & CORS
# ======================================================================================

app = FastAPI(title="Ultra Downloader Backend", version="1.0")

# Endpoint de check removido para silenciar updates


async def run_ytdlp_update_task():
    try:
        ws_manager.broadcast_threadsafe({"ytdlp_status": "Iniciando atualização do yt-dlp..."})
        
        # 1. Identificar URL do asset
        latest = await asyncio.to_thread(YTDLP_UPDATER.get_latest_release, False)
        if not latest:
            raise Exception("Não foi possível obter informações da versão mais recente.")
            
        asset_url = None
        asset_name = "yt-dlp.exe"
        
        # Procura asset compatível (windows exe)
        for asset in latest.assets:
            name = str(asset.get("name", "")).lower()
            if name == "yt-dlp.exe" or name == "yt-dlp_win.exe":
                asset_url = asset.get("browser_download_url") or asset.get("url")
                asset_name = asset.get("name")
                break
        
        if not asset_url:
            # Fallback: tenta pegar o primeiro executável ou o próprio 'yt-dlp' (linux/mac) se fosse o caso, 
            # mas aqui focamos em windows
            raise Exception("Nenhum executável compatível encontrado na release.")

        ws_manager.broadcast_threadsafe({"ytdlp_status": f"Baixando {latest.version}..."})

        # 2. Baixar para temp
        tmp_dir = Path(tempfile.gettempdir()) / "ud_ytdlp_update"
        tmp_dir.mkdir(exist_ok=True)
        tmp_file = tmp_dir / asset_name
        
        def download_file():
            with urlopen(asset_url, timeout=60) as response, open(tmp_file, "wb") as out_file:
                shutil.copyfileobj(response, out_file)
                
        await asyncio.to_thread(download_file)
        
        ws_manager.broadcast_threadsafe({"ytdlp_status": "Verificando integridade..."})
        if not tmp_file.exists() or tmp_file.stat().st_size < 1000:
            raise Exception("Download falhou ou arquivo corrompido.")

        # 3. Substituir
        ws_manager.broadcast_threadsafe({"ytdlp_status": "Substituindo binário..."})
        
        target = YTDLP_EXE
        backup = target.with_suffix(".bak")
        
        # Tenta renomear o atual para .bak (windows não deixa sobrescrever exe em uso, mas deixa renomear)
        if target.exists():
            try:
                if backup.exists():
                    os.remove(backup)
                target.rename(backup)
            except OSError:
                # Se falhar renomear, tenta mover/deletar de outra forma ou falha
                pass
        
        try:
            shutil.move(str(tmp_file), str(target))
            # Se sucesso, tenta remover backup
            if backup.exists():
                try:
                    os.remove(backup)
                except:
                    pass
        except Exception as e:
            # Rollback
            if backup.exists() and not target.exists():
                backup.rename(target)
            raise e
            
        new_ver = await asyncio.to_thread(get_local_ytdlp_version)
        ws_manager.broadcast_threadsafe({
            "ytdlp_status": "Concluído", 
            "ytdlp_updated": True, 
            "new_version": new_ver
        })
        
    except Exception as e:
        print(f"Erro update yt-dlp: {e}")
        ws_manager.broadcast_threadsafe({"ytdlp_status": f"Erro: {str(e)}"})

@app.post("/ytdlp/update")
async def update_ytdlp_endpoint(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_ytdlp_update_task)
    return {"status": "Update started"}

app = FastAPI(title="Ultra Downloader Backend", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "app://.",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir assets do build do frontend (se existirem)
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")


# ======================================================================================
# WebSocket manager (broadcast seguro a partir de threads)
# ======================================================================================

class WSManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, ws: WebSocket):
        # Aceita sem checar origin (evita 403)
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def _broadcast(self, payload: dict):
        dead: List[WebSocket] = []
        for ws in list(self.active):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def broadcast_threadsafe(self, payload: dict):
        """
        Pode ser chamado de QUALQUER thread (ex.: hooks do yt-dlp).
        """
        if self._loop and self._loop.is_running():
            try:
                asyncio.run_coroutine_threadsafe(self._broadcast(payload), self._loop)
            except RuntimeError:
                # loop não disponível — ignora silenciosamente
                pass


ws_manager = WSManager()
LATEST_UPDATE: Optional[dict] = None

# instância única do UpdateManager
UPDATER = UpdateManager(
    repo="lucasjordaoreal/YouTube-Downloader-Tool---yt_dlp-GUI",
    current_version=APP_VERSION,
    include_prereleases=False,
)

YTDLP_UPDATER = UpdateManager(
    repo="yt-dlp/yt-dlp",
    current_version="0.0.0",
    include_prereleases=False,
)

def get_local_ytdlp_version() -> str:
    try:
        cmd = [str(YTDLP_EXE), "--version"]
        # Cria startupinfo para esconder janela no Windows
        startupinfo = None
        if sys.platform == "win32":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        
        cp = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            check=False,
            startupinfo=startupinfo
        )
        if cp.returncode == 0:
            return cp.stdout.strip()
    except Exception:
        pass
    return "0.0.0"


# check_and_cache_update removido



@app.on_event("startup")
async def _on_startup():
    loop = asyncio.get_running_loop()
    ws_manager.set_loop(loop)

    # Limpeza de arquivos antigos de update (.old)
    try:
        if getattr(sys, "frozen", False):
            base_dir = Path(sys.executable).parent
            for old_file in base_dir.glob("*.old"):
                try:
                    os.remove(old_file)
                except Exception:
                    pass
    except Exception:
        pass

    # Tarefa de auto-update silencioso do APP
    async def _silent_app_update_task():
        # Aguarda um pouco para não impactar o boot imediato
        await asyncio.sleep(5)
        
        # Só roda se estiver empacotado (PyInstaller)
        if not getattr(sys, "frozen", False):
            return

        try:
            # 1. Checar versão
            latest = await asyncio.to_thread(UPDATER.get_latest_release, False)
            if not latest:
                return
            
            # Compara versões
            # Se a versão atual for menor que a latest, prossegue
            # (Assumindo que UPDATER.check_for_update faz essa validação, mas vamos fazer manual para garantir o fluxo)
            from .update_manager import _cmp_versions
            current_ver = APP_VERSION
            latest_ver = latest.version
            
            if _cmp_versions(current_ver, latest_ver) >= 0:
                return # Já está atualizado

            # 2. Encontrar asset .exe
            asset_url = None
            asset_name = "UltraDownloader.exe"
            
            for asset in latest.assets:
                name = str(asset.get("name", "")).lower()
                if name.endswith(".exe"):
                    asset_url = asset.get("browser_download_url") or asset.get("url")
                    asset_name = asset.get("name")
                    break
            
            if not asset_url:
                return

            # 3. Baixar silenciosamente
            tmp_dir = Path(tempfile.gettempdir()) / "ud_update_stage"
            tmp_dir.mkdir(exist_ok=True)
            tmp_file = tmp_dir / asset_name
            
            def download_update():
                with urlopen(asset_url, timeout=120) as response, open(tmp_file, "wb") as out_file:
                    shutil.copyfileobj(response, out_file)
            
            await asyncio.to_thread(download_update)
            
            if not tmp_file.exists() or tmp_file.stat().st_size < 10000:
                return # Download falhou

            # 4. Substituição Atômica (Rename + Move + Restart)
            current_exe = Path(sys.executable)
            old_exe = current_exe.with_suffix(".exe.old")
            
            # Renomeia executável atual (Windows permite renomear em uso)
            if old_exe.exists():
                try:
                    os.remove(old_exe)
                except:
                    pass
            
            current_exe.rename(old_exe)
            
            # Move o novo para o lugar do atual
            shutil.move(str(tmp_file), str(current_exe))
            
            # 5. Reiniciar Aplicação
            subprocess.Popen([str(current_exe)] + sys.argv[1:])
            sys.exit(0)

        except Exception as e:
            print(f"Silent update failed: {e}")
            # Em caso de falha crítica na substituição, tenta rollback se possível
            # (Mas aqui o rename já aconteceu, então o restart falharia se o move falhou.
            #  O ideal seria um try/except mais granular, mas para este script simples:
            #  se falhar o move, tentamos renomear de volta)
            try:
                if 'old_exe' in locals() and old_exe.exists() and not current_exe.exists():
                    old_exe.rename(current_exe)
            except:
                pass

    loop.create_task(_silent_app_update_task())

    # Checa update do yt-dlp silenciosamente (sem broadcast de 'update_available')
    async def _silent_ytdlp_check():
        try:
            if os.environ.get("AUTO_UPDATE_YTDLP", "1") == "1":
                await asyncio.to_thread(maybe_update_ytdlp)
        except Exception:
            pass
    
    loop.create_task(_silent_ytdlp_check())


# ======================================================================================
# Cancelamento
# ======================================================================================

class CanceledByUser(Exception):
    """Exceção interna para abortar downloads via hook do yt-dlp."""


class CancelToken:
    """Token simples, seguro para threads, para sinalizar cancelamento."""
    def __init__(self) -> None:
        self._ev = threading.Event()
    def cancel(self) -> None:
        self._ev.set()
    def is_cancelled(self) -> bool:
        return self._ev.is_set()


ACTIVE_TOKEN: Optional[CancelToken] = None  # token atual (download único ou fila)


# ======================================================================================
# Utilidades
# ======================================================================================

def _ensure_dir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p


DEFAULT_COMPRESS_DIR = _ensure_dir(ROOT_DIR / "downloads" / "compressed")

def _is_instagram_url(value: str | None) -> bool:
    if not value:
        return False
    return bool(INSTAGRAM_HOST_RE.search(str(value)))


def _is_facebook_url(value: str | None) -> bool:
    if not value:
        return False
    return bool(FACEBOOK_HOST_RE.search(str(value)))


def _is_twitter_url(value: str | None) -> bool:
    if not value:
        return False
    return bool(TWITTER_HOST_RE.search(str(value)))

def _read_clipboard() -> str:
    """
    Tenta ler o conteúdo de texto da área de transferência.
    Usa Tkinter quando disponível (mesma dependência do seletor de diretório)
    e possui fallback para Windows via PowerShell.
    """
    try:
        import tkinter as tk  # type: ignore

        root = tk.Tk()
        root.withdraw()
        try:
            data = root.clipboard_get()  # type: ignore[attr-defined]
        except Exception:
            data = ""
        finally:
            root.destroy()
        if isinstance(data, str):
            return data
        return str(data or "")
    except Exception:
        pass

    if sys.platform.startswith("win"):
        try:
            cp = subprocess.run(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-Command",
                    "Try { Get-Clipboard -Raw } Catch { '' }",
                ],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if cp.returncode == 0:
                return cp.stdout or ""
        except Exception:
            pass

    return ""


def _sanitize_filename(name: str) -> Optional[str]:
    """
    Remove caracteres inválidos para nomes de arquivo e normaliza espaços.
    Retorna None se o resultado ficar vazio.
    """
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1F]', "", name or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip().strip(".")
    if not cleaned:
        return None
    return cleaned[:120]

def _expected_extension(fmt: str) -> str:
    fmt_lower = (fmt or "").lower()
    return fmt_lower if fmt_lower in AUDIO_FORMATS else "mp4"


def _build_yt_args(
    fmt: str,
    resolution: str,
    quality: int,
    target_dir: Path,
    *,
    simple_mode: bool = False,
) -> dict:
    """
    Retorna as opcoes do YoutubeDL conforme formato (video/audio).
    Agora inclui embed de capas automaticamente para MP3 e M4A.
    """
    target_dir = _ensure_dir(target_dir)
    fmt_lower = fmt.lower()
    expected_ext = _expected_extension(fmt)
    outtmpl = str(target_dir / ("%(title)s.%(ext)s" if simple_mode else f"%(title)s.{expected_ext}"))

    common = {
        "ffmpeg_location": str(FFMPEG_EXE.parent),
        "outtmpl": {"default": outtmpl},
        "noprogress": True,
        "concurrent_fragment_downloads": 3,
        "retries": 10,
        "fragment_retries": 10,
        "ignore_no_formats_error": True,
        "no_warnings": True,
        "quiet": True,
        "windowsfilenames": True,
        "postprocessor_args": ["-metadata", "comment=UltraDownloader"],
    }

    if simple_mode:
        simple_opts = dict(common)
        simple_opts.pop("postprocessor_args", None)
        simple_opts["format"] = "best"
        simple_opts["noplaylist"] = False
        simple_opts["postprocessors"] = [{"key": "FFmpegMetadata"}]
        simple_opts["merge_output_format"] = "mp4"
        return simple_opts

    # === AUDIO ===
    if fmt_lower in AUDIO_FORMATS:
        pp = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": fmt_lower,
                "preferredquality": str(quality),
            },
            {"key": "FFmpegMetadata"},
        ]

        # So adiciona capa automaticamente para mp3 e m4a
        if fmt_lower in {"mp3", "m4a"}:
            pp.insert(1, {"key": "EmbedThumbnail"})  # precisa vir antes do metadata
            common["writethumbnail"] = True

        return {**common, "format": "bestaudio/best", "postprocessors": pp}

    # === VIDEO ===
    height = None
    if isinstance(resolution, str) and resolution.endswith("p") and resolution[:-1].isdigit():
        try:
            height = int(resolution[:-1])
        except ValueError:
            height = None

    if height:
        video_part = f"bv*[height<={height}][vcodec^=avc][ext=mp4]"
    else:
        video_part = "bv*[vcodec^=avc][ext=mp4]"
    
    # Enforce MP4 (H.264 + AAC)
    format_selector = f"{video_part}+ba[ext=m4a]/mp4"

    return {
        **common,
        "format": format_selector,
        "merge_output_format": "mp4",
        "postprocessors": [
            {"key": "FFmpegMetadata"},
            {"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"},
        ],
    }


def _bool_from(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "on", "yes", "y", "sim"}


def _parse_resolution_token(token: Optional[str]) -> Optional[int]:
    if not token:
        return None
    token = str(token).strip().lower()
    if token in {"auto", "original", "source", "none"}:
        return None
    if token.endswith("p") and token[:-1].isdigit():
        try:
            return max(144, int(token[:-1]))
        except ValueError:
            return None
    if token.isdigit():
        try:
            return max(144, int(token))
        except ValueError:
            return None
    return None


def _format_bytes(num: int) -> str:
    if num <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    idx = 0
    value = float(num)
    while value >= 1024 and idx < len(units) - 1:
        value /= 1024.0
        idx += 1
    precision = 0 if idx == 0 else (1 if value >= 10 else 2)
    return f"{value:.{precision}f} {units[idx]}"


def maybe_update_ytdlp():
    """
    Se AUTO_UPDATE_YTDLP=1, tenta atualizar o yt-dlp.exe embutido (se existir).
    Ignora falhas silenciosamente.
    """
    try:
        if os.environ.get("AUTO_UPDATE_YTDLP", "0") == "1" and YTDLP_EXE.exists():
            subprocess.run(
                [str(YTDLP_EXE), "-U"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
    except Exception:
        pass


def _download_one(url: str, ydl_opts: dict, token: Optional[CancelToken] = None):
    """
    Baixa um unico item com yt-dlp e emite progresso no WebSocket.
    Tambem tenta enviar 'saved_path' assim que o yt-dlp informar 'filename'
    no hook (status 'finished'), com fallback apos o download.
    Se 'token' estiver cancelado, aborta elegantemente.
    """

    def _guess_expected_ext(template: Optional[str]) -> Optional[str]:
        if not template:
            return None
        _, ext = os.path.splitext(template)
        if ext and "%" not in ext:
            return ext.lstrip('.').lower() or None
        return None

    def _first_ext_from(seq) -> Optional[str]:
        if not seq:
            return None
        for item in seq:
            if isinstance(item, dict):
                ext = item.get('ext')
                if ext:
                    return str(ext).strip('.') or None
        return None

    # Progress hook (chamado pelo yt-dlp em thread corrente)
    def _hook(d: dict):
        # Cancelamento rapido (checa varias vezes por segundo)
        if token and token.is_cancelled():
            raise CanceledByUser()

        try:
            status = d.get('status')
            if status in {'downloading', 'processing'}:
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes') or 0
                pct = 0.0
                if total:
                    pct = max(0.0, min(100.0, downloaded * 100.0 / total))
                ws_manager.broadcast_threadsafe({
                    'status': 'Baixando.' if status == 'downloading' else 'Processando.',
                    'progress': round(pct, 1),
                })

            elif status == 'finished':
                # Muitos casos ja trazem o caminho final aqui:
                info_dict = d.get('info_dict') or {}
                fn = (
                    d.get('filename')
                    or info_dict.get('filepath')
                    or info_dict.get('_filename')
                )
                payload = {'status': 'Concluindo', 'progress': 100.0}
                if fn:
                    p = Path(fn)
                    if p.exists():
                        payload['saved_path'] = str(p.resolve())
                ws_manager.broadcast_threadsafe(payload)

        except Exception:
            # Nunca deixar o hook quebrar
            pass

    from yt_dlp import YoutubeDL

    opts = dict(ydl_opts)
    outtmpl_opt = opts.get('outtmpl', {})
    if isinstance(outtmpl_opt, dict):
        template = outtmpl_opt.get('default')
    else:
        template = outtmpl_opt
    opts['progress_hooks'] = [_hook]

    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)

            expected_ext = (
                info.get('final_ext')
                or info.get('ext')
                or _first_ext_from(info.get('requested_downloads'))
                or _first_ext_from(info.get('requested_formats'))
                or opts.get('merge_output_format')
                or _guess_expected_ext(template)
            )
            if isinstance(expected_ext, str):
                expected_ext = expected_ext.strip('.').lower() or None
            else:
                expected_ext = None

            # Fallback caso o hook nao tenha entregue o arquivo final:
            saved_path = None
            if template:
                title = info.get('title', 'video')
                candidate = template
                if '%(title)s' in candidate:
                    candidate = candidate.replace('%(title)s', title)
                if '%(final_ext)s' in candidate and expected_ext:
                    candidate = candidate.replace('%(final_ext)s', expected_ext)
                cp = Path(candidate)

                candidate_paths = []
                candidate_paths.append(cp)
                fallback_exts = [
                    expected_ext,
                    info.get('final_ext'),
                    info.get('ext'),
                    _first_ext_from(info.get('requested_downloads')),
                    _first_ext_from(info.get('requested_formats')),
                    'mp4',
                    'mp3',
                    'm4a',
                    'wav',
                    'flac',
                ]
                for ex in fallback_exts:
                    if not ex:
                        continue
                    ex_clean = str(ex).strip('.')
                    if not ex_clean:
                        continue
                    try:
                        candidate_paths.append(cp.with_suffix(f'.{ex_clean}'))
                    except ValueError:
                        candidate_paths.append(Path(f'{cp}.{ex_clean}'))

                for cand in candidate_paths:
                    if isinstance(cand, Path) and cand.exists():
                        saved_path = cand.resolve()
                        break

            for k in ('filepath', '_filename'):
                v = info.get(k)
                if isinstance(v, str) and Path(v).exists():
                    saved_path = Path(v).resolve()
                    break

            if saved_path and saved_path.exists():
                if saved_path.suffix.upper() == '.NA' and expected_ext:
                    new_path = saved_path.with_suffix(f'.{expected_ext}')
                    if not new_path.exists():
                        try:
                            saved_path.rename(new_path)
                            saved_path = new_path
                        except Exception:
                            pass
                ws_manager.broadcast_threadsafe({
                    'status': 'Concluindo',
                    'progress': 100.0,
                    'saved_path': str(saved_path),
                })
            else:
                ws_manager.broadcast_threadsafe({
                    'status': 'Concluindo',
                    'progress': 100.0,
                })

    except CanceledByUser:
        # Aviso de cancelamento
        ws_manager.broadcast_threadsafe({
            'status': 'Cancelado pelo usuario',
            'progress': 0,
        })
        return
    except Exception as e:
        ws_manager.broadcast_threadsafe({
            'status': f'Erro: {e}',
        })


def _summarize_instagram(url: str) -> dict:
    from yt_dlp import YoutubeDL  # Import aqui para evitar custo desnecessário em módulos

    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
        "simulate": True,
    }

    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    if not isinstance(info, dict):
        return {"is_carousel": False, "entry_count": 0, "video_count": 0, "image_count": 0}

    entries = []
    if info.get("_type") == "playlist":
        for entry in info.get("entries") or []:
            if entry:
                entries.append(entry)
    else:
        entries.append(info)

    video_count = 0
    image_count = 0
    for entry in entries:
        ext = str(entry.get("ext") or "").lower()
        vcodec = str(entry.get("vcodec") or "").lower()
        formats = entry.get("formats") or []
        url = str(entry.get("url") or "")
        thumbnails = entry.get("thumbnails") or []
        media_type = entry.get("media_type")
        resource = str(entry.get("resource") or "").lower()
        type_str = str(entry.get("type") or "").lower()

        def _has_video() -> bool:
            if str(media_type) == "2":
                return True
            if media_type == "video":
                return True
            if resource in {"video", "dash"}:
                return True
            if "video" in type_str:
                return True
            if ext in VIDEO_EXTS:
                return True
            if vcodec and vcodec != "none":
                return True
            for fmt in formats:
                fmt_ext = str(fmt.get("ext") or "").lower()
                fmt_vc = str(fmt.get("vcodec") or "").lower()
                if fmt_ext in VIDEO_EXTS or (fmt_vc and fmt_vc != "none"):
                    return True
            return False

        has_video = _has_video()

        def _has_image() -> bool:
            if str(media_type) == "1":
                return True
            if media_type == "image":
                return True
            if resource in {"photo", "image"}:
                return True
            if "image" in type_str or "photo" in type_str:
                return True
            if ext in IMAGE_EXTS:
                return True
            for fmt in formats:
                fmt_ext = str(fmt.get("ext") or "").lower()
                if fmt_ext in IMAGE_EXTS:
                    return True
            if url:
                path_ext = Path(urlparse(url).path).suffix.lower().lstrip(".")
                if path_ext in IMAGE_EXTS:
                    return True
            for thumb in thumbnails:
                t_url = str(thumb.get("url") or "")
                if not t_url:
                    continue
                path_ext = Path(urlparse(t_url).path).suffix.lower().lstrip(".")
                if path_ext in IMAGE_EXTS:
                    return True
            return False

        has_image = _has_image()
        if not has_video and not has_image:
            if not entry.get("duration") and entry.get("thumbnail"):
                has_image = True
            elif not entry.get("duration") and entry.get("height"):
                has_image = True

        if not has_video and not has_image:
            has_image = True  # assume imagem se nada indicar vídeo

        if has_video:
            video_count += 1
        if has_image and not has_video:
            image_count += 1

    return {
        "is_carousel": info.get("_type") == "playlist",
        "entry_count": len(entries),
        "video_count": video_count,
        "image_count": image_count,
        "title": info.get("title"),
        "uploader": info.get("uploader") or info.get("uploader_id"),
        "description": info.get("description"),
    }


def _probe_media(path: Path) -> dict:
    cmd = [
        str(FFPROBE_EXE),
        "-v",
        "error",
        "-show_entries",
        "format=duration,size:stream=width,height",
        "-of",
        "json",
        str(path),
    ]
    cp = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if cp.returncode != 0:
        raise RuntimeError(f"ffprobe falhou ({cp.returncode}): {cp.stderr.strip()}")
    try:
        data = json.loads(cp.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Não foi possível ler informações do vídeo: {exc}") from exc

    format_info = data.get("format") or {}
    streams = data.get("streams") or []
    video_stream = streams[0] if streams else {}
    duration = float(format_info.get("duration") or 0.0)
    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)
    size = int(float(format_info.get("size") or path.stat().st_size))
    if duration <= 0:
        raise RuntimeError("Vídeo sem duração válida para compressão.")
    return {"duration": duration, "width": width, "height": height, "size": size}


def _unique_output_path(base_dir: Path, base_name: str, suffix: str = ".mp4") -> Path:
    candidate = base_dir / f"{base_name}{suffix}"
    if not candidate.exists():
        return candidate
    for idx in range(1, 200):
        alt = base_dir / f"{base_name}-{idx}{suffix}"
        if not alt.exists():
            return alt
    unique = f"{base_name}-{uuid.uuid4().hex[:6]}"
    return base_dir / f"{unique}{suffix}"


def _run_ffmpeg_with_progress_sync(cmd: List[str], duration: float, token: Optional[CancelToken] = None) -> None:
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        universal_newlines=True,
        encoding="utf-8",
        errors="ignore",
    )
    last_lines: List[str] = []
    cancel_requested = False

    def _terminate():
        try:
            process.terminate()
        except Exception:
            pass
        try:
            process.wait(timeout=2)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass

    try:
        for raw_line in process.stdout:  # type: ignore[attr-defined]
            line = (raw_line or "").strip()
            if not line:
                continue
            if token and token.is_cancelled():
                cancel_requested = True
                _terminate()
                break
            last_lines.append(line)
            if len(last_lines) > 30:
                last_lines.pop(0)
            if line.startswith("out_time_ms="):
                try:
                    micro = int(line.split("=", 1)[1])
                    seconds = micro / 1_000_000.0
                    pct = max(0.0, min(100.0, (seconds / duration) * 100.0))
                    ws_manager.broadcast_threadsafe({
                        "task": "compressor",
                        "status": "Comprimindo...",
                        "progress": round(pct, 2),
                    })
                except Exception:
                    continue
    finally:
        stdout_remaining, _ = process.communicate()
        if stdout_remaining:
            for tail in (stdout_remaining.splitlines()[-10:]):
                if tail:
                    last_lines.append(tail.strip())
                    if len(last_lines) > 30:
                        last_lines.pop(0)
    if cancel_requested:
        raise CanceledByUser()
    if process.returncode not in (0, None):
        snippet = "\n".join(last_lines[-6:])
        raise RuntimeError(f"ffmpeg falhou ({process.returncode}). Detalhes:\n{snippet}")


async def _run_ffmpeg_with_progress(cmd: List[str], duration: float, token: Optional[CancelToken] = None) -> None:
    """
    Executa o ffmpeg em uma thread separada para nǜo bloquear o event loop enquanto envia progresso.
    """
    await asyncio.to_thread(_run_ffmpeg_with_progress_sync, cmd, duration, token)


def _ffmpeg_list_encoders() -> str:
    """
    Executa `ffmpeg -encoders` somente uma vez (cache) para descobrir os encoders de GPU.
    """
    cmd = [str(FFMPEG_EXE), "-hide_banner", "-encoders"]
    try:
        cp = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except Exception:
        return ""
    if cp.returncode != 0:
        return ""
    return cp.stdout or ""


def _detect_hw_encoders() -> list[str]:
    """
    Retorna a lista de encoders H.264 acelerados detectados no ffmpeg atual.
    """
    global _HW_ENCODER_DETECTED
    with _HW_ENCODER_LOCK:
        if _HW_ENCODER_DETECTED is not None:
            return list(_HW_ENCODER_DETECTED)
        output = _ffmpeg_list_encoders()
        found: list[str] = []
        for _, enc in HW_ENCODER_ORDER:
            if not enc:
                continue
            if re.search(rf"\b{re.escape(enc)}\b", output):
                found.append(enc)
        _HW_ENCODER_DETECTED = found
        return list(found)


def _select_video_encoder(preferred_mode: str) -> tuple[str, list[str], str]:
    """
    Seleciona o encoder de v��deo (CPU ou GPU) conforme prefer��ncia do usuǭrio.

    Retorna (encoder, argumentos_extras, modo_utilizado[\"cpu\"|\"gpu\"]).
    """
    requested = (preferred_mode or "cpu").strip().lower()
    if requested not in {"cpu", "gpu", "auto"}:
        requested = "cpu"

    available_hw = _detect_hw_encoders() if requested in {"gpu", "auto"} else []
    chosen_hw = available_hw[0] if available_hw else None

    if requested == "gpu" and not chosen_hw:
        raise HTTPException(
            status_code=400,
            detail="Nenhum encoder de GPU compat��vel foi encontrado no ffmpeg.",
        )

    if requested == "gpu" and chosen_hw:
        return chosen_hw, list(HW_ENCODER_EXTRA_ARGS.get(chosen_hw, [])), "gpu"

    if requested == "auto" and chosen_hw:
        return chosen_hw, list(HW_ENCODER_EXTRA_ARGS.get(chosen_hw, [])), "gpu"

    # fallback CPU
    return "libx264", ["-preset", "veryfast"], "cpu"


# ======================================================================================
# Schemas / Endpoints
# ======================================================================================

@app.get("/inspect-instagram")
def inspect_instagram_endpoint(
    url: str = Query(..., description="URL pública de post do Instagram"),
):
    if not _is_instagram_url(url):
        raise HTTPException(status_code=400, detail="URL não pertence ao Instagram.")
    try:
        return _summarize_instagram(url)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

class QueueBody(BaseModel):
    urls: List[str] = Field(default_factory=list)
    target_dir: str
    format: str = "mp4"
    quality: int = 192
    resolution: str = "best"


@app.post("/download")
def download_endpoint(
    background: BackgroundTasks,
    url: str = Query(..., description="URL única"),
    format: str = Query("mp4"),
    quality: int = Query(192),
    resolution: str = Query("best"),
    target_dir: Optional[str] = Query(None, description="Diretório de destino"),
    filename: Optional[str] = Query(None, description="Nome personalizado (sem extensao)"),
    instagram_mode: Optional[str] = Query(None, description="(deprecated)"),
):
    url = url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL vazia.")
    tgt = Path(target_dir) if target_dir else (ROOT_DIR / "downloads")

    is_instagram = _is_instagram_url(url)
    is_facebook = _is_facebook_url(url)
    is_twitter = _is_twitter_url(url)
    simple_mode = is_instagram or is_facebook or is_twitter

    opts = _build_yt_args(
        format,
        resolution,
        quality,
        tgt,
        simple_mode=simple_mode,
    )
    custom_name = _sanitize_filename(filename) if filename else None
    if custom_name:
        expected_ext = _expected_extension(format)
        custom_path = str((tgt / f"{custom_name}.{expected_ext}"))
        outtmpl = opts.get("outtmpl", {})
        if isinstance(outtmpl, dict):
            outtmpl = dict(outtmpl)
            outtmpl["default"] = custom_path
        else:
            outtmpl = {"default": custom_path}
        opts["outtmpl"] = outtmpl


    # cria e armazena o token de cancelamento para esta operação
    global ACTIVE_TOKEN
    ACTIVE_TOKEN = CancelToken()

    background.add_task(_download_one, url, opts, ACTIVE_TOKEN)
    return {"accepted": True}


@app.post("/queue")
def queue_endpoint(background: BackgroundTasks, body: QueueBody):
    if not body.urls:
        raise HTTPException(status_code=400, detail="Nenhuma URL recebida.")
    tgt = Path(body.target_dir)
    opts = _build_yt_args(body.format, body.resolution, body.quality, tgt)

    # cria e armazena o token de cancelamento para a fila
    global ACTIVE_TOKEN
    ACTIVE_TOKEN = CancelToken()

    def _run_queue(urls: List[str], base_opts: dict, target_dir: Path, token: CancelToken):
        for u in urls:
            if token.is_cancelled():
                ws_manager.broadcast_threadsafe({
                    "status": "Fila cancelada pelo usuário",
                    "progress": 0,
                })
                return
            _download_one(u, base_opts, token)

        # ✅ sinal único quando TODOS terminarem
        ws_manager.broadcast_threadsafe({
            "status": "Fila concluída",
            "progress": 100.0,
            "queue_finished": True,
            "target_dir": str(target_dir.resolve()),
        })

    background.add_task(_run_queue, list(body.urls), opts, tgt, ACTIVE_TOKEN)
    return {"accepted": True, "count": len(body.urls)}


@app.post("/compress")
async def compress_endpoint(
    file: UploadFile = File(...),
    compression: int = Form(40, ge=0, le=99),
    resolution: str = Form("auto"),
    target_dir: Optional[str] = Form(None),
    discord_mode: bool = Form(False),
    custom_name: Optional[str] = Form(None),
    hardware_mode: str = Form("cpu"),
):
    global ACTIVE_TOKEN
    if not file.filename:
        raise HTTPException(status_code=400, detail="Arquivo inválido.")
    if file.content_type not in {"video/mp4", "application/octet-stream", "video/quicktime"} and not file.filename.lower().endswith(".mp4"):
        raise HTTPException(status_code=400, detail="Envie um vídeo MP4.")

    clamp_compression = max(0, min(99, int(compression)))
    target_height = _parse_resolution_token(resolution)
    temp_dir = Path(tempfile.mkdtemp(prefix="compress-"))
    temp_input = temp_dir / "input.mp4"
    video_encoder, encoder_args, encoder_kind = _select_video_encoder(hardware_mode)
    ACTIVE_TOKEN = CancelToken()
    current_token = ACTIVE_TOKEN

    ws_manager.broadcast_threadsafe({
        "task": "compressor",
        "status": "Preparando compressão...",
        "progress": 0.0,
    })

    try:
        with temp_input.open("wb") as dest:
            while True:
                chunk = await file.read(4 * 1024 * 1024)
                if not chunk:
                    break
                dest.write(chunk)
        await file.close()

        if not temp_input.exists() or temp_input.stat().st_size == 0:
            raise HTTPException(status_code=400, detail="Arquivo enviado está vazio.")

        if current_token.is_cancelled():
            raise CanceledByUser()

        media = _probe_media(temp_input)
        duration = media["duration"]
        source_size = media["size"]
        source_height = media["height"]
        source_width = media["width"]

        if target_height and source_height and target_height >= source_height:
            target_height = None  # evita upscale

        if _bool_from(discord_mode):
            target_bytes = min(source_size, DISCORD_TARGET_BYTES)
        else:
            factor = max(0.01, 1.0 - (clamp_compression / 100.0))
            target_bytes = int(max(source_size * factor, 256_000))
            target_bytes = min(target_bytes, source_size)

        if target_bytes <= 0 or duration <= 0:
            raise HTTPException(status_code=400, detail="Não foi possível calcular a compressão.")

        target_bitrate = max(int((target_bytes * 8) / duration), 128_000)
        audio_bitrate = min(128_000, max(64_000, target_bitrate // 5))
        video_bitrate = target_bitrate - audio_bitrate
        if video_bitrate < 64_000:
            video_bitrate = max(48_000, target_bitrate // 2)
            audio_bitrate = max(48_000, target_bitrate - video_bitrate)
        if video_bitrate <= 0:
            raise HTTPException(status_code=400, detail="Taxa de bits resultante é inválida.")

        video_bitrate_k = max(64, video_bitrate // 1000)
        audio_bitrate_k = max(48, audio_bitrate // 1000)
        maxrate_k = max(video_bitrate_k + 1, int(video_bitrate * 1.35) // 1000)
        bufsize_k = max(video_bitrate_k + 1, int(video_bitrate * 2) // 1000)

        output_dir = _ensure_dir(Path(target_dir).expanduser()) if target_dir else DEFAULT_COMPRESS_DIR
        base_name = _sanitize_filename(custom_name) if custom_name else None
        if not base_name:
            original_stem = _sanitize_filename(Path(file.filename).stem) or "video"
            base_name = f"{original_stem}-compressed"
        output_path = _unique_output_path(output_dir, base_name, ".mp4")

        cmd: List[str] = [
            str(FFMPEG_EXE),
            "-hide_banner",
            "-y",
            "-i",
            str(temp_input),
            "-c:v",
            video_encoder,
        ]
        if encoder_args:
            cmd.extend(encoder_args)
        cmd.extend([
            "-b:v",
            f"{video_bitrate_k}k",
            "-maxrate",
            f"{maxrate_k}k",
            "-bufsize",
            f"{bufsize_k}k",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-c:a",
            "aac",
            "-b:a",
            f"{audio_bitrate_k}k",
        ])
        if target_height:
            cmd.extend(["-vf", f"scale=-2:{target_height}"])
        cmd.extend(["-progress", "pipe:1", "-nostats", str(output_path)])

        encoder_label = f"{'GPU' if encoder_kind == 'gpu' else 'CPU'}: {video_encoder}"
        ws_manager.broadcast_threadsafe({
            "task": "compressor",
            "status": f"Iniciando ffmpeg ({encoder_label})...",
            "progress": 0.0,
        })

        await _run_ffmpeg_with_progress(cmd, duration, current_token)

        if not output_path.exists():
            raise RuntimeError("Arquivo comprimido não foi gerado.")

        final_size = output_path.stat().st_size
        reduction_pct = 0.0
        if source_size:
            reduction_pct = max(0.0, 100.0 - ((final_size / source_size) * 100.0))

        ws_manager.broadcast_threadsafe({
            "task": "compressor",
            "status": "Compressão concluída!",
            "progress": 100.0,
            "saved_path": str(output_path.resolve()),
            "final_size": final_size,
            "encoder": video_encoder,
            "hardware_mode": encoder_kind,
        })

        return {
            "ok": True,
            "output_path": str(output_path.resolve()),
            "filename": output_path.name,
            "final_size": final_size,
            "final_size_human": _format_bytes(final_size),
            "source_size": source_size,
            "source_size_human": _format_bytes(source_size),
            "target_size_bytes": target_bytes,
            "target_size_human": _format_bytes(target_bytes),
            "reduction_percent": round(reduction_pct, 2),
            "duration_seconds": duration,
            "video_bitrate_kbps": video_bitrate_k,
            "audio_bitrate_kbps": audio_bitrate_k,
            "applied_resolution": target_height or source_height or None,
            "source_resolution": {"width": source_width, "height": source_height},
            "discord_mode": _bool_from(discord_mode),
            "encoder_used": video_encoder,
            "hardware_mode_used": encoder_kind,
        }
    except CanceledByUser:
        ws_manager.broadcast_threadsafe({
            "task": "compressor",
            "status": "Compressão cancelada pelo usuário.",
            "progress": 0.0,
        })
        raise HTTPException(status_code=499, detail="Compressão cancelada pelo usuário.")
    except HTTPException:
        raise
    except Exception as exc:
        ws_manager.broadcast_threadsafe({
            "task": "compressor",
            "status": f"Erro na compressão: {exc}",
            "progress": 0.0,
        })
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        if ACTIVE_TOKEN is current_token:
            ACTIVE_TOKEN = None


# ======================================================================================
# Auxiliares da interface
# ======================================================================================

@app.get("/update-check")
def update_check():
    """Checa atualização agora e retorna JSON. Se houver, também broadcast no WS."""
    result = check_and_cache_update()
    if result.get("update_available"):
        ws_manager.broadcast_threadsafe(result)
    return result


@app.get("/clipboard")
def get_clipboard():
    """
    Retorna o conteúdo textual atual da área de transferência.
    Utiliza o helper _read_clipboard que já trata fallbacks por plataforma.
    """
    try:
        text = _read_clipboard()
        return {"text": text or ""}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/select-dir")
def select_dir():
    """
    Abre um seletor de pasta no Windows/macOS/Linux e retorna o caminho.
    """
    try:
        # Tkinter local (app desktop)
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        path = filedialog.askdirectory()
        root.destroy()
        return {"dir": path or None}
    except Exception:
        # Fallback: usa downloads padrão
        default = _ensure_dir(ROOT_DIR / "downloads")
        return {"dir": str(default)}


@app.post("/reveal")
def reveal(payload: dict):
    """
    Abre o Explorer/Finder na pasta (ou seleciona o arquivo).
    """
    p = Path(payload.get("path", "")).expanduser()
    if not p.exists():
        # Se for diretório inexistente, abre pai se existir
        parent = p.parent if p.suffix else p
        if parent.exists():
            p = parent
        else:
            raise HTTPException(status_code=404, detail="Caminho não encontrado.")

    try:
        if sys.platform.startswith("win"):
            if p.is_file():
                subprocess.Popen(["explorer", "/select,", str(p)])
            else:
                subprocess.Popen(["explorer", str(p)])
        elif sys.platform == "darwin":
            if p.is_file():
                subprocess.Popen(["open", "-R", str(p)])
            else:
                subprocess.Popen(["open", str(p)])
        else:
            subprocess.Popen(["xdg-open", str(p if p.is_dir() else p.parent)])
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ======================================================================================
# Cancel endpoint
# ======================================================================================

@app.post("/cancel")
def cancel_endpoint():
    """Sinaliza cancelamento do download/fila atual (se houver)."""
    global ACTIVE_TOKEN
    tok = ACTIVE_TOKEN
    if tok:
        tok.cancel()
        return {"canceled": True}
    return {"canceled": False}


# ======================================================================================
# WebSocket
# ======================================================================================

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    try:
        await ws_manager.connect(ws)
        # Mensagem inicial
        await ws.send_json({"status": "Conectado", "progress": 0})
        if LATEST_UPDATE:
            await ws.send_json(LATEST_UPDATE)

        while True:
            # Mantém a conexão viva lendo pings do cliente, se houver
            _ = await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        ws_manager.disconnect(ws)


# ======================================================================================
# Rota raiz (opcional)
# ======================================================================================

@app.get("/")
def root():
    return JSONResponse({"message": "Ultra Downloader API. Acesse /app/ para interface."})
