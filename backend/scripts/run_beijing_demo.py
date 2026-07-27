import argparse
import json
import subprocess
import sys
from pathlib import Path

import httpx

DEFAULT_URL = "https://ggzyfw.beijing.gov.cn/jyxxggjtbyqs/index.html"
BACKEND_DIR = Path(__file__).resolve().parents[1]


def run_worker_once(queue: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "app.worker", "--queue", queue, "--once"],
        cwd=BACKEND_DIR,
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Beijing one-site demo.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--limit", type=int, default=3)
    args = parser.parse_args()

    with httpx.Client(base_url=args.base_url, timeout=30) as client:
        health = client.get("/api/health")
        health.raise_for_status()

        site_response = client.post("/api/sites", json={"url": args.url})
        site_response.raise_for_status()
        site = site_response.json()
        print(f"Site: {site['id']} {site['entry_url']}")

        analysis_response = client.post(
            f"/api/sites/{site['id']}/analysis",
            json={"sample_limit": args.limit},
        )
        analysis_response.raise_for_status()
        analysis_job = analysis_response.json()
        print(f"Analysis queued: {analysis_job['id']}")
        run_worker_once("analysis")

        analysis_job = client.get(f"/api/jobs/{analysis_job['id']}").json()
        if analysis_job["status"] != "succeeded":
            print(json.dumps(analysis_job, ensure_ascii=False, indent=2))
            raise SystemExit("Analysis failed")
        candidate = analysis_job["output"]["candidate"]
        print(
            f"Rule candidate: confidence={candidate['confidence']}, "
            f"item={candidate['list']['item_selector']}"
        )

        approve_response = client.post(
            f"/api/analysis-jobs/{analysis_job['id']}/approve"
        )
        approve_response.raise_for_status()
        rule = approve_response.json()
        print(f"Rule published: {rule['id']} v{rule['version']}")

        execution_response = client.post(
            f"/api/sites/{site['id']}/execute",
            json={"sample_limit": args.limit},
        )
        execution_response.raise_for_status()
        collection_job = execution_response.json()
        print(f"Collection queued: {collection_job['id']}")
        run_worker_once("collection")

        collection_job = client.get(f"/api/jobs/{collection_job['id']}").json()
        if collection_job["status"] != "succeeded":
            print(json.dumps(collection_job, ensure_ascii=False, indent=2))
            raise SystemExit("Collection failed")

        articles_response = client.get(
            "/api/articles",
            params={"site_id": site["id"], "limit": args.limit},
        )
        articles_response.raise_for_status()
        articles = articles_response.json()
        print(f"Collected articles: {len(articles)}")
        for article in reversed(articles):
            print(f"- {article['published_at']} {article['title']}")


if __name__ == "__main__":
    main()
