# 單元測試和驗證指南

## 單元測試: `test_spaced_repetition.py`

```python
import unittest
from datetime import datetime, date, timedelta
from spaced_repetition import (
    AcquisitionState,
    UserFeedback,
    calculate_retrievability,
    calculate_interval,
    update_stability_and_difficulty,
    update_word_after_review,
    calculate_priority_score,
)

class TestRetrievability(unittest.TestCase):
    """測試遺忘曲線計算"""
    
    def test_retrievability_at_0_days(self):
        """剛複習完應該是 100% 可回想"""
        result = calculate_retrievability(stability=10, days_since_review=0)
        self.assertAlmostEqual(result, 1.0, places=2)
    
    def test_retrievability_after_1_day(self):
        """1 天後應該有衰減"""
        result = calculate_retrievability(stability=10, days_since_review=1)
        self.assertLess(result, 1.0)
        self.assertGreater(result, 0.5)  # 穩定度 10，1 天後應該約 70%
    
    def test_retrievability_half_life(self):
        """在穩定度時間點，可回想性應該約 50%"""
        result = calculate_retrievability(stability=10, days_since_review=10)
        self.assertAlmostEqual(result, 0.5, delta=0.05)
    
    def test_retrievability_invalid_inputs(self):
        """邊界情況"""
        self.assertEqual(calculate_retrievability(0, 5), 1.0)
        self.assertEqual(calculate_retrievability(10, -1), 1.0)


class TestIntervalCalculation(unittest.TestCase):
    """測試 interval 計算"""
    
    def test_familiar_increases_interval(self):
        """答對應該增加 interval"""
        result = calculate_interval(
            current_interval=3,
            last_result=UserFeedback.FAMILIAR,
            difficulty=0.5,
            stability=5,
            lapse_count=0,
            success_streak=0,
        )
        self.assertGreater(result, 3)
    
    def test_unsure_decreases_interval(self):
        """不確定應該減少 interval"""
        result = calculate_interval(
            current_interval=10,
            last_result=UserFeedback.UNSURE,
            difficulty=0.5,
            stability=10,
            lapse_count=0,
            success_streak=0,
        )
        self.assertLess(result, 10)
    
    def test_new_significantly_decreases_interval(self):
        """答錯應該大幅減少 interval"""
        result = calculate_interval(
            current_interval=30,
            last_result=UserFeedback.NEW,
            difficulty=0.5,
            stability=30,
            lapse_count=0,
            success_streak=0,
        )
        self.assertLess(result, 10)
    
    def test_difficulty_affects_growth(self):
        """困難的字增長應該比簡單的字慢"""
        result_easy = calculate_interval(
            current_interval=5,
            last_result=UserFeedback.FAMILIAR,
            difficulty=0.1,  # 簡單
            stability=5,
            lapse_count=0,
            success_streak=0,
        )
        
        result_hard = calculate_interval(
            current_interval=5,
            last_result=UserFeedback.FAMILIAR,
            difficulty=0.9,  # 困難
            stability=5,
            lapse_count=0,
            success_streak=0,
        )
        
        self.assertGreater(result_easy, result_hard)
    
    def test_interval_bounds(self):
        """interval 應該在 1-365 天之間"""
        # 極度困難 + 多次答錯
        result = calculate_interval(
            current_interval=1,
            last_result=UserFeedback.NEW,
            difficulty=1.0,
            stability=1,
            lapse_count=5,
            success_streak=0,
        )
        self.assertGreaterEqual(result, 1)
        self.assertLessEqual(result, 365)


class TestUpdateWord(unittest.TestCase):
    """測試完整的單字更新過程"""
    
    def create_test_word(self):
        """建立測試單字"""
        return {
            "_id": "test_id",
            "word": "example",
            "acquisition_state": "new",
            "stability": 1.0,
            "difficulty": 0.5,
            "current_interval": 1,
            "review_count": 0,
            "success_streak": 0,
            "lapse_count": 0,
            "last_result": None,
            "last_review_timestamp": None,
            "difficulty_history": [],
            "review_interval_history": [],
        }
    
    def test_first_familiar_transitions_to_learning(self):
        """第一次答對應該從 new 轉移到 learning"""
        word = self.create_test_word()
        today = datetime.utcnow()
        
        updated = update_word_after_review(
            word,
            UserFeedback.FAMILIAR,
            today,
        )
        
        self.assertEqual(updated["acquisition_state"], AcquisitionState.LEARNING.value)
        self.assertEqual(updated["review_count"], 1)
        self.assertEqual(updated["success_streak"], 1)
        self.assertIsNotNone(updated["next_review_date"])
    
    def test_second_consecutive_familiar_graduates(self):
        """連續答對 2 次且複習 3 次後應該 graduate"""
        word = self.create_test_word()
        today = datetime.utcnow()
        
        # 第 1 次答對
        word = update_word_after_review(word, UserFeedback.FAMILIAR, today)
        self.assertEqual(word["acquisition_state"], AcquisitionState.LEARNING.value)
        
        # 再答對 1 次，達到 2 連勝，但複習次數只有 2，還不能 graduate
        word = update_word_after_review(
            word,
            UserFeedback.FAMILIAR,
            today + timedelta(days=word["current_interval"]),
        )
        self.assertEqual(word["success_streak"], 2)
        # 還不能 graduate（需要 review_count >= 3）
        self.assertEqual(word["acquisition_state"], AcquisitionState.LEARNING.value)
        
        # 再答對 1 次，現在應該 graduate
        word = update_word_after_review(
            word,
            UserFeedback.FAMILIAR,
            today + timedelta(days=word["current_interval"]),
        )
        self.assertEqual(word["acquisition_state"], AcquisitionState.GRADUATED.value)
    
    def test_unsure_resets_streak(self):
        """按「不確定」應該重置連勝"""
        word = self.create_test_word()
        word["success_streak"] = 3
        
        today = datetime.utcnow()
        updated = update_word_after_review(
            word,
            UserFeedback.UNSURE,
            today,
        )
        
        self.assertEqual(updated["success_streak"], 0)
        self.assertEqual(updated["lapse_count"], 0)  # unsure 不增加 lapse
    
    def test_new_increases_lapse_and_resets_streak(self):
        """按「很陌生」應該增加 lapse 並重置連勝"""
        word = self.create_test_word()
        word["success_streak"] = 3
        word["lapse_count"] = 1
        word["acquisition_state"] = "learning"
        
        today = datetime.utcnow()
        updated = update_word_after_review(
            word,
            UserFeedback.NEW,
            today,
        )
        
        self.assertEqual(updated["success_streak"], 0)
        self.assertEqual(updated["lapse_count"], 2)
        self.assertLess(
            updated["current_interval"],
            word["current_interval"]
        )
    
    def test_multiple_lapses_suspend(self):
        """多次遺忘後應該暫停"""
        word = self.create_test_word()
        word["lapse_count"] = 3
        
        today = datetime.utcnow()
        updated = update_word_after_review(
            word,
            UserFeedback.NEW,
            today,
        )
        
        self.assertEqual(updated["acquisition_state"], AcquisitionState.SUSPENDED.value)
        self.assertEqual(updated["current_interval"], 1)  # 重置


class TestPriorityScore(unittest.TestCase):
    """測試優先級分數計算"""
    
    def create_test_word(self, **kwargs):
        """建立測試單字"""
        default = {
            "word": "test",
            "importance": 3,
            "proficiency": 50,
            "stability": 10,
            "review_count": 5,
            "lapse_count": 0,
            "success_streak": 1,
            "last_review_timestamp": None,
        }
        default.update(kwargs)
        return default
    
    def test_recent_review_has_lower_priority(self):
        """剛複習的字應該優先級較低"""
        today = date.today()
        word_recent = self.create_test_word(
            last_review_timestamp=datetime.combine(today, type('T', (), {'time': lambda: type('T', (), {'hour': 10})()})()).isoformat()
        )
        
        word_old = self.create_test_word(
            last_review_timestamp=(datetime.combine(today - timedelta(days=30), type('T', (), {'time': lambda: type('T', (), {'hour': 10})()})())).isoformat()
        )
        
        score_recent = calculate_priority_score(word_recent, today)
        score_old = calculate_priority_score(word_old, today)
        
        self.assertLess(score_recent, score_old)
    
    def test_high_importance_increases_priority(self):
        """重要的字應該優先級較高"""
        today = date.today()
        word_important = self.create_test_word(importance=5)
        word_less_important = self.create_test_word(importance=1)
        
        score_important = calculate_priority_score(word_important, today)
        score_less_important = calculate_priority_score(word_less_important, today)
        
        self.assertGreater(score_important, score_less_important)
    
    def test_low_proficiency_increases_priority(self):
        """不熟的字應該優先級較高"""
        today = date.today()
        word_bad = self.create_test_word(proficiency=20)
        word_good = self.create_test_word(proficiency=90)
        
        score_bad = calculate_priority_score(word_bad, today)
        score_good = calculate_priority_score(word_good, today)
        
        self.assertGreater(score_bad, score_good)


class TestEdgeCases(unittest.TestCase):
    """測試邊界情況"""
    
    def test_none_last_review_timestamp(self):
        """第一次複習應該處理 None 的 last_review_timestamp"""
        word = {
            "word": "test",
            "acquisition_state": "new",
            "stability": 1.0,
            "difficulty": 0.5,
            "current_interval": 1,
            "review_count": 0,
            "success_streak": 0,
            "lapse_count": 0,
            "last_review_timestamp": None,
            "difficulty_history": [],
            "review_interval_history": [],
        }
        
        today = datetime.utcnow()
        result = update_word_after_review(word, UserFeedback.FAMILIAR, today)
        
        # 應該成功處理
        self.assertIsNotNone(result["last_review_timestamp"])
        self.assertIsNotNone(result["first_review_date"])
    
    def test_history_truncation(self):
        """歷史紀錄應該只保留最新 10 筆"""
        word = {
            "word": "test",
            "acquisition_state": "learning",
            "stability": 5.0,
            "difficulty": 0.5,
            "current_interval": 5,
            "review_count": 15,  # 已複習 15 次
            "success_streak": 1,
            "lapse_count": 0,
            "last_review_timestamp": datetime.utcnow().isoformat(),
            "difficulty_history": [0.5] * 15,  # 15 筆歷史
            "review_interval_history": [1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
        }
        
        today = datetime.utcnow()
        result = update_word_after_review(word, UserFeedback.FAMILIAR, today)
        
        # 應該只有 10 筆
        self.assertEqual(len(result["difficulty_history"]), 10)
        self.assertEqual(len(result["review_interval_history"]), 10)


if __name__ == "__main__":
    unittest.main()
```

## 運行測試

```bash
cd backend
python -m pytest test_spaced_repetition.py -v

# 或使用 unittest
python -m unittest test_spaced_repetition -v
```

---

## 集成測試：選字邏輯驗證

```python
# test_word_selection.py

import unittest
from datetime import date, datetime, timedelta
from word_selection import simulate_word_selection_for_today, PoolType

class TestWordSelection(unittest.TestCase):
    """測試每日選字邏輯"""
    
    def create_sample_words(self):
        """建立多個測試單字"""
        today = date.today()
        
        return [
            # Pool 1: Due pool - 到期且需要複習
            {
                "_id": "due_1",
                "word": "due_word_1",
                "acquisition_state": "learning",
                "next_review_date": (today - timedelta(days=1)).isoformat(),
                "retrievability": 0.3,
                "lapse_count": 1,
                "importance": 3,
            },
            # Pool 2: At-risk pool - 可回想性下降
            {
                "_id": "risk_1",
                "word": "at_risk_word",
                "acquisition_state": "graduated",
                "retrievability": 0.6,
                "lapse_count": 1,
                "last_review_timestamp": (datetime.utcnow() - timedelta(days=20)).isoformat(),
                "importance": 4,
            },
            # Pool 3: New pool
            {
                "_id": "new_1",
                "word": "new_word",
                "acquisition_state": "new",
                "review_count": 0,
                "importance": 5,
                "priority_score": 80,
            },
            # Pool 4: Maintenance pool
            {
                "_id": "maint_1",
                "word": "maintenance_word",
                "acquisition_state": "graduated",
                "retrievability": 0.9,
                "proficiency": 80,
                "importance": 2,
                "created_date": "2023-01-01",
            },
        ]
    
    def test_selection_respects_limit(self):
        """選字總數不應超過限制"""
        words = self.create_sample_words() * 20  # 複製多份
        
        result = simulate_word_selection_for_today(
            all_words=words,
            today=date.today(),
            total_limit=30,
        )
        
        self.assertLessEqual(result["count"], 30)
    
    def test_pool_proportions(self):
        """各池的比例應該大致符合設定"""
        words = self.create_sample_words() * 50
        
        result = simulate_word_selection_for_today(
            all_words=words,
            today=date.today(),
            total_limit=100,
        )
        
        due_ratio = result["pools"]["due"]["selected"] / result["count"]
        at_risk_ratio = result["pools"]["at_risk"]["selected"] / result["count"]
        new_ratio = result["pools"]["new"]["selected"] / result["count"]
        
        # 允許 ±10% 的偏差
        self.assertAlmostEqual(due_ratio, 0.40, delta=0.10)
        self.assertAlmostEqual(at_risk_ratio, 0.25, delta=0.10)
        self.assertAlmostEqual(new_ratio, 0.25, delta=0.10)
    
    def test_new_word_limit_respected(self):
        """新字數量不應超過 new_word_limit"""
        words = self.create_sample_words() * 50
        
        result = simulate_word_selection_for_today(
            all_words=words,
            today=date.today(),
            new_word_limit=5,
            total_limit=30,
        )
        
        self.assertLessEqual(
            result["pools"]["new"]["selected"],
            5
        )


if __name__ == "__main__":
    unittest.main()
```

---

## 手動驗證檢查清單

### 資料庫驗證

```javascript
// 在 MongoDB Shell 中

// 檢查遷移是否成功
db.words.countDocuments({ acquisition_state: { $exists: true } })
// 應該返回總單字數

// 檢查 next_review_date 格式
db.words.findOne({}).next_review_date
// 應該是 "YYYY-MM-DD" 格式

// 檢查 ReviewLog collection 是否存在
db.getCollectionNames().includes("review_log")
// 應該返回 true

// 檢查 indexes
db.words.getIndexes()
// 應該包含 idx_next_review_state, idx_priority 等
```

### API 驗證

```bash
# 測試記錄反饋
curl -X POST http://localhost:8000/training/507f1f77bcf86cd799439010/record-feedback \
  -H "Content-Type: application/json" \
  -d '{
    "word_id": "507f1f77bcf86cd799439011",
    "feedback": "familiar"
  }'

# 預期回應（200 OK）:
# {
#   "success": true,
#   "updated_word": {
#     "word": "ambiguous",
#     "next_review_date": "2024-03-29",
#     ...
#   }
# }

# 檢查 ReviewLog 記錄
curl http://localhost:8000/review-logs?word_id=507f1f77bcf86cd799439011
```

### 效能驗證

```bash
# 查詢性能測試（應該 < 100ms）
time curl http://localhost:8000/training/today/pick-words?total_limit=30

# 監控 MongoDB 慢查詢
db.setProfilingLevel(1)  # Level 1: log slow queries
db.system.profile.find({ millis: { $gt: 100 } }).pretty()
```

---

祝測試順利! ✅
