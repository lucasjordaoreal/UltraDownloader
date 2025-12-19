import argparse
import os
import sys
import threading
import time
from pathlib import Path

if getattr(sys, "frozen", False):
    ROOT = Path(sys._MEIPASS).resolve()
else:
    ROOT = Path(__file__).parent.resolve()

BACKEND_DIR = ROOT / "backend"
FRONTEND_DIST = ROOT / "frontend" / "dist"
_LOG_FILE_ENV = os.environ.get("ULTRA_LOG_FILE")
LOG_FILE = Path(_LOG_FILE_ENV).expanduser() if _LOG_FILE_ENV else None


def log(msg: str):
    ts = time.strftime("[%H:%M:%S]")
    line = f"{ts} {msg}"
    print(msg)
    if not LOG_FILE:
        return
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        LOG_FILE.touch(exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(f"{line}\n")
    except Exception:
        pass


def ensure_binaries_on_path():
    os.environ["PATH"] = str(BACKEND_DIR) + os.pathsep + os.environ.get("PATH", "")
    for name in ["ffmpeg.exe", "ffprobe.exe", "yt-dlp.exe"]:
        exe = BACKEND_DIR / name
        if exe.exists():
            os.environ[name.upper().replace(".", "_")] = str(exe)
    os.chdir(BACKEND_DIR)
    log(f"INFO PATH += {BACKEND_DIR}")
    log(f"INFO CWD  = {Path.cwd()}")


import asyncio
import uvicorn


def build_app_and_mount_static():
    from backend.main import app as fastapi_app
    from fastapi import APIRouter, HTTPException
    from fastapi.responses import RedirectResponse, FileResponse
    from starlette.staticfiles import StaticFiles

    if FRONTEND_DIST.exists():
        fastapi_app.mount("/app", StaticFiles(directory=str(FRONTEND_DIST), html=True))
        assets_dir = FRONTEND_DIST / "assets"
        if assets_dir.exists():
            fastapi_app.mount("/assets", StaticFiles(directory=str(assets_dir)))
    else:
        log("⚠️ frontend/dist não encontrado. Rode 'npm run build'.")

    router = APIRouter()

    @router.get("/health")
    async def health():
        return {"ok": True}

    @router.get("/")
    async def root():
        return RedirectResponse("/app/")

    @router.get("/favicon.ico")
    async def favicon():
        ico = FRONTEND_DIST / "favicon.ico"
        if ico.exists():
            return FileResponse(str(ico))
        raise HTTPException(status_code=404)

    fastapi_app.include_router(router)
    return fastapi_app


class UvicornThread(threading.Thread):
    def __init__(self, app, host: str, port: int, log_level: str = "info"):
        super().__init__(daemon=True)
        self.app = app
        self.host = host
        self.port = port
        self.log_level = log_level
        self.server = None

    def run(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        # 🔧 Limpa log_config para ambiente --noconsole
        log_config = uvicorn.config.LOGGING_CONFIG.copy()
        log_config["formatters"]["default"]["use_colors"] = False
        log_config["formatters"]["default"]["fmt"] = "%(levelprefix)s %(message)s"

        # Remove o formatter e handler de acesso problemáticos
        log_config["loggers"]["uvicorn.access"]["handlers"] = []
        log_config["handlers"].pop("access", None)
        log_config["formatters"].pop("access", None)

        try:
            self.server = uvicorn.Server(
                uvicorn.Config(
                    self.app,
                    host=self.host,
                    port=self.port,
                    log_level=self.log_level,
                    log_config=log_config,
                    lifespan="on",
                )
            )
            loop.run_until_complete(self.server.serve())
        except Exception as e:
            log(f"ERRO no servidor: {e}")
        finally:
            loop.close()

    def stop(self):
        if self.server:
            self.server.should_exit = True


def wait_until_ready(url: str, timeout: float = 25.0):
    import requests

    session = requests.Session()
    deadline = time.time() + timeout

    while time.time() < deadline:
        try:
            resp = session.get(url, timeout=0.7)
            if resp.ok:
                log("Backend pronto!")
                return True
        except Exception:
            pass
        time.sleep(0.2)

    log("Backend n?o respondeu a tempo.")
    return False


def open_window(url: str, title: str = "Ultra Downloader", width: int = 1120, height: int = 940):
    try:
        import webview
        log("Abrindo PyWebView...")
        window = webview.create_window(title, url=url, width=width, height=height, resizable=True)
        window.events.loaded += lambda: window.resize(width, height)
        webview.start()
    except Exception as e:
        import webbrowser
        log(f"Falha no WebView ({e}), abrindo no navegador...")
        webbrowser.open(url)


def main():
    parser = argparse.ArgumentParser(description="Launcher: backend + janela nativa")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--title", default="Ultra Downloader")
    parser.add_argument("--width", type=int, default=1120)
    parser.add_argument("--height", type=int, default=940)
    args = parser.parse_args()

    ensure_binaries_on_path()
    app = build_app_and_mount_static()
    server_thread = UvicornThread(app, host=args.host, port=args.port)
    server_thread.start()

    if not wait_until_ready(f"http://{args.host}:{args.port}/health", timeout=25.0):
        log("❌ Backend não iniciou. Abortando.")
        server_thread.stop()
        server_thread.join(timeout=3)
        sys.exit(1)

    try:
        open_window(f"http://{args.host}:{args.port}/app/", title=args.title, width=args.width, height=args.height)
    finally:
        server_thread.stop()
        server_thread.join(timeout=3)
        log("Encerrado.")


if __name__ == "__main__":
    main()
