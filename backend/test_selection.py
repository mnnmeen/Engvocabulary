#!/usr/bin/env python3
"""測試選字邏輯"""

import asyncio
from datetime import date
from db import get_database
from word_selection import simulate_word_selection_for_today

async def test_selection():
    db = get_database()
    words_collection = db["words"]
    
    all_words = await words_collection.find({}).to_list(None)
    print(f"Total words: {len(all_words)}")
    
    # 執行選字
    result = simulate_word_selection_for_today(
        all_words=all_words,
        today=date.today(),
        new_word_limit=8,
        total_limit=25,
    )
    
    selected = result.get("words", [])
    print(f"\nSelected {len(selected)} words:")
    for word in selected:
        print(f"  - {word.get('word')} ({word.get('acquisition_state')})")
    
    print(f"\nPool distribution:")
    for pool_name, pool_info in result.get("pools", {}).items():
        if isinstance(pool_info, dict) and "selected" in pool_info:
            print(f"  {pool_name}: {pool_info['selected']}/{pool_info['total']}")

asyncio.run(test_selection())
