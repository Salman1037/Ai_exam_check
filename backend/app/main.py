import asyncio
import hashlib
import logging
import os
from contextlib import asynccontextmanager, suppress
from typing import Annotated
from uuid import UUID, uuid4

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.files import detect_type
from app.limits import UploadBodyLimit
from app.store import Store
from app.worker import worker

logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)
bearer = HTTPBearer(auto_error=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = settings()
    app.state.store = Store(config)
    task = (
        asyncio.create_task(worker(app.state.store, config))
        if config.enable_worker
        else None
    )
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    await app.state.store.http.aclose()


app = FastAPI(title="AutoCheck", lifespan=lifespan)
# Read configuration at startup without requiring credentials for importing tests.
load_dotenv()
app.add_middleware(UploadBodyLimit)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").rstrip("/")],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


def store(request: Request) -> Store:
    return request.app.state.store


async def user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[Store, Depends(store)],
) -> str:
    if not credentials:
        raise HTTPException(401, "Please sign in to continue.")
    # Auth server validates both legacy and asymmetric Supabase JWTs.
    response = await db.http.get(
        "/auth/v1/user", headers={"Authorization": f"Bearer {credentials.credentials}"}
    )
    if response.status_code in (401, 403):
        raise HTTPException(401, "Your session expired. Please sign in again.")
    response.raise_for_status()
    return response.json()["id"]


UserId = Annotated[str, Depends(user)]
Database = Annotated[Store, Depends(store)]


@app.exception_handler(httpx.HTTPError)
async def upstream_error(request: Request, exc: httpx.HTTPError):
    logger.error("Upstream request failed: %s", type(exc).__name__)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "The service is temporarily unavailable. Please try again shortly."
        },
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/config")
async def limits(uid: UserId):
    config = settings()
    return {"max_file_bytes": config.max_file_bytes, "page_size": config.page_size}


@app.get("/papers")
async def list_papers(uid: UserId, db: Database, page: int = 1):
    if page < 1 or page > 100000:
        raise HTTPException(400, "Invalid page.")
    size = settings().page_size
    rows = await db.papers(
        uid,
        select="id,file_name,status,subject,total,out_of,error_message,created_at,checked_at",
        order="created_at.desc,id.desc",
        limit=size + 1,
        offset=(page - 1) * size,
    )
    # Pending jobs on another page must also keep the current dashboard refreshing.
    pending = await db.papers(uid, select="id", status="in.(pending,checking)", limit=1)
    return {
        "papers": rows[:size],
        "has_more": len(rows) > size,
        "has_pending": bool(pending),
    }


async def owned(paper_id: UUID, uid: str, db: Store) -> dict:
    rows = await db.papers(uid, id=f"eq.{paper_id}", select="*")
    if not rows:
        raise HTTPException(404, "Paper not found.")
    return rows[0]


@app.get("/papers/{paper_id}")
async def detail(paper_id: UUID, uid: UserId, db: Database):
    paper = await owned(paper_id, uid, db)
    paper["preview_url"] = await db.signed_url(paper["file_path"])
    return paper


@app.post("/papers", status_code=202)
async def upload(file: Annotated[UploadFile, File()], uid: UserId, db: Database):
    config = settings()
    if not await db.rpc(
        "consume_upload", owner_id=uid, hourly_limit=config.uploads_per_hour
    ):
        raise HTTPException(
            429,
            "Upload limit reached. Please try again in an hour.",
            headers={"Retry-After": "3600"},
        )
    data = await file.read(config.max_file_bytes + 1)
    await file.close()
    if len(data) > config.max_file_bytes:
        raise HTTPException(
            413, "File is larger than 10 MB. Please upload a smaller photo or PDF."
        )
    mime = await asyncio.to_thread(detect_type, data)
    digest = hashlib.sha256(data).hexdigest()
    existing = await db.papers(uid, file_hash=f"eq.{digest}", select="*")
    if existing:
        return {"paper": existing[0], "duplicate": True}
    paper_id = str(uuid4())
    extension = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }[mime]
    path = f"{uid}/{paper_id}.{extension}"
    await db.upload(path, data, mime)
    try:
        response = await db.http.post(
            "/rest/v1/papers",
            headers={"Prefer": "return=representation"},
            json={
                "id": paper_id,
                "user_id": uid,
                "file_name": (file.filename or "Test paper")[:255],
                "file_path": path,
                "file_hash": digest,
            },
        )
        if response.status_code == 409:
            await db.remove(path)
            existing = await db.papers(uid, file_hash=f"eq.{digest}", select="*")
            if existing:
                return {"paper": existing[0], "duplicate": True}
        response.raise_for_status()
        return {"paper": response.json()[0], "duplicate": False}
    except Exception:
        # Clean up the object if the database write fails.
        with suppress(httpx.HTTPError):
            await db.remove(path)
        raise


@app.post("/papers/{paper_id}/recheck", status_code=202)
async def recheck(paper_id: UUID, uid: UserId, db: Database):
    paper = await owned(paper_id, uid, db)
    if paper["status"] in ("pending", "checking"):
        return {"status": paper["status"]}
    if not await db.rpc(
        "consume_upload", owner_id=uid, hourly_limit=settings().uploads_per_hour
    ):
        raise HTTPException(429, "Checking limit reached. Please try again in an hour.")
    await db.update(
        str(paper_id),
        {
            "status": "pending",
            "error_message": None,
            "lease_until": None,
            "lease_token": None,
            "total": None,
            "out_of": None,
            "results": None,
            "checked_at": None,
        },
        user_id=f"eq.{uid}",
        status="in.(done,error)",
    )
    return {"status": "pending"}


@app.delete("/papers/{paper_id}", status_code=204)
async def delete(paper_id: UUID, uid: UserId, db: Database):
    paper = await owned(paper_id, uid, db)
    await db.remove(paper["file_path"])
    await db.request(
        "DELETE",
        "/rest/v1/papers",
        params={"id": f"eq.{paper_id}", "user_id": f"eq.{uid}"},
    )
