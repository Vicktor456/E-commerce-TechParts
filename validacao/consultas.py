from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError
from urllib.parse import urlencode

from bson.decimal128 import Decimal128

from .carga import request

PRODUCTS = "/api/catalogo/produtos"


def walk(base, path, parameters, expected_total, *, pages=2):
    cursor = None
    items = []
    for index in range(pages):
        position = [("cursor", cursor)] if cursor else []
        query = urlencode([*parameters, *position])
        result = request(base, f"{path}?{query}")
        assert result["total"] == expected_total
        items.extend(result["items"])
        cursor = result.get("nextCursor")
        if index < pages - 1:
            assert cursor
    assert len(items) == len({item["id"] for item in items})
    return items, cursor


def verify_queries(base, database):
    category = [("categoria", "placa-mae"), ("limite", "3")]
    q01, _ = walk(base, PRODUCTS, [*category, ("preco_min", "500"), ("preco_max", "900")], 990)
    assert len(q01) == 6
    assert [(p["price"], p["id"]) for p in q01] == sorted((p["price"], p["id"]) for p in q01)

    specs = [("especificacao", "soquete:AM5"), ("especificacao", "tipo_memoria:DDR5")]
    q02, token = walk(base, PRODUCTS, [*category, *specs], 990)
    assert all(p["specs"]["Soquete"] == "AM5" and p["specs"]["Tipo de memória"] == "DDR5" for p in q02)
    try:
        request(base, PRODUCTS + "?" + urlencode({"categoria": "monitor", "limite": 3, "cursor": token}))
    except HTTPError as error:
        assert error.code == 422
    else:
        raise AssertionError("A API aceitou um cursor de outro filtro.")

    for direction in ("low", "high", "name", "relevance"):
        by_text, _ = walk(base, PRODUCTS, [
            *category, *specs, ("ordem", direction), ("busca", "isolada"),
        ], 988)
        assert len(by_text) == 6 and all("isolada" in p["description"] for p in by_text)
    assert request(base, PRODUCTS + "?" + urlencode({"busca": "Kumara"}))["total"] == 1

    # Equal timestamps force Q04 to use its ObjectId tie-breaker.
    product_id = database.produtos.find_one({"codigo": 2})["_id"]
    timestamp = datetime.now(UTC) - timedelta(days=1)
    records = database.historico_precos.insert_many([
        {"produto_id": product_id, "preco": Decimal128(str(1200 + index)), "registrado_em": timestamp}
        for index in range(55)
    ])
    try:
        interval = [("inicio", (timestamp - timedelta(seconds=1)).isoformat()),
                    ("fim", (timestamp + timedelta(seconds=1)).isoformat())]
        history, last = walk(base, f"{PRODUCTS}/2/historico", interval, 55)
        assert last is None and [event["id"] for event in history] == [
            str(identifier) for identifier in reversed(records.inserted_ids)
        ]
    finally:
        database.historico_precos.delete_many({"_id": {"$in": records.inserted_ids}})
    print("Consultas verificadas: cursores Q01/Q02/Q04 e busca textual IX06.", flush=True)
