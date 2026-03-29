# Spaced Repetition Core Module

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

def deep_copy_dict(obj: Dict[str, Any]) -> Dict[str, Any]:
    """遞迴複製字典和列表，避免引用問題。"""
    if isinstance(obj, dict):
        return {k: deep_copy_dict(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [deep_copy_dict(item) for item in obj]
    else:
        return obj

def update_word_after_review(
    word_doc: Dict[str, Any],
    review_result: UserFeedback,
    review_date: datetime,
) -> Dict[str, Any]:
    """
    根據複習結果更新單字文件（返回副本，原文件未改動）。
    
    Args:
        word_doc: 原始單字文件
        review_result: 用戶反饋
        review_date: 複習日期
    
    Returns:
        更新後的文件副本
    """
    updated = deep_copy_dict(word_doc)
    
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
    current_state = updated.get("acquisition_state", AcquisitionState.NEW.value)
    current_interval = updated.get("current_interval", 1) or 1
    success_streak = updated.get("success_streak", 0) or 0
    lapse_count = updated.get("lapse_count", 0) or 0
    review_count = updated.get("review_count", 0) or 0
    difficulty = updated.get("difficulty", 0.5)
    stability = updated.get("stability", 1.0)
    
    # === 根據反饋更新欄位 ===
    if review_result == UserFeedback.FAMILIAR:
        # 狀態轉移
        if current_state == AcquisitionState.NEW.value and review_count == 0:
            updated["acquisition_state"] = AcquisitionState.LEARNING.value
        else:
            success_streak += 1
            if success_streak >= 2 and review_count >= 2:
                updated["acquisition_state"] = AcquisitionState.GRADUATED.value
        
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
            updated["acquisition_state"] = AcquisitionState.SUSPENDED.value
        else:
            updated["acquisition_state"] = AcquisitionState.LEARNING.value
        
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
