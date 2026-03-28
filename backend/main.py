import math
import os
import re
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import get_database
from openrouter_cli import call_openrouter

app = FastAPI(title="ENGVOCAB Backend")


def _build_allowed_origins() -> list[str]:
    base = {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    }

    extra = os.getenv("FRONTEND_ORIGINS", "")
    for origin in extra.split(","):
        value = origin.strip()
        if value:
            base.add(value)

    return sorted(base)


class TrainingGenerateRequest(BaseModel):
    model: str = "openrouter/auto"
    temperature: float = 0.7
    max_output_tokens: int = 900


def _build_training_system_instruction() -> str:
    return (
        "You are an English learning content generator. "
        "Write one coherent practice article in natural English. "
        "Do not include analysis, headings, bullet points, or markdown."
    )


def _build_training_prompt(words: list[str]) -> str:
    joined_words = ", ".join(words)
    return (
        "Write a 220-340 word English practice article for vocabulary review.\n"
        "Requirements:\n"
        "1. The article must be coherent and natural.\n"
        "2. Integrate the target words in meaningful context.\n"
        "3. Adapt the difficulty naturally based on the given words.\n"
        "4. Return only the final article text.\n\n"
        f"Target words:\n{joined_words}"
    )


def _normalize_word(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _bold_training_words(article: str, words: list[str]) -> str:
    target_set = {w.lower() for w in words if w}
    if not target_set:
        return article

    def replace_match(match: re.Match[str]) -> str:
        token = match.group(0)
        if token.lower() in target_set:
            return f"**{token}**"
        return token

    return re.sub(r"[A-Za-z]+(?:'[A-Za-z]+)?", replace_match, article)


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_vec(vec: list[float]) -> list[float] | None:
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

    total = [0.0] * dim
    for vec in vectors:
        if len(vec) != dim:
            return None
        for i, value in enumerate(vec):
            total[i] += value

    avg = [value / len(vectors) for value in total]
    return _normalize_vec(avg)


def _extract_doc_vector(doc: dict[str, Any]) -> list[float] | None:
    raw = doc.get("sense_pos_vectors")
    if not isinstance(raw, dict) or not raw:
        return None

    vectors: list[list[float]] = []
    for _, raw_vec in raw.items():
        if not isinstance(raw_vec, list):
            continue
        vec = [_to_float(v) for v in raw_vec]
        normalized = _normalize_vec(vec)
        if normalized is not None:
            vectors.append(normalized)

    return _avg_vectors(vectors)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _select_training_words(
    docs: list[dict[str, Any]],
    selected_limit: int,
) -> tuple[list[str], dict[str, Any]]:
    normalized_docs: list[dict[str, Any]] = []
    for doc in docs:
        word = _normalize_word(str(doc.get("word", "")))
        if not word:
            continue
        normalized_docs.append(
            {
                "word": word,
                "priority_rank": doc.get("priority_rank"),
                "priority_score": _to_float(doc.get("priority_score")),
                "vector": _extract_doc_vector(doc),
            }
        )

    if not normalized_docs:
        return [], {
            "pool_count": 0,
            "vector_count": 0,
            "rule": "high_top_50_then_vector_top_25",
        }

    vector_docs = [doc for doc in normalized_docs if doc["vector"] is not None]
    centroid = _avg_vectors([doc["vector"] for doc in vector_docs]) if vector_docs else None

    selected: list[dict[str, Any]] = []
    if centroid is not None:
        scored_docs = sorted(
            vector_docs,
            key=lambda doc: (
                _cosine_similarity(doc["vector"], centroid),
                -doc["priority_score"],
            ),
            reverse=True,
        )
        selected.extend(scored_docs[:selected_limit])

    if len(selected) < selected_limit:
        selected_words = {item["word"].lower() for item in selected}
        for doc in normalized_docs:
            if doc["word"].lower() in selected_words:
                continue
            selected.append(doc)
            if len(selected) >= selected_limit:
                break

    words = [item["word"] for item in selected]
    metadata = {
        "pool_count": len(normalized_docs),
        "vector_count": len(vector_docs),
        "selected_count": len(words),
        "rule": "high_top_50_then_vector_top_25",
    }
    return words, metadata

# 先允許本機前端（Next.js dev 通常是 3000）
app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_allowed_origins(),
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/mongo-ping")
async def mongo_ping():
    db = get_database()
    result = await db.command("ping")
    return {"ok": result.get("ok", 0)}


@app.get("/words/{word_id}")
async def get_word(word_id: str):
    """示範：從 english_words.words 取出指定 id 的單字資料。"""
    db = get_database()
    collection = db["words"]

    # 優先假設文件裡有一個 "id" 欄位存這個 UUID
    doc = await collection.find_one({"id": word_id})

    # 如果找不到，也嘗試把它當作 _id 的字串來找
    if doc is None:
        doc = await collection.find_one({"_id": word_id})

    if doc is None:
        raise HTTPException(status_code=404, detail="Word not found")

    # 將 Mongo 特有型別轉成可 JSON 化（這裡先簡化處理）
    doc["_id"] = str(doc.get("_id"))
    return doc


@app.get("/words")
async def list_words(page: int = 1, limit: int = 20):
    if page < 1:
        raise HTTPException(status_code=400, detail="page must be >= 1")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")

    db = get_database()
    collection = db["words"]

    total = await collection.count_documents({})
    total_pages = max(1, math.ceil(total / limit))
    if page > total_pages and total > 0:
        raise HTTPException(status_code=404, detail="page out of range")

    skip = (page - 1) * limit
    cursor = collection.find({}).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)

    for doc in items:
        doc["_id"] = str(doc.get("_id"))

    return {
        "items": items,
        "page": page,
        "limit": limit,
        "total": total,
        "total_pages": total_pages,
    }


@app.get("/stats")
async def get_stats():
    db = get_database()
    collection = db["words"]

    total_words = await collection.count_documents({})
    pipeline = [
        {
            "$project": {
                "collocations_count": {
                    "$sum": {
                        "$map": {
                            "input": {"$ifNull": ["$senses", []]},
                            "as": "sense",
                            "in": {
                                "$size": {
                                    "$ifNull": ["$$sense.collocations", []]
                                }
                            },
                        }
                    }
                }
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$collocations_count"}}},
    ]
    agg_result = await collection.aggregate(pipeline).to_list(length=1)
    total_collocations = agg_result[0]["total"] if agg_result else 0

    return {"total_words": total_words, "total_collocations": total_collocations}


@app.get("/training/candidates")
async def list_training_candidates(limit: int = 30):
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")

    db = get_database()
    collection = db["words"]

    cursor = (
        collection.find(
            {},
            {
                "_id": 1,
                "id": 1,
                "word": 1,
                "priority_score": 1,
                "priority_rank": 1,
                "proficiency": 1,
                "importance": 1,
            },
        )
        .sort(
            [
                ("priority_rank", 1),
                ("priority_score", -1),
                ("word", 1),
            ]
        )
        .limit(limit)
    )

    docs = await cursor.to_list(length=limit)
    items = []
    for doc in docs:
        word = _normalize_word(str(doc.get("word", "")))
        if not word:
            continue

        items.append(
            {
                "_id": str(doc.get("_id")),
                "id": str(doc.get("id", str(doc.get("_id")))),
                "word": word,
                "priority_score": doc.get("priority_score"),
                "priority_rank": doc.get("priority_rank"),
                "proficiency": doc.get("proficiency"),
                "importance": doc.get("importance"),
            }
        )

    return {
        "items": items,
        "count": len(items),
    }


@app.post("/training/generate")
async def generate_training_article(payload: TrainingGenerateRequest):
    db = get_database()
    words_collection = db["words"]

    pool_limit = 50
    selected_limit = 25
    cursor = (
        words_collection.find(
            {"priority_group": "high"},
            {
                "word": 1,
                "priority_rank": 1,
                "priority_score": 1,
                "sense_pos_vectors": 1,
            },
        )
        .sort(
            [
                ("priority_rank", 1),
                ("priority_score", -1),
                ("word", 1),
            ]
        )
        .limit(pool_limit)
    )
    candidate_docs = await cursor.to_list(length=pool_limit)

    selected_words, selection_meta = _select_training_words(
        docs=candidate_docs,
        selected_limit=selected_limit,
    )

    if not selected_words:
        raise HTTPException(status_code=400, detail="No eligible high-priority words found")

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not set")

    try:
        article = call_openrouter(
            api_key=api_key,
            prompt=_build_training_prompt(selected_words),
            model=payload.model,
            system=_build_training_system_instruction(),
            temperature=payload.temperature,
            max_output_tokens=payload.max_output_tokens,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    article = article.strip()
    if not article:
        raise HTTPException(status_code=502, detail="AI returned empty article")

    article_bolded = _bold_training_words(article, selected_words)
    now = datetime.utcnow()

    training_collection = db["training"]
    document = {
        "created_at": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "words": selected_words,
        "article": article,
        "article_bolded": article_bolded,
        "training_ai": {
            "provider": "openrouter",
            "model": payload.model,
            "temperature": payload.temperature,
            "max_output_tokens": payload.max_output_tokens,
        },
        "selection": {
            "pool_limit": pool_limit,
            "selected_limit": selected_limit,
            **selection_meta,
        },
    }
    result = await training_collection.insert_one(document)

    response_document = {
        key: value
        for key, value in document.items()
        if key != "_id"
    }

    return {
        "training_id": str(result.inserted_id),
        **response_document,
    }