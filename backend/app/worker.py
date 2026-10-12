import asyncio
import logging

from app.config import Settings
from app.files import detect_type
from app.grading import NotPaperError, check_paper
from app.store import Store

logger = logging.getLogger(__name__)


async def worker(store: Store, config: Settings):
    """Atomic database claims and leases survive restarts and multiple instances."""
    while True:
        paper = None
        try:
            jobs = await store.rpc("claim_paper", lease_seconds=config.lease_seconds)
            if not jobs:
                await asyncio.sleep(2)
                continue
            paper = jobs[0]
            data = await store.download(paper["file_path"])
            async with asyncio.timeout(config.lease_seconds - 30):
                result = await check_paper(data, detect_type(data), config)
            await store.rpc(
                "finish_paper",
                paper_id=paper["id"],
                claim_token=paper["lease_token"],
                grade=result,
                failure=None,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception(
                "Checking failed for paper %s", paper["id"] if paper else "queue"
            )
            if paper:
                message = (
                    str(exc)
                    if isinstance(exc, NotPaperError)
                    else "Checking failed or the AI quota is temporarily unavailable. Wait a few minutes, then re-check."
                )
                try:
                    await store.rpc(
                        "finish_paper",
                        paper_id=paper["id"],
                        claim_token=paper["lease_token"],
                        grade=None,
                        failure=message,
                    )
                except Exception:
                    logger.exception("Could not save failure; lease will recover job")
            else:
                await asyncio.sleep(5)
        if paper:
            await asyncio.sleep(config.min_check_interval_seconds)
