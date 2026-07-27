from bs4 import BeautifulSoup

from app.services.collector import (
    assess_quality,
    extract_issuer,
    extract_notice_type,
    extract_value,
)
from app.services.rule_validator import validate_rule_candidate
from app.services.site_fetcher import discover_sample_links
from app.url_identity import normalize_entry_url, site_id_for_url


def test_discovers_dated_detail_links_first() -> None:
    html = """
    <nav><a href="/other/help.html">帮助</a></nav>
    <ul class="article-listjy2">
      <li><a title="公告一" href="/jyxxggjtbyqs/20260724/1001.html">公告一</a></li>
      <li><a title="公告二" href="/jyxxggjtbyqs/20260724/1002.html">公告二</a></li>
    </ul>
    """

    links = discover_sample_links(
        "https://ggzyfw.beijing.gov.cn/jyxxggjtbyqs/index.html",
        html,
        limit=2,
    )

    assert [link.title for link in links] == ["公告一", "公告二"]
    assert links[0].url.endswith("/20260724/1001.html")


def test_extracts_text_attribute_and_html() -> None:
    soup = BeautifulSoup(
        '<article><a href="/detail">标题</a><div class="body"><b>正文</b></div></article>',
        "html.parser",
    )

    assert extract_value(soup, "a::text") == "标题"
    assert extract_value(soup, "a::attr(href)") == "/detail"
    assert extract_value(soup, ".body::html") == "<b>正文</b>"


def test_rule_validation_returns_real_sample_rows(tmp_path) -> None:
    (tmp_path / "manifest.json").write_text(
        '{"entry_url":"https://ggzyfw.beijing.gov.cn/list/index.html"}',
        encoding="utf-8",
    )
    (tmp_path / "list.html").write_text(
        """
        <ul class="list">
          <li><a href="/detail/1.html" title="公告一">公告一</a><time>2026-07-24</time></li>
        </ul>
        """,
        encoding="utf-8",
    )
    (tmp_path / "detail-1.html").write_text(
        f"""
        <html><head><meta name="date" content="2026-07-24"></head>
        <body><h1>公告一</h1><article>{"正文" * 100}</article></body></html>
        """,
        encoding="utf-8",
    )
    candidate = {
        "list": {
            "item_selector": ".list > li",
            "link_selector": "a::attr(href)",
            "title_selector": "a::attr(title)",
            "date_selector": "time",
        },
        "detail": {
            "title_selector": "h1",
            "content_selector": "article::html",
            "published_at_selector": 'meta[name="date"]::attr(content)',
        },
    }

    result = validate_rule_candidate(tmp_path, candidate)

    assert result["sample_rows"] == [
        {
            "title": "公告一",
            "url": "https://ggzyfw.beijing.gov.cn/detail/1.html",
            "published_at": "2026-07-24",
        }
    ]


def test_deterministic_article_fields_and_quality() -> None:
    content = (
        "本项目已具备招标条件，招标人为 北京市测试建设有限公司，"
        "招标代理机构为测试代理公司。" + "完整公告正文" * 40
    )
    issuer = extract_issuer(content)
    notice_type = extract_notice_type("测试工程施工资格预审公告")
    status, checks, issues = assess_quality(
        title="测试工程施工资格预审公告",
        url="https://ggzyfw.beijing.gov.cn/detail/1.html",
        published_at="2026-07-24 17:00:00",
        content_text=content,
        raw_html=f"<article>{content}</article>",
        source_html=(
            f"<!doctype html><html><body><article>{content}</article></body></html>"
        ),
        issuer=issuer,
        notice_type=notice_type,
    )

    assert issuer == "北京市测试建设有限公司"
    assert notice_type == "资格预审公告"
    assert status == "passed"
    assert all(checks.values())
    assert issues == []


def test_entry_url_identity_is_stable_and_path_scoped() -> None:
    first = normalize_entry_url(
        "HTTPS://WWW.ggzyfw.beijing.gov.cn:443/jyxxggjtbyqs/index.html/"
        "?utm_source=test&category=1#top"
    )
    duplicate = normalize_entry_url(
        "https://ggzyfw.beijing.gov.cn/jyxxggjtbyqs/index.html?category=1"
    )
    sibling = normalize_entry_url(
        "https://ggzyfw.beijing.gov.cn/jyxxcggg/index.html?category=1"
    )
    query_variant = normalize_entry_url(
        "https://ggzyfw.beijing.gov.cn/jyxxggjtbyqs/index.html?category=2"
    )

    assert first == duplicate
    assert site_id_for_url(first) == site_id_for_url(duplicate)
    assert site_id_for_url(first) != site_id_for_url(sibling)
    assert site_id_for_url(first) != site_id_for_url(query_variant)
