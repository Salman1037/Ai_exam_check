"""Inspect or re-queue one failed paper using server-side credentials."""

import argparse
import asyncio
from uuid import UUID

from app.config import settings
from app.store import Store


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paper_id", type=UUID)
    parser.add_argument("--retry", action="store_true")
    parser.add_argument("--wait", type=int, default=0, choices=range(46))
    args = parser.parse_args()
    db = Store(settings())
    try:

        async def fetch():
            rows = await db.request(
                "GET",
                "/rest/v1/papers",
                params={
                    "id": f"eq.{args.paper_id}",
                    "select": "id,user_id,status,total,out_of,results,error_message",
                },
            )
            if not rows:
                raise SystemExit("Paper not found.")
            return rows[0]

        paper = await fetch()
        if args.retry and paper["status"] == "error":
            await db.update(
                str(args.paper_id),
                {
                    "status": "pending",
                    "error_message": None,
                    "lease_until": None,
                    "lease_token": None,
                    "results": None,
                    "total": None,
                    "out_of": None,
                    "checked_at": None,
                },
                user_id=f"eq.{paper['user_id']}",
                status="eq.error",
            )
            paper = await fetch()
            print("Failed paper re-queued.", flush=True)
        deadline = asyncio.get_running_loop().time() + args.wait
        while (
            paper["status"] in ("pending", "checking")
            and asyncio.get_running_loop().time() < deadline
        ):
            await asyncio.sleep(2)
            paper = await fetch()
        print("Status:", paper["status"], flush=True)
        if paper["status"] == "done":
            print("Score:", paper["total"], "/", paper["out_of"], flush=True)
            print("Questions:", len(paper["results"] or []), flush=True)
        elif paper["status"] == "error":
            print(
                "A checking error was saved. Inspect the application logs.", flush=True
            )
    finally:
        await db.http.aclose()


if __name__ == "__main__":
    asyncio.run(main())
