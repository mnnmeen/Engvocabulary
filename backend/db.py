import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

try:
    import certifi
except ImportError:
    certifi = None


ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

MONGODB_URI = os.getenv("MONGODB_URI")

if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI is not set in the environment or .env file")

_client: Optional[AsyncIOMotorClient] = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        client_kwargs = {
            "serverSelectionTimeoutMS": 30000,
            "connectTimeoutMS": 20000,
            "socketTimeoutMS": 20000,
        }

        # Atlas (mongodb+srv) connections on some Windows/Conda setups
        # can fail TLS handshake unless an explicit CA bundle is provided.
        if MONGODB_URI.startswith("mongodb+srv://"):
            client_kwargs["tls"] = True
            if certifi is not None:
                client_kwargs["tlsCAFile"] = certifi.where()

        _client = AsyncIOMotorClient(MONGODB_URI, **client_kwargs)
    return _client


def get_database(db_name: str = "english_words") -> AsyncIOMotorDatabase:
    client = get_client()
    return client[db_name]
