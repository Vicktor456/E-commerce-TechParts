import binascii
import json
from base64 import b64decode, urlsafe_b64encode
from datetime import datetime
from decimal import DecimalException
from hashlib import sha256

from bson import ObjectId
from bson.decimal128 import Decimal128
from bson.errors import InvalidId
from fastapi import HTTPException


def cursor_scope(request):
    filters = sorted((key, value) for key, value in request.query_params.multi_items()
                     if key not in ("cursor", "pagina"))
    return sha256(json.dumps([request.url.path, filters]).encode()).hexdigest()


def cursor_query(query, sort, token, scope):
    try:
        saved_scope, values = json.loads(b64decode(token, altchars=b"-_", validate=True))
        if saved_scope != scope or not isinstance(values, list) or len(values) != len(sort):
            raise ValueError
        if any(not isinstance(value, str) for value in values):
            raise ValueError
        conversions = {
            "codigo": int, "nome": str, "preco_atual": Decimal128,
            "registrado_em": datetime.fromisoformat, "_id": ObjectId,
        }
        boundary = {field: conversions[field](value)
                    for (field, _), value in zip(sort, values)}
        if "codigo" in boundary and not 0 <= boundary["codigo"] < 2**63:
            raise ValueError
        if "preco_atual" in boundary and not boundary["preco_atual"].to_decimal().is_finite():
            raise ValueError
    except (TypeError, ValueError, OverflowError, binascii.Error, InvalidId, DecimalException) as error:
        raise HTTPException(422, "Cursor inválido para esta consulta.") from error

    equal = {}
    after = []
    for field, direction in sort:
        after.append({**equal, field: {"$gt" if direction == 1 else "$lt": boundary[field]}})
        equal[field] = boundary[field]
    return {**query, "$or": after}


def read_page(collection, query, sort, *, request, token, page, limit):
    scope = cursor_scope(request)
    if token and page != 1:
        raise HTTPException(422, "Use cursor ou número de página.")
    selection = cursor_query(query, sort, token, scope) if token else query
    documents = collection.find(selection).sort(sort)
    if page > 1:
        documents = documents.skip((page - 1) * limit)
    rows = list(documents.limit(limit + 1))
    next_cursor = None
    if len(rows) > limit:
        values = [str(rows[limit - 1][field]) for field, _ in sort]
        next_cursor = urlsafe_b64encode(json.dumps([scope, values], ensure_ascii=False).encode()).decode()
    return rows[:limit], next_cursor
