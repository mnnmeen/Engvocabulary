import argparse
import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from db import get_database


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rank words by priority_score for review scheduling."
    )
    parser.add_argument("--top", type=int, default=30, help="How many ranked words to print")
    parser.add_argument("--limit", type=int, default=None, help="Limit docs to scan")
    parser.add_argument(
        "--missing-days",
        type=int,
        default=30,
        help="Fallback days_since_last_review when date is missing",
    )
    parser.add_argument(
        "--default-proficiency",
        type=float,
        default=5.0,
        help="Fallback proficiency when missing/non-numeric",
    )
    parser.add_argument(
        "--default-importance",
        type=float,
        default=5.0,
        help="Fallback importance when missing/non-numeric",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write priority score fields back to MongoDB",
    )
    return parser.parse_args()


def _to_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_date(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value

    text = str(value).strip()
    if not text:
        return None

    # Try common date formats used in this project and generic ISO formats.
    patterns = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
    ]
    for pattern in patterns:
        try:
            return datetime.strptime(text, pattern)
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _days_since_last_review(doc: dict[str, Any], fallback_days: int) -> int:
    today = datetime.now(timezone.utc).date()

    last_review_dt = _parse_date(doc.get("last_review_date"))
    if last_review_dt is None:
        last_review_dt = _parse_date(doc.get("created_date"))

    if last_review_dt is None:
        return max(0, fallback_days)

    last_review_date = last_review_dt.date()
    days = (today - last_review_date).days
    return max(0, days)


def _priority_group(score: float) -> str:
    if score >= 80:
        return "high"
    if score >= 50:
        return "medium"
    return "low"


def build_priority_entry(
    doc: dict[str, Any],
    fallback_days: int,
    default_proficiency: float,
    default_importance: float,
) -> dict[str, Any]:
    days_since_last_review = _days_since_last_review(doc, fallback_days=fallback_days)

    proficiency = _to_float(doc.get("proficiency"), default_proficiency)
    importance = _to_float(doc.get("importance"), default_importance)

    score = (
        (days_since_last_review * 2)
        + ((11 - proficiency) * 5)
        + (importance * 3)
    )

    return {
        "_id": doc["_id"],
        "id": doc.get("id", str(doc.get("_id"))),
        "word": str(doc.get("word", "")),
        "days_since_last_review": days_since_last_review,
        "proficiency": proficiency,
        "importance": importance,
        "priority_score": round(score, 2),
        "priority_group": _priority_group(score),
    }


async def main() -> None:
    args = parse_args()

    db = get_database()
    collection = db["words"]

    cursor = collection.find({})
    if args.limit is not None and args.limit > 0:
        cursor = cursor.limit(args.limit)

    entries: list[dict[str, Any]] = []
    scanned = 0

    async for doc in cursor:
        scanned += 1
        entry = build_priority_entry(
            doc=doc,
            fallback_days=args.missing_days,
            default_proficiency=args.default_proficiency,
            default_importance=args.default_importance,
        )
        entries.append(entry)

    entries.sort(key=lambda item: item["priority_score"], reverse=True)

    if args.apply:
        for index, entry in enumerate(entries, start=1):
            await collection.update_one(
                {"_id": entry["_id"]},
                {
                    "$set": {
                        "priority_score": entry["priority_score"],
                        "priority_rank": index,
                        "priority_group": entry["priority_group"],
                        "priority_updated_at": datetime.utcnow().isoformat(),
                    }
                },
            )

    top = max(1, args.top)
    output_rows = []
    for index, entry in enumerate(entries[:top], start=1):
        output_rows.append(
            {
                "rank": index,
                "id": entry["id"],
                "word": entry["word"],
                "priority_score": entry["priority_score"],
                "priority_group": entry["priority_group"],
                "days_since_last_review": entry["days_since_last_review"],
                "proficiency": entry["proficiency"],
                "importance": entry["importance"],
            }
        )

    print(
        json.dumps(
            {
                "scanned": scanned,
                "ranked": len(entries),
                "applied": args.apply,
                "formula": "(days_since_last_review * 2) + ((11 - proficiency) * 5) + (importance * 3)",
                "top": output_rows,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
