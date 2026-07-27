from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: str | None = None


class FolderRead(ApiModel):
    id: str
    name: str
    parent_id: str | None
    is_default: bool


class SiteCreate(BaseModel):
    url: HttpUrl
    folder_id: str | None = None


class SiteRead(ApiModel):
    id: str
    name: str
    entry_url: str
    normalized_url: str
    normalized_host: str
    folder_id: str
    status: str
    created_at: datetime


class AnalysisCreate(BaseModel):
    sample_limit: int = Field(default=3, ge=1, le=5)


class CollectionCreate(BaseModel):
    sample_limit: int | None = Field(default=None, ge=1, le=10)


class JobRead(ApiModel):
    id: str
    kind: str
    site_id: str
    status: str
    progress: int
    attempt: int
    output: dict[str, Any] | None = None
    error_code: str | None
    error_message: str | None
    codex_thread_id: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class JobEventRead(ApiModel):
    id: int
    job_id: str
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class RuleRead(ApiModel):
    id: str
    site_id: str
    version: int
    status: str
    config: dict[str, Any] = Field(default_factory=dict)
    source_job_id: str | None
    created_at: datetime
    published_at: datetime | None


class PlanUpsert(BaseModel):
    enabled: bool = True
    sample_limit: int = Field(default=3, ge=1, le=10)


class PlanRead(ApiModel):
    id: str
    site_id: str
    enabled: bool
    sample_limit: int


class ExecutionRead(ApiModel):
    id: str
    site_id: str
    job_id: str
    rule_id: str
    status: str
    collected_count: int
    discovered_count: int = 0
    linked_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    unchanged_count: int = 0
    quality_passed_count: int = 0
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class ArticleRead(ApiModel):
    id: str
    site_id: str
    execution_id: str
    title: str
    url: str
    published_at: str | None
    content_text: str
    fingerprint: str
    version_id: str = ""
    observation_id: str = ""
    observation_outcome: str = ""
    issuer: str | None = None
    notice_type: str | None = None
    quality_status: str = "needs_review"
    quality_checks: dict[str, bool] = Field(default_factory=dict)
    quality_issues: list[str] = Field(default_factory=list)
    created_at: datetime


class AttachmentRead(ApiModel):
    id: str
    name: str
    url: str
    status: str
    content_type: str | None
    size_bytes: int | None
    sha256: str | None
    error_message: str | None
    archived_url: str | None = None


class ArticleDetailRead(ArticleRead):
    raw_html: str
    source_html: str
    source_url: str
    final_url: str
    source_status_code: int
    source_content_type: str | None
    source_encoding: str | None
    source_sha256: str
    fetched_at: datetime
    attachments: list[AttachmentRead] = Field(default_factory=list)
    rule_id: str
    site_name: str


class FailureRead(ApiModel):
    id: str
    job_id: str
    site_id: str
    handling: Literal["automatic", "manual"]
    category: str
    message: str
    status: str
    created_at: datetime
    resolved_at: datetime | None
