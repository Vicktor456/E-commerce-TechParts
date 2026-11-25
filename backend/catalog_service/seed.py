import json
from datetime import UTC, datetime
from pathlib import Path

from bson.decimal128 import Decimal128
from pymongo import UpdateOne

from .database import mongo_client


def main() -> None:
    fixture = Path(__file__).with_name("produtos_demo.json")
    documents = json.loads(fixture.read_text(encoding="utf-8"))
    now = datetime.now(UTC)
    operations = []
    for document in documents:
        document["preco_atual"] = Decimal128(document["preco_atual"])
        document["criado_em"] = now
        document["atualizado_em"] = now
        operations.append(UpdateOne(
            {"codigo": document["codigo"]},
            {"$setOnInsert": document},
            upsert=True,
        ))

    with mongo_client() as client:
        products = client.catalogo.produtos
        products.create_index("codigo", unique=True)
        result = products.bulk_write(operations)
    print(f"Produtos de demonstração: {result.upserted_count} inseridos, {result.matched_count} já cadastrados.")


if __name__ == "__main__":
    main()
