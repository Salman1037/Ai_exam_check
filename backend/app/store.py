from urllib.parse import quote

import httpx

from app.config import Settings


class Store:
    def __init__(self, config: Settings):
        self.config = config
        key = config.server_key
        headers = {"apikey": key}
        # Opaque sb_secret keys belong only in apikey, never in a JWT header.
        if not key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {key}"
        self.http = httpx.AsyncClient(
            base_url=config.supabase_url.rstrip("/"),
            headers=headers,
            timeout=60,
        )

    async def request(self, method: str, path: str, **kwargs):
        response = await self.http.request(method, path, **kwargs)
        response.raise_for_status()
        return response.json() if response.content else None

    async def rpc(self, name: str, **data):
        return await self.request("POST", f"/rest/v1/rpc/{name}", json=data)

    async def papers(self, user: str, **params):
        return await self.request(
            "GET", "/rest/v1/papers", params={"user_id": f"eq.{user}", **params}
        )

    async def update(self, paper: str, values: dict, **filters):
        return await self.request(
            "PATCH",
            "/rest/v1/papers",
            params={"id": f"eq.{paper}", **filters},
            json=values,
        )

    def object_path(self, path: str) -> str:
        return f"/storage/v1/object/{self.config.bucket}/{quote(path, safe='/')}"

    async def upload(self, path: str, data: bytes, mime: str):
        return await self.request(
            "POST", self.object_path(path), content=data, headers={"Content-Type": mime}
        )

    async def download(self, path: str) -> bytes:
        response = await self.http.get(self.object_path(path))
        response.raise_for_status()
        return response.content

    async def remove(self, path: str):
        return await self.request(
            "DELETE",
            f"/storage/v1/object/{self.config.bucket}",
            json={"prefixes": [path]},
        )

    async def signed_url(self, path: str) -> str:
        result = await self.request(
            "POST",
            f"/storage/v1/object/sign/{self.config.bucket}/{quote(path, safe='/')}",
            json={"expiresIn": 3600},
        )
        return (
            self.config.supabase_url.rstrip("/") + "/storage/v1" + result["signedURL"]
        )
