import argparse
import asyncio
import re
from collections import Counter
from typing import Any

from db import get_database

# Heuristics for noisy memorization-style notes in examples.
NOISE_PATTERNS = [
    re.compile(r"^\*"),
    re.compile(r"[=→]"),
    re.compile(r"\([^)]*[\u4e00-\u9fff][^)]*\)"),
]

POS_MAP = {
    "n": "n.",
    "v": "v.",
    "a": "adj.",
    "s": "adj.",
    "r": "adv.",
}

PENN_TO_POS = {
    "NN": "n.",
    "VB": "v.",
    "JJ": "adj.",
    "RB": "adv.",
}


def looks_like_sentence(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if len(stripped.split()) < 4:
        return False
    return bool(re.search(r"[.!?]$", stripped))


def is_noisy_example(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True

    if any(p.search(stripped) for p in NOISE_PATTERNS):
        return True

    # Very short entries are usually notes rather than example sentences.
    if len(stripped.split()) <= 3 and not looks_like_sentence(stripped):
        return True

    return False


def clean_examples(examples: Any) -> list[str]:
    if not isinstance(examples, list):
        return []

    cleaned: list[str] = []
    for item in examples:
        text = ""
        if isinstance(item, str):
            text = item
        elif isinstance(item, dict):
            if "text" in item and isinstance(item.get("text"), str):
                text = str(item.get("text"))
            elif len(item) == 1:
                maybe_text = next(iter(item.values()))
                if isinstance(maybe_text, str):
                    text = maybe_text

        if not text:
            continue

        text = re.sub(r"\s+", " ", text).strip()
        if not is_noisy_example(text):
            cleaned.append(text)

    return cleaned


def _tokenize_words(sentence: str) -> list[str]:
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", sentence)


def sentence_mentions_word(word: str, sentence: str) -> bool:
    if not word:
        return True

    tokens = _tokenize_words(sentence)
    if not tokens:
        return False

    target = word.lower()

    try:
        from nltk.stem import WordNetLemmatizer

        lemmatizer = WordNetLemmatizer()
        for token in tokens:
            lowered = token.lower()
            if lowered == target:
                return True
            if lemmatizer.lemmatize(lowered, "n") == target:
                return True
            if lemmatizer.lemmatize(lowered, "v") == target:
                return True
        return False
    except Exception:
        return any(token.lower() == target for token in tokens)


def infer_example_pos(word: str, sentence: str, fallback_tags: list[str]) -> str:
    if not word:
        return fallback_tags[0] if fallback_tags else "n."

    try:
        import nltk
        from nltk.stem import WordNetLemmatizer
    except Exception:
        return fallback_tags[0] if fallback_tags else "n."

    tokens = _tokenize_words(sentence)
    if not tokens:
        return fallback_tags[0] if fallback_tags else "n."

    tagged = nltk.pos_tag(tokens)
    lemmatizer = WordNetLemmatizer()
    target = word.lower()

    score: Counter[str] = Counter()
    for token, penn in tagged:
        lowered = token.lower()
        lemma_n = lemmatizer.lemmatize(lowered, "n")
        lemma_v = lemmatizer.lemmatize(lowered, "v")

        if lowered == target or lemma_n == target or lemma_v == target:
            for prefix, mapped in PENN_TO_POS.items():
                if penn.startswith(prefix):
                    score[mapped] += 1
                    break

    if score:
        order = {"n.": 0, "v.": 1, "adj.": 2, "adv.": 3}
        return sorted(score.keys(), key=lambda k: (-score[k], order.get(k, 99)))[0]

    return fallback_tags[0] if fallback_tags else "n."


def format_examples_with_pos(examples: list[str], word: str, fallback_tags: list[str]) -> list[dict[str, str]]:
    formatted: list[dict[str, str]] = []
    for sentence in examples:
        pos = infer_example_pos(word=word, sentence=sentence, fallback_tags=fallback_tags)
        formatted.append({pos: sentence})
    return formatted


def collect_example_pos_tags(examples: list[dict[str, str]]) -> list[str]:
    tags: list[str] = []
    for item in examples:
        if not isinstance(item, dict) or len(item) != 1:
            continue
        key = next(iter(item.keys()))
        if key in {"n.", "v.", "adj.", "adv."} and key not in tags:
            tags.append(key)
    return tags


def infer_pos_tags(word: str) -> list[str]:
    try:
        from nltk.corpus import wordnet as wn
    except Exception:
        return []

    pos_counter: Counter[str] = Counter()
    for synset in wn.synsets(word):
        pos = synset.pos()
        mapped = POS_MAP.get(pos)
        if mapped:
            pos_counter[mapped] += 1

    # Keep stable ordering by frequency, then by common POS order.
    order = {"n.": 0, "v.": 1, "adj.": 2, "adv.": 3}
    return sorted(pos_counter.keys(), key=lambda k: (-pos_counter[k], order.get(k, 99)))


def merge_posandchinese(existing: Any, inferred_tags: list[str]) -> dict[str, str]:
    base: dict[str, str] = existing if isinstance(existing, dict) else {}
    merged: dict[str, str] = {}

    for tag in inferred_tags:
        merged[tag] = str(base.get(tag, "")).strip()

    # Keep existing keys that are not standard inferred tags to avoid data loss.
    for key, value in base.items():
        if key not in merged:
            merged[str(key)] = str(value)

    return merged


async def ensure_wordnet() -> None:
    import nltk
    from nltk.corpus import wordnet as wn

    resources = [
        "wordnet",
        "omw-1.4",
        "averaged_perceptron_tagger",
        "averaged_perceptron_tagger_eng",
    ]

    for name in resources:
        try:
            nltk.data.find(f"corpora/{name}")
        except LookupError:
            try:
                nltk.data.find(f"taggers/{name}")
            except LookupError:
                nltk.download(name, quiet=True)

    wn.synsets("test")


async def process_words(limit: int | None, dry_run: bool, only_id: str | None) -> None:
    await ensure_wordnet()

    db = get_database()
    collection = db["words"]

    query: dict[str, Any] = {"id": only_id} if only_id else {}
    cursor = collection.find(query)
    if limit is not None and limit > 0:
        cursor = cursor.limit(limit)

    changed_count = 0
    scanned_count = 0

    async for doc in cursor:
        scanned_count += 1
        word = str(doc.get("word", "")).strip()

        old_examples = doc.get("examples", [])
        cleaned_example_texts = clean_examples(old_examples)
        if word:
            cleaned_example_texts = [
                s for s in cleaned_example_texts if sentence_mentions_word(word=word, sentence=s)
            ]

        inferred_tags = infer_pos_tags(word.lower()) if word else []
        new_examples = format_examples_with_pos(
            examples=cleaned_example_texts,
            word=word,
            fallback_tags=inferred_tags,
        )
        example_tags = collect_example_pos_tags(new_examples)
        merged_tags = list(dict.fromkeys([*inferred_tags, *example_tags]))
        new_posandchinese = merge_posandchinese(doc.get("posandchinese"), merged_tags)

        updates: dict[str, Any] = {}
        if new_examples != old_examples:
            updates["examples"] = new_examples
        if new_posandchinese != doc.get("posandchinese"):
            updates["posandchinese"] = new_posandchinese

        if updates:
            changed_count += 1
            doc_id = str(doc.get("id") or doc.get("_id"))
            print(f"[CHANGE] {doc_id} | word={word} | fields={list(updates.keys())}")

            if dry_run:
                if "examples" in updates:
                    print(f"  examples: {old_examples} -> {new_examples}")
                if "posandchinese" in updates:
                    print(f"  posandchinese: {doc.get('posandchinese')} -> {new_posandchinese}")
            else:
                await collection.update_one({"_id": doc["_id"]}, {"$set": updates})

    mode = "DRY-RUN" if dry_run else "APPLY"
    print(f"[{mode}] scanned={scanned_count}, changed={changed_count}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clean examples and infer POS for words.")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of docs to process")
    parser.add_argument("--apply", action="store_true", help="Write updates to DB")
    parser.add_argument("--id", dest="only_id", default=None, help="Process one word by id")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(process_words(limit=args.limit, dry_run=not args.apply, only_id=args.only_id))


if __name__ == "__main__":
    main()
