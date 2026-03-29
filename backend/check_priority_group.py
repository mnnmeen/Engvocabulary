#!/usr/bin/env python3
"""檢查 priority_group 的值"""

import asyncio
from db import get_database

async def check():
    db = get_database()
    words = db['words']
    
    # 查詢 priority_group 的分佈
    pipeline = [
        {'$group': {'_id': '$priority_group', 'count': {'$sum': 1}}}
    ]
    result = await words.aggregate(pipeline).to_list(None)
    print('Priority group distribution:')
    for item in result:
        print(f'  {item["_id"]}: {item["count"]}')
    
    # 查看一個 sample
    sample = await words.find_one({})
    if sample:
        print(f'\nSample priority_group: {sample.get("priority_group")}')
        print(f'Sample priority_rank: {sample.get("priority_rank")}')
        print(f'Sample acquisition_state: {sample.get("acquisition_state")}')

asyncio.run(check())
