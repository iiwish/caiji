import asyncio
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.collector import CollectedArticle
from app.services.jobs import process_next_job

RULE_CANDIDATE = {
    "site_name": "北京市公共资源交易服务平台",
    "strategy": "html",
    "list": {
        "item_selector": ".article-listjy2 > li",
        "link_selector": "a.divtitlejy::attr(href)",
        "title_selector": "a.divtitlejy::attr(title)",
        "date_selector": ".list-times1",
        "next_page_selector": "",
    },
    "detail": {
        "title_selector": 'meta[http-equiv="ArticleTitle"]::attr(content)',
        "content_selector": ".div-article2 .newsCon::html",
        "published_at_selector": 'meta[http-equiv="PubDate"]::attr(content)',
    },
    "request": {"method": "GET", "interval_ms": 0, "timeout_ms": 15000},
    "confidence": 0.98,
    "notes": ["测试候选"],
}


def test_one_site_workflow(monkeypatch) -> None:
    async def fake_evidence(
        entry_url: str,
        run_dir: Path,
        sample_limit: int,
        settings,
    ) -> dict:
        run_dir.mkdir(parents=True, exist_ok=True)
        return {
            "entry_url": entry_url,
            "samples": [
                {"url": f"{entry_url}#sample-{index}"} for index in range(sample_limit)
            ],
        }

    async def fake_codex(
        run_dir: Path,
        schema_path: Path,
        settings,
        on_event,
    ):
        await on_event({"type": "thread.started", "thread_id": "test-thread"})
        return RULE_CANDIDATE, "test-thread"

    async def fake_collect(entry_url: str, config: dict, limit: int, settings):
        return [
            CollectedArticle(
                title=f"测试公告 {index}",
                url=f"https://ggzyfw.beijing.gov.cn/detail/{index}.html",
                published_at="2026-07-24 09:00:00",
                content_text="测试正文" * 80,
                raw_html="<p>测试正文</p>" * 80,
                fingerprint=f"fingerprint-{index}",
                issuer="测试采购单位",
                notice_type="采购公告",
                source_html=(
                    "<!doctype html><html><head><title>测试公告</title></head>"
                    f"<body><main>{'<p>测试正文</p>' * 80}</main></body></html>"
                ),
                final_url=f"https://ggzyfw.beijing.gov.cn/detail/{index}.html",
                source_sha256=f"source-{index}",
                quality_status="passed",
                quality_checks={
                    "title": True,
                    "detail_url": True,
                    "published_at": True,
                    "content_text": True,
                    "content_html": True,
                    "source_snapshot": True,
                    "issuer": True,
                    "notice_type": True,
                },
            )
            for index in range(1, limit + 1)
        ]

    monkeypatch.setattr("app.services.jobs.collect_analysis_evidence", fake_evidence)
    monkeypatch.setattr("app.services.jobs.run_codex_analysis", fake_codex)
    monkeypatch.setattr(
        "app.services.jobs.validate_rule_candidate",
        lambda _run_dir, _candidate: {
            "passed": True,
            "list_item_count": 3,
            "detail_checks": [],
        },
    )
    monkeypatch.setattr("app.services.jobs.collect_articles", fake_collect)

    with TestClient(app) as client:
        site_response = client.post(
            "/api/sites",
            json={"url": "https://ggzyfw.beijing.gov.cn/jyxxggjtbyqs/index.html"},
        )
        assert site_response.status_code == 200
        site = site_response.json()

        duplicate_response = client.post(
            "/api/sites",
            json={
                "url": "https://ggzyfw.beijing.gov.cn/jyxxggjtbyqs/index.html"
                "?utm_source=duplicate#top"
            },
        )
        assert duplicate_response.json()["id"] == site["id"]

        sibling_response = client.post(
            "/api/sites",
            json={"url": "https://ggzyfw.beijing.gov.cn/jyxxcggg/index.html"},
        )
        sibling_site = sibling_response.json()
        assert sibling_site["id"] != site["id"]
        assert sibling_site["normalized_host"] == site["normalized_host"]

        analysis_response = client.post(
            f"/api/sites/{site['id']}/analysis",
            json={"sample_limit": 3},
        )
        analysis_job = analysis_response.json()
        assert analysis_job["status"] == "queued"

        assert asyncio.run(process_next_job("analysis")) == analysis_job["id"]
        completed_analysis = client.get(f"/api/jobs/{analysis_job['id']}").json()
        assert completed_analysis["status"] == "succeeded"
        assert completed_analysis["output"]["candidate"]["confidence"] == 0.98

        rule_response = client.post(f"/api/analysis-jobs/{analysis_job['id']}/approve")
        assert rule_response.status_code == 200
        assert rule_response.json()["status"] == "published"

        plan_response = client.get(f"/api/sites/{site['id']}/plan")
        assert plan_response.status_code == 200
        first_plan = plan_response.json()
        assert first_plan["sample_limit"] == 3

        sibling_analysis_response = client.post(
            f"/api/sites/{sibling_site['id']}/analysis",
            json={"sample_limit": 2},
        )
        sibling_analysis_job = sibling_analysis_response.json()
        assert sibling_analysis_job["id"] != analysis_job["id"]
        assert asyncio.run(process_next_job("analysis")) == sibling_analysis_job["id"]
        sibling_rule_response = client.post(
            f"/api/analysis-jobs/{sibling_analysis_job['id']}/approve"
        )
        assert sibling_rule_response.status_code == 200
        sibling_plan = client.get(
            f"/api/sites/{sibling_site['id']}/plan"
        ).json()
        assert sibling_plan["site_id"] == sibling_site["id"]
        assert sibling_plan["id"] != first_plan["id"]

        collection_response = client.post(
            f"/api/sites/{site['id']}/execute",
            json={"sample_limit": 3},
        )
        collection_job = collection_response.json()
        assert collection_job["status"] == "queued"

        assert asyncio.run(process_next_job("collection")) == collection_job["id"]
        completed_collection = client.get(f"/api/jobs/{collection_job['id']}").json()
        assert completed_collection["status"] == "succeeded"
        assert completed_collection["output"]["collected_count"] == 3
        first_execution_id = completed_collection["output"]["execution_id"]

        articles = client.get(
            "/api/articles",
            params={"site_id": site["id"], "limit": 10},
        ).json()
        assert len(articles) == 3
        assert all(article["quality_status"] == "passed" for article in articles)
        assert all(article["issuer"] == "测试采购单位" for article in articles)

        repeated_response = client.post(
            f"/api/sites/{site['id']}/execute",
            json={"sample_limit": 3},
        )
        repeated_job = repeated_response.json()
        assert asyncio.run(process_next_job("collection")) == repeated_job["id"]
        repeated_result = client.get(f"/api/jobs/{repeated_job['id']}").json()
        second_execution_id = repeated_result["output"]["execution_id"]
        assert second_execution_id != first_execution_id
        assert repeated_result["output"]["inserted_count"] == 0
        assert repeated_result["output"]["updated_count"] == 0
        assert repeated_result["output"]["unchanged_count"] == 3
        assert repeated_result["output"]["linked_count"] == 3

        repeated_articles = client.get(
            "/api/articles",
            params={"execution_id": second_execution_id, "limit": 10},
        ).json()
        assert len(repeated_articles) == 3
        assert all(
            article["execution_id"] == second_execution_id
            for article in repeated_articles
        )
        assert all(
            article["observation_outcome"] == "unchanged"
            for article in repeated_articles
        )
        repeated_detail = client.get(
            f"/api/articles/{repeated_articles[0]['id']}",
            params={"execution_id": second_execution_id},
        ).json()
        assert repeated_detail["source_html"].startswith("<!doctype html>")
        assert repeated_detail["source_status_code"] == 200
        assert repeated_detail["quality_status"] == "passed"

        events = client.get(f"/api/jobs/{analysis_job['id']}/events").json()
        assert events[-1]["event_type"] == "job.succeeded"
