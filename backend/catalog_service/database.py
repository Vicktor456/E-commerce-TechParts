import os

from pymongo import MongoClient


def mongo_client() -> MongoClient:
    uri = os.getenv(
        "MONGODB_URI",
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
    )
    return MongoClient(uri, serverSelectionTimeoutMS=3000)
