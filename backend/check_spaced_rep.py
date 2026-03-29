#!/usr/bin/env python3
"""檢查數據庫中的 spaced repetition 字段"""

import asyncio
from db import get_database

async def check():
    db = get_database()
    words = db['words']
    
    # 取一個單字看看有什麼字段
    sample = await words.find_one({})
    if sample:
        print('Sample word fields:')
        for key in sorted(sample.keys()):
            if key != '_id':
                print(f'  {key}: {type(sample[key]).__name__}')
        
        # 檢查是否有新字段
        has_new_fields = all(
            field in sample 
            for field in ['acquisition_state', 'stability', 'next_review_date']
        )
        print(f'\nHas spaced repetition fields: {has_new_fields}')
        
        # 檢查 acquisition_state 分佈
        pipeline = [
            {'$group': {'_id': '$acquisition_state', 'count': {'$sum': 1}}}
        ]
        result = await words.aggregate(pipeline).to_list(None)
        print(f'\nAcquisition state distribution:')
        for item in result:
            print(f'  {item["_id"]}: {item["count"]}')
    else:
        print('No words found in database!')

asyncio.run(check())
