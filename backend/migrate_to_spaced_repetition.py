# Migration Script: Migrate to Spaced Repetition Schema

import asyncio
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
import os
import argparse


async def migrate_words_to_spaced_repetition(
    db,
    limit: int = None,
    apply: bool = False,
):
    """
    將現有 words collection 遷移到 spaced repetition schema。
    
    Args:
        db: Motor database instance
        limit: 最多遷移的文件數（用於測試）
        apply: 實際執行遷移（如果 False，僅預覽）
    """
    words_collection = db["words"]
    
    # 查詢所有需要遷移的文件（還沒有 spaced repetition 欄位的）
    query = {
        "acquisition_state": {"$exists": False}
    }
    
    total_to_migrate = await words_collection.count_documents(query)
    print(f"Found {total_to_migrate} words to migrate")
    
    if total_to_migrate == 0:
        print("No words to migrate. Already migrated!")
        return
    
    cursor = words_collection.find(query)
    if limit:
        cursor = cursor.limit(limit)
    
    count = 0
    errors = 0
    skipped = 0
    
    async for word_doc in cursor:
        try:
            # 準備更新數據
            update_data = {
                "$set": {
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
            }
            
            if apply:
                await words_collection.update_one(
                    {"_id": word_doc["_id"]},
                    update_data
                )
                print(f"✓ Migrated: {word_doc.get('word', 'unknown')} (ID: {word_doc['_id']})")
            else:
                print(f"[PREVIEW] Would migrate: {word_doc.get('word', 'unknown')} (ID: {word_doc['_id']})")
            
            count += 1
            
        except Exception as e:
            errors += 1
            print(f"✗ Error migrating {word_doc.get('word', 'unknown')}: {str(e)}")
        
        if count % 100 == 0:
            print(f"... processed {count} words")
    
    print("\n" + "="*60)
    print(f"Migration Summary:")
    print(f"  Processed:  {count}")
    print(f"  Errors:     {errors}")
    print(f"  Status:     {'APPLIED' if apply else 'PREVIEW ONLY'}")
    print("="*60)


async def ensure_indexes(db):
    """確保所有必要的 index 存在。"""
    words_col = db["words"]
    review_log_col = db["review_log"]
    training_col = db["training"]
    
    print("\nCreating indexes...")
    
    # Words indexes
    try:
        await words_col.create_index(
            [("next_review_date", 1), ("acquisition_state", 1)],
            name="idx_next_review_state"
        )
        print("✓ Created index: idx_next_review_state")
    except Exception as e:
        print(f"  (Index may already exist: {e})")
    
    try:
        await words_col.create_index(
            [("retrievability", 1), ("lapse_count", -1)],
            name="idx_at_risk_pool"
        )
        print("✓ Created index: idx_at_risk_pool")
    except Exception as e:
        print(f"  (Index may already exist: {e})")
    
    try:
        await words_col.create_index(
            [("priority_score", -1)],
            name="idx_priority"
        )
        print("✓ Created index: idx_priority")
    except Exception as e:
        print(f"  (Index may already exist: {e})")
    
    try:
        await words_col.create_index(
            [("word", 1)],
            name="idx_word",
            unique=True,
            sparse=True
        )
        print("✓ Created index: idx_word")
    except Exception as e:
        print(f"  (Index may already exist: {e})")
    
    try:
        await words_col.create_index(
            [("acquisition_state", 1)],
            name="idx_state"
        )
        print("✓ Created index: idx_state")
    except Exception as e:
        print(f"  (Index may already exist: {e})")
    
    # Review Log indexes
    try:
        await review_log_col.create_index(
            [("training_id", 1)],
            name="idx_training_id"
        )
        print("✓ Created index: idx_training_id")
    except Exception as e:
        print(f"  (Index may already exist: {e})")
    
    try:
        await review_log_col.create_index(
            [("word_id", 1)],
            name="idx_word_id"
        )
        print("✓ Created index: idx_word_id")
    except Exception as e:
        print(f"  (Index may already exist: {e})")
    
    try:
        await review_log_col.create_index(
            [("review_date", -1)],
            name="idx_review_date"
        )
        print("✓ Created index: idx_review_date")
    except Exception as e:
        print(f"  (Index may already exist: {e})")
    
    print("Indexes setup complete\n")


async def main():
    parser = argparse.ArgumentParser(
        description="Migrate words collection to spaced repetition schema"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of words to migrate (for testing)"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually apply the migration (default: preview only)"
    )
    parser.add_argument(
        "--index-only",
        action="store_true",
        help="Only create indexes, don't migrate data"
    )
    parser.add_argument(
        "--db-uri",
        type=str,
        default=os.getenv("MONGODB_URI"),
        help="MongoDB connection URI"
    )
    
    args = parser.parse_args()
    
    if not args.db_uri:
        print("Error: MONGODB_URI not set. Provide via --db-uri or env var")
        return
    
    # Connect to MongoDB
    try:
        client = AsyncIOMotorClient(args.db_uri)
        db = client["english_words"]
        
        # Ping to verify connection
        await db.command("ping")
        print("✓ Connected to MongoDB\n")
        
    except Exception as e:
        print(f"✗ Failed to connect to MongoDB: {e}")
        return
    
    try:
        # Ensure indexes
        await ensure_indexes(db)
        
        # Skip data migration if --index-only
        if not args.index_only:
            # Run migration
            await migrate_words_to_spaced_repetition(
                db,
                limit=args.limit,
                apply=args.apply
            )
            
            if not args.apply:
                print("\n⚠ This was a PREVIEW. Run with --apply to actually migrate.\n")
    
    finally:
        client.close()
        print("✓ Connection closed")


if __name__ == "__main__":
    asyncio.run(main())
