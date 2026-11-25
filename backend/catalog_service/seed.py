import json
from pathlib import Path

from bson.decimal128 import Decimal128

from backend.database import mongo_client

from .persistence import initialize_catalog, insert_product, transaction


def main() -> None:
    fixture = Path(__file__).with_name("produtos_demo.json")
    documents = json.loads(fixture.read_text(encoding="utf-8"))
    with mongo_client() as client:
        database = client.catalogo
        initialize_catalog(database)

        def seed(session):
            inserted = 0
            for product in documents:
                if database.produtos.find_one({"codigo": product["codigo"]}, session=session):
                    continue
                fields = {**product, "preco_atual": Decimal128(product["preco_atual"])}
                insert_product(database, fields, session)
                inserted += 1
            return inserted

        inserted = transaction(database, seed)
    print(f"Produtos de demonstração: {inserted} inseridos, {len(documents) - inserted} já cadastrados.")


if __name__ == "__main__":
    main()
