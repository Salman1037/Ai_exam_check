import pytest

from app.config import Settings
from app.store import Store


@pytest.mark.parametrize("key", ["sb_secret_test", "legacy-server-jwt"])
async def test_server_key_header(key):
    config = Settings(
        supabase_url="https://example.test",
        supabase_secret_key=key,
        gemini_api_key="test",
    )
    db = Store(config)
    try:
        assert db.http.headers["apikey"] == key
        if key.startswith("sb_secret_"):
            assert "authorization" not in db.http.headers
        else:
            assert db.http.headers["authorization"] == "Bearer " + key
    finally:
        await db.http.aclose()


def test_publishable_key_cannot_be_used_as_server_key():
    config = Settings(
        supabase_url="https://example.test",
        supabase_secret_key="sb_publishable_test",
        gemini_api_key="test",
    )
    with pytest.raises(ValueError, match="not a publishable"):
        Store(config)
