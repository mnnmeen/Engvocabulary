# Spaced Repetition 實施指南

## 快速上手（30 分鐘）

### Step 1: 預覽遷移（5 分鐘）

```bash
cd backend
python migrate_to_spaced_repetition.py --limit 5
```

查看輸出，確認要遷移的欄位無誤。

### Step 2: 執行遷移（5 分鐘）

```bash
python migrate_to_spaced_repetition.py --apply
```

輸出應該顯示 "Migration Summary"。

### Step 3: 驗證 schema（5 分鐘）

```python
# 在 Python REPL 中
import asyncio
from db import get_database

async def check():
    db = get_database()
    words_col = db["words"]
    sample = await words_col.find_one({})
    print("Sample word schema:")
    for key in ["word", "acquisition_state", "stability", "difficulty", "current_interval", "next_review_date"]:
        print(f"  {key}: {sample.get(key)}")

asyncio.run(check())
```

### Step 4: 建立 ReviewLog Collection（5 分鐘）

```bash
# 在 MongoDB Shell 中（或使用 Python）
db.createCollection("review_log")
db.review_log.createIndex({ "training_id": 1 })
db.review_log.createIndex({ "word_id": 1 })
db.review_log.createIndex({ "review_date": -1 })
```

### Step 5: 測試選字邏輯（5 分鐘）

```python
from word_selection import simulate_word_selection_for_today
from datetime import date

# 假設已經查出 words
words = await words_collection.find({}).to_list(100)

result = simulate_word_selection_for_today(
    all_words=words,
    today=date.today(),
    new_word_limit=5,
    total_limit=30
)

print(f"Selected {result['count']} words today")
print(f"  Due: {result['pools']['due']['selected']}/{result['pools']['due']['total']}")
print(f"  At-risk: {result['pools']['at_risk']['selected']}/{result['pools']['at_risk']['total']}")
print(f"  New: {result['pools']['new']['selected']}/{result['pools']['new']['total']}")
print(f"  Maintenance: {result['pools']['maintenance']['selected']}/{result['pools']['maintenance']['total']}")
```

---

## 集成到 Backend API（1-2 小時）

### 1. 新增到 main.py

```python
# 在 backend/main.py 頂端
from spaced_repetition import update_word_after_review, UserFeedback
from word_selection import simulate_word_selection_for_today

# 新增 Pydantic model
class RecordFeedbackRequest(BaseModel):
    word_id: str
    feedback: str  # "familiar" | "unsure" | "new"
    training_id: Optional[str] = None
    review_mode: str = "article_context"

# 新增 API endpoint
@app.post("/training/{training_id}/record-feedback")
async def record_word_feedback(
    training_id: str,
    payload: RecordFeedbackRequest,
):
    """記錄使用者對單字的反饋"""
    # ... 實作見上面的完整設計文檔
    pass

@app.get("/training/today/pick-words")
async def get_todays_training_words(
    new_word_limit: int = 5,
    total_limit: int = 30,
):
    """獲取今天應該練習的單字"""
    # ... 實作見上面的完整設計文檔
    pass
```

### 2. 測試 API

```bash
# 測試記錄用戶反饋
curl -X POST http://localhost:8000/training/{training_id}/record-feedback \
  -H "Content-Type: application/json" \
  -d '{
    "word_id": "5f75c28f8f8f8f8f8f8f8f8f",
    "feedback": "familiar",
    "training_id": "5f75c28f8f8f8f8f8f8f8f80",
    "review_mode": "article_context"
  }'

# 測試取得今天的單字
curl http://localhost:8000/training/today/pick-words?total_limit=20
```

---

## 前端集成（30 分鐘）

### 1. 在 result/[trainingId]/page.tsx 中添加 API 調用

```typescript
// 當用戶點擊 emoji 按鈕時
async function recordFeedback(
  wordId: string,
  feedback: 'familiar' | 'unsure' | 'new'
) {
  try {
    const response = await fetch(
      `${API_BASE}/training/${trainingId}/record-feedback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word_id: wordId,
          feedback: feedback,
          training_id: trainingId,
          review_mode: 'article_context',
        }),
      }
    );

    if (!response.ok) throw new Error('Failed to record feedback');
    
    const data = await response.json();
    console.log('Feedback recorded:', data.updated_word);
    
    // 更新本地狀態 ...
  } catch (error) {
    console.error('Error recording feedback:', error);
  }
}
```

### 2. 修改 emoji 按鈕的 onClick

```typescript
<button
  onClick={() => {
    recordFeedback(selectedWord!, 'familiar');
    setWordFeedback(prev => ({ ...prev, [selectedWordKey]: 'familiar' }));
  }}
  className="..."
>
  😎 很熟了
</button>
```

---

## 驗證檢查清單

- [ ] 遷移指令已執行：`python migrate_to_spaced_repetition.py --apply`
- [ ] MongoDB indexes 已建立
- [ ] `review_log` collection 已創建
- [ ] 後端 spaced_repetition 模塊導入無誤
- [ ] 後端 API endpoint 已添加
- [ ] API 端點已測試（curl 或 Postman）
- [ ] 前端能成功調用 `/training/{id}/record-feedback`
- [ ] 資料庫中有新的 review_log 記錄
- [ ] `words` collection 中的 words 有更新的 `next_review_date`

---

## 常見問題

### Q1: 遷移後，舊的單字還能用嗎？

是的。遷移只添加新欄位，不刪除舊欄位。所以 `proficiency`, `importance`, `senses` 等都保留。舊 endpoint 仍然可用。

### Q2: 如何回滾？

新欄位都有默認值，如果要回滾，只需刪除新欄位：

```python
db.words.update_many(
    {},
    {"$unset": {
        "acquisition_state": "",
        "stability": "",
        "difficulty": "",
        # ... 其他新欄位
    }}
)
```

### Q3: 效能會受影響嗎？

不會。新增 index 實際上會提升查詢性能。review_log 是新 collection，不會干擾現有查詢。

### Q4: 如何測試演算法？

見上面「測試選字邏輯」部分，或查看 `SPACED_REPETITION_DESIGN.md` Part 5 的 JSON 範例。

---

## 進階：完整版本升級路線圖

### Phase 2（Week 2）
- [ ] 添加 `retrievability` 每日計算任務
- [ ] 實作 FSRS stability/difficulty 更新
- [ ] 新增 `/stats/spaced-repetition` endpoint

### Phase 3（Week 3）
- [ ] 趨勢分析儀表板
- [ ] 自動 suspend 機制
- [ ] 複習效率報告

---

## 文檔位置

- **完整設計**: `SPACED_REPETITION_DESIGN.md`
- **核心模塊**: `backend/spaced_repetition.py`
- **選字邏輯**: `backend/word_selection.py`
- **遷移腳本**: `backend/migrate_to_spaced_repetition.py`

---

## 技術支持

如有問題，檢查：

1. 是否安裝了必要套件：`motor`, `pydantic`, `fastapi`
2. MongoDB 連線是否正常：測試 `python -c "from db import get_database; asyncio.run(ping())"`
3. 遷移日誌：檢查 `migrate_to_spaced_repetition.py` 的輸出
4. 資料庫狀態：`db.words.findOne()` 檢查新欄位是否存在

---

祝上線順利！ 🚀
