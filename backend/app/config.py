from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_prefix="COLLECTOR_",
        extra="ignore",
    )

    database_url: str = f"sqlite:///{BACKEND_DIR / 'data' / 'collector.db'}"
    run_root: Path = BACKEND_DIR / "data" / "runs"
    attachment_root: Path = BACKEND_DIR / "data" / "attachments"
    codex_binary: str = "codex"
    codex_model: str | None = None
    codex_timeout_seconds: int = 600
    worker_poll_seconds: float = 0.5
    request_timeout_seconds: float = 30
    attachment_timeout_seconds: float = 20
    attachment_max_bytes: int = 25 * 1024 * 1024
    user_agent: str = "CollectorLocalPOC/0.1 (+local product validation)"
    allowed_hosts: str = "ggzyfw.beijing.gov.cn"

    @property
    def allowed_host_set(self) -> set[str]:
        return {
            item.strip().lower()
            for item in self.allowed_hosts.split(",")
            if item.strip()
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
