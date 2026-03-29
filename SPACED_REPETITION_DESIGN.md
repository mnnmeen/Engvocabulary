# Spaced Repetition 系統重構設計文檔

## 執行摘要

本文檔提供了一個基於艾賓浩斯遺忘曲線的實用 spaced repetition 系統設計，包含完整的 schema、演算法規則、Python 實作和 MongoDB 最佳實踐。系統分為**MVP（最小可行版本）**和**完整版本**，方便漸進式上線。

---

## Part 1. Schema 設計

### 1.1 Vocabulary Collection Schema（主表）

#### JSON 模式

```json
{
  "_id": "ObjectId",
  "id": "uuid_string",
  "word": "string",
  "lemma": "string",
  "source": "string",
  "created_date": "ISO8601 string",
  
  "senses": [
    {
      "pos": "string (NOUN|VERB|ADJ|ADV|...)",
      "chinese": "string",
      "examples": ["string"],
      "collocations": ["string"]
    }
  ],
  
  "proficiency": "number (0-100, deprecated but kept for compatibility)",
  "importance": "number (1-5, user-defined criticality)",
  "memorize": "boolean | REPLACED_BY: acquisition_state",
  "last_review_date": "ISO8601 string | null",
  
  "priority_score": "number (used by ranking algorithm)",
  "priority_rank": "number (position in high-priority group)",
  "priority_group": "string (high|medium|low)",
  "sense_pos_vectors": "{ 'pos_tag': [float array] }",
  
  "# === NEW SPACED REPETITION FIELDS === below",
  
  "acquisition_state": "string (new | learning | graduated | suspended)",
  "stability": "number (days, default 1, 1-36500)",
  "difficulty": "number (0-1, default 0.5, inverse of ease_factor)",
  "retrievability": "number (0-1, default 1.0, confidence of recall)",
  "last_review_timestamp": "ISO8601 string | null",
  "next_review_date": "ISO8601 string | null (date only, YYYY-MM-DD)",
  "review_count": "number (total times reviewed)",
  "success_streak": "number (consecutive 'familiar' responses)",
  "lapse_count": "number (times user said 'new' after reviewing)",
  "last_result": "string (last feedback: familiar | unsure | new, or null)",
  "difficulty_history": "[number] (last 10 attempts for trend analysis)",
  "review_interval_history": "[number] (last 10 intervals in days)",
  "first_review_date": "ISO8601 string | null",
  "current_interval": "number (days until next review)",
  
  "metadata": {
    "ease_factor": "number (FSRS ease, 1.3-2.5, for advanced version)",
    "algorithm_version": "number (1=MVP, 2=with_decay)",
    "last_updated_at": "ISO8601 string"
  }
}
```

### 1.2 Review Log Collection Schema（複習紀錄表）

#### JSON 模式

```json
{
  "_id": "ObjectId",
  "training_id": "ObjectId (references training._id)",
  "word_id": "ObjectId (references words._id)",
  "word": "string (denormalized snapshot)",
  
  "review_date": "ISO8601 string",
  "review_mode": "string (article_context|isolated_word|cloze_sentence)",
  "user_feedback": "string (familiar | unsure | new)",
  "quality_score": "number (0-5, derived from feedback: familiar=5, unsure=2-3, new=0-1)",
  
  "interval_before": "number (days, interval before this review)",
  "interval_after": "number (days, interval assigned after this review)",
  "retrievability_before": "number (0-1, estimated at review time)",
  "stability_before": "number (days, state before this review)",
  "stability_after": "number (days, state assigned after this review)",
  
  "difficulty_change": "number (-0.5 to +0.5, delta in difficulty)",
  "is_first_review": "boolean",
  "success_streak_before": "number",
  "success_streak_after": "number",
  "lapse_count_before": "number",
  "lapse_count_after": "number",
  
  "context": {
    "training_model": "string (e.g., 'openrouter/claude-opus')",
    "training_ai_provider": "string",
    "article_preview": "string"
  },
  
  "metadata": {
    "algorithm_version": "number (1=MVP, 2=with_decay)",
    "review_session_id": "ObjectId (references training._id)",
    "review_index": "number (which word in this training session)"
  }
}
```

---

## Part 2. 欄位說明

### Vocabulary 新增欄位

| 欄位名稱 | 型別 | 預設值 | 用途 | 備註 |
|--------|------|------|------|------|
| `acquisition_state` | string | `"new"` | 學習狀態：new(新單字) \| learning(正在學) \| graduated(已掌握) \| suspended(暫停) | 決定是否出現在後續訓練中 |
| `stability` | number | `1` | 單字當前穩定度（天數）。用來計算遺忘曲線。值越大代表越不容易忘記 | 1-36500 天連續範圍 |
| `difficulty` | number | `0.5` | 難度係數（0-1）。反映此單字對用戶的相對難度。0=很容易，1=很難 | 用於調整 interval 增長率 |
| `retrievability` | number | `1.0` | 可檢索性（0-1）。該時間點用戶能想起的概率。用來判斷是否該複習 | < 0.9 時建議複習 |
| `last_review_timestamp` | ISO8601 | `null` | 最後一次複習的完整時刻（含時分秒）| 用於計算實際間隔 |
| `next_review_date` | string (YYYY-MM-DD) | `null` | 建議下次複習的日期 | 「何時應該複習」的指標 |
| `review_count` | number | `0` | 累計複習次數 | 用於狀態轉移的條件 |
| `success_streak` | number | `0` | 連續答對次數（連續「很熟了」） | 用於 graduation 判斷 |
| `lapse_count` | number | `0` | 遺忘次數（使用者按「很陌生」的次數） | 用於判斷是否高風險 |
| `last_result` | string | `null` | 最後一次的反饋結果：familiar \| unsure \| new | 用於決定下一個 interval |
| `difficulty_history` | [number] | `[]` | 最後 10 次的難度值（用於追蹤難度趨勢） | 只保留最新 10 筆 |
| `review_interval_history` | [number] | `[]` | 最後 10 次的間隔天數 | 用於計算平均間隔 |
| `first_review_date` | ISO8601 | `null` | 首次複習的日期 | 用於計算總學習週期 |
| `current_interval` | number | `null` | 當前的間隔天數（days until next review）| 快速查詢用 |

### Review Log 新增欄位

| 欄位名稱 | 型別 | 用途 |
|--------|------|------|
| `quality_score` | number | 反映此次複習的品質：familiar=5, unsure=2.5, new=0。用於 FSRS 演算法 |
| `interval_before` / `interval_after` | number | 複習前後的間隔長度，用於監控演算法效果 |
| `retrievability_before` / `stability_before` | number | 複習時的系統狀態快照，用於審計和調試 |
| `success_streak_before` / `success_streak_after` | number | 連勝次數的前後狀態 |

---

## Part 3. 演算法規則

### 3.1 狀態轉移圖

```
new → learning → graduated → (suspended)
  ↑     ↓ ↑          ↑
  └─ (lapse) ─────┘
```

### 3.2 核心規則：三種按鈕反饋如何更新 Vocabulary

#### 規則 A: 用戶按「很熟了」（familiar）

```
如果 acquisition_state == "new" 且 review_count == 0:
  - acquisition_state ← "learning"
  - stability ← 3（第一次答對，設定為 3 天）
  - difficulty ← 0.3（更新為較簡單）
  - current_interval ← 3

如果 acquisition_state == "learning" 或 "graduated":
  - success_streak ← success_streak + 1
  - if success_streak >= 2:
      - acquisition_state ← "graduated"
  - difficulty ← max(0.1, difficulty - 0.2)（變簡單）
  - 計算新 interval（見下方）

計算新 interval（見後續）:
  new_interval = calculate_interval(
    current_interval=current_interval,
    last_result="familiar",
    difficulty=difficulty,
    stability=stability,
    lapse_count=lapse_count
  )
  
  stability_growth = ease_factor_for_familiar(success_streak, lapse_count)
  # ease_factor 越大，interval 增長越快
  
  new_stability ← ceil(stability * stability_growth)
  current_interval ← new_stability
  
  next_review_date ← today + new_interval
```

#### 規則 B: 用戶按「有點不確定」（unsure）

```
如果 acquisition_state == "new" 且 review_count == 0:
  - acquisition_state ← "learning"
  - stability ← 1（保持最小穩定度）
  - difficulty ← 0.5（維持中等難度）
  - current_interval ← 1

如果 acquisition_state == "learning" 或 "graduated":
  - success_streak ← 0（重置連勝）
  - difficulty ← min(0.9, difficulty + 0.15)（變難一點）
  - 計算新 interval（見下方）

計算新 interval:
  stability_decay = 0.5（「unsure」時的衰減因子）
  new_stability ← ceil(stability * stability_decay)
  new_interval ← max(1, new_stability / 2)
  current_interval ← new_interval
  next_review_date ← today + new_interval
```

#### 規則 C: 用戶按「很陌生」（new）

```
如果 acquisition_state 是任何狀態:
  - lapse_count ← lapse_count + 1
  - success_streak ← 0（完全重置）
  - difficulty ← min(1.0, difficulty + 0.3)（大幅變難）
  - acquisition_state ← 如果 lapse_count > 3 則 "suspended"，否則 "learning"
  
計算新 interval:
  if lapse_count > 3:
    # 重置為最初狀態
    new_stability ← 1
    new_interval ← 1
  else:
    # 縮短 interval 到 1/3 左右
    new_stability ← ceil(stability / 4)
    new_interval ← max(1, ceil(stability / 3))
  
  current_interval ← new_interval
  next_review_date ← today + new_interval
```

### 3.3 Interval 計算規則（詳細版）

```python
def calculate_interval(
    current_interval: int,
    last_result: str,  # "familiar" | "unsure" | "new"
    difficulty: float,  # 0.0-1.0
    stability: float,  # days
    lapse_count: int,
    success_streak: int
) -> int:
    """計算下次複習的間隔（天數）"""
    
    base_multiplier = {
        "familiar": 2.5,      # 每次答對增加 2.5 倍
        "unsure": 0.5,        # 每次不確定減半
        "new": 0.25,          # 每次答錯減至 1/4
    }[last_result]
    
    # 難度調整：難的字增長慢，簡單的字增長快
    difficulty_factor = 1.0 - (difficulty * 0.4)
    # 若 difficulty=0.5，difficulty_factor = 0.8
    # 若 difficulty=1.0，difficulty_factor = 0.6
    
    # 連勝獎勵：連勝越多，interval 增長越快（上限 1.3x）
    streak_bonus = min(1.0 + (success_streak * 0.1), 1.3)
    
    # 遺忘懲罰：遺忘越多，增長越慢（下限 0.7x）
    lapse_penalty = max(1.0 - (lapse_count * 0.15), 0.7)
    
    new_interval = ceil(
        current_interval * base_multiplier * difficulty_factor * streak_bonus * lapse_penalty
    )
    
    # 設定上限（最多延後 365 天），下限（最少 1 天）
    return max(1, min(new_interval, 365))
```

### 3.4 Stability 與 Difficulty 更新

```python
def update_stability_and_difficulty(
    stability: float,
    difficulty: float,
    last_result: str,
    review_count: int
) -> tuple[float, float]:
    """更新 stability 和 difficulty，用於評估可檢索性"""
    
    if last_result == "familiar":
        # 穩定度增加（指數成長，但速度遞減）
        # 第 1-5 次複習：快速增長
        # 第 6+ 次複習：緩慢增長（每次 +1.2x）
        if review_count <= 5:
            stability_multiplier = 1.5 + (review_count * 0.1)  # 1.6 ~ 2.0
        else:
            stability_multiplier = min(1.2 + (0.05 * (review_count - 5)), 1.4)
        
        new_stability = stability * stability_multiplier
        
        # 難度下降
        new_difficulty = difficulty * 0.7  # 下降 30%
        
    elif last_result == "unsure":
        # 穩定度適度增加
        new_stability = stability * 1.1
        # 難度小幅上升
        new_difficulty = min(difficulty * 1.2, 1.0)
        
    else:  # "new" (forgot)
        # 穩定度大幅衰減
        new_stability = max(stability * 0.5, 1.0)
        # 難度大幅上升
        new_difficulty = min(difficulty * 1.5, 1.0)
    
    return new_stability, new_difficulty
```

### 3.5 Retrievability 計算（可檢索性）

```python
def calculate_retrievability(
    stability: float,
    days_since_review: int
) -> float:
    """
    計算在距離上次複習 N 天後的可檢索性（回想概率）。
    基於遺忘曲線：R = exp(-ln(2) * t / S)
    其中 S = 穩定度（天數）
    """
    import math
    
    if stability <= 0 or days_since_review < 0:
        return 1.0
    
    # 標準遺忘曲線
    retrievability = math.exp(-math.log(2) * days_since_review / stability)
    
    # 限制在 0-1 之間
    return max(0.0, min(retrievability, 1.0))
```

### 3.6 Status 轉移條件

```
new → learning:
  條件：review_count >= 1 且 (last_result == "familiar" OR last_result == "unsure")

learning → graduated:
  條件：(success_streak >= 2 AND review_count >= 3) OR (review_count >= 5)
  說明：連續答對 2 次，至少複習過 3 次；或總共複習 5 次

graduated → suspended:
  條件：lapse_count > 3 AND last_result == "new"
  說明：多次遺忘後暫停該單字

suspended → learning:
  條件：手動重啟或管理員重置

learning / graduated → learning （衰變）:
  如果 retrievability < 0.5 且距離上次複習 > 90 天
  自動降級為 learning 狀態，重新安排複習
```

---

## Part 4. 每日選字邏輯

### 4.1 選字的 4 個 Pool

#### Pool 1: 到期複習池（Due Pool）
**條件**
- `next_review_date <= today` 且 `retrievability < 0.9`
- `acquisition_state` ∈ {learning, graduated}

**權重**: 100（最高優先級）

#### Pool 2: 高風險遺忘池（At-Risk Pool）
**條件**
- `0.5 < retrievability < 0.7` 且 `days_since_last_review > 14`
- `lapse_count > 0`
- `acquisition_state` ∈ {learning, graduated}

**權重**: 80

#### Pool 3: 新字池（New / Learning Pool）
**條件**
- `acquisition_state == "new"` 或 (`acquisition_state == "learning"` 且 `review_count < 3`)

**權重**: 60

#### Pool 4: 維持池（Maintenance Pool）
**條件**
- `retrievability > 0.8` 且 `acquisition_state == "graduated"`
- `importance >= 3` 或 `proficiency >= 70`

**權重**: 20

### 4.2 每日選字的建議比例（假設每天 30 個單字）

```
到期複習池:     40% (12 個)
高風險池:       25% (7-8 個)
新字池:         25% (7-8 個)
維持池:         10% (3 個)
```

### 4.3 排序邏輯（Pool 內排序）

#### Due Pool 內排序
1. 按 `retrievability` 升序（最需要複習的先來）
2. 次級排序：按 `lapse_count` 降序（遺忘越多越優先）

#### At-Risk Pool 內排序
1. 按 `retrievability` 升序
2. 次級排序：按 `importance` 降序

#### New/Learning Pool 內排序
1. 按 `importance` 降序（重要的字優先）
2. 次級排序：按 `priority_score` 降序（系統推薦度）

#### Maintenance Pool 內排序
1. 按 `retrievability` 升序（快要忘記的先）
2. 次級排序：按 `created_date` 升序（舊字優先）

### 4.4 最終選字演算法（偽代碼）

```python
def pick_words_for_today(
    words_collection,
    today: date,
    new_word_limit: int = 5,
    total_limit: int = 30
) -> list[dict]:
    """
    選出今天應該複習的單字。
    返回按優先級排序的單字列表。
    """
    
    result = []
    days_since_epoch = (today - epoch).days
    
    # 1. 到期複習池
    due_pool = find_words(
        filter={
            "next_review_date": {"$lte": today},
            "retrievability": {"$lt": 0.9},
            "acquisition_state": {"$in": ["learning", "graduated"]}
        },
        sort=[("retrievability", 1), ("lapse_count", -1)]
    )
    due_count = min(len(due_pool), ceil(total_limit * 0.40))
    result.extend(due_pool[:due_count])
    
    # 2. 高風險遺忘池
    at_risk_pool = find_words(
        filter={
            "retrievability": {"$gt": 0.5, "$lt": 0.7},
            "days_since_last_review": {"$gt": 14},
            "lapse_count": {"$gt": 0},
            "acquisition_state": {"$in": ["learning", "graduated"]},
            "_id": {"$nin": [w["_id"] for w in result]}
        },
        sort=[("retrievability", 1), ("importance", -1)]
    )
    at_risk_count = min(len(at_risk_pool), ceil(total_limit * 0.25))
    result.extend(at_risk_pool[:at_risk_count])
    
    # 3. 新字池
    new_pool = find_words(
        filter={
            "$or": [
                {"acquisition_state": "new"},
                {
                    "acquisition_state": "learning",
                    "review_count": {"$lt": 3}
                }
            ],
            "_id": {"$nin": [w["_id"] for w in result]}
        },
        sort=[("importance", -1), ("priority_score", -1)]
    )
    new_count = min(
        len(new_pool),
        min(new_word_limit, ceil(total_limit * 0.25))
    )
    result.extend(new_pool[:new_count])
    
    # 4. 維持池（填充剩餘名額）
    remaining = total_limit - len(result)
    if remaining > 0:
        maintenance_pool = find_words(
            filter={
                "retrievability": {"$gt": 0.8},
                "acquisition_state": "graduated",
                "_id": {"$nin": [w["_id"] for w in result]},
                "$or": [
                    {"importance": {"$gte": 3}},
                    {"proficiency": {"$gte": 70}}
                ]
            },
            sort=[("retrievability", 1), ("created_date", 1)]
        )
        result.extend(maintenance_pool[:remaining])
    
    return result
```

### 4.5 Priority Score 計算建議

```python
def calculate_priority_score(word: dict, today: date) -> float:
    """
    計算單字的優先級分數（用於排序）。
    分數越高，優先級越高。
    """
    
    score = 0.0
    
    # 基礎分：importance (1-5)，標準化到 10-50
    score += (word["importance"] or 3) * 10
    
    # 可檢索性分：越低越需要複習
    retrievability = calculate_retrievability(
        word["stability"],
        days_since_last_review
    )
    score += (1.0 - retrievability) * 30
    
    # 遺忘次數分：遺忘越多優先級越高
    score += word["lapse_count"] * 5
    
    # 複習頻率分：複習越少優先級越高（新字優先）
    score -= word["review_count"] * 2
    
    # 連勝分：連勝越少優先級越高（容易忘記的要複習）
    score -= word["success_streak"] * 1
    
    # Proficiency 分：不熟的優先
    proficiency = word.get("proficiency", 50)
    score += (100 - proficiency) * 0.2
    
    # 時間衰變：距離上次複習越久優先級越高（上限 30 分）
    # 14 天後達到最大值
    days_ago = (today - word["last_review_date"]).days if word["last_review_date"] else 999
    recency_penalty = min(days_ago / 14 * 30, 30)
    score += recency_penalty
    
    return score
```

---

## Part 5. JSON 範例

### 5.1 一筆完整的 Vocabulary 文件範例

```json
{
  "_id": "ObjectId('507f1f77bcf86cd799439011')",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "word": "ambiguous",
  "lemma": "ambiguous",
  "source": "academic_vocabulary_list",
  "created_date": "2024-01-15T10:30:00Z",
  
  "senses": [
    {
      "pos": "ADJ",
      "chinese": "（意思）含糊的；（含義）模稜兩可的",
      "examples": [
        "The instruction manual is ambiguous and confuses many users.",
        "Her statement was ambiguous enough to be interpreted in two ways."
      ],
      "collocations": [
        "ambiguous meaning",
        "ambiguous reference",
        "somewhat ambiguous"
      ]
    }
  ],
  
  "proficiency": 42,
  "importance": 4,
  "memorize": true,
  "last_review_date": "2024-03-25T14:20:00Z",
  
  "priority_score": 85.3,
  "priority_rank": 12,
  "priority_group": "high",
  "sense_pos_vectors": {
    "ADJ": [0.123, -0.456, 0.789, ...]
  },
  
  "acquisition_state": "learning",
  "stability": 12.5,
  "difficulty": 0.45,
  "retrievability": 0.72,
  "last_review_timestamp": "2024-03-25T14:20:00Z",
  "next_review_date": "2024-03-29",
  "review_count": 8,
  "success_streak": 1,
  "lapse_count": 2,
  "last_result": "unsure",
  "difficulty_history": [0.5, 0.48, 0.46, 0.45, 0.45],
  "review_interval_history": [1, 2, 3, 5, 7, 10, 12],
  "first_review_date": "2024-02-20T09:15:00Z",
  "current_interval": 4,
  
  "metadata": {
    "ease_factor": 1.85,
    "algorithm_version": 1,
    "last_updated_at": "2024-03-25T14:25:00Z"
  }
}
```

### 5.2 一筆完整的 Review Log 文件範例

```json
{
  "_id": "ObjectId('507f1f77bcf86cd799439022')",
  "training_id": "ObjectId('507f1f77bcf86cd799439010')",
  "word_id": "ObjectId('507f1f77bcf86cd799439011')",
  "word": "ambiguous",
  
  "review_date": "2024-03-25T14:20:00Z",
  "review_mode": "article_context",
  "user_feedback": "unsure",
  "quality_score": 2.5,
  
  "interval_before": 7,
  "interval_after": 4,
  "retrievability_before": 0.85,
  "stability_before": 10.0,
  "stability_after": 12.5,
  
  "difficulty_change": 0.05,
  "is_first_review": false,
  "success_streak_before": 2,
  "success_streak_after": 0,
  "lapse_count_before": 1,
  "lapse_count_after": 2,
  
  "context": {
    "training_model": "openrouter/claude-opus",
    "training_ai_provider": "openrouter",
    "article_preview": "The contract uses ambiguous language that..."
  },
  
  "metadata": {
    "algorithm_version": 1,
    "review_session_id": "ObjectId('507f1f77bcf86cd799439010')",
    "review_index": 5
  }
}
```

---

## Part 6. Python 實作

### 6.1 Core Spaced Repetition 模組

```python
# file: backend/spaced_repetition.py

from datetime import datetime, timedelta, date
from typing import Dict, Any, Optional, List, Tuple
import math
from enum import Enum

class AcquisitionState(str, Enum):
    NEW = "new"
    LEARNING = "learning"
    GRADUATED = "graduated"
    SUSPENDED = "suspended"

class UserFeedback(str, Enum):
    FAMILIAR = "familiar"  # 很熟了
    UNSURE = "unsure"      # 有點不確定
    NEW = "new"            # 很陌生

def calculate_retrievability(
    stability: float,
    days_since_review: int
) -> float:
    """
    計算可檢索性（回想概率）。
    基於遺忘曲線公式：R = exp(-ln(2) * t / S)
    
    Args:
        stability: 穩定度（天數）
        days_since_review: 距離上次複習的天數
    
    Returns:
        0.0-1.0 的可檢索性分數
    """
    if stability <= 0 or days_since_review < 0:
        return 1.0
    
    retrievability = math.exp(
        -math.log(2) * days_since_review / stability
    )
    return max(0.0, min(retrievability, 1.0))

def calculate_interval(
    current_interval: int,
    last_result: UserFeedback,
    difficulty: float,
    stability: float,
    lapse_count: int,
    success_streak: int,
) -> int:
    """
    計算下次複習的間隔（天數）。
    
    Args:
        current_interval: 當前間隔天數
        last_result: 用戶反饋（familiar/unsure/new）
        difficulty: 難度係數（0.0-1.0）
        stability: 穩定度（天數）
        lapse_count: 遺忘次數
        success_streak: 連勝次數
    
    Returns:
        下次複習間隔（最少 1 天，最多 365 天）
    """
    # 基礎倍數
    base_multipliers = {
        UserFeedback.FAMILIAR: 2.5,
        UserFeedback.UNSURE: 0.5,
        UserFeedback.NEW: 0.25,
    }
    base_multiplier = base_multipliers[last_result]
    
    # 難度調整：難度越高，間隔增長越慢
    difficulty_factor = 1.0 - (difficulty * 0.4)
    
    # 連勝獎勵：連勝越多，增長越快（上限 1.3x）
    streak_bonus = min(1.0 + (success_streak * 0.1), 1.3)
    
    # 遺忘懲罰：遺忘越多，增長越慢（下限 0.7x）
    lapse_penalty = max(1.0 - (lapse_count * 0.15), 0.7)
    
    new_interval = math.ceil(
        current_interval 
        * base_multiplier 
        * difficulty_factor 
        * streak_bonus 
        * lapse_penalty
    )
    
    return max(1, min(new_interval, 365))

def update_stability_and_difficulty(
    stability: float,
    difficulty: float,
    last_result: UserFeedback,
    review_count: int,
) -> Tuple[float, float]:
    """
    更新 stability 和 difficulty。
    
    Returns:
        (新 stability, 新 difficulty)
    """
    if last_result == UserFeedback.FAMILIAR:
        # 穩定度快速增加（優先級遞減）
        if review_count <= 5:
            multiplier = 1.6 + (review_count * 0.1)
        else:
            multiplier = min(1.2 + (0.05 * (review_count - 5)), 1.4)
        
        new_stability = stability * multiplier
        new_difficulty = max(0.1, difficulty * 0.7)
        
    elif last_result == UserFeedback.UNSURE:
        new_stability = stability * 1.1
        new_difficulty = min(1.0, difficulty * 1.2)
        
    else:  # NEW (forgotten)
        new_stability = max(1.0, stability * 0.5)
        new_difficulty = min(1.0, difficulty * 1.5)
    
    return new_stability, new_difficulty

def update_word_after_review(
    word_doc: Dict[str, Any],
    review_result: UserFeedback,
    review_date: datetime,
) -> Dict[str, Any]:
    """
    根據複習結果更新單字文件（mutation）。
    
    Args:
        word_doc: 原始單字文件
        review_result: 用戶反饋
        review_date: 複習日期
    
    Returns:
        更新後的文件副本（原文件未改動）
    """
    updated = word_doc.copy()
    deep_copy_nested_fields(updated)
    
    today = review_date.date() if isinstance(review_date, datetime) else review_date
    
    # === 計算上次複習距離 ===
    last_review_ts = updated.get("last_review_timestamp")
    if last_review_ts:
        if isinstance(last_review_ts, str):
            last_review_dt = datetime.fromisoformat(last_review_ts)
        else:
            last_review_dt = last_review_ts
        days_since = (review_date - last_review_dt).days
    else:
        days_since = 0
    
    # === 基礎變數 ===
    current_state = updated.get("acquisition_state", AcquisitionState.NEW)
    current_interval = updated.get("current_interval", 1) or 1
    success_streak = updated.get("success_streak", 0)
    lapse_count = updated.get("lapse_count", 0)
    review_count = updated.get("review_count", 0)
    difficulty = updated.get("difficulty", 0.5)
    stability = updated.get("stability", 1.0)
    
    # === 根據反饋更新欄位 ===
    if review_result == UserFeedback.FAMILIAR:
        # 狀態轉移
        if current_state == AcquisitionState.NEW and review_count == 0:
            updated["acquisition_state"] = AcquisitionState.LEARNING
        else:
            success_streak += 1
            if success_streak >= 2 and review_count >= 2:
                updated["acquisition_state"] = AcquisitionState.GRADUATED
        
        # 難度和穩定度
        new_stability, new_difficulty = update_stability_and_difficulty(
            stability, difficulty, review_result, review_count
        )
        new_interval = calculate_interval(
            current_interval, review_result, new_difficulty, 
            new_stability, lapse_count, success_streak
        )
        
        updated["stability"] = new_stability
        updated["difficulty"] = new_difficulty
        updated["current_interval"] = new_interval
        updated["success_streak"] = success_streak
    
    elif review_result == UserFeedback.UNSURE:
        # 連勝重置
        success_streak = 0
        
        # 難度和穩定度
        new_stability, new_difficulty = update_stability_and_difficulty(
            stability, difficulty, review_result, review_count
        )
        new_interval = calculate_interval(
            current_interval, review_result, new_difficulty,
            new_stability, lapse_count, success_streak
        )
        
        updated["stability"] = new_stability
        updated["difficulty"] = new_difficulty
        updated["current_interval"] = new_interval
        updated["success_streak"] = success_streak
    
    else:  # NEW (forgotten)
        lapse_count += 1
        success_streak = 0
        
        # 狀態轉移
        if lapse_count > 3:
            updated["acquisition_state"] = AcquisitionState.SUSPENDED
        else:
            updated["acquisition_state"] = AcquisitionState.LEARNING
        
        # 難度和穩定度
        new_stability, new_difficulty = update_stability_and_difficulty(
            stability, difficulty, review_result, review_count
        )
        
        if lapse_count > 3:
            new_interval = 1
            new_stability = 1.0
        else:
            new_interval = calculate_interval(
                current_interval, review_result, new_difficulty,
                new_stability, lapse_count, success_streak
            )
        
        updated["stability"] = new_stability
        updated["difficulty"] = new_difficulty
        updated["current_interval"] = new_interval
        updated["lapse_count"] = lapse_count
        updated["success_streak"] = success_streak
    
    # === 共通更新欄位 ===
    updated["review_count"] = review_count + 1
    updated["last_result"] = review_result.value
    updated["last_review_timestamp"] = review_date.isoformat()
    updated["last_review_date"] = today.isoformat()
    
    if not updated.get("first_review_date"):
        updated["first_review_date"] = review_date.isoformat()
    
    # 計算下次複習日期
    next_review_date = today + timedelta(days=updated.get("current_interval", 1))
    updated["next_review_date"] = next_review_date.isoformat().split('T')[0]
    
    # 更新歷史紀錄（只保留最新 10 筆）
    if "difficulty_history" not in updated:
        updated["difficulty_history"] = []
    updated["difficulty_history"].append(updated["difficulty"])
    updated["difficulty_history"] = updated["difficulty_history"][-10:]
    
    if "review_interval_history" not in updated:
        updated["review_interval_history"] = []
    updated["review_interval_history"].append(updated.get("current_interval", 1))
    updated["review_interval_history"] = updated["review_interval_history"][-10:]
    
    # 更新 metadata
    if "metadata" not in updated:
        updated["metadata"] = {}
    updated["metadata"]["algorithm_version"] = 1
    updated["metadata"]["last_updated_at"] = datetime.utcnow().isoformat()
    
    return updated

def calculate_priority_score(
    word: Dict[str, Any],
    today: date,
) -> float:
    """
    計算單字的優先級分數（用於排序）。
    分數越高 = 優先級越高。
    """
    score = 0.0
    
    # 基礎分：importance (1-5) → (10-50)
    importance = word.get("importance", 3)
    score += importance * 10
    
    # 可檢索性分：低可檢索性 = 高優先級
    last_review_ts = word.get("last_review_timestamp")
    if last_review_ts:
        if isinstance(last_review_ts, str):
            last_review_dt = datetime.fromisoformat(last_review_ts)
        else:
            last_review_dt = last_review_ts
        
        # 轉換為 date 以計算天數
        if isinstance(last_review_dt, datetime):
            last_review_date = last_review_dt.date()
        else:
            last_review_date = last_review_dt
        
        days_since = (today - last_review_date).days
    else:
        days_since = 999
    
    stability = word.get("stability", 1.0)
    retrievability = calculate_retrievability(stability, days_since)
    score += (1.0 - retrievability) * 30
    
    # 遺忘次數分：遺忘越多優先級越高
    lapse_count = word.get("lapse_count", 0)
    score += lapse_count * 5
    
    # 複習頻率分：複習越少優先級越高
    review_count = word.get("review_count", 0)
    score -= review_count * 2
    
    # 連勝分：連勝越少優先級越高
    success_streak = word.get("success_streak", 0)
    score -= success_streak * 1
    
    # Proficiency 分：不熟的優先
    proficiency = word.get("proficiency", 50)
    score += (100 - proficiency) * 0.2
    
    # 時間衰變：距離上次複習越久優先級越高（上限 30 分）
    recency_penalty = min(days_since / 14 * 30, 30)
    score += recency_penalty
    
    return score

# ===== 輔助函數 =====

def deep_copy_nested_fields(obj: Dict) -> None:
    """就地複製嵌套列表和字典，避免引用問題。"""
    for key, value in list(obj.items()):
        if isinstance(value, list):
            obj[key] = value.copy()
        elif isinstance(value, dict):
            obj[key] = {k: v for k, v in value.items()}
```

### 6.2 選字邏輯實作

```python
# file: backend/word_selection.py

from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional
from motor.motor_asyncio import AsyncIOMotorCollection
from enum import Enum
import math
from .spaced_repetition import (
    calculate_retrievability,
    calculate_priority_score,
    AcquisitionState,
)

class PoolType(str, Enum):
    DUE = "due"
    AT_RISK = "at_risk"
    NEW = "new"
    MAINTENANCE = "maintenance"

async def pick_words_for_today(
    words_collection: AsyncIOMotorCollection,
    today: Optional[date] = None,
    new_word_limit: int = 5,
    total_limit: int = 30,
) -> Dict[str, Any]:
    """
    選出今天應該複習的單字。
    
    Returns:
        {
            "words": [word_doc, ...],
            "pools": {
                "due": [...],
                "at_risk": [...],
                "new": [...],
                "maintenance": [...]
            }
        }
    """
    if today is None:
        today = date.today()
    
    # === Pool 1: 到期複習池 ===
    due_pipeline = [
        {
            "$addFields": {
                "days_since_review": {
                    "$cond": [
                        {"$eq": ["$last_review_timestamp", None]},
                        999,
                        {
                            "$divide": [
                                {
                                    "$subtract": [
                                        datetime.utcnow(),
                                        {"$dateFromString": {"dateString": "$last_review_timestamp"}}
                                    ]
                                },
                                86400000  # milliseconds per day
                            ]
                        }
                    ]
                }
            }
        },
        {
            "$addFields": {
                "retrievability": {
                    "$exp": {
                        "$multiply": [
                            -0.693147,  # -ln(2)
                            {"$divide": ["$days_since_review", {"$cond": [{"$eq": ["$stability", 0]}, 1, "$stability"]}]}
                        ]
                    }
                }
            }
        },
        {
            "$match": {
                "next_review_date": {"$lte": today.isoformat()},
                "retrievability": {"$lt": 0.9},
                "acquisition_state": {"$in": ["learning", "graduated"]},
            }
        },
        {
            "$sort": {"retrievability": 1, "lapse_count": -1}
        }
    ]
    
    due_words = await words_collection.aggregate(due_pipeline).to_list(None)
    
    # === Pool 2: 高風險遺忘池 ===
    at_risk_pipeline = [
        {
            "$addFields": {
                "days_since_review": {
                    "$cond": [
                        {"$eq": ["$last_review_timestamp", None]},
                        999,
                        {
                            "$divide": [
                                {
                                    "$subtract": [
                                        datetime.utcnow(),
                                        {"$dateFromString": {"dateString": "$last_review_timestamp"}}
                                    ]
                                },
                                86400000
                            ]
                        }
                    ]
                }
            }
        },
        {
            "$addFields": {
                "retrievability": {
                    "$exp": {
                        "$multiply": [
                            -0.693147,
                            {"$divide": ["$days_since_review", {"$cond": [{"$eq": ["$stability", 0]}, 1, "$stability"]}]}
                        ]
                    }
                }
            }
        },
        {
            "$match": {
                "retrievability": {"$gt": 0.5, "$lt": 0.7},
                "days_since_review": {"$gt": 14},
                "lapse_count": {"$gt": 0},
                "acquisition_state": {"$in": ["learning", "graduated"]},
                "_id": {"$nin": [w["_id"] for w in due_words]},
            }
        },
        {
            "$sort": {"retrievability": 1, "importance": -1}
        }
    ]
    
    at_risk_words = await words_collection.aggregate(at_risk_pipeline).to_list(None)
    
    # === Pool 3: 新字池 ===
    new_pipeline = [
        {
            "$addFields": {
                "priority_score_calc": {
                    "$add": [
                        {"$multiply": [{"$cond": [{"$eq": ["$importance", None]}, 3, "$importance"]}, 10]},
                        {"$multiply": [{"$cond": [{"$eq": ["$priority_score", None]}, 50, "$priority_score"]}, 0.5]},
                    ]
                }
            }
        },
        {
            "$match": {
                "$or": [
                    {"acquisition_state": "new"},
                    {"acquisition_state": "learning", "review_count": {"$lt": 3}},
                ],
                "_id": {"$nin": [w["_id"] for w in due_words + at_risk_words]},
            }
        },
        {
            "$sort": {"importance": -1, "priority_score": -1}
        }
    ]
    
    new_words = await words_collection.aggregate(new_pipeline).to_list(None)
    
    # === 組合結果 ===
    result_words = []
    
    # Due pool: 40%
    due_count = min(len(due_words), math.ceil(total_limit * 0.40))
    result_words.extend(due_words[:due_count])
    
    # At-risk pool: 25%
    at_risk_count = min(len(at_risk_words), math.ceil(total_limit * 0.25))
    result_words.extend(at_risk_words[:at_risk_count])
    
    # New pool: 25%
    new_count = min(
        len(new_words),
        min(new_word_limit, math.ceil(total_limit * 0.25))
    )
    result_words.extend(new_words[:new_count])
    
    # === Pool 4: 維持池（填充剩餘） ===
    remaining = total_limit - len(result_words)
    if remaining > 0:
        maintenance_pipeline = [
            {
                "$addFields": {
                    "days_since_review": {
                        "$cond": [
                            {"$eq": ["$last_review_timestamp", None]},
                            999,
                            {
                                "$divide": [
                                    {
                                        "$subtract": [
                                            datetime.utcnow(),
                                            {"$dateFromString": {"dateString": "$last_review_timestamp"}}
                                        ]
                                    },
                                    86400000
                                ]
                            }
                        ]
                    }
                }
            },
            {
                "$addFields": {
                    "retrievability": {
                        "$exp": {
                            "$multiply": [
                                -0.693147,
                                {"$divide": ["$days_since_review", {"$cond": [{"$eq": ["$stability", 0]}, 1, "$stability"]}]}
                            ]
                        }
                    }
                }
            },
            {
                "$match": {
                    "retrievability": {"$gt": 0.8},
                    "acquisition_state": "graduated",
                    "_id": {"$nin": [w["_id"] for w in result_words]},
                    "$or": [
                        {"importance": {"$gte": 3}},
                        {"proficiency": {"$gte": 70}},
                    ],
                }
            },
            {
                "$sort": {"retrievability": 1, "created_date": 1}
            }
        ]
        
        maintenance_words = await words_collection.aggregate(maintenance_pipeline).to_list(None)
        result_words.extend(maintenance_words[:remaining])
    
    # === 規範化返回值 ===
    for word in result_words:
        word["_id"] = str(word["_id"])
        if "senses" in word and isinstance(word["senses"], list):
            # 保留原樣
            pass
    
    return {
        "words": result_words,
        "count": len(result_words),
        "pools": {
            "due": {"count": due_count, "total": len(due_words)},
            "at_risk": {"count": at_risk_count, "total": len(at_risk_words)},
            "new": {"count": new_count, "total": len(new_words)},
            "maintenance": {"count": remaining, "total": len(await words_collection.aggregate(maintenance_pipeline).to_list(None)) if remaining > 0 else 0},
        }
    }
```

### 6.3 在 FastAPI 中集成

```python
# 新增到 backend/main.py

from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional
from spaced_repetition import update_word_after_review, UserFeedback, AcquisitionState
from word_selection import pick_words_for_today

class ReviewWordRequest(BaseModel):
    word_id: str
    feedback: str  # "familiar" | "unsure" | "new"
    training_id: Optional[str] = None
    review_mode: str = "article_context"

class TodayWordsRequest(BaseModel):
    new_word_limit: int = 5
    total_limit: int = 30

@app.post("/training/{training_id}/record-feedback")
async def record_word_feedback(
    training_id: str,
    payload: ReviewWordRequest,
):
    """
    記錄使用者對單字的反饋，並更新 Vocabulary 和 ReviewLog。
    """
    db = get_database()
    words_collection = db["words"]
    review_log_collection = db["review_log"]
    training_collection = db["training"]
    
    try:
        word_id = ObjectId(payload.word_id)
        training_oid = ObjectId(training_id)
    except (InvalidId, TypeError) as exc:
        raise HTTPException(status_code=400, detail="invalid id format") from exc
    
    # 取得單字和訓練記錄
    word_doc = await words_collection.find_one({"_id": word_id})
    if not word_doc:
        raise HTTPException(status_code=404, detail="Word not found")
    
    training_doc = await training_collection.find_one({"_id": training_oid})
    if not training_doc:
        raise HTTPException(status_code=404, detail="Training not found")
    
    # 驗證 feedback 值
    try:
        feedback = UserFeedback(payload.feedback)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid feedback value")
    
    # 更新 Vocabulary
    review_now = datetime.utcnow()
    updated_word = update_word_after_review(word_doc, feedback, review_now)
    
    # 寫入資料庫
    await words_collection.replace_one({"_id": word_id}, updated_word)
    
    # 記錄到 ReviewLog
    review_log_entry = {
        "training_id": training_oid,
        "word_id": word_id,
        "word": word_doc.get("word"),
        "review_date": review_now.isoformat(),
        "review_mode": payload.review_mode,
        "user_feedback": feedback.value,
        "quality_score": {
            UserFeedback.FAMILIAR: 5.0,
            UserFeedback.UNSURE: 2.5,
            UserFeedback.NEW: 0.0,
        }[feedback],
        "interval_before": word_doc.get("current_interval", 1),
        "interval_after": updated_word.get("current_interval", 1),
        "stability_before": word_doc.get("stability", 1.0),
        "stability_after": updated_word.get("stability", 1.0),
        "difficulty_change": updated_word.get("difficulty", 0.5) - word_doc.get("difficulty", 0.5),
        "is_first_review": word_doc.get("review_count", 0) == 0,
        "success_streak_before": word_doc.get("success_streak", 0),
        "success_streak_after": updated_word.get("success_streak", 0),
        "lapse_count_before": word_doc.get("lapse_count", 0),
        "lapse_count_after": updated_word.get("lapse_count", 0),
        "context": {
            "training_model": training_doc.get("training_ai", {}).get("model"),
            "training_ai_provider": training_doc.get("training_ai", {}).get("provider"),
            "article_preview": training_doc.get("article", "")[:100],
        },
        "metadata": {
            "algorithm_version": 1,
            "review_session_id": training_oid,
        }
    }
    
    await review_log_collection.insert_one(review_log_entry)
    
    return {
        "success": True,
        "word_id": str(word_id),
        "updated_word": {
            "word": updated_word.get("word"),
            "acquisition_state": updated_word.get("acquisition_state"),
            "next_review_date": updated_word.get("next_review_date"),
            "current_interval": updated_word.get("current_interval"),
            "success_streak": updated_word.get("success_streak"),
            "review_count": updated_word.get("review_count"),
        }
    }

@app.get("/training/today/pick-words")
async def get_todays_training_words(
    new_word_limit: int = 5,
    total_limit: int = 30,
):
    """
    獲取今天應該練習的單字。
    """
    db = get_database()
    words_collection = db["words"]
    
    result = await pick_words_for_today(
        words_collection,
        today=date.today(),
        new_word_limit=new_word_limit,
        total_limit=total_limit,
    )
    
    return result
```

---

## Part 7. MongoDB 更新建議

### 7.1 遷移策略（從舊 schema 到新 schema）

#### 步驟 1: 新增欄位到現有文件

```python
# file: backend/migrate_to_spaced_repetition.py

import asyncio
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
import os

async def migrate_words_to_spaced_repetition(db):
    """
    將現有 words collection 遷移到 spaced repetition schema。
    """
    words_collection = db["words"]
    
    # 查詢所有需要遷移的文件
    cursor = words_collection.find({
        "acquisition_state": {"$exists": False}
    })
    
    count = 0
    async for word_doc in cursor:
        update_data = {
            "acquisition_state": "new",
            "stability": 1.0,
            "difficulty": 0.5,
            "retrievability": 1.0,
            "last_review_timestamp": None,
            "next_review_date": datetime.utcnow().date().isoformat(),
            "review_count": 0,
            "success_streak": 0,
            "lapse_count": 0,
            "last_result": None,
            "difficulty_history": [],
            "review_interval_history": [],
            "first_review_date": None,
            "current_interval": 1,
            "metadata": {
                "ease_factor": 1.85,
                "algorithm_version": 1,
                "last_updated_at": datetime.utcnow().isoformat()
            }
        }
        
        await words_collection.update_one(
            {"_id": word_doc["_id"]},
            {"$set": update_data}
        )
        
        count += 1
        if count % 100 == 0:
            print(f"Migrated {count} words...")
    
    print(f"Migration complete: {count} words updated")

if __name__ == "__main__":
    # 使用方式
    client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
    db = client["english_words"]
    asyncio.run(migrate_words_to_spaced_repetition(db))
```

### 7.2 MongoDB Index 建議

```javascript
// 在 MongoDB Shell 中執行或在 Python 中用 create_index

// words collection indexes
db.words.createIndex({ "next_review_date": 1, "acquisition_state": 1 }) // 複習池查詢
db.words.createIndex({ "retrievability": 1, "lapse_count": -1 }) // 風險排序
db.words.createIndex({ "priority_score": -1 }) // 優先級排序
db.words.createIndex({ "word": 1 }) // 單字超找
db.words.createIndex({ "acquisition_state": 1 }) // 狀態篩選
db.words.createIndex({ "last_review_timestamp": 1 }) // 時間排序
db.words.createIndex({ "importance": -1, "priority_score": -1 }) // 新字排序

// review_log collection indexes
db.review_log.createIndex({ "training_id": 1 }) // 訓練關聯
db.review_log.createIndex({ "word_id": 1 }) // 單字歷史
db.review_log.createIndex({ "review_date": -1 }) // 時間查詢
db.review_log.createIndex({ "user_feedback": 1 }) // 反饋統計

// training collection indexes
db.training.createIndex({ "created_at": -1 }) // 歷史排序
db.training.createIndex({ "words": 1 }) // 單字包含查詢
```

### 7.3 Python 中建立 Index

```python
async def ensure_indexes(db):
    """確保所有必要的 index 存在。"""
    words_col = db["words"]
    review_log_col = db["review_log"]
    training_col = db["training"]
    
    # Words indexes
    await words_col.create_index(
        [("next_review_date", 1), ("acquisition_state", 1)],
        name="idx_next_review_state"
    )
    await words_col.create_index(
        [("retrievability", 1), ("lapse_count", -1)],
        name="idx_at_risk_pool"
    )
    await words_col.create_index(
        [("priority_score", -1)],
        name="idx_priority"
    )
    await words_col.create_index(
        [("word", 1)],
        name="idx_word",
        unique=True,
        sparse=True
    )
    await words_col.create_index(
        [("acquisition_state", 1)],
        name="idx_state"
    )
    
    # Review Log indexes
    await review_log_col.create_index(
        [("training_id", 1)],
        name="idx_training_id"
    )
    await review_log_col.create_index(
        [("word_id", 1)],
        name="idx_word_id"
    )
    await review_log_col.create_index(
        [("review_date", -1)],
        name="idx_review_date"
    )
    
    print("Indexes ensured successfully")

# 在 app startup 時呼叫
# asyncio.create_task(ensure_indexes(get_database()))
```

### 7.4 查詢最佳實踐

#### ❌ 避免：N+1 查詢

```python
# 不好的做法
words = await words_collection.find({...}).to_list(None)
for word in words:
    reviews = await review_log_collection.find({
        "word_id": word["_id"]
    }).to_list(None)
    # 這樣會執行 N 次查詢！
```

#### ✅ 正確做法：使用 Aggregation Pipeline

```python
# 好的做法：一次查詢獲取所有信息
pipeline = [
    {
        "$match": {
            "acquisition_state": "learning",
            "next_review_date": {"$lte": today.isoformat()}
        }
    },
    {
        "$lookup": {
            "from": "review_log",
            "localField": "_id",
            "foreignField": "word_id",
            "as": "reviews",
            "pipeline": [
                {"$sort": {"review_date": -1}},
                {"$limit": 5}  # 只取最近 5 筆
            ]
        }
    },
    {
        "$sort": {"retrievability": 1}
    },
    {
        "$limit": 30
    }
]

results = await words_collection.aggregate(pipeline).to_list(None)
```

### 7.5 效能監控查詢

```python
async def get_spaced_repetition_stats(db) -> dict:
    """獲取 spaced repetition 系統的統計信息。"""
    words_col = db["words"]
    review_log_col = db["review_log"]
    
    # 狀態分布
    state_stats = await words_col.aggregate([
        {"$group": {"_id": "$acquisition_state", "count": {"$sum": 1}}}
    ]).to_list(None)
    
    # 反饋分布（過去 7 天）
    seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
    feedback_stats = await review_log_col.aggregate([
        {
            "$match": {
                "review_date": {"$gte": seven_days_ago}
            }
        },
        {
            "$group": {
                "_id": "$user_feedback",
                "count": {"$sum": 1}
            }
        }
    ]).to_list(None)
    
    # 遺忘統計（lapse_count > 0 的單字）
    high_lapse = await words_col.count_documents({"lapse_count": {"$gt": 2}})
    
    return {
        "state_distribution": {item["_id"]: item["count"] for item in state_stats},
        "feedback_distribution": {item["_id"]: item["count"] for item in feedback_stats},
        "high_lapse_words": high_lapse,
    }

# 使用
# stats = await get_spaced_repetition_stats(get_database())
# print(stats)
```

---

## MVP vs 完整版本比較

### 最小可行版本（MVP）

必要欄位：
- `acquisition_state`
- `current_interval`
- `next_review_date`
- `stability`
- `difficulty`
- `review_count`
- `success_streak`
- `lapse_count`
- `last_result`

演算法：
- 簡化的 interval 計算（基礎倍數 + 難度調整）
- 三種按鈕的基本狀態轉移
- 簡單的每日選字（按 next_review_date 和 importance）

時間成本：**2-3 天**

### 完整版本

額外欄位：
- `retrievability`
- `difficulty_history`, `review_interval_history`
- `first_review_date`
- `metadata.ease_factor`

額外演算法：
- 完整的 FSRS-equivalent stability/difficulty 更新
- 可檢索性衰變曲線
- 複雜的選字邏輯（4 個 pool）
- 趨勢分析和自適應調整

時間成本：**1-2 週**

---

## 實施路線圖

### Week 1
- [ ] 遷移 schema（添加新欄位）
- [ ] 實作 `update_word_after_review()` 函數
- [ ] 建立 ReviewLog collection
- [ ] 新增 `/training/{training_id}/record-feedback` API

### Week 2
- [ ] 實作基礎選字邏輯
- [ ] 新增 `/training/today/pick-words` API
- [ ] 前端集成反饋 API
- [ ] 測試工作流

### Week 3
- [ ] 建立 MongoDB index
- [ ] 效能監控和優化
- [ ] 資料清理腳本

---

## 總結

這個設計提供了：

1. **可擴展的 Schema**：保留原有欄位，新增 spaced repetition 相關欄位
2. **實用的演算法**：基於艾賓浩斯遺忘曲線，但簡化易實作
3. **完整的 Python 實作**：可直接複製使用的代碼
4. **清晰的集成步驟**：與現有 FastAPI 無縫配合
5. **效能優化建議**：Index 設計和查詢最佳實踐

開始實施前，建議先在測試資料庫上試驗遷移腳本！
