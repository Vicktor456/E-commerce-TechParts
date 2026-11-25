import os

from pymongo import MongoClient
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern


def mongo_client() -> MongoClient:
    uri = os.getenv(
        "MONGODB_URI",
        "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true",
    )
    return MongoClient(uri, serverSelectionTimeoutMS=3000)


def service_database(client, name):
    prefix = os.getenv("MONGODB_DB_PREFIX", "")
    return client[f"{prefix}{name}"]


def transaction(database, action):
    with database.client.start_session() as session:
        return session.with_transaction(
            action, read_concern=ReadConcern("snapshot"), write_concern=WriteConcern("majority"),
        )
