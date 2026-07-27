import asyncio
import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .db import SessionLocal, get_db, init_db
from .models import (
    Article,
    ArticleAttachment,
    ArticleVersion,
    CollectionPlan,
    Execution,
    ExecutionArticle,
    Failure,
    Folder,
    Job,
    JobEvent,
    RuleVersion,
    Site,
    utc_now,
)
from .schemas import (
    AnalysisCreate,
    ArticleDetailRead,
    ArticleRead,
    AttachmentRead,
    CollectionCreate,
    ExecutionRead,
    FailureRead,
    FolderCreate,
    FolderRead,
    JobEventRead,
    JobRead,
    PlanRead,
    PlanUpsert,
    RuleRead,
    SiteCreate,
    SiteRead,
)
from .services.jobs import TERMINAL_STATUSES, append_event, json_dumps, new_id
from .services.site_fetcher import FetchError, validate_public_url
from .url_identity import normalize_entry_url, site_id_for_url

DEFAULT_FOLDER_ID = "FD-DEFAULT"


def ensure_default_folder() -> None:
    with SessionLocal.begin() as session:
        if session.get(Folder, DEFAULT_FOLDER_ID) is None:
            session.add(
                Folder(
                    id=DEFAULT_FOLDER_ID,
                    name="默认文件夹",
                    is_default=True,
                )
            )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    ensure_default_folder()
    yield


app = FastAPI(
    title="采集平台本地后端",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_json(value: str | None) -> dict | None:
    return json.loads(value) if value else None


def serialize_job(job: Job) -> JobRead:
    return JobRead.model_validate(job).model_copy(
        update={"output": parse_json(job.output_json)}
    )


def serialize_event(event: JobEvent) -> JobEventRead:
    return JobEventRead.model_validate(event).model_copy(
        update={"payload": parse_json(event.payload_json) or {}}
    )


def serialize_rule(rule: RuleVersion) -> RuleRead:
    return RuleRead.model_validate(rule).model_copy(
        update={"config": parse_json(rule.config_json) or {}}
    )


def serialize_execution(db: Session, execution: Execution) -> ExecutionRead:
    job = db.get(Job, execution.job_id)
    output = parse_json(job.output_json) if job else None
    linked_count = len(
        list(
            db.scalars(
                select(ExecutionArticle.id).where(
                    ExecutionArticle.execution_id == execution.id
                )
            )
        )
    )
    return ExecutionRead.model_validate(execution).model_copy(
        update={
            "discovered_count": int(
                (output or {}).get("discovered_count", execution.collected_count)
            ),
            "linked_count": linked_count,
            "inserted_count": int((output or {}).get("inserted_count", linked_count)),
            "updated_count": int((output or {}).get("updated_count", 0)),
            "unchanged_count": int((output or {}).get("unchanged_count", 0)),
            "quality_passed_count": int(
                (output or {}).get("quality_passed_count", 0)
            ),
            "collected_count": linked_count,
        }
    )


def latest_observation(db: Session, article_id: str) -> ExecutionArticle | None:
    return db.scalar(
        select(ExecutionArticle)
        .where(ExecutionArticle.article_id == article_id)
        .order_by(ExecutionArticle.created_at.desc())
    )


def serialize_article(
    db: Session,
    article: Article,
    observation: ExecutionArticle | None = None,
) -> ArticleRead:
    observation = observation or latest_observation(db, article.id)
    version = (
        db.get(ArticleVersion, observation.version_id) if observation else None
    )
    return ArticleRead(
        id=article.id,
        site_id=article.site_id,
        execution_id=observation.execution_id if observation else article.execution_id,
        title=version.title if version else article.title,
        url=article.url,
        published_at=version.published_at if version else article.published_at,
        content_text=version.content_text if version else article.content_text,
        fingerprint=version.fingerprint if version else article.fingerprint,
        version_id=version.id if version else "",
        observation_id=observation.id if observation else "",
        observation_outcome=observation.outcome if observation else "",
        issuer=version.issuer if version else None,
        notice_type=version.notice_type if version else None,
        quality_status=version.quality_status if version else "legacy_unverified",
        quality_checks=parse_json(version.quality_checks_json) if version else {},
        quality_issues=(
            json.loads(version.quality_issues_json) if version else ["缺少质量记录"]
        ),
        created_at=article.created_at,
    )


def serialize_article_detail(
    db: Session,
    article: Article,
    observation: ExecutionArticle | None = None,
) -> ArticleDetailRead:
    observation = observation or latest_observation(db, article.id)
    summary = serialize_article(db, article, observation)
    version = (
        db.get(ArticleVersion, observation.version_id) if observation else None
    )
    execution = (
        db.get(Execution, observation.execution_id)
        if observation
        else db.get(Execution, article.execution_id)
    )
    site = db.get(Site, article.site_id)
    attachments = (
        list(
            db.scalars(
                select(ArticleAttachment)
                .where(ArticleAttachment.version_id == version.id)
                .order_by(ArticleAttachment.created_at.asc())
            )
        )
        if version
        else []
    )
    return ArticleDetailRead(
        **summary.model_dump(),
        raw_html=version.raw_html if version else article.raw_html,
        source_html=version.source_html if version else article.raw_html,
        source_url=version.source_url if version else article.url,
        final_url=version.final_url if version else article.url,
        source_status_code=version.source_status_code if version else 0,
        source_content_type=version.source_content_type if version else "text/html",
        source_encoding=version.source_encoding if version else "utf-8",
        source_sha256=version.source_sha256 if version else article.fingerprint,
        fetched_at=version.fetched_at if version else article.created_at,
        attachments=[
            AttachmentRead(
                id=item.id,
                name=item.name,
                url=item.url,
                status=item.status,
                content_type=item.content_type,
                size_bytes=item.size_bytes,
                sha256=item.sha256,
                error_message=item.error_message,
                archived_url=(
                    f"/api/attachments/{item.id}/content"
                    if item.status == "archived" and item.storage_path
                    else None
                ),
            )
            for item in attachments
        ],
        rule_id=execution.rule_id if execution else "",
        site_name=site.name if site else "",
    )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/folders", response_model=list[FolderRead])
def list_folders(db: Session = Depends(get_db)) -> list[Folder]:
    return list(db.scalars(select(Folder).order_by(Folder.created_at.asc())))


@app.post(
    "/api/folders", response_model=FolderRead, status_code=status.HTTP_201_CREATED
)
def create_folder(payload: FolderCreate, db: Session = Depends(get_db)) -> Folder:
    if payload.parent_id and db.get(Folder, payload.parent_id) is None:
        raise HTTPException(status_code=404, detail="父文件夹不存在")
    folder = Folder(
        id=new_id("FD"),
        name=payload.name.strip(),
        parent_id=payload.parent_id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@app.get("/api/sites", response_model=list[SiteRead])
def list_sites(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[Site]:
    return list(
        db.scalars(
            select(Site).order_by(Site.created_at.desc()).offset(offset).limit(limit)
        )
    )


@app.post("/api/sites", response_model=SiteRead)
def create_site(payload: SiteCreate, db: Session = Depends(get_db)) -> Site:
    url = str(payload.url)
    settings = get_settings()
    try:
        validate_public_url(url, settings)
    except FetchError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    normalized_url = normalize_entry_url(url)
    existing = db.scalar(select(Site).where(Site.normalized_url == normalized_url))
    if existing:
        return existing
    folder_id = payload.folder_id or DEFAULT_FOLDER_ID
    if db.get(Folder, folder_id) is None:
        raise HTTPException(status_code=404, detail="归属文件夹不存在")
    site = Site(
        id=site_id_for_url(normalized_url),
        name=host,
        entry_url=url,
        normalized_url=normalized_url,
        normalized_host=host,
        folder_id=folder_id,
    )
    db.add(site)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="网站已存在") from exc
    db.refresh(site)
    return site


@app.get("/api/sites/{site_id}", response_model=SiteRead)
def get_site(site_id: str, db: Session = Depends(get_db)) -> Site:
    site = db.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=404, detail="网站不存在")
    return site


@app.post("/api/sites/{site_id}/analysis", response_model=JobRead)
def create_analysis(
    site_id: str,
    payload: AnalysisCreate,
    db: Session = Depends(get_db),
) -> JobRead:
    site = db.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=404, detail="网站不存在")
    active = db.scalar(
        select(Job).where(
            Job.site_id == site_id,
            Job.kind == "analysis",
            Job.status.in_(["queued", "running"]),
        )
    )
    if active:
        return serialize_job(active)
    job = Job(
        id=new_id("AJ"),
        kind="analysis",
        site_id=site_id,
        input_json=json_dumps(payload.model_dump()),
    )
    site.status = "analysis_queued"
    db.add(job)
    db.commit()
    db.refresh(job)
    append_event(job.id, "job.queued", payload.model_dump())
    return serialize_job(job)


@app.get("/api/jobs", response_model=list[JobRead])
def list_jobs(
    kind: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[JobRead]:
    statement = select(Job).order_by(Job.created_at.desc()).offset(offset).limit(limit)
    if kind:
        statement = statement.where(Job.kind == kind)
    return [serialize_job(job) for job in db.scalars(statement)]


@app.get("/api/jobs/{job_id}", response_model=JobRead)
def get_job(job_id: str, db: Session = Depends(get_db)) -> JobRead:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return serialize_job(job)


@app.get("/api/jobs/{job_id}/events", response_model=list[JobEventRead])
def list_job_events(
    job_id: str,
    after: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[JobEventRead]:
    if db.get(Job, job_id) is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    events = db.scalars(
        select(JobEvent)
        .where(JobEvent.job_id == job_id, JobEvent.id > after)
        .order_by(JobEvent.id.asc())
    )
    return [serialize_event(event) for event in events]


@app.get("/api/jobs/{job_id}/stream")
async def stream_job(job_id: str) -> StreamingResponse:
    with SessionLocal() as session:
        if session.get(Job, job_id) is None:
            raise HTTPException(status_code=404, detail="任务不存在")

    async def generate() -> AsyncGenerator[str, None]:
        last_event_id = 0
        idle_terminal_checks = 0
        while True:
            with SessionLocal() as session:
                events = list(
                    session.scalars(
                        select(JobEvent)
                        .where(
                            JobEvent.job_id == job_id,
                            JobEvent.id > last_event_id,
                        )
                        .order_by(JobEvent.id.asc())
                    )
                )
                job = session.get(Job, job_id)
                job_status = job.status if job else "failed"
            for event in events:
                last_event_id = event.id
                data = serialize_event(event).model_dump(mode="json")
                yield f"id: {event.id}\nevent: {event.event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
            if job_status in TERMINAL_STATUSES:
                idle_terminal_checks += 1
                if idle_terminal_checks >= 2:
                    return
            await asyncio.sleep(0.5)

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/jobs/{job_id}/cancel", response_model=JobRead)
def cancel_job(job_id: str, db: Session = Depends(get_db)) -> JobRead:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if job.status != "queued":
        raise HTTPException(status_code=409, detail="只有排队中的任务可以取消")
    job.status = "cancelled"
    job.finished_at = utc_now()
    db.commit()
    append_event(job.id, "job.cancelled")
    return serialize_job(job)


@app.post("/api/jobs/{job_id}/retry", response_model=JobRead)
def retry_job(job_id: str, db: Session = Depends(get_db)) -> JobRead:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if job.status != "failed":
        raise HTTPException(status_code=409, detail="只有失败任务可以重试")
    retried = Job(
        id=new_id("AJ" if job.kind == "analysis" else "CJ"),
        kind=job.kind,
        site_id=job.site_id,
        input_json=job.input_json,
        attempt=job.attempt + 1,
    )
    db.add(retried)
    db.flush()
    if job.kind == "collection":
        previous_execution = db.scalar(
            select(Execution).where(Execution.job_id == job.id)
        )
        if previous_execution is None:
            raise HTTPException(status_code=409, detail="原采集任务缺少运行记录")
        db.add(
            Execution(
                id=new_id("EX"),
                site_id=job.site_id,
                job_id=retried.id,
                rule_id=previous_execution.rule_id,
            )
        )
    db.commit()
    db.refresh(retried)
    append_event(retried.id, "job.queued", {"retry_of": job.id})
    return serialize_job(retried)


@app.get("/api/sites/{site_id}/rules", response_model=list[RuleRead])
def list_rules(site_id: str, db: Session = Depends(get_db)) -> list[RuleRead]:
    if db.get(Site, site_id) is None:
        raise HTTPException(status_code=404, detail="网站不存在")
    rules = db.scalars(
        select(RuleVersion)
        .where(RuleVersion.site_id == site_id)
        .order_by(RuleVersion.version.desc())
    )
    return [serialize_rule(rule) for rule in rules]


@app.post("/api/analysis-jobs/{job_id}/approve", response_model=RuleRead)
def approve_analysis(job_id: str, db: Session = Depends(get_db)) -> RuleRead:
    job = db.get(Job, job_id)
    if job is None or job.kind != "analysis":
        raise HTTPException(status_code=404, detail="分析任务不存在")
    if job.status != "succeeded":
        raise HTTPException(status_code=409, detail="分析任务尚未成功完成")
    rule = db.scalar(select(RuleVersion).where(RuleVersion.source_job_id == job_id))
    if rule is None:
        raise HTTPException(status_code=409, detail="分析任务没有规则候选")
    for published in db.scalars(
        select(RuleVersion).where(
            RuleVersion.site_id == job.site_id,
            RuleVersion.status == "published",
        )
    ):
        published.status = "archived"
    rule.status = "published"
    rule.published_at = utc_now()
    site = db.get(Site, job.site_id)
    if site:
        site.status = "collectable"
    plan = db.scalar(
        select(CollectionPlan).where(CollectionPlan.site_id == job.site_id)
    )
    if plan is None:
        db.add(
            CollectionPlan(
                id=new_id("PL"),
                site_id=job.site_id,
                enabled=True,
                sample_limit=3,
            )
        )
    db.commit()
    db.refresh(rule)
    return serialize_rule(rule)


@app.get("/api/sites/{site_id}/plan", response_model=PlanRead)
def get_plan(site_id: str, db: Session = Depends(get_db)) -> CollectionPlan:
    plan = db.scalar(select(CollectionPlan).where(CollectionPlan.site_id == site_id))
    if plan is None:
        raise HTTPException(status_code=404, detail="采集计划不存在")
    return plan


@app.put("/api/sites/{site_id}/plan", response_model=PlanRead)
def upsert_plan(
    site_id: str,
    payload: PlanUpsert,
    db: Session = Depends(get_db),
) -> CollectionPlan:
    if db.get(Site, site_id) is None:
        raise HTTPException(status_code=404, detail="网站不存在")
    plan = db.scalar(select(CollectionPlan).where(CollectionPlan.site_id == site_id))
    if plan is None:
        plan = CollectionPlan(id=new_id("PL"), site_id=site_id)
        db.add(plan)
    plan.enabled = payload.enabled
    plan.sample_limit = payload.sample_limit
    db.commit()
    db.refresh(plan)
    return plan


@app.post("/api/sites/{site_id}/execute", response_model=JobRead)
def create_execution(
    site_id: str,
    payload: CollectionCreate,
    db: Session = Depends(get_db),
) -> JobRead:
    site = db.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=404, detail="网站不存在")
    rule = db.scalar(
        select(RuleVersion)
        .where(
            RuleVersion.site_id == site_id,
            RuleVersion.status == "published",
        )
        .order_by(RuleVersion.version.desc())
    )
    if rule is None:
        raise HTTPException(status_code=409, detail="请先审核发布采集规则")
    plan = db.scalar(select(CollectionPlan).where(CollectionPlan.site_id == site_id))
    if plan is None or not plan.enabled:
        raise HTTPException(status_code=409, detail="采集计划不存在或已停用")
    active = db.scalar(
        select(Job).where(
            Job.site_id == site_id,
            Job.kind == "collection",
            Job.status.in_(["queued", "running"]),
        )
    )
    if active:
        return serialize_job(active)
    sample_limit = payload.sample_limit or plan.sample_limit
    job = Job(
        id=new_id("CJ"),
        kind="collection",
        site_id=site_id,
        input_json=json_dumps({"sample_limit": sample_limit}),
    )
    execution = Execution(
        id=new_id("EX"),
        site_id=site_id,
        job_id=job.id,
        rule_id=rule.id,
    )
    db.add(job)
    db.flush()
    db.add(execution)
    db.commit()
    db.refresh(job)
    append_event(job.id, "job.queued", {"sample_limit": sample_limit})
    return serialize_job(job)


@app.get("/api/executions", response_model=list[ExecutionRead])
def list_executions(
    site_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[ExecutionRead]:
    statement = (
        select(Execution)
        .order_by(Execution.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if site_id:
        statement = statement.where(Execution.site_id == site_id)
    return [serialize_execution(db, item) for item in db.scalars(statement)]


@app.get("/api/executions/{execution_id}", response_model=ExecutionRead)
def get_execution(
    execution_id: str,
    db: Session = Depends(get_db),
) -> ExecutionRead:
    execution = db.get(Execution, execution_id)
    if execution is None:
        raise HTTPException(status_code=404, detail="采集批次不存在")
    return serialize_execution(db, execution)


@app.get("/api/articles", response_model=list[ArticleRead])
def list_articles(
    site_id: str | None = None,
    execution_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[ArticleRead]:
    if execution_id:
        observations = list(
            db.scalars(
                select(ExecutionArticle)
                .where(ExecutionArticle.execution_id == execution_id)
                .order_by(ExecutionArticle.position.asc())
                .limit(limit)
            )
        )
        result = []
        for observation in observations:
            article = db.get(Article, observation.article_id)
            if article and (not site_id or article.site_id == site_id):
                result.append(serialize_article(db, article, observation))
        return result

    statement = select(Article).order_by(Article.created_at.desc()).limit(limit)
    if site_id:
        statement = statement.where(Article.site_id == site_id)
    return [serialize_article(db, article) for article in db.scalars(statement)]


@app.get("/api/articles/{article_id}", response_model=ArticleDetailRead)
def get_article(
    article_id: str,
    execution_id: str | None = None,
    db: Session = Depends(get_db),
) -> ArticleDetailRead:
    article = db.get(Article, article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="原文记录不存在")
    observation = None
    if execution_id:
        observation = db.scalar(
            select(ExecutionArticle).where(
                ExecutionArticle.execution_id == execution_id,
                ExecutionArticle.article_id == article_id,
            )
        )
        if observation is None:
            raise HTTPException(status_code=404, detail="该执行未关联此原文")
    return serialize_article_detail(db, article, observation)


@app.get("/api/attachments/{attachment_id}/content")
def get_attachment_content(
    attachment_id: str,
    db: Session = Depends(get_db),
) -> FileResponse:
    attachment = db.get(ArticleAttachment, attachment_id)
    if (
        attachment is None
        or attachment.status != "archived"
        or not attachment.storage_path
    ):
        raise HTTPException(status_code=404, detail="附件归档文件不存在")
    path = (get_settings().attachment_root / attachment.storage_path).resolve()
    root = get_settings().attachment_root.resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="附件归档文件不存在")
    return FileResponse(
        path,
        media_type=attachment.content_type or "application/octet-stream",
        filename=attachment.name,
    )


@app.get("/api/failures", response_model=list[FailureRead])
def list_failures(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[Failure]:
    return list(
        db.scalars(
            select(Failure)
            .order_by(Failure.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    )
