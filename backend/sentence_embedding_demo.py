import asyncio
import json
from datetime import date, datetime

from db import get_database

# from sentence_transformers import SentenceTransformer


TARGET_ID = "f76de301-8302-48a0-9212-c074389e95bc"


def _to_jsonable(value):
    if isinstance(value, dict):
        return {k: _to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_jsonable(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


async def main() -> None:
    # model = SentenceTransformer("all-MiniLM-L6-v2")
    # text = "abolish 廢除/廢止 I think bullfighting should be abolished."
    # embedding = model.encode(text)
    # print("Vector length:", len(embedding))
    # print("First 10 values:", embedding[:10])

    db = get_database()
    collection = db["words"]

    doc = await collection.find_one({"id": TARGET_ID})
    if doc is None:
        doc = await collection.find_one({"_id": TARGET_ID})

    if doc is None:
        print(f"Not found: {TARGET_ID}")
        return

    print(json.dumps(_to_jsonable(doc), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())