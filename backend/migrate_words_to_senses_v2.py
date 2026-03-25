import argparse
import asyncio
import re
from collections import defaultdict
from typing import Any

from db import get_database

PENN_TO_POS = {
    "NN": "n.",
    "VB": "v.",
    "JJ": "adj.",
    "RB": "adv.",
}

POS_ORDER = {"n.": 0, "v.": 1, "adj.": 2, "adv.": 3}


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def tokenize_words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)


def parse_examples_by_pos(raw_examples: Any, fallback_pos: str) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = defaultdict(list)
    if not isinstance(raw_examples, list):
        return grouped

    for item in raw_examples:
        if isinstance(item, dict) and len(item) == 1:
            pos = str(next(iter(item.keys()))).strip()
            sentence = next(iter(item.values()))
            if isinstance(sentence, str):
                cleaned = normalize_text(sentence)
                if cleaned:
                    grouped[pos].append(cleaned)
            continue

        if isinstance(item, str):
            cleaned = normalize_text(item)
            if cleaned:
                grouped[fallback_pos].append(cleaned)

    return grouped


def parse_posandchinese(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}

    parsed: dict[str, str] = {}
    for key, value in raw.items():
        pos = str(key).strip()
        zh = normalize_text(str(value)) if value is not None else ""
        if pos:
            parsed[pos] = zh
    return parsed


def ensure_pos_list(pos_map: dict[str, str], examples_by_pos: dict[str, list[str]]) -> list[str]:
    pos_set = set(pos_map.keys()) | set(examples_by_pos.keys())
    if not pos_set:
        pos_set = {"n."}
    return sorted(pos_set, key=lambda p: POS_ORDER.get(p, 99))


def detect_collocation_pos(phrase: str, headword: str, available_pos: list[str]) -> str:
    if not available_pos:
        return "n."
    if len(available_pos) == 1:
        return available_pos[0]

    lowered_phrase = phrase.lower()
    lowered_word = headword.lower().strip()

    if lowered_phrase.startswith("to "):
        return "v." if "v." in available_pos else available_pos[0]

    # Lightweight verb-pattern heuristics.
    if re.search(r"\b(sth|sb)\b", lowered_phrase):
        return "v." if "v." in available_pos else available_pos[0]
    if re.search(r"\bfor/on\b", lowered_phrase):
        return "v." if "v." in available_pos else available_pos[0]

    tokens = tokenize_words(lowered_phrase)
    for token in tokens:
        if lowered_word and (token == lowered_word or token.startswith(lowered_word)):
            if token.endswith("ed") or token.endswith("ing"):
                return "v." if "v." in available_pos else available_pos[0]

    return "n." if "n." in available_pos else available_pos[0]


def build_senses(doc: dict[str, Any]) -> list[dict[str, Any]]:
    word = str(doc.get("word", "")).strip()
    pos_map = parse_posandchinese(doc.get("posandchinese"))
    examples_by_pos = parse_examples_by_pos(
        raw_examples=doc.get("examples", []),
        fallback_pos=next(iter(pos_map.keys()), "n."),
    )

    pos_list = ensure_pos_list(pos_map, examples_by_pos)
    collocations = doc.get("collocations", []) if isinstance(doc.get("collocations"), list) else []

    grouped_collocations: dict[str, list[dict[str, str]]] = defaultdict(list)
    for item in collocations:
        if not isinstance(item, dict):
            continue

        phrase = normalize_text(str(item.get("phrase", "")))
        meaning = normalize_text(str(item.get("meaning", "")))
        example = normalize_text(str(item.get("example", "")))
        if not phrase:
            continue

        pos = detect_collocation_pos(phrase=phrase, headword=word, available_pos=pos_list)
        grouped_collocations[pos].append(
            {
                "phrase": phrase,
                "phrase_chinese": meaning,
                "phrase_example": example,
            }
        )

    senses: list[dict[str, Any]] = []
    for pos in pos_list:
        senses.append(
            {
                "pos": pos,
                "chinese": pos_map.get(pos, ""),
                "examples": examples_by_pos.get(pos, []),
                "collocations": grouped_collocations.get(pos, []),
            }
        )

    return senses


def build_v2_document(doc: dict[str, Any]) -> dict[str, Any]:
    word = str(doc.get("word", "")).strip()

    updated = {
        "id": str(doc.get("id", "")).strip(),
        "word": word,
        "lemma": word.lower(),
        "source": doc.get("source", ""),
        "created_date": doc.get("created_date", ""),
        "proficiency": doc.get("proficiency"),
        "importance": doc.get("importance"),
        "memorize": doc.get("memorize", "No"),
        "last_review_date": "",
        "senses": build_senses(doc),
    }

    return updated


async def migrate(limit: int | None, dry_run: bool, only_id: str | None) -> None:
    db = get_database()
    collection = db["words"]

    query: dict[str, Any] = {"id": only_id} if only_id else {}
    cursor = collection.find(query)
    if limit is not None and limit > 0:
        cursor = cursor.limit(limit)

    scanned = 0
    changed = 0

    async for doc in cursor:
        scanned += 1
        new_doc = build_v2_document(doc)

        # Compare only v2 fields we manage.
        different = any(doc.get(k) != v for k, v in new_doc.items())
        if not different:
            continue

        changed += 1
        doc_id = str(doc.get("id") or doc.get("_id"))
        print(f"[CHANGE] {doc_id} | word={doc.get('word', '')} | fields=v2_schema")

        if dry_run:
            continue

        await collection.update_one({"_id": doc["_id"]}, {"$set": new_doc})

    mode = "DRY-RUN" if dry_run else "APPLY"
    print(f"[{mode}] scanned={scanned}, changed={changed}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate words documents to senses-v2 format.")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of docs to process")
    parser.add_argument("--id", dest="only_id", default=None, help="Process one word by id")
    parser.add_argument("--apply", action="store_true", help="Write updates to DB")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(migrate(limit=args.limit, dry_run=not args.apply, only_id=args.only_id))


if __name__ == "__main__":
    main()
