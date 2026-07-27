import asyncio
import json
import re
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession

from ..config import Settings

DETAIL_PATH_PATTERN = re.compile(r"/\d{8}/\d+\.html$", re.IGNORECASE)


class FetchError(RuntimeError):
    pass


@dataclass
class SampleLink:
    url: str
    title: str


@dataclass
class FetchedDocument:
    text: str
    content: bytes
    requested_url: str
    final_url: str
    status_code: int
    content_type: str
    encoding: str
    fetched_at: datetime


def validate_public_url(url: str, settings: Settings) -> None:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"}:
        raise FetchError("仅支持 HTTP 或 HTTPS 地址")
    if host not in settings.allowed_host_set:
        raise FetchError(
            f"当前本地验证仅允许访问：{', '.join(sorted(settings.allowed_host_set))}"
        )


async def fetch_html(
    client: AsyncSession,
    url: str,
    settings: Settings,
    timeout_seconds: float | None = None,
) -> str:
    return (
        await fetch_document(
            client,
            url,
            settings,
            timeout_seconds=timeout_seconds,
        )
    ).text


async def fetch_document(
    client: AsyncSession,
    url: str,
    settings: Settings,
    timeout_seconds: float | None = None,
) -> FetchedDocument:
    validate_public_url(url, settings)
    response = await client.get(
        url,
        timeout=timeout_seconds or settings.request_timeout_seconds,
        allow_redirects=True,
        impersonate="chrome",
    )
    response.raise_for_status()
    final_url = str(response.url)
    validate_public_url(final_url, settings)
    content_type = response.headers.get("content-type", "")
    if "html" not in content_type.lower():
        raise FetchError(f"目标返回的不是 HTML：{content_type or 'unknown'}")
    return FetchedDocument(
        text=response.text,
        content=bytes(response.content),
        requested_url=url,
        final_url=final_url,
        status_code=response.status_code,
        content_type=content_type,
        encoding=response.encoding or "utf-8",
        fetched_at=datetime.now(UTC),
    )


def discover_sample_links(entry_url: str, html: str, limit: int) -> list[SampleLink]:
    soup = BeautifulSoup(html, "html.parser")
    entry_host = urlparse(entry_url).hostname
    candidates: list[tuple[int, SampleLink]] = []
    seen: set[str] = set()

    for anchor in soup.select("a[href]"):
        absolute_url = urljoin(entry_url, anchor.get("href", ""))
        parsed = urlparse(absolute_url)
        if parsed.hostname != entry_host or absolute_url in seen:
            continue
        if not parsed.path.lower().endswith(".html") or parsed.path.endswith(
            "/index.html"
        ):
            continue
        title = (anchor.get("title") or anchor.get_text(" ", strip=True)).strip()
        if not title:
            continue
        seen.add(absolute_url)
        score = 10 if DETAIL_PATH_PATTERN.search(parsed.path) else 1
        if anchor.get("title"):
            score += 2
        candidates.append((score, SampleLink(url=absolute_url, title=title)))

    candidates.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in candidates[:limit]]


async def collect_analysis_evidence(
    entry_url: str,
    run_dir: Path,
    sample_limit: int,
    settings: Settings,
) -> dict:
    validate_public_url(entry_url, settings)
    run_dir.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": settings.user_agent}
    async with AsyncSession(headers=headers) as client:
        list_html = await fetch_html(client, entry_url, settings)
        sample_links = discover_sample_links(entry_url, list_html, sample_limit)
        if not sample_links:
            raise FetchError("未能从入口页发现可用于分析的详情链接")

        (run_dir / "list.html").write_text(list_html, encoding="utf-8")
        samples = []
        for index, link in enumerate(sample_links, start=1):
            if index > 1:
                await asyncio.sleep(0.25)
            detail_html = await fetch_html(client, link.url, settings)
            filename = f"detail-{index}.html"
            (run_dir / filename).write_text(detail_html, encoding="utf-8")
            samples.append({**asdict(link), "file": filename})

    manifest = {
        "entry_url": entry_url,
        "list_file": "list.html",
        "samples": samples,
        "constraints": {
            "pages": 1,
            "sample_limit": sample_limit,
            "allowed_host": urlparse(entry_url).hostname,
        },
    }
    (run_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest
