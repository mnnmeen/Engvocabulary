#!/usr/bin/env python3
"""修復 acquisition_state 的分類"""

import asyncio
from db import get_database

async def fix_acquisition_state():
    db = get_database()
    words_collection = db["words"]
    
    print("Starting acquisition_state classification fix...")
    
    # 按 priority_group 分類
    mappings = {
        "high": "graduated",      # 高優先度單字 → 已畢業
        "medium": "learning",     # 中優先度 → 學習中
        "low": "new",             # 低優先度 → 新單字
    }
    
    for priority_group, new_state in mappings.items():
        result = await words_collection.update_many(
            {"priority_group": priority_group},
            {"$set": {"acquisition_state": new_state}}
        )
        print(f"{priority_group.upper()}: {result.modified_count} words updated to '{new_state}'")
    
    # 也處理 priority_group 是 None 的
    result = await words_collection.update_many(
        {"priority_group": None},
        {"$set": {"acquisition_state": "new"}}
    )
    print(f"NONE: {result.modified_count} words updated to 'new'")
    
    # 驗證結果
    print("\nVerifying distribution:")
    pipeline = [
        {"$group": {"_id": "$acquisition_state", "count": {"$sum": 1}}}
    ]
    result = await words_collection.aggregate(pipeline).to_list(None)
    for item in result:
        print(f"  {item['_id']}: {item['count']}")

asyncio.run(fix_acquisition_state())
