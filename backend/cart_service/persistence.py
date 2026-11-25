from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from backend.database import transaction

CART_TIMEOUT = timedelta(minutes=30)
EXPIRED_MESSAGE = "Seu carrinho expirou. Inicie um novo carrinho."
STALE_MESSAGE = "Este carrinho mudou. Atualize a página e tente novamente."


def active_cart(user_id):
    return {"usuario_id": user_id, "status": "ativo"}


def initialize_cart(database):
    database.carrinhos.create_index(
        "usuario_id", unique=True, partialFilterExpression={"status": "ativo"},
    )
    database.carrinhos.create_index([("status", 1), ("expira_em", 1), ("_id", 1)])
    database.carrinhos.create_index([("usuario_id", 1), ("status", 1)])
    database.carrinhos.update_many(
        {"status": "ativo", "expira_em": {"$exists": False}},
        [{"$set": {"expira_em": {"$add": [
            "$ultima_atividade_em", int(CART_TIMEOUT.total_seconds() * 1000),
        ]}}}],
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


def expire_cart(database, cart_id):
    def release(session):
        now = datetime.now(UTC)
        cart = database.carrinhos.find_one_and_update(
            {"_id": cart_id, "status": "ativo", "expira_em": {"$lte": now}},
            {"$set": {"status": "expirado", "encerrado_em": now}},
            return_document=ReturnDocument.BEFORE, session=session,
        )
        if cart is None:
            return False
        for item in sorted(cart["itens"], key=lambda item: item["produto_id"]):
            result = database.estoques.update_one(
                {"produto_id": item["produto_id"],
                 "quantidade_reservada": {"$gte": item["quantidade"]}},
                {"$inc": {"quantidade_reservada": -item["quantidade"]},
                 "$set": {"atualizado_em": now}},
                session=session,
            )
            if not result.matched_count:
                raise RuntimeError(f"Reserva inconsistente para o produto {item['produto_id']}.")
        return True

    return transaction(database, release)


def due_carts(database, limit=100):
    return list(database.carrinhos.find(
        {"status": "ativo", "expira_em": {"$lte": datetime.now(UTC)}}, {"_id": 1},
    ).sort([("expira_em", 1), ("_id", 1)]).limit(limit))


def has_expired_cart(database, user_id, session=None):
    return database.carrinhos.find_one(
        {"usuario_id": user_id, "status": "expirado"}, {"_id": 1}, session=session,
    ) is not None


def cart_expired(cart, now):
    return cart["expira_em"].replace(tzinfo=UTC) <= now


def get_active_cart(database, user_id):
    query = active_cart(user_id)
    cart = database.carrinhos.find_one(query)
    if cart is not None and cart_expired(cart, datetime.now(UTC)):
        expire_cart(database, cart["_id"])
        cart = database.carrinhos.find_one(query)
    return cart


def activity_dates(now):
    return {"ultima_atividade_em": now, "expira_em": now + CART_TIMEOUT}


def start_cart(database, user_id):
    if get_active_cart(database, user_id) is not None:
        return
    try:
        database.carrinhos.update_one(
            active_cart(user_id),
            {"$setOnInsert": {"itens": [], **activity_dates(datetime.now(UTC))}},
            upsert=True,
        )
    except DuplicateKeyError:
        # Another request started the customer's cart.
        if get_active_cart(database, user_id) is None:
            raise


def touch_cart(database, user_id, cart_id):
    now = datetime.now(UTC)
    result = database.carrinhos.update_one(
        {**active_cart(user_id), "_id": cart_id, "expira_em": {"$gt": now}},
        {"$set": activity_dates(now)},
    )
    if not result.matched_count:
        get_active_cart(database, user_id)
        raise HTTPException(409, STALE_MESSAGE)


def set_cart_quantity(database, user_id, cart_id, code, quantity, product_active):
    query = active_cart(user_id)

    def apply(session):
        now = datetime.now(UTC)
        cart = database.carrinhos.find_one(query, session=session)
        if cart is not None and cart_expired(cart, now):
            return cart["_id"]
        if (cart["_id"] if cart else None) != cart_id:
            raise HTTPException(409, STALE_MESSAGE)
        if cart is None and has_expired_cart(database, user_id, session):
            raise HTTPException(409, EXPIRED_MESSAGE)
        items = {item["produto_id"]: item["quantidade"] for item in cart["itens"]} if cart else {}
        delta = quantity - items.get(code, 0)
        if not delta:
            return
        if delta > 0 and not product_active:
            raise HTTPException(409, "Este produto foi removido do catálogo.")

        condition = ({"$expr": availability_query(delta)} if delta > 0
                     else {"quantidade_reservada": {"$gte": -delta}})
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
        changes = {
            "itens": [{"produto_id": key, "quantidade": value} for key, value in items.items()],
            **activity_dates(now),
        }
        if cart:
            database.carrinhos.update_one({"_id": cart_id}, {"$set": changes}, session=session)
        else:
            database.carrinhos.insert_one({**query, **changes}, session=session)

    try:
        expired_id = transaction(database, apply)
    except DuplicateKeyError as error:
        raise HTTPException(409, STALE_MESSAGE) from error
    if expired_id is not None:
        expire_cart(database, expired_id)
        raise HTTPException(409, EXPIRED_MESSAGE)
