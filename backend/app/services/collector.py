import asyncio
import hashlib
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag
from curl_cffi.requests import AsyncSession

from ..config import Settings
from .site_fetcher import fetch_document, fetch_html, validate_public_url

EXTRACTOR_PATTERN = re.compile(r"^(.*)::(attr\(([^)]+)\)|text|html)$")


class CollectionError(RuntimeError):
    pass


@dataclass
class CollectedAttachment:
    name: str
    url: str


@dataclass
class ArchivedAttachment:
    status: str
    content_type: str | None = None
    size_bytes: int | None = None
    sha256: str | None = None
    content: bytes | None = None
    error_message: str | None = None


@dataclass
class CollectedArticle:
    title: str
    url: str
    published_at: str | None
    content_text: str
    raw_html: str
    fingerprint: str
    issuer: str | None = None
    notice_type: str | None = None
    source_html: str = ""
    final_url: str = ""
    source_status_code: int = 200
    source_content_type: str = "text/html"
    source_encoding: str = "utf-8"
    source_sha256: str = ""
    fetched_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    quality_status: str = "needs_review"
    quality_checks: dict[str, bool] = field(default_factory=dict)
    quality_issues: list[str] = field(default_factory=list)
    attachments: list[CollectedAttachment] = field(default_factory=list)


NOTICE_TYPES = (
    "资格预审公告",
    "中标候选人公示",
    "中标结果公告",
    "更正公告",
    "招标公告",
    "采购公告",
    "竞争性磋商公告",
    "询价公告",
    "终止公告",
    "合同公告",
)

ISSUER_PATTERN = re.compile(
    r"(?:招\s*标\s*人|采购人|采购单位)(?:名称)?\s*[：:为]?\s*"
    r"(.{2,100}?)(?=\s*(?:招\s*标\s*代理|采购代理|投资额|项目资金|"
    r"地\s*址|，|,|；|;|$))"
)


def extract_value(scope: BeautifulSoup | Tag, expression: str) -> str:
    expression = expression.strip()
    if not expression:
        return ""
    match = EXTRACTOR_PATTERN.match(expression)
    selector = match.group(1).strip() if match else expression
    mode = match.group(2) if match else "text"
    node = scope.select_one(selector)
    if node is None:
        return ""
    if mode.startswith("attr("):
        return str(node.get(match.group(3), "")).strip()
    if mode == "html":
        return node.decode_contents().strip()
    return node.get_text(" ", strip=True)


def extract_notice_type(title: str) -> str | None:
    return next((value for value in NOTICE_TYPES if value in title), None)


def extract_issuer(content_text: str) -> str | None:
    normalized = re.sub(r"\s+", " ", content_text).strip()
    match = ISSUER_PATTERN.search(normalized)
    return match.group(1).strip(" ：:，,；;") if match else None


def extract_attachments(
    raw_html: str,
    detail_url: str,
) -> list[CollectedAttachment]:
    attachments: list[CollectedAttachment] = []
    seen: set[str] = set()
    for anchor in BeautifulSoup(raw_html, "html.parser").select("a[href]"):
        url = urljoin(detail_url, str(anchor.get("href", "")).strip())
        if not url or url in seen:
            continue
        seen.add(url)
        name = (
            anchor.get_text(" ", strip=True)
            or str(anchor.get("title", "")).strip()
            or url.rsplit("/", 1)[-1]
        )
        attachments.append(CollectedAttachment(name=name, url=url))
    return attachments


def assess_quality(
    *,
    title: str,
    url: str,
    published_at: str | None,
    content_text: str,
    raw_html: str,
    source_html: str,
    issuer: str | None,
    notice_type: str | None,
) -> tuple[str, dict[str, bool], list[str]]:
    checks = {
        "title": len(title.strip()) >= 4,
        "detail_url": url.startswith(("http://", "https://")),
        "published_at": bool(published_at),
        "content_text": len(content_text.strip()) >= 100,
        "content_html": len(raw_html.strip()) >= 100,
        "source_snapshot": len(source_html.strip()) > len(raw_html.strip()),
        "issuer": bool(issuer),
        "notice_type": bool(notice_type),
    }
    labels = {
        "title": "标题缺失或过短",
        "detail_url": "详情链接无效",
        "published_at": "发布时间缺失",
        "content_text": "正文内容过短",
        "content_html": "正文 HTML 缺失",
        "source_snapshot": "完整响应快照缺失",
        "issuer": "发布单位或招标人未识别",
        "notice_type": "公告类型未识别",
    }
    issues = [labels[key] for key, passed in checks.items() if not passed]
    return ("passed" if not issues else "needs_review"), checks, issues


async def archive_attachment(
    attachment: CollectedAttachment,
    settings: Settings,
) -> ArchivedAttachment:
    try:
        validate_public_url(attachment.url, settings)
        async with AsyncSession(headers={"User-Agent": settings.user_agent}) as client:
            response = await client.get(
                attachment.url,
                timeout=settings.attachment_timeout_seconds,
                allow_redirects=True,
                impersonate="chrome",
            )
            response.raise_for_status()
        content = bytes(response.content)
        if len(content) > settings.attachment_max_bytes:
            return ArchivedAttachment(
                status="skipped_too_large",
                content_type=response.headers.get("content-type"),
                size_bytes=len(content),
                error_message="附件超过本地归档大小上限",
            )
        return ArchivedAttachment(
            status="archived",
            content_type=response.headers.get("content-type"),
            size_bytes=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
            content=content,
        )
    except Exception as exc:
        message = str(exc).lower()
        if "timed out" in message or "timeout" in message:
            error_message = (
                f"附件下载超时（{int(settings.attachment_timeout_seconds)} 秒）"
            )
        else:
            error_message = "附件归档失败"
        return ArchivedAttachment(
            status="failed",
            error_message=error_message,
        )


async def collect_articles(
    entry_url: str,
    config: dict,
    limit: int,
    settings: Settings,
) -> list[CollectedArticle]:
    headers = {"User-Agent": settings.user_agent}
    request_config = config.get("request", {})
    timeout_seconds = min(
        max(int(request_config.get("timeout_ms", 30000)) / 1000, 1),
        settings.request_timeout_seconds,
    )
    interval_seconds = max(int(request_config.get("interval_ms", 500)), 0) / 1000
    list_config = config["list"]
    detail_config = config["detail"]

    async with AsyncSession(headers=headers) as client:
        list_html = await fetch_html(
            client, entry_url, settings, timeout_seconds=timeout_seconds
        )
        list_soup = BeautifulSoup(list_html, "html.parser")
        rows = list_soup.select(list_config["item_selector"])
        if not rows:
            raise CollectionError("列表选择器未匹配任何公告")

        candidates: list[tuple[str, str, str]] = []
        seen_urls: set[str] = set()
        for row in rows:
            href = extract_value(row, list_config["link_selector"])
            if not href:
                continue
            detail_url = urljoin(entry_url, href)
            if detail_url in seen_urls:
                continue
            seen_urls.add(detail_url)
            title = extract_value(row, list_config["title_selector"])
            published_at = extract_value(row, list_config.get("date_selector", ""))
            candidates.append((detail_url, title, published_at))
            if len(candidates) >= limit:
                break
        if not candidates:
            raise CollectionError("列表规则未提取到有效详情链接")

        articles: list[CollectedArticle] = []
        for index, (url, list_title, list_date) in enumerate(candidates):
            if index:
                await asyncio.sleep(interval_seconds)
            detail_document = await fetch_document(
                client, url, settings, timeout_seconds=timeout_seconds
            )
            detail_html = detail_document.text
            detail_soup = BeautifulSoup(detail_html, "html.parser")
            title = (
                extract_value(detail_soup, detail_config["title_selector"])
                or list_title
            )
            published_at = (
                extract_value(detail_soup, detail_config["published_at_selector"])
                or list_date
                or None
            )
            raw_html = extract_value(detail_soup, detail_config["content_selector"])
            content_node = BeautifulSoup(raw_html, "html.parser")
            content_text = content_node.get_text(" ", strip=True)
            if not title or not raw_html:
                raise CollectionError(f"详情规则未完整提取：{url}")
            issuer = extract_issuer(content_text)
            notice_type = extract_notice_type(title)
            fingerprint = hashlib.sha256(
                f"{title}|{published_at or ''}|{content_text}".encode()
            ).hexdigest()
            source_sha256 = hashlib.sha256(detail_document.content).hexdigest()
            quality_status, quality_checks, quality_issues = assess_quality(
                title=title,
                url=url,
                published_at=published_at,
                content_text=content_text,
                raw_html=raw_html,
                source_html=detail_html,
                issuer=issuer,
                notice_type=notice_type,
            )
            articles.append(
                CollectedArticle(
                    title=title,
                    url=url,
                    published_at=published_at,
                    content_text=content_text,
                    raw_html=raw_html,
                    fingerprint=fingerprint,
                    issuer=issuer,
                    notice_type=notice_type,
                    source_html=detail_html,
                    final_url=detail_document.final_url,
                    source_status_code=detail_document.status_code,
                    source_content_type=detail_document.content_type,
                    source_encoding=detail_document.encoding,
                    source_sha256=source_sha256,
                    fetched_at=detail_document.fetched_at,
                    quality_status=quality_status,
                    quality_checks=quality_checks,
                    quality_issues=quality_issues,
                    attachments=extract_attachments(raw_html, detail_document.final_url),
                )
            )
    return articles
