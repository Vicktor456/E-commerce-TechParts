from datetime import UTC, datetime

from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from backend.database import transaction


def active_cart(user_id):
    return {"usuario_id": user_id, "status": "ativo"}


def initialize_cart(database):
    database.carrinhos.create_index(
        "usuario_id", unique=True, partialFilterExpression={"status": "ativo"},
    )
    database.estoques.create_index("produto_id", unique=True)


def stock_values(document):
    total = document["quantidade_total"] if document else 0
    reserved = document["quantidade_reservada"] if document else 0
    return {"total": total, "baseReserved": reserved}


def availability_query(delta):
    return {"$gte": [{"$subtract": ["$quantidade_total", "$quantidade_reservada"]}, delta]}


def set_stock(database, code, total):
    database.estoques.update_one(
        {"produto_id": code},
        {"$setOnInsert": {"quantidade_total": 0, "quantidade_reservada": 0,
                          "atualizado_em": datetime.now(UTC)}},
        upsert=True,
    )
    document = database.estoques.find_one_and_update(
        {"produto_id": code, "quantidade_reservada": {"$lte": total}},
        {"$set": {"quantidade_total": total, "atualizado_em": datetime.now(UTC)}},
        return_document=ReturnDocument.AFTER,
    )
    if document is None:
        raise HTTPException(409, "O total não pode ser inferior à quantidade reservada.")
    return stock_values(document)


def set_cart_quantity(database, user_id, code, quantity, product_active):
    query = active_cart(user_id)

    def apply(session):
        cart = database.carrinhos.find_one(query, session=session)
        items = {item["produto_id"]: item["quantidade"] for item in cart["itens"]} if cart else {}
        delta = quantity - items.get(code, 0)
        if not delta:
            return
        if delta > 0 and not product_active:
            raise HTTPException(409, "Este produto foi removido do catálogo.")

        condition = ({"$expr": availability_query(delta)} if delta > 0
                     else {"quantidade_reservada": {"$gte": -delta}})
        now = datetime.now(UTC)
        result = database.estoques.update_one(
            {"produto_id": code, **condition},
            {"$inc": {"quantidade_reservada": delta}, "$set": {"atualizado_em": now}},
            session=session,
        )
        if not result.matched_count:
            message = "Estoque insuficiente para reservar esta quantidade." if delta > 0 else (
                "Não foi possível liberar a reserva. Tente novamente."
            )
            raise HTTPException(409, message)

        if quantity:
            items[code] = quantity
        else:
            items.pop(code)
        database.carrinhos.update_one(
            query,
            {"$set": {
                "itens": [{"produto_id": key, "quantidade": value} for key, value in items.items()],
                "ultima_atividade_em": now,
            }},
            upsert=True, session=session,
        )

    try:
        transaction(database, apply)
    except DuplicateKeyError:
        # A first write for this customer may have created the active cart concurrently.
        transaction(database, apply)
