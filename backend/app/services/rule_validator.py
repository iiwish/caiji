import json
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .collector import extract_value


class RuleValidationError(RuntimeError):
    pass


def validate_rule_candidate(run_dir: Path, candidate: dict) -> dict:
    list_path = run_dir / "list.html"
    detail_paths = sorted(run_dir.glob("detail-*.html"))
    if not list_path.exists() or not detail_paths:
        raise RuleValidationError("缺少规则验证样本")

    list_soup = BeautifulSoup(list_path.read_text(encoding="utf-8"), "html.parser")
    list_config = candidate["list"]
    try:
        rows = list_soup.select(list_config["item_selector"])
    except Exception as exc:
        raise RuleValidationError(f"列表选择器语法错误：{exc}") from exc
    if not rows:
        raise RuleValidationError("列表选择器未命中任何公告")

    link_matches = sum(
        bool(extract_value(row, list_config["link_selector"])) for row in rows
    )
    title_matches = sum(
        bool(extract_value(row, list_config["title_selector"])) for row in rows
    )
    if link_matches == 0 or title_matches == 0:
        raise RuleValidationError("列表规则未提取到有效标题或详情链接")

    manifest_path = run_dir / "manifest.json"
    manifest = (
        json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest_path.exists()
        else {}
    )
    entry_url = manifest.get("entry_url", "")
    sample_rows = []
    for row in rows[:5]:
        href = extract_value(row, list_config["link_selector"])
        title = extract_value(row, list_config["title_selector"])
        if not href or not title:
            continue
        sample_rows.append(
            {
                "title": title,
                "url": urljoin(entry_url, href) if entry_url else href,
                "published_at": extract_value(
                    row, list_config.get("date_selector", "")
                ),
            }
        )

    detail_config = candidate["detail"]
    detail_checks = []
    for path in detail_paths:
        soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
        title = extract_value(soup, detail_config["title_selector"])
        content = extract_value(soup, detail_config["content_selector"])
        published_at = extract_value(soup, detail_config["published_at_selector"])
        passed = bool(title and published_at and len(content) >= 160)
        detail_checks.append(
            {
                "file": path.name,
                "passed": passed,
                "title_length": len(title),
                "content_length": len(content),
                "has_published_at": bool(published_at),
                "title": title,
                "published_at": published_at,
            }
        )
    if not all(check["passed"] for check in detail_checks):
        raise RuleValidationError("详情规则未通过全部样本验证")

    return {
        "passed": True,
        "list_item_count": len(rows),
        "link_match_count": link_matches,
        "title_match_count": title_matches,
        "sample_rows": sample_rows,
        "detail_checks": detail_checks,
    }
