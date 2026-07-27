import json
import traceback
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from sqlalchemy import select

from ..config import get_settings
from ..db import SessionLocal
from ..models import (
    Article,
    ArticleAttachment,
    ArticleVersion,
    Execution,
    ExecutionArticle,
    Failure,
    Job,
    JobEvent,
    RuleVersion,
    Site,
    utc_now,
)

TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}
JOB_KINDS = {"analysis", "collection"}

# Kept as injectable module attributes so workflow tests can replace external work
# without importing the Agent runtime in collection-only workers.
collect_analysis_evidence = None
run_codex_analysis = None
validate_rule_candidate = None
collect_articles = None


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12].upper()}"


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def append_event(job_id: str, event_type: str, payload: dict | None = None) -> None:
    with SessionLocal.begin() as session:
        session.add(
            JobEvent(
                job_id=job_id,
                event_type=event_type,
                payload_json=json_dumps(payload or {}),
            )
        )


def update_job(job_id: str, **values: Any) -> None:
    with SessionLocal.begin() as session:
        job = session.get(Job, job_id)
        if job is None:
            return
        for key, value in values.items():
            setattr(job, key, value)


def claim_next_job(job_kind: str | None = None) -> str | None:
    if job_kind is not None and job_kind not in JOB_KINDS:
        raise ValueError(f"不支持的任务队列：{job_kind}")
    with SessionLocal.begin() as session:
        statement = select(Job).where(Job.status == "queued")
        if job_kind is not None:
            statement = statement.where(Job.kind == job_kind)
        job = session.scalars(
            statement.order_by(Job.created_at.asc()).limit(1)
        ).first()
        if job is None:
            return None
        job.status = "running"
        job.progress = 1
        job.claimed_at = utc_now()
        job.started_at = utc_now()
        job_id = job.id
    append_event(job_id, "job.started", {"progress": 1})
    return job_id


def classify_failure(exc: Exception) -> tuple[str, str]:
    code = getattr(exc, "code", "")
    if code.startswith("codex_"):
        if code in {"codex_timeout", "codex_failed"}:
            return "automatic", code
        return "manual", code
    if isinstance(exc, TimeoutError) or exc.__class__.__name__ == "FetchError":
        return "automatic", "request_failed"
    if exc.__class__.__name__ == "CollectionError":
        return "manual", "rule_mismatch"
    if exc.__class__.__name__ == "RuleValidationError":
        return "manual", "rule_validation_failed"
    return "manual", "internal_error"


def fail_job(job_id: str, exc: Exception) -> None:
    handling, category = classify_failure(exc)
    message = str(exc) or exc.__class__.__name__
    with SessionLocal.begin() as session:
        job = session.get(Job, job_id)
        if job is None:
            return
        job.status = "failed"
        job.error_code = category
        job.error_message = message
        job.finished_at = utc_now()
        execution = session.scalar(select(Execution).where(Execution.job_id == job_id))
        if execution:
            execution.status = "failed"
            execution.finished_at = utc_now()
        session.add(
            Failure(
                id=new_id("FL"),
                job_id=job.id,
                site_id=job.site_id,
                handling=handling,
                category=category,
                message=message,
            )
        )
    append_event(
        job_id,
        "job.failed",
        {"handling": handling, "category": category, "message": message},
    )


async def process_analysis(job_id: str) -> None:
    global collect_analysis_evidence
    global run_codex_analysis
    global validate_rule_candidate
    if collect_analysis_evidence is None:
        from .site_fetcher import collect_analysis_evidence as evidence_collector

        collect_analysis_evidence = evidence_collector
    if run_codex_analysis is None:
        from .codex_runner import run_codex_analysis as agent_analyzer

        run_codex_analysis = agent_analyzer
    if validate_rule_candidate is None:
        from .rule_validator import validate_rule_candidate as candidate_validator

        validate_rule_candidate = candidate_validator

    settings = get_settings()
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if job is None:
            return
        site = session.get(Site, job.site_id)
        if site is None:
            raise RuntimeError("网站不存在")
        options = json.loads(job.input_json)
        entry_url = site.entry_url
        sample_limit = int(options.get("sample_limit", 3))

    run_dir = settings.run_root / job_id
    manifest = await collect_analysis_evidence(
        entry_url=entry_url,
        run_dir=run_dir,
        sample_limit=sample_limit,
        settings=settings,
    )
    update_job(job_id, progress=30)
    append_event(
        job_id,
        "evidence.collected",
        {"sample_count": len(manifest["samples"]), "progress": 30},
    )

    codex_event_count = 0

    async def on_codex_event(event: dict[str, Any]) -> None:
        nonlocal codex_event_count
        codex_event_count += 1
        event_type = str(event.get("type") or "codex.event")
        if event_type == "thread.started":
            update_job(job_id, codex_thread_id=event.get("thread_id"))
        if codex_event_count <= 100:
            serialized = json_dumps(event)
            payload = (
                event
                if len(serialized) <= 20000
                else {
                    "type": event_type,
                    "truncated": True,
                    "preview": serialized[:18000],
                }
            )
            append_event(job_id, f"codex.{event_type}", payload)
        progress = min(85, 30 + codex_event_count)
        update_job(job_id, progress=progress)

    schema_path = Path(__file__).resolve().parents[1] / "rule_candidate.schema.json"
    candidate, thread_id = await run_codex_analysis(
        run_dir=run_dir,
        schema_path=schema_path,
        settings=settings,
        on_event=on_codex_event,
    )
    validation = validate_rule_candidate(run_dir, candidate)
    append_event(job_id, "rule.validated", validation)
    rule_id = new_id("RV")
    with SessionLocal.begin() as session:
        job = session.get(Job, job_id)
        site = session.get(Site, job.site_id) if job else None
        if job is None or site is None:
            raise RuntimeError("分析任务关联数据不存在")
        previous_version = session.scalar(
            select(RuleVersion.version)
            .where(RuleVersion.site_id == site.id)
            .order_by(RuleVersion.version.desc())
            .limit(1)
        )
        session.add(
            RuleVersion(
                id=rule_id,
                site_id=site.id,
                version=(previous_version or 0) + 1,
                status="candidate",
                config_json=json_dumps(candidate),
                source_job_id=job.id,
            )
        )
        site.name = candidate["site_name"]
        site.status = "pending_review"
        job.status = "succeeded"
        job.progress = 100
        job.codex_thread_id = thread_id
        job.output_json = json_dumps(
            {
                "rule_id": rule_id,
                "candidate": candidate,
                "validation": validation,
                "sample_count": len(manifest["samples"]),
                "samples": manifest["samples"],
                "run_dir": str(run_dir),
            }
        )
        job.finished_at = utc_now()
    append_event(
        job_id,
        "job.succeeded",
        {"rule_id": rule_id, "confidence": candidate["confidence"], "progress": 100},
    )


async def process_collection(job_id: str) -> None:
    global collect_articles
    from .collector import (
        CollectionError as DeterministicCollectionError,
    )
    from .collector import (
        archive_attachment,
    )

    if collect_articles is None:
        from .collector import collect_articles as deterministic_collector

        collect_articles = deterministic_collector

    settings = get_settings()
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if job is None:
            return
        site = session.get(Site, job.site_id)
        execution = session.scalar(select(Execution).where(Execution.job_id == job_id))
        if site is None or execution is None:
            raise RuntimeError("采集任务关联数据不存在")
        rule = session.get(RuleVersion, execution.rule_id)
        if rule is None or rule.status != "published":
            raise DeterministicCollectionError("网站没有已发布的采集规则")
        config = json.loads(rule.config_json)
        options = json.loads(job.input_json)
        sample_limit = int(options.get("sample_limit", 3))
        execution_id = execution.id

    with SessionLocal.begin() as session:
        execution = session.get(Execution, execution_id)
        if execution:
            execution.status = "running"
            execution.started_at = utc_now()
    update_job(job_id, progress=20)
    append_event(job_id, "collection.started", {"limit": sample_limit, "progress": 20})

    articles = await collect_articles(
        entry_url=site.entry_url,
        config=config,
        limit=sample_limit,
        settings=settings,
    )
    inserted_count = 0
    updated_count = 0
    unchanged_count = 0
    pending_archives: list[tuple[str, str, Any]] = []
    affected_version_ids: set[str] = set()
    with SessionLocal.begin() as session:
        for position, article in enumerate(articles):
            existing = session.scalar(select(Article).where(Article.url == article.url))
            is_new_article = existing is None
            previous_fingerprint = existing.fingerprint if existing else None
            content_changed = (
                not is_new_article and previous_fingerprint != article.fingerprint
            )
            if is_new_article:
                existing = Article(
                    id=new_id("AR"),
                    site_id=site.id,
                    execution_id=execution_id,
                    title=article.title,
                    url=article.url,
                    published_at=article.published_at,
                    content_text=article.content_text,
                    raw_html=article.raw_html,
                    fingerprint=article.fingerprint,
                )
                session.add(existing)
                session.flush()
                inserted_count += 1

            version = session.scalar(
                select(ArticleVersion).where(
                    ArticleVersion.article_id == existing.id,
                    ArticleVersion.fingerprint == article.fingerprint,
                )
            )
            is_new_version = version is None
            is_legacy_upgrade = (
                version is not None and version.quality_status == "legacy_unverified"
            )
            if is_new_version:
                version = ArticleVersion(
                    id=new_id("AV"),
                    article_id=existing.id,
                    fingerprint=article.fingerprint,
                    title=article.title,
                    published_at=article.published_at,
                    issuer=article.issuer,
                    notice_type=article.notice_type,
                    content_text=article.content_text,
                    raw_html=article.raw_html,
                    source_html=article.source_html,
                    source_url=article.url,
                    final_url=article.final_url or article.url,
                    source_status_code=article.source_status_code,
                    source_content_type=article.source_content_type,
                    source_encoding=article.source_encoding,
                    source_sha256=article.source_sha256,
                    fetched_at=article.fetched_at,
                    quality_status=article.quality_status,
                    quality_checks_json=json_dumps(article.quality_checks),
                    quality_issues_json=json_dumps(article.quality_issues),
                )
                session.add(version)
                session.flush()
            elif is_legacy_upgrade:
                version.title = article.title
                version.published_at = article.published_at
                version.issuer = article.issuer
                version.notice_type = article.notice_type
                version.content_text = article.content_text
                version.raw_html = article.raw_html
                version.source_html = article.source_html
                version.source_url = article.url
                version.final_url = article.final_url or article.url
                version.source_status_code = article.source_status_code
                version.source_content_type = article.source_content_type
                version.source_encoding = article.source_encoding
                version.source_sha256 = article.source_sha256
                version.fetched_at = article.fetched_at
                version.quality_status = article.quality_status
                version.quality_checks_json = json_dumps(article.quality_checks)
                version.quality_issues_json = json_dumps(article.quality_issues)

            if content_changed:
                updated_count += 1
            elif not is_new_article:
                unchanged_count += 1

            existing.site_id = site.id
            existing.execution_id = execution_id
            existing.title = article.title
            existing.published_at = article.published_at
            existing.content_text = article.content_text
            existing.raw_html = article.raw_html
            existing.fingerprint = article.fingerprint

            session.add(
                ExecutionArticle(
                    id=new_id("EA"),
                    execution_id=execution_id,
                    article_id=existing.id,
                    version_id=version.id,
                    position=position,
                    outcome=(
                        "inserted"
                        if is_new_article
                        else "updated"
                        if content_changed
                        else "unchanged"
                    ),
                )
            )

            if is_new_version or is_legacy_upgrade:
                checks = dict(article.quality_checks)
                checks["attachments_archived"] = not article.attachments
                issues = list(article.quality_issues)
                if article.attachments:
                    issues.append("附件归档处理中")
                    version.quality_status = "needs_review"
                version.quality_checks_json = json_dumps(checks)
                version.quality_issues_json = json_dumps(issues)
                affected_version_ids.add(version.id)
                for attachment in article.attachments:
                    attachment_row = ArticleAttachment(
                        id=new_id("AT"),
                        version_id=version.id,
                        name=attachment.name,
                        url=attachment.url,
                        status="pending",
                    )
                    session.add(attachment_row)
                    pending_archives.append(
                        (attachment_row.id, version.id, attachment)
                    )
            elif article.attachments:
                stored_attachments = {
                    item.url: item
                    for item in session.scalars(
                        select(ArticleAttachment).where(
                            ArticleAttachment.version_id == version.id
                        )
                    )
                }
                for attachment in article.attachments:
                    attachment_row = stored_attachments.get(attachment.url)
                    if attachment_row is None:
                        attachment_row = ArticleAttachment(
                            id=new_id("AT"),
                            version_id=version.id,
                            name=attachment.name,
                            url=attachment.url,
                        )
                        session.add(attachment_row)
                    if attachment_row.status != "archived":
                        attachment_row.status = "pending"
                        attachment_row.error_message = None
                        pending_archives.append(
                            (attachment_row.id, version.id, attachment)
                        )
                        affected_version_ids.add(version.id)

    for attachment_id, _version_id, attachment in pending_archives:
        archive = await archive_attachment(attachment, settings)
        storage_path = None
        if archive.status == "archived" and archive.content and archive.sha256:
            suffix = Path(urlparse(attachment.url).path).suffix.lower() or ".bin"
            storage_path = f"{archive.sha256}{suffix}"
            target = settings.attachment_root / storage_path
            if not target.exists():
                target.write_bytes(archive.content)
        with SessionLocal.begin() as session:
            attachment_row = session.get(ArticleAttachment, attachment_id)
            if attachment_row:
                attachment_row.status = archive.status
                attachment_row.content_type = archive.content_type
                attachment_row.size_bytes = archive.size_bytes
                attachment_row.sha256 = archive.sha256
                attachment_row.storage_path = storage_path
                attachment_row.error_message = archive.error_message

    with SessionLocal.begin() as session:
        for version_id in affected_version_ids:
            version = session.get(ArticleVersion, version_id)
            if version is None:
                continue
            attachment_rows = list(
                session.scalars(
                    select(ArticleAttachment).where(
                        ArticleAttachment.version_id == version_id
                    )
                )
            )
            checks = json.loads(version.quality_checks_json)
            checks["attachments_archived"] = all(
                item.status == "archived" for item in attachment_rows
            )
            issues = [
                issue
                for issue in json.loads(version.quality_issues_json)
                if "附件未完成归档" not in issue and issue != "附件归档处理中"
            ]
            failed_attachments = [
                item for item in attachment_rows if item.status != "archived"
            ]
            if failed_attachments:
                issues.append(f"{len(failed_attachments)} 个附件未完成归档")
            version.quality_checks_json = json_dumps(checks)
            version.quality_issues_json = json_dumps(issues)
            version.quality_status = (
                "passed" if all(checks.values()) and not issues else "needs_review"
            )
        observations = list(
            session.scalars(
                select(ExecutionArticle).where(
                    ExecutionArticle.execution_id == execution_id
                )
            )
        )
        linked_count = len(observations)
        quality_passed_count = sum(
            session.get(ArticleVersion, item.version_id).quality_status == "passed"
            for item in observations
        )
        execution = session.get(Execution, execution_id)
        job = session.get(Job, job_id)
        current_site = session.get(Site, site.id)
        if execution:
            execution.status = "succeeded"
            execution.collected_count = linked_count
            execution.finished_at = utc_now()
        if current_site:
            current_site.status = "collectable"
        if job:
            job.status = "succeeded"
            job.progress = 100
            job.output_json = json_dumps(
                {
                    "execution_id": execution_id,
                    "collected_count": linked_count,
                    "discovered_count": len(articles),
                    "linked_count": linked_count,
                    "inserted_count": inserted_count,
                    "updated_count": updated_count,
                    "unchanged_count": unchanged_count,
                    "quality_passed_count": quality_passed_count,
                }
            )
            job.finished_at = utc_now()
    append_event(
        job_id,
        "job.succeeded",
        {
            "execution_id": execution_id,
            "collected_count": linked_count,
            "discovered_count": len(articles),
            "linked_count": len(articles),
            "inserted_count": inserted_count,
            "updated_count": updated_count,
            "unchanged_count": unchanged_count,
            "quality_passed_count": quality_passed_count,
            "progress": 100,
        },
    )


async def process_job(job_id: str, expected_kind: str | None = None) -> None:
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        kind = job.kind if job else None
    if expected_kind is not None and kind != expected_kind:
        raise RuntimeError(
            f"{expected_kind} Worker 拒绝执行 {kind or 'unknown'} 任务 {job_id}"
        )
    try:
        if kind == "analysis":
            await process_analysis(job_id)
        elif kind == "collection":
            await process_collection(job_id)
        else:
            raise RuntimeError(f"不支持的任务类型：{kind}")
    except Exception as exc:
        traceback.print_exc()
        fail_job(job_id, exc)


async def process_next_job(job_kind: str | None = None) -> str | None:
    job_id = claim_next_job(job_kind)
    if job_id is None:
        return None
    await process_job(job_id, expected_kind=job_kind)
    return job_id
