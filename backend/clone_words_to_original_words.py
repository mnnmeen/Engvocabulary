import asyncio

from db import get_database


async def clone_words_to_original_words() -> None:
    db = get_database()
    source = db["words"]
    target = db["original_words"]

    source_count = await source.count_documents({})

    # Use $out to copy the full source collection server-side.
    # This replaces original_words with the latest snapshot from words.
    await source.aggregate([
        {"$match": {}},
        {"$out": "original_words"},
    ]).to_list(length=None)

    target_count = await target.count_documents({})

    print(f"words count: {source_count}")
    print(f"original_words count: {target_count}")
    print("Done: copied words -> original_words")


if __name__ == "__main__":
    asyncio.run(clone_words_to_original_words())
