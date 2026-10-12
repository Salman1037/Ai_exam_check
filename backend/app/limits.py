from fastapi import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import settings

TOO_LARGE = "File is larger than 10 MB. Please upload a smaller photo or PDF."


class UploadBodyLimit:
    """Bound multipart input before it can fill the server's temporary disk."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] != "POST"
            or scope["path"] != "/papers"
        ):
            await self.app(scope, receive, send)
            return
        # Allow room for ordinary multipart headers; the endpoint also validates
        # the exact file size. Count streamed bodies even without Content-Length.
        limit = settings().max_file_bytes + 64 * 1024
        headers = dict(scope.get("headers", []))
        try:
            length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            await JSONResponse({"detail": "Invalid upload size."}, 400)(
                scope, receive, send
            )
            return
        if length > limit:
            await JSONResponse({"detail": TOO_LARGE}, 413)(scope, receive, send)
            return
        received = 0

        async def bounded_receive() -> Message:
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > limit:
                raise HTTPException(413, TOO_LARGE)
            return message

        await self.app(scope, bounded_receive, send)
