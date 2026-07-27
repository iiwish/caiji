from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("folders.id"))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(240))
    entry_url: Mapped[str] = mapped_column(Text)
    normalized_url: Mapped[str] = mapped_column(Text, unique=True, index=True)
    normalized_host: Mapped[str] = mapped_column(String(255), index=True)
    folder_id: Mapped[str] = mapped_column(ForeignKey("folders.id"))
    status: Mapped[str] = mapped_column(String(40), default="pending_analysis")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    folder: Mapped[Folder] = relationship()


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    input_json: Mapped[str] = mapped_column(Text, default="{}")
    output_json: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(String(80))
    error_message: Mapped[str | None] = mapped_column(Text)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    codex_thread_id: Mapped[str | None] = mapped_column(String(80))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    site: Mapped[Site] = relationship()
    events: Mapped[list["JobEvent"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class JobEvent(Base):
    __tablename__ = "job_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(80))
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    job: Mapped[Job] = relationship(back_populates="events")


class RuleVersion(Base):
    __tablename__ = "rule_versions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(32), default="candidate")
    config_json: Mapped[str] = mapped_column(Text)
    source_job_id: Mapped[str | None] = mapped_column(ForeignKey("jobs.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    site: Mapped[Site] = relationship()


class CollectionPlan(Base):
    __tablename__ = "collection_plans"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    site_id: Mapped[str] = mapped_column(
        ForeignKey("sites.id"), unique=True, index=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sample_limit: Mapped[int] = mapped_column(Integer, default=3)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    site: Mapped[Site] = relationship()


class Execution(Base):
    __tablename__ = "executions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), index=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), unique=True)
    rule_id: Mapped[str] = mapped_column(ForeignKey("rule_versions.id"))
    status: Mapped[str] = mapped_column(String(32), default="queued")
    collected_count: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    site: Mapped[Site] = relationship()


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), index=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), index=True)
    title: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text, unique=True)
    published_at: Mapped[str | None] = mapped_column(String(80))
    content_text: Mapped[str] = mapped_column(Text)
    raw_html: Mapped[str] = mapped_column(Text)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    site: Mapped[Site] = relationship()


class ArticleVersion(Base):
    __tablename__ = "article_versions"
    __table_args__ = (
        UniqueConstraint(
            "article_id",
            "fingerprint",
            name="uq_article_versions_article_fingerprint",
        ),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    article_id: Mapped[str] = mapped_column(ForeignKey("articles.id"), index=True)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(Text)
    published_at: Mapped[str | None] = mapped_column(String(80))
    issuer: Mapped[str | None] = mapped_column(Text)
    notice_type: Mapped[str | None] = mapped_column(String(120))
    content_text: Mapped[str] = mapped_column(Text)
    raw_html: Mapped[str] = mapped_column(Text)
    source_html: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(Text)
    final_url: Mapped[str] = mapped_column(Text)
    source_status_code: Mapped[int] = mapped_column(Integer)
    source_content_type: Mapped[str | None] = mapped_column(String(255))
    source_encoding: Mapped[str | None] = mapped_column(String(80))
    source_sha256: Mapped[str] = mapped_column(String(64), index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    quality_status: Mapped[str] = mapped_column(String(40), default="needs_review")
    quality_checks_json: Mapped[str] = mapped_column(Text, default="{}")
    quality_issues_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    article: Mapped[Article] = relationship()


class ExecutionArticle(Base):
    __tablename__ = "execution_articles"
    __table_args__ = (
        UniqueConstraint(
            "execution_id",
            "article_id",
            name="uq_execution_articles_execution_article",
        ),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    execution_id: Mapped[str] = mapped_column(
        ForeignKey("executions.id"), index=True
    )
    article_id: Mapped[str] = mapped_column(ForeignKey("articles.id"), index=True)
    version_id: Mapped[str] = mapped_column(
        ForeignKey("article_versions.id"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    outcome: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    execution: Mapped[Execution] = relationship()
    article: Mapped[Article] = relationship()
    version: Mapped[ArticleVersion] = relationship()


class ArticleAttachment(Base):
    __tablename__ = "article_attachments"
    __table_args__ = (
        UniqueConstraint(
            "version_id",
            "url",
            name="uq_article_attachments_version_url",
        ),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    version_id: Mapped[str] = mapped_column(
        ForeignKey("article_versions.id"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), default="pending")
    content_type: Mapped[str | None] = mapped_column(String(255))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    storage_path: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    version: Mapped[ArticleVersion] = relationship()


class Failure(Base):
    __tablename__ = "failures"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), index=True)
    handling: Mapped[str] = mapped_column(String(32), default="manual")
    category: Mapped[str] = mapped_column(String(80))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="open")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


JsonObject = dict[str, Any]
