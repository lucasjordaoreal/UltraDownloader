# update_manager.py
from __future__ import annotations

import json
import os
import time
import typing as t
from dataclasses import dataclass
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


@dataclass
class ReleaseInfo:
    tag: str
    name: str
    body: str
    html_url: str
    published_at: str
    prerelease: bool
    assets: t.List[t.Dict[str, t.Any]]

    @property
    def version(self) -> str:
        # Usa tag como "versão" preferencialmente
        return self.tag or self.name or ""

    def as_public_dict(self) -> dict:
        return {
            "version": self.version,
            "notes": self.body or "",
            "html_url": self.html_url,
            "published_at": self.published_at,
            "assets": [
                {
                    "name": a.get("name"),
                    "size": a.get("size"),
                    "download_url": a.get("browser_download_url"),
                    "content_type": a.get("content_type"),
                }
                for a in (self.assets or [])
            ],
        }


def _normalize_version(v: str) -> t.Tuple[int, ...]:
    """
    Normaliza strings de versão como 'v2.1.0' -> (2,1,0).
    Caracteres não numéricos (exceto pontos) são removidos do prefixo.
    """
    if not isinstance(v, str):
        return (0,)
    v = v.strip()
    if v.lower().startswith("v"):
        v = v[1:]
    # Mantém apenas dígitos e pontos
    clean = []
    for ch in v:
        if ch.isdigit() or ch == ".":
            clean.append(ch)
        else:
            break  # para em qualquer sufixo (ex: -beta)
    v = "".join(clean).strip(".")
    if not v:
        return (0,)
    parts = []
    for part in v.split("."):
        try:
            parts.append(int(part))
        except ValueError:
            parts.append(0)
    # Normaliza comprimento para comparação mais estável (ex: 2 vs 2.0.0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


def _cmp_versions(a: str, b: str) -> int:
    """
    Compara 'a' e 'b'. Retorna:
      -1 se a < b, 0 se a == b, 1 se a > b
    """
    ta, tb = _normalize_version(a), _normalize_version(b)
    if ta < tb:
        return -1
    if ta > tb:
        return 1
    return 0


class UpdateManager:
    """
    Verifica releases do GitHub para encontrar novas versões.
    - Usa apenas urllib (sem dependências externas)
    - Aceita token via variável de ambiente GITHUB_TOKEN para evitar rate limit
    - Pode incluir pré-releases se desejado
    """

    def __init__(
        self,
        repo: str = "lucasjordaoreal/YouTube-Downloader-Tool---yt_dlp-GUI",
        current_version: str = "0.0.0",
        include_prereleases: bool = False,
        timeout: float = 7.0,
        cache_ttl_sec: int = 1800,
        token_env: str = "GITHUB_TOKEN",
    ) -> None:
        """
        :param repo: "owner/repo"
        :param current_version: versão atual do app (ex: "1.0.0" ou "v1.0.0")
        :param include_prereleases: se True, considera pré-releases
        :param timeout: timeout de rede (segundos)
        :param cache_ttl_sec: TTL para cache em memória (segundos)
        :param token_env: nome da variável de ambiente com o token do GitHub
        """
        self.repo = repo
        self.current_version = current_version
        self.include_prereleases = include_prereleases
        self.timeout = timeout
        self.token = os.environ.get(token_env) or None
        self._cache: t.Tuple[float, t.Optional[ReleaseInfo]] = (0.0, None)
        self._cache_ttl = cache_ttl_sec

    # --------------------- HTTP helpers ---------------------

    def _api(self, path: str) -> str:
        return f"https://api.github.com/repos/{self.repo}{path}"

    def _headers(self) -> dict:
        h = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "UltraDownloader-UpdateManager",
        }
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _get_json(self, url: str) -> t.Optional[t.Any]:
        req = Request(url, headers=self._headers(), method="GET")
        try:
            with urlopen(req, timeout=self.timeout) as resp:
                data = resp.read().decode("utf-8", errors="replace")
                return json.loads(data)
        except HTTPError as e:
            # 403 / rate limit / etc
            # Você pode logar se quiser
            return None
        except URLError:
            return None
        except Exception:
            return None

    # --------------------- GitHub release logic ---------------------

    def _fetch_latest_release(self) -> t.Optional[ReleaseInfo]:
        """
        Busca a release mais recente conforme configuração.
        Se include_prereleases = False, escolhe a primeira não-draft e não-prerelease.
        Caso contrário, pega a primeira não-draft (mesmo que prerelease).
        """
        # Para respeitar include_prereleases corretamente, usamos /releases (lista)
        # e escolhemos a primeira adequada. (A rota /releases/latest ignora pré-releases)
        url = self._api("/releases")
        data = self._get_json(url)
        if not isinstance(data, list):
            return None

        for rel in data:
            if not rel or rel.get("draft"):
                continue
            if not self.include_prereleases and rel.get("prerelease"):
                continue
            return ReleaseInfo(
                tag=rel.get("tag_name") or "",
                name=rel.get("name") or "",
                body=rel.get("body") or "",
                html_url=rel.get("html_url") or "",
                published_at=rel.get("published_at") or "",
                prerelease=bool(rel.get("prerelease")),
                assets=rel.get("assets") or [],
            )

        return None

    def get_latest_release(self, use_cache: bool = True) -> t.Optional[ReleaseInfo]:
        """
        Retorna ReleaseInfo da release mais recente adequada aos critérios.
        Usa cache em memória para evitar chamadas repetidas.
        """
        now = time.time()
        ts, cached = self._cache
        if use_cache and cached and (now - ts) < self._cache_ttl:
            return cached
        latest = self._fetch_latest_release()
        self._cache = (now, latest)
        return latest

    # --------------------- Public API ---------------------

    def check_for_update(self) -> t.Optional[dict]:
        """
        Compara a versão atual com a release mais recente.
        Retorna dict com metadados da atualização se houver; senão, None.
        """
        latest = self.get_latest_release(use_cache=True)
        if not latest:
            return None

        # tag sobrescreve name como "versão"
        current = self.current_version or "0.0.0"
        latest_str = latest.version or latest.name or ""
        if not latest_str:
            return None

        if _cmp_versions(current, latest_str) < 0:
            return latest.as_public_dict()
        return None


# --------------------- Execução direta (teste manual) ---------------------

if __name__ == "__main__":
    # Exemplo de uso standalone
    um = UpdateManager(
        repo="lucasjordaoreal/YouTube-Downloader-Tool---yt_dlp-GUI",
        current_version="0.0.0",
        include_prereleases=False,  # mude para True se quiser pré-releases
    )
    upd = um.check_for_update()
    print(json.dumps(upd or {"update": False}, ensure_ascii=False, indent=2))
