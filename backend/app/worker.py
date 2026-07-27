import argparse
import asyncio
import signal

from .config import get_settings
from .db import init_db
from .services.jobs import JOB_KINDS, process_next_job


async def run_worker(queue: str, once: bool = False) -> None:
    settings = get_settings()
    init_db()
    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signal_name in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signal_name, stopping.set)
        except NotImplementedError:
            pass

    print(f"{queue.capitalize()} worker started", flush=True)
    while not stopping.is_set():
        job_id = await process_next_job(queue)
        if once:
            if job_id is None:
                print("No queued jobs", flush=True)
            else:
                print(f"Processed {job_id}", flush=True)
            return
        if job_id is None:
            try:
                await asyncio.wait_for(
                    stopping.wait(), timeout=settings.worker_poll_seconds
                )
            except TimeoutError:
                pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local collector worker.")
    parser.add_argument(
        "--queue",
        required=True,
        choices=sorted(JOB_KINDS),
        help="Only claim jobs from this isolated queue.",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process at most one queued job and exit.",
    )
    args = parser.parse_args()
    asyncio.run(run_worker(queue=args.queue, once=args.once))


if __name__ == "__main__":
    main()
