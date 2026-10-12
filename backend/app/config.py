from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    supabase_url: str
    supabase_service_role_key: str = ""
    supabase_secret_key: str = ""
    gemini_api_key: str = Field(min_length=1)
    gemini_model: str = "gemini-2.5-flash"
    frontend_origin: str = "http://localhost:3000"
    max_file_bytes: int = Field(default=10 * 1024 * 1024, gt=0)
    uploads_per_hour: int = Field(default=30, gt=0)
    min_check_interval_seconds: float = Field(default=12, ge=0)
    enable_worker: bool = True
    bucket: str = "papers"
    page_size: int = Field(default=20, gt=0, le=100)
    lease_seconds: int = Field(default=600, ge=60)

    @property
    def server_key(self) -> str:
        key = self.supabase_secret_key or self.supabase_service_role_key
        if not key:
            raise ValueError(
                "Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in backend/.env."
            )
        if key.startswith("sb_publishable_"):
            raise ValueError(
                "The backend needs a Supabase secret key, not a publishable key."
            )
        return key


@lru_cache
def settings() -> Settings:
    return Settings()
