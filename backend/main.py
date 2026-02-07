import math

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from db import get_database

app = FastAPI(title="ENGVOCAB Backend")

# 先允許本機前端（Next.js dev 通常是 3000）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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