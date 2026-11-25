from datetime import UTC, datetime

from bson.decimal128 import Decimal128
from pymongo import DESCENDING, ReturnDocument
from backend.database import transaction

from .models import price_decimal


def record_price(database, product_id, price, recorded_at, session):
    database.historico_precos.insert_one({
        "produto_id": product_id, "preco": price, "registrado_em": recorded_at,
    }, session=session)


def initialize_catalog(database):
    products = database.produtos
    products.create_index("codigo", unique=True)
    products.create_index([("ativo", 1), ("preco_atual", 1), ("codigo", 1)])
    products.create_index([("ativo", 1), ("categoria", 1), ("preco_atual", 1), ("codigo", 1)])
    products.create_index([
        ("ativo", 1), ("categoria", 1), ("especificacoes.tipo_memoria", 1),
        ("especificacoes.soquete", 1), ("preco_atual", 1), ("codigo", 1),
    ])
    database.historico_precos.create_index([("produto_id", 1), ("registrado_em", -1), ("_id", -1)])
    last_product = products.find_one({}, sort=[("codigo", DESCENDING)], projection={"codigo": 1})
    # Keep codes 1 through 12 available for the demonstration seed.
    database.contadores.update_one(
        {"_id": "produtos"}, {"$max": {"ultimo_codigo": max(12, (last_product or {}).get("codigo", 0))}},
        upsert=True,
    )
    for product in products.find({"historico_inicializado": {"$ne": True}}, {"_id": 1}):
        migrate_history(database, product["_id"])


def migrate_history(database, product_id):
    def migrate(session):
        product = database.produtos.find_one(
            {"_id": product_id, "historico_inicializado": {"$ne": True}}, session=session,
        )
        if product is None:
            return
        legacy = product.get("demonstracao", {}).get("historico", [])
        current = price_decimal(product["preco_atual"])
        price = None
        for sample in sorted(legacy, key=lambda item: item["date"]):
            new_price = price_decimal(sample["price"])
            if new_price == price:
                continue
            recorded_at = datetime.fromisoformat(sample["date"]).replace(tzinfo=UTC)
            record_price(database, product_id, Decimal128(new_price), recorded_at, session)
            price = new_price
        if current != price:
            recorded_at = product.get("atualizado_em") or product.get("criado_em") or datetime.now(UTC)
            record_price(database, product_id, Decimal128(current), recorded_at, session)
        database.produtos.update_one(
            {"_id": product_id},
            {"$set": {"historico_inicializado": True}, "$unset": {"demonstracao.historico": ""}},
            session=session,
        )

    transaction(database, migrate)


def insert_product(database, fields, session):
    now = datetime.now(UTC)
    product = {
        **fields, "historico_inicializado": True,
        "criado_em": fields.get("criado_em", now), "atualizado_em": fields.get("atualizado_em", now),
    }
    inserted = database.produtos.insert_one(product, session=session)
    record_price(database, inserted.inserted_id, product["preco_atual"], product["criado_em"], session)
    return product


def create_product(database, fields):
    def create(session):
        counter = database.contadores.find_one_and_update(
            {"_id": "produtos"}, {"$inc": {"ultimo_codigo": 1}},
            return_document=ReturnDocument.AFTER, session=session,
        )
        return insert_product(database, {**fields, "codigo": counter["ultimo_codigo"], "ativo": True}, session)

    return transaction(database, create)


def update_product(database, code, fields):
    def update(session):
        current = database.produtos.find_one({"codigo": code}, session=session)
        if current is None:
            return None
        now = datetime.now(UTC)
        changes = {**fields, "atualizado_em": now}
        database.produtos.update_one({"_id": current["_id"]}, {"$set": changes}, session=session)
        if price_decimal(current["preco_atual"]) != price_decimal(fields["preco_atual"]):
            record_price(database, current["_id"], fields["preco_atual"], now, session)
        return {**current, **changes}

    return transaction(database, update)
