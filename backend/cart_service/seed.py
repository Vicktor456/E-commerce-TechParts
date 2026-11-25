import json
from datetime import UTC, datetime
from pathlib import Path

from pymongo import UpdateOne

from backend.database import mongo_client, service_database

from .persistence import initialize_cart


def main():
    fixture = Path(__file__).with_name("estoques_demo.json")
    totals = json.loads(fixture.read_text(encoding="utf-8"))
    now = datetime.now(UTC)
    with mongo_client() as client:
        database = service_database(client, "compras")
        initialize_cart(database)
        result = database.estoques.bulk_write([
            UpdateOne(
                {"produto_id": int(code)},
                {"$setOnInsert": {"quantidade_total": total, "quantidade_reservada": 0,
                                  "atualizado_em": now}},
                upsert=True,
            )
            for code, total in totals.items()
        ])
    print(f"Estoques: {result.upserted_count} inseridos, {result.matched_count} já cadastrados.")


if __name__ == "__main__":
    main()
