import io
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from PIL import Image

from app.config import settings
from app.main import app, store, user

UID = str(uuid4())
PID = str(uuid4())


@pytest.fixture
def fake_store():
    db = AsyncMock()
    db.rpc.return_value = True
    db.papers.return_value = []
    db.http.post.return_value = httpx.Response(
        201,
        json=[{"id": PID, "status": "pending"}],
        request=httpx.Request("POST", "https://example.test"),
    )
    app.dependency_overrides[store] = lambda: db
    app.dependency_overrides[user] = lambda: UID
    settings.cache_clear()
    yield db
    app.dependency_overrides.clear()
    settings.cache_clear()


@pytest.fixture(autouse=True)
def environment(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-only")
    monkeypatch.setenv("GEMINI_API_KEY", "test-only")


@pytest.fixture
async def client(fake_store):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client


def photo():
    stream = io.BytesIO()
    Image.new("RGB", (10, 10), "white").save(stream, "JPEG")
    return stream.getvalue()


async def test_upload_queues_immediately(client, fake_store):
    response = await client.post(
        "/papers", files={"file": ("paper.jpg", photo(), "image/jpeg")}
    )
    assert response.status_code == 202
    assert response.json()["paper"]["status"] == "pending"
    fake_store.upload.assert_awaited_once()
    payload = fake_store.http.post.call_args.kwargs["json"]
    assert payload["user_id"] == UID
    assert len(payload["file_hash"]) == 64


async def test_magic_bytes_reject_spoof(client):
    response = await client.post(
        "/papers", files={"file": ("paper.jpg", b"hello", "image/jpeg")}
    )
    assert response.status_code == 400


async def test_size_limit(client):
    response = await client.post(
        "/papers",
        files={"file": ("paper.pdf", b"x" * (10 * 1024 * 1024 + 1), "application/pdf")},
    )
    assert response.status_code == 413


async def test_duplicate_returns_saved(client, fake_store):
    fake_store.papers.return_value = [{"id": PID, "status": "done"}]
    response = await client.post("/papers", files={"file": ("paper.jpg", photo())})
    assert response.json()["duplicate"] is True
    fake_store.upload.assert_not_awaited()


async def test_rate_limit(client, fake_store):
    fake_store.rpc.return_value = False
    response = await client.post("/papers", files={"file": ("paper.jpg", photo())})
    assert response.status_code == 429


async def test_detail_and_ownership(client, fake_store):
    fake_store.papers.return_value = [
        {"id": PID, "status": "done", "file_path": f"{UID}/paper.jpg"}
    ]
    fake_store.signed_url.return_value = "https://example.test/signed"
    response = await client.get(f"/papers/{PID}")
    assert response.status_code == 200
    assert response.json()["preview_url"].endswith("signed")
    assert fake_store.papers.call_args.args[0] == UID
    fake_store.papers.return_value = []
    assert (await client.get(f"/papers/{PID}")).status_code == 404


async def test_status_list_and_invalid_page(client, fake_store):
    fake_store.papers.side_effect = [[{"id": PID, "status": "checking"}], [{"id": PID}]]
    response = await client.get("/papers")
    assert response.json()["has_pending"] is True
    assert response.json()["papers"][0]["status"] == "checking"
    assert (await client.get("/papers?page=0")).status_code == 400


async def test_saved_history_is_loaded_for_authenticated_owner(client, fake_store):
    saved = {"id": PID, "status": "done", "total": 17, "out_of": 20}
    fake_store.papers.side_effect = [[saved], [], [saved], []]
    first = await client.get("/papers")
    returning = await client.get("/papers")
    assert first.json()["papers"] == returning.json()["papers"] == [saved]
    for call in fake_store.papers.call_args_list:
        assert call.args[0] == UID
    assert (
        fake_store.papers.call_args_list[0].kwargs["order"] == "created_at.desc,id.desc"
    )


async def test_auth_required(client):
    del app.dependency_overrides[user]
    assert (await client.get("/papers")).status_code == 401


async def test_invalid_jwt(client, fake_store):
    del app.dependency_overrides[user]
    fake_store.http.get.return_value = httpx.Response(
        401, request=httpx.Request("GET", "https://example.test/auth/v1/user")
    )
    response = await client.get("/papers", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401
    fake_store.papers.assert_not_awaited()


async def test_recheck_clears_previous_grade(client, fake_store):
    fake_store.papers.return_value = [{"id": PID, "status": "done"}]
    response = await client.post(f"/papers/{PID}/recheck")
    assert response.status_code == 202
    values = fake_store.update.call_args.args[1]
    assert values["status"] == "pending"
    assert values["results"] is None
    assert values["total"] is None


async def test_delete_removes_private_object(client, fake_store):
    path = f"{UID}/paper.jpg"
    fake_store.papers.return_value = [{"id": PID, "file_path": path}]
    response = await client.delete(f"/papers/{PID}")
    assert response.status_code == 204
    fake_store.remove.assert_awaited_once_with(path)


async def test_paginate_twenty_without_results(client, fake_store):
    fake_store.papers.side_effect = [[{"id": str(uuid4())} for _ in range(21)], []]
    response = await client.get("/papers?page=2")
    assert len(response.json()["papers"]) == 20
    assert response.json()["has_more"] is True
    call = fake_store.papers.call_args_list[0]
    assert call.kwargs["offset"] == 20
    assert "results" not in call.kwargs["select"]


async def test_reject_large_body_before_parsing(client, fake_store):
    response = await client.post(
        "/papers", content=b"small", headers={"Content-Length": str(50 * 1024 * 1024)}
    )
    assert response.status_code == 413
    fake_store.rpc.assert_not_awaited()


async def test_streamed_body_is_bounded(client):
    async def content():
        yield b'--test\r\nContent-Disposition: form-data; name="file"; filename="paper.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'
        for _ in range(6):
            yield b"x" * (2 * 1024 * 1024)
        yield b"\r\n--test--\r\n"

    response = await client.post(
        "/papers",
        content=content(),
        headers={"Content-Type": "multipart/form-data; boundary=test"},
    )
    assert response.status_code == 413
