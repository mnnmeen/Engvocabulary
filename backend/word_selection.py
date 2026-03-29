# Word Selection Module for Spaced Repetition

from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional
import math
from enum import Enum
import random

class PoolType(str, Enum):
    DUE = "due"
    AT_RISK = "at_risk"
    NEW = "new"
    MAINTENANCE = "maintenance"


def _resolve_phrase_alternatives(phrase: str) -> str:
    """把帶有 / 的片語展開成單一路徑，例如 bargain for/on sth -> bargain on sth。"""
    normalized = " ".join(str(phrase).split())
    if not normalized:
        return normalized

    resolved_tokens: List[str] = []
    for token in normalized.split(" "):
        if "/" not in token:
            resolved_tokens.append(token)
            continue

        # 只在英文字母替代場景做展開，避免 URL 或奇怪符號誤拆。
        parts = [p for p in token.split("/") if p]
        if len(parts) >= 2 and all(any(ch.isalpha() for ch in p) for p in parts):
            resolved_tokens.append(random.choice(parts))
        else:
            resolved_tokens.append(token)

    return " ".join(resolved_tokens)

def get_review_unit(word_doc: Dict[str, Any]) -> str:
    """
    從單字中隨機選出搭配詞或單字本身作為複習單位。
    
    Args:
        word_doc: 單字字典
    
    Returns:
        複習單位（可能是搭配詞或純單字）
    
    Examples:
        "bargain" → 可能返回 "bargain for/on sth" 或 "bargain" 本身
    """
    # 收集所有可能的複習單位（搭配詞 + 單字本身）
    review_units = [word_doc.get("word")]  # 第一個選項總是單字本身
    
    # 從所有 senses 中收集搭配詞
    senses = word_doc.get("senses", [])
    for sense in senses:
        collocations = sense.get("collocations", [])
        for collocation in collocations:
            phrase = collocation.get("phrase")
            if phrase:
                review_units.append(_resolve_phrase_alternatives(str(phrase)))
    
    # 移除重複
    review_units = list(set(review_units))
    
    # 隨機選擇
    chosen = random.choice(review_units) if review_units else word_doc.get("word")
    return " ".join(str(chosen or "").split())

def build_selection_pools_filter(
    today: date,
) -> Dict[str, Dict[str, Any]]:
    """
    構建 4 個選字池的篩選條件。
    返回可用於 MongoDB find() 或 aggregation 的過濾條件。
    """
    filters = {
        PoolType.DUE: {
            "next_review_date": {"$lte": today.isoformat()},
            "retrievability": {"$lt": 0.9},
            "acquisition_state": {"$in": ["learning", "graduated"]},
        },
        PoolType.AT_RISK: {
            "retrievability": {"$gt": 0.5, "$lt": 0.7},
            "lapse_count": {"$gt": 0},
            "acquisition_state": {"$in": ["learning", "graduated"]},
        },
        PoolType.NEW: {
            "$or": [
                {"acquisition_state": "new"},
                {
                    "acquisition_state": "learning",
                    "review_count": {"$lt": 3}
                }
            ],
        },
        PoolType.MAINTENANCE: {
            "retrievability": {"$gt": 0.8},
            "acquisition_state": "graduated",
            "$or": [
                {"importance": {"$gte": 3}},
                {"proficiency": {"$gte": 70}},
            ],
        },
    }
    
    return filters

def get_pool_sort_order(pool_type: PoolType) -> List[tuple]:
    """
    取得各 pool 內部的排序規則。
    """
    sort_orders = {
        PoolType.DUE: [
            ("retrievability", 1),    # 最需要複習的先
            ("lapse_count", -1),      # 遺忘多的優先
        ],
        PoolType.AT_RISK: [
            ("retrievability", 1),
            ("importance", -1),
        ],
        PoolType.NEW: [
            ("importance", -1),
            ("priority_score", -1),
        ],
        PoolType.MAINTENANCE: [
            ("retrievability", 1),    # 快要忘記的先
            ("created_date", 1),      # 舊字優先
        ],
    }
    
    return sort_orders.get(pool_type, [("priority_score", -1)])

def simulate_word_selection_for_today(
    all_words: List[Dict[str, Any]],
    today: Optional[date] = None,
    new_word_limit: int = 5,
    total_limit: int = 30,
) -> Dict[str, Any]:
    """
    非同步版本的選字邏輯（用於測試或同步環境）。
    
    Args:
        all_words: 從資料庫查出的所有單字列表
        today: 今天的日期
        new_word_limit: 新字的最大數量
        total_limit: 每天總數量限制
    
    Returns:
        {
            "words": [...],
            "count": int,
            "pools": {...}
        }
    """
    if today is None:
        today = date.today()
    
    import random
    
    # 計算 retrievability（如果尚未計算）
    for word in all_words:
        if "retrievability" not in word:
            last_review_ts = word.get("last_review_timestamp")
            if last_review_ts:
                if isinstance(last_review_ts, str):
                    last_review_dt = datetime.fromisoformat(last_review_ts)
                else:
                    last_review_dt = last_review_ts
                days_since = (datetime.utcnow() - last_review_dt).days
            else:
                days_since = 0
            
            stability = word.get("stability", 1.0)
            retrievability = math.exp(
                -math.log(2) * days_since / stability
            ) if stability > 0 else 1.0
            word["retrievability"] = max(0.0, min(retrievability, 1.0))
    
    # 定義過濾條件
    filters = build_selection_pools_filter(today)
    
    # Filter function
    def matches_filter(word: Dict, filter_spec: Dict) -> bool:
        """判斷單字是否符合過濾條件。"""
        for key, value in filter_spec.items():
            if key == "$or":
                # OR 條件：至少一個 sub-filter 符合
                # value 是一個列表，每個元素是一個過濾 dict
                if not any(matches_filter(word, sub_filter) for sub_filter in value):
                    return False
            elif isinstance(value, dict):
                # 處理 MongoDB 操作符
                word_value = word.get(key)
                for op, op_value in value.items():
                    if op == "$lte":
                        if not (word_value is not None and word_value <= op_value):
                            return False
                    elif op == "$lt":
                        if not (word_value is not None and word_value < op_value):
                            return False
                    elif op == "$gte":
                        if not (word_value is not None and word_value >= op_value):
                            return False
                    elif op == "$gt":
                        if not (word_value is not None and word_value > op_value):
                            return False
                    elif op == "$in":
                        if not (word_value in op_value):
                            return False
                    elif op == "$eq":
                        if not (word_value == op_value):
                            return False
            else:
                # 精確比較
                if word.get(key) != value:
                    return False
        
        return True
    
    # === 構建各 pool ===
    pools = {}
    for pool_type in PoolType:
        pool_words = [
            w for w in all_words 
            if matches_filter(w, filters[pool_type])
        ]
        
        # 排序
        sort_order = get_pool_sort_order(pool_type)
        for field, direction in reversed(sort_order):
            reverse = direction == -1
            pool_words.sort(
                key=lambda w: (w.get(field) is None, w.get(field)),
                reverse=reverse
            )
        
        # ⭐ 新增：部分隨機化 - 各 pool 內部打亂，保留排序的前 50% 概率
        # 這樣既尊重優先度，又引入多樣性
        if len(pool_words) > 3:
            # 分成前一半（優先度高）和後一半（優先度低）
            split_point = len(pool_words) // 2
            high_priority = pool_words[:split_point]
            low_priority = pool_words[split_point:]
            # 打亂低優先度部分
            random.shuffle(low_priority)
            pool_words = high_priority + low_priority
        
        pools[pool_type] = pool_words
    
    # === 選字比例 ===
    result_words = []
    excluded_ids = set()
    
    import random
    
    # Due pool: 40%
    due_target = math.ceil(total_limit * 0.40)
    due_pool = [w for w in pools[PoolType.DUE] if w.get("_id") not in excluded_ids]
    due_count = min(len(due_pool), due_target)
    due_selected = random.sample(due_pool, due_count) if due_count > 0 else []
    result_words.extend(due_selected)
    excluded_ids.update(w.get("_id") for w in due_selected)
    
    # At-risk pool: 25%
    at_risk_target = math.ceil(total_limit * 0.25)
    at_risk_pool = [w for w in pools[PoolType.AT_RISK] if w.get("_id") not in excluded_ids]
    at_risk_count = min(len(at_risk_pool), at_risk_target)
    at_risk_selected = random.sample(at_risk_pool, at_risk_count) if at_risk_count > 0 else []
    result_words.extend(at_risk_selected)
    excluded_ids.update(w.get("_id") for w in at_risk_selected)
    
    # New pool: 25%
    new_target = min(new_word_limit, math.ceil(total_limit * 0.25))
    new_pool_available = [w for w in pools[PoolType.NEW] if w.get("_id") not in excluded_ids]
    new_count = min(len(new_pool_available), new_target)
    new_selected = random.sample(new_pool_available, new_count) if new_count > 0 else []
    result_words.extend(new_selected)
    excluded_ids.update(w.get("_id") for w in new_selected)
    
    # Maintenance pool: 填充剩餘
    remaining = total_limit - len(result_words)
    if remaining > 0:
        maintenance_pool = [w for w in pools[PoolType.MAINTENANCE] if w.get("_id") not in excluded_ids]
        maintenance_count = min(len(maintenance_pool), remaining)
        maintenance_selected = random.sample(maintenance_pool, maintenance_count) if maintenance_count > 0 else []
        result_words.extend(maintenance_selected)
    
    # === 為每個選中的單字添加 review_unit ===
    for word in result_words:
        word["review_unit"] = get_review_unit(word)
    
    return {
        "words": result_words,
        "count": len(result_words),
        "pools": {
            "due": {"selected": due_count, "total": len(pools[PoolType.DUE])},
            "at_risk": {"selected": at_risk_count, "total": len(at_risk_pool)},
            "new": {"selected": new_count, "total": len(new_pool_available)},
            "maintenance": {"selected": len(result_words) - due_count - at_risk_count - new_count, "total": len(pools[PoolType.MAINTENANCE])},
        }
    }
