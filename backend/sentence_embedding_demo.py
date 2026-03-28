import argparse
import asyncio
import json
from datetime import date, datetime
from typing import Any

from db import get_database

try:
    from sentence_transformers import SentenceTransformer
except ImportError as exc:  # pragma: no cover - runtime dependency check
    raise RuntimeError(
        "sentence-transformers is required. Install it with: pip install sentence-transformers"
    ) from exc


DEFAULT_MODEL = "all-MiniLM-L6-v2"
DEFAULT_TARGET_ID = "f76de301-8302-48a0-9212-c074389e95bc"


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


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def _build_pos_embedding_inputs(doc: dict[str, Any]) -> dict[str, str]:
    word = _clean_text(doc.get("word", ""))
    senses = doc.get("senses", [])
    if not isinstance(senses, list):
        return {}

    text_by_pos: dict[str, list[str]] = {}
    for sense in senses:
        if not isinstance(sense, dict):
            continue

        pos = _clean_text(sense.get("pos"))
        if not pos:
            continue

        parts: list[str] = [word, pos]

        chinese = _clean_text(sense.get("chinese", ""))
        if chinese:
            parts.append(chinese)

        examples = sense.get("examples", [])
        if isinstance(examples, list):
            for example in examples:
                text = _clean_text(example)
                if text:
                    parts.append(text)

        collocations = sense.get("collocations", [])
        if isinstance(collocations, list):
            for collocation in collocations:
                if not isinstance(collocation, dict):
                    continue

                phrase = _clean_text(collocation.get("phrase", ""))
                phrase_chinese = _clean_text(collocation.get("phrase_chinese", ""))
                phrase_example = _clean_text(collocation.get("phrase_example", ""))

                if phrase:
                    parts.append(phrase)
                if phrase_chinese:
                    parts.append(phrase_chinese)
                if phrase_example:
                    parts.append(phrase_example)

        pos_text = " ".join(part for part in parts if part)
        if not pos_text:
            continue

        text_by_pos.setdefault(pos, []).append(pos_text)

    # Merge duplicated POS senses into one text input so each unique POS has one vector.
    return {pos: " ".join(chunks) for pos, chunks in text_by_pos.items() if chunks}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate one embedding vector per unique POS under senses."
    )
    parser.add_argument("--id", dest="target_id", default=DEFAULT_TARGET_ID, help="Word id to process")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process all words in collection (ignores --id)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of docs when using --all",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL, help="SentenceTransformer model name")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist vectors to words.sense_pos_vectors in MongoDB",
    )
    return parser.parse_args()


def _build_result(doc: dict[str, Any], model_name: str, pos_vectors: dict[str, list[float]]) -> dict[str, Any]:
    return {
        "id": doc.get("id", str(doc.get("_id"))),
        "word": doc.get("word", ""),
        "model": model_name,
        "vector_dim": len(next(iter(pos_vectors.values()))),
        "pos_count": len(pos_vectors),
        "sense_pos_vectors": pos_vectors,
    }


async def _process_one_doc(
    collection,
    model: SentenceTransformer,
    doc: dict[str, Any],
    model_name: str,
    apply_update: bool,
) -> dict[str, Any] | None:
    pos_inputs = _build_pos_embedding_inputs(doc)
    if not pos_inputs:
        return None

    pos_vectors: dict[str, list[float]] = {}
    for pos, text in pos_inputs.items():
        vector = model.encode(text, normalize_embeddings=True)
        pos_vectors[pos] = [float(v) for v in vector]

    result = _build_result(doc, model_name=model_name, pos_vectors=pos_vectors)

    if apply_update:
        await collection.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "sense_pos_vectors": pos_vectors,
                    "sense_pos_vector_model": model_name,
                    "sense_pos_vector_dim": result["vector_dim"],
                    "sense_pos_vector_updated_at": datetime.utcnow().isoformat(),
                }
            },
        )
        result["applied"] = True
    else:
        result["applied"] = False

    return result


async def main() -> None:
    args = parse_args()
    model = SentenceTransformer(args.model)

    db = get_database()
    collection = db["words"]

    if args.all:
        cursor = collection.find({})
        if args.limit is not None and args.limit > 0:
            cursor = cursor.limit(args.limit)

        scanned = 0
        embedded = 0
        skipped = 0
        sample_results: list[dict[str, Any]] = []

        async for doc in cursor:
            scanned += 1
            result = await _process_one_doc(
                collection=collection,
                model=model,
                doc=doc,
                model_name=args.model,
                apply_update=args.apply,
            )
            if result is None:
                skipped += 1
            else:
                embedded += 1
                if len(sample_results) < 3:
                    sample_results.append(
                        {
                            "id": result["id"],
                            "word": result["word"],
                            "pos_count": result["pos_count"],
                            "vector_dim": result["vector_dim"],
                        }
                    )

            if scanned % 100 == 0:
                print(f"Progress: scanned={scanned}, embedded={embedded}, skipped={skipped}")

        summary = {
            "mode": "all",
            "model": args.model,
            "applied": args.apply,
            "scanned": scanned,
            "embedded": embedded,
            "skipped": skipped,
            "sample_results": sample_results,
        }
        print(json.dumps(_to_jsonable(summary), ensure_ascii=False, indent=2))
        return

    doc = await collection.find_one({"id": args.target_id})
    if doc is None:
        doc = await collection.find_one({"_id": args.target_id})

    if doc is None:
        print(f"Not found: {args.target_id}")
        return

    result = await _process_one_doc(
        collection=collection,
        model=model,
        doc=doc,
        model_name=args.model,
        apply_update=args.apply,
    )
    if result is None:
        print("No valid senses/pos found; nothing to embed.")
        return

    print(json.dumps(_to_jsonable(result), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())