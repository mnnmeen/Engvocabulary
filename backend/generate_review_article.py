import argparse
import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Any

from db import get_database
from openrouter_cli import call_openrouter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a review article from selected vocabulary using OpenRouter."
    )
    parser.add_argument("--count", type=int, default=30, help="Target number of words")
    parser.add_argument(
        "--min-similarity",
        type=float,
        default=0.2,
        help="Minimum cosine similarity to current selected centroid",
    )
    parser.add_argument(
        "--model",
        default="openrouter/auto",
        help="OpenRouter model name",
    )
    parser.add_argument(
        "--fallback-models",
        default="",
        help="Comma-separated fallback OpenRouter models when primary model is unavailable",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.7,
        help="Model temperature",
    )
    parser.add_argument(
        "--max-output-tokens",
        type=int,
        default=900,
        help="OpenRouter max output tokens",
    )
    parser.add_argument(
        "--topic",
        default="auto",
        help="Topic preference, or 'auto' to let model infer natural scenario",
    )
    parser.add_argument(
        "--level",
        default="B1",
        help="Target CEFR level (e.g. A2, B1, B2)",
    )
    parser.add_argument(
        "--genre",
        default="narrative",
        help="Target genre, e.g. narrative, dialogue, reflection, article",
    )
    parser.add_argument(
        "--tone",
        default="friendly",
        help="Target tone, e.g. friendly, formal, motivational",
    )
    parser.add_argument(
        "--length",
        default="280-380 words",
        help="Text length requirement",
    )
    parser.add_argument(
        "--paragraph-count",
        type=int,
        default=1,
        help="Desired number of paragraphs",
    )
    parser.add_argument(
        "--word-notes",
        default="None",
        help="Optional notes for some words",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit candidate docs scanned",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only select words and print prompt, do not call OpenRouter API",
    )
    parser.add_argument(
        "--min-required-words",
        type=int,
        default=12,
        help="Minimum words to keep when auto-retrying after reasoning-length failures",
    )
    return parser.parse_args()


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize(vec: list[float]) -> list[float] | None:
    if not vec:
        return None
    norm = sum(v * v for v in vec) ** 0.5
    if norm <= 0:
        return None
    return [v / norm for v in vec]


def _avg_vectors(vectors: list[list[float]]) -> list[float] | None:
    if not vectors:
        return None
    dim = len(vectors[0])
    if dim == 0:
        return None
    summed = [0.0] * dim
    for vec in vectors:
        if len(vec) != dim:
            return None
        for i, value in enumerate(vec):
            summed[i] += value
    avg = [value / len(vectors) for value in summed]
    return _normalize(avg)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _extract_doc_vector(doc: dict[str, Any]) -> list[float] | None:
    pos_vectors_raw = doc.get("sense_pos_vectors")
    if not isinstance(pos_vectors_raw, dict) or not pos_vectors_raw:
        return None

    norm_vectors: list[list[float]] = []
    for _, raw_vec in pos_vectors_raw.items():
        if not isinstance(raw_vec, list):
            continue
        vec = [_to_float(v) for v in raw_vec]
        normalized = _normalize(vec)
        if normalized is not None:
            norm_vectors.append(normalized)

    return _avg_vectors(norm_vectors)


def _build_system_instruction() -> str:
    return (
        "You are an English learning content generator.\\n\\n"
        "Your task is to create a coherent English practice text based on a selected set of review words.\\n\\n"
        "Follow these rules carefully:\\n"
        "1. The text must sound natural and coherent, not like a list of separate example sentences.\\n"
        "2. Use the target words in meaningful and contextually appropriate ways.\\n"
        "3. If some words are difficult to combine, create a scenario or theme that makes their coexistence feel reasonable.\\n"
        "4. Prioritize fluency, readability, and learning value.\\n"
        "5. Do not force all words into unnatural sentences. If necessary, slightly vary the structure to keep the text smooth.\\n"
        "6. The content should match the requested CEFR difficulty, genre, and tone.\\n"
        "7. The text should help the learner review the target vocabulary in context.\\n"
        "8. Do NOT reveal reasoning or analysis. Return only the final English text."
    )


def _build_prompt(
    *,
    level: str,
    genre: str,
    tone: str,
    topic_preference: str,
    length: str,
    paragraph_count: int,
    words: list[str],
    word_notes: str,
) -> str:
    word_block = ", ".join(words)
    return (
        "Output requirements:\\n"
        f"- CEFR level: {level}\\n"
        f"- Genre: {genre}\\n"
        f"- Tone: {tone}\\n"
        f"- Topic preference: {topic_preference}\\n"
        f"- Length: {length}\\n"
        f"- Number of paragraphs: {paragraph_count}\\n\\n"
        "Target review words:\\n"
        f"{word_block}\\n\\n"
        "Optional notes for some words:\\n"
        f"{word_notes}\\n\\n"
        "Now generate:\\n"
        "- a natural English text\\n"
        "- clearly include all target review words when possible while keeping fluency\\n"
        "- keep the text suitable for vocabulary learning\\n"
        "- Return only the final English text. Do not include reasoning."
    )


def _is_reasoning_length_error(message: str) -> bool:
    lowered = message.lower()
    return (
        "reasoning but no final content" in lowered
        or ("finish_reason=length" in lowered and "no final content" in lowered)
    )


def _build_word_count_schedule(total: int, min_required: int) -> list[int]:
    if total <= 0:
        return [0]

    minimum = max(1, min(min_required, total))
    schedule = [total]
    for ratio in (0.85, 0.7, 0.55, 0.4):
        candidate = max(minimum, int(total * ratio))
        if candidate not in schedule:
            schedule.append(candidate)
    if minimum not in schedule:
        schedule.append(minimum)
    return schedule


def _parse_model_list(primary_model: str, fallback_models: str) -> list[str]:
    models: list[str] = []

    primary = primary_model.strip()
    if primary:
        models.append(primary)

    for raw in fallback_models.split(","):
        model = raw.strip()
        if model and model not in models:
            models.append(model)

    return models


def _looks_incomplete(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True

    if len(stripped) < 160:
        return True

    if stripped[-1] not in {".", "!", "?", '"', "'"}:
        return True

    tail_words = stripped.split()[-3:]
    if tail_words:
        last_word = tail_words[-1].lower().strip(".,!?;:\"'")
        if last_word in {"and", "or", "but", "because", "so", "to", "of", "with", "for"}:
            return True

    return False


def _merge_article(base: str, continuation: str) -> str:
    left = base.rstrip()
    right = continuation.lstrip()
    if not left:
        return right
    if not right:
        return left
    if left.endswith(("\n", " ")):
        return left + right
    return left + " " + right


def _build_template_article(words: list[str], topic_preference: str) -> str:
    use_words = words[: min(len(words), 14)]
    if not use_words:
        return "Today I reviewed vocabulary in a short and practical story."

    topic = topic_preference if topic_preference and topic_preference != "auto" else "daily life"
    chunks = [use_words[i : i + 3] for i in range(0, len(use_words), 3)]
    lines: list[str] = []

    lines.append(
        f"On a busy day about {topic}, I tried to review new words in a natural way."
    )
    for idx, chunk in enumerate(chunks, start=1):
        joined = ", ".join(chunk)
        lines.append(
            f"In scene {idx}, these words appeared in context: {joined}, and each one fit the story naturally."
        )
    lines.append(
        "By the end, the story felt coherent, and the vocabulary was easier to remember in context."
    )
    return " ".join(lines)


async def _load_candidates(limit: int | None) -> list[dict[str, Any]]:
    db = get_database()
    collection = db["words"]

    cursor = collection.find(
        {},
        {
            "_id": 1,
            "id": 1,
            "word": 1,
            "priority_score": 1,
            "priority_rank": 1,
            "sense_pos_vectors": 1,
        },
    )
    if limit is not None and limit > 0:
        cursor = cursor.limit(limit)

    docs = await cursor.to_list(length=None)

    # Prefer user-defined ranking if exists, then priority_score descending.
    docs.sort(
        key=lambda d: (
            d.get("priority_rank") is None,
            d.get("priority_rank", 10**9),
            -_to_float(d.get("priority_score"), 0.0),
        )
    )
    return docs


def _select_words(
    docs: list[dict[str, Any]],
    count: int,
    min_similarity: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    selected: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for doc in docs:
        word = str(doc.get("word", "")).strip()
        if not word:
            continue

        doc_vec = _extract_doc_vector(doc)
        if doc_vec is None:
            skipped.append({
                "id": doc.get("id", str(doc.get("_id"))),
                "word": word,
                "reason": "missing_or_invalid_vector",
            })
            continue

        if not selected:
            selected.append(
                {
                    "id": doc.get("id", str(doc.get("_id"))),
                    "word": word,
                    "priority_score": _to_float(doc.get("priority_score"), 0.0),
                    "similarity": 1.0,
                    "vector": doc_vec,
                }
            )
            if len(selected) >= count:
                break
            continue

        centroid = _avg_vectors([item["vector"] for item in selected])
        if centroid is None:
            break

        similarity = _cosine_similarity(doc_vec, centroid)
        if similarity < min_similarity:
            skipped.append(
                {
                    "id": doc.get("id", str(doc.get("_id"))),
                    "word": word,
                    "reason": "too_far",
                    "similarity": round(similarity, 4),
                }
            )
            continue

        selected.append(
            {
                "id": doc.get("id", str(doc.get("_id"))),
                "word": word,
                "priority_score": _to_float(doc.get("priority_score"), 0.0),
                "similarity": round(similarity, 4),
                "vector": doc_vec,
            }
        )
        if len(selected) >= count:
            break

    return selected, skipped


async def main() -> None:
    args = parse_args()

    docs = await _load_candidates(limit=args.limit)
    selected, skipped = _select_words(
        docs=docs,
        count=max(1, args.count),
        min_similarity=args.min_similarity,
    )

    words = [item["word"] for item in selected]
    system_instruction = _build_system_instruction()
    prompt = _build_prompt(
        level=args.level,
        genre=args.genre,
        tone=args.tone,
        topic_preference=args.topic,
        length=args.length,
        paragraph_count=max(1, args.paragraph_count),
        words=words,
        word_notes=args.word_notes,
    )

    summary = {
        "timestamp": datetime.utcnow().isoformat(),
        "target_count": args.count,
        "selected_count": len(selected),
        "skipped_count": len(skipped),
        "min_similarity": args.min_similarity,
        "selected_words": [
            {
                "id": item["id"],
                "word": item["word"],
                "priority_score": item["priority_score"],
                "similarity": item["similarity"],
            }
            for item in selected
        ],
        "skipped_preview": skipped[:20],
        "requested_model": args.model,
        "level": args.level,
        "genre": args.genre,
        "tone": args.tone,
        "topic_preference": args.topic,
        "length": args.length,
        "paragraph_count": max(1, args.paragraph_count),
        "dry_run": args.dry_run,
    }

    if args.dry_run:
        summary["system_instruction"] = system_instruction
        summary["prompt"] = prompt
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Set it first, e.g. PowerShell: $env:OPENROUTER_API_KEY='your_api_key'"
        )

    if not words:
        raise RuntimeError("No words selected for generation. Try lowering --min-similarity.")

    models_to_try = _parse_model_list(args.model, args.fallback_models)
    word_count_schedule = _build_word_count_schedule(
        total=len(words),
        min_required=args.min_required_words,
    )
    article = None
    used_model = None
    used_word_count = 0
    used_prompt = prompt
    last_error_message = ""
    tried_word_counts: list[int] = []

    for word_count in word_count_schedule:
        tried_word_counts.append(word_count)
        attempt_words = words[:word_count]
        attempt_prompt = _build_prompt(
            level=args.level,
            genre=args.genre,
            tone=args.tone,
            topic_preference=args.topic,
            length=args.length,
            paragraph_count=max(1, args.paragraph_count),
            words=attempt_words,
            word_notes=args.word_notes,
        )

        for model_name in models_to_try:
            try:
                article = call_openrouter(
                    api_key=api_key,
                    prompt=attempt_prompt,
                    model=model_name,
                    system=system_instruction,
                    temperature=args.temperature,
                    max_output_tokens=args.max_output_tokens,
                )
                used_model = model_name
                used_word_count = word_count
                used_prompt = attempt_prompt
                break
            except RuntimeError as exc:
                message = str(exc)
                last_error_message = message

                if "HTTP 404" in message:
                    continue

                if "Network" in message or "timeout" in message.lower():
                    continue

                if _is_reasoning_length_error(message):
                    continue

                break

        if article is not None and used_model is not None:
            break

        if last_error_message and not _is_reasoning_length_error(last_error_message) and not (
            "HTTP 404" in last_error_message and "No endpoints found" in last_error_message
        ):
            break

    if article is None or used_model is None:
        error_output = {
            **summary,
            "error": {
                "type": "openrouter_api_error",
                "message": last_error_message,
            },
            "tried_models": models_to_try,
            "tried_word_counts": tried_word_counts,
            "prompt": used_prompt,
            "hint": (
                "If your OpenRouter quota is exceeded, wait for reset or use another key/project. "
                "If model is unavailable, keep fallback models enabled. "
                "If reasoning keeps consuming tokens, lower --count or --max-output-tokens."
            ),
        }
        print(json.dumps(error_output, ensure_ascii=False, indent=2), file=sys.stderr)
        raise SystemExit(1)

    continuation_attempts = 0
    while _looks_incomplete(article) and continuation_attempts < 2:
        continuation_attempts += 1
        continuation_prompt = (
            "Continue the following English text naturally from where it stopped. "
            "Do not restart the story, do not add headings, and do not include explanations. "
            "Return only the continuation text.\n\n"
            f"Current text:\n{article}"
        )

        try:
            continuation = call_openrouter(
                api_key=api_key,
                prompt=continuation_prompt,
                model=used_model,
                system=system_instruction,
                temperature=args.temperature,
                max_output_tokens=max(256, args.max_output_tokens // 2),
            )
        except RuntimeError:
            break

        if not continuation or not continuation.strip():
            break

        article = _merge_article(article, continuation)

    salvage_used = False
    if _looks_incomplete(article):
        salvage_used = True
        salvage_words = words[: max(args.min_required_words, min(18, len(words)))]
        salvage_prompt = _build_prompt(
            level=args.level,
            genre=args.genre,
            tone=args.tone,
            topic_preference=args.topic,
            length="140-220 words",
            paragraph_count=max(1, args.paragraph_count),
            words=salvage_words,
            word_notes=args.word_notes,
        ) + "\n- Ensure the text ends with a complete sentence."

        try:
            salvage_article = call_openrouter(
                api_key=api_key,
                prompt=salvage_prompt,
                model=used_model,
                system=system_instruction,
                temperature=args.temperature,
                max_output_tokens=max(384, args.max_output_tokens // 2),
            )
            if salvage_article and not _looks_incomplete(salvage_article):
                article = salvage_article
                used_word_count = len(salvage_words)
                used_words = salvage_words
            else:
                used_words = words[:used_word_count]
        except RuntimeError:
            used_words = words[:used_word_count]
    else:
        used_words = words[:used_word_count]

    if _looks_incomplete(article):
        fallback_article = _build_template_article(used_words, args.topic)
        output = {
            **summary,
            "model": used_model,
            "used_word_count": used_word_count,
            "used_words": used_words,
            "continuation_attempts": continuation_attempts,
            "salvage_used": salvage_used,
            "fallback_used": True,
            "partial_article": article,
            "article": fallback_article,
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return

    output = {
        **summary,
        "model": used_model,
        "used_word_count": used_word_count,
        "used_words": used_words,
        "continuation_attempts": continuation_attempts,
        "salvage_used": salvage_used,
        "fallback_used": False,
        "article": article,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
