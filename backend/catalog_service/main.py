import re
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Literal

from bson.decimal128 import Decimal128
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

from backend.database import mongo_client
from backend.service_http import ProductCodes, call_service, require_admin

from . import persistence
from .models import (
    CATEGORY_LABELS, CatalogFilters, CatalogProduct, Category, HistoryPage, PriceEvent,
    ProductInput, ProductPage, price_decimal, spec_display, spec_label,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    with mongo_client() as client:
        app.state.database = client.catalogo
        persistence.initialize_catalog(app.state.database)
        yield


app = FastAPI(title="TechParts — Catálogo", lifespan=lifespan)


@app.middleware("http")
async def catalog_cache_control(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(PyMongoError)
async def database_unavailable(_request: Request, _error: PyMongoError):
    return JSONResponse(status_code=503, content={"detail": "Banco de dados do catálogo indisponível."})


def products_with_stock(documents) -> list[CatalogProduct]:
    products = list(documents)
    if not products:
        return []
    stocks = call_service(
        "CART_SERVICE_URL", "http://127.0.0.1:8002", "/_interno/estoque/saldos",
        body={"codes": [document["codigo"] for document in products]},
    )
    return [CatalogProduct.from_document(document, stocks.get(str(document["codigo"])))
            for document in products]


@app.post("/_interno/catalogo/produtos", response_model_exclude_none=True)
def product_references(request: Request, data: ProductCodes) -> list[CatalogProduct]:
    documents = request.app.state.database.produtos.find({"codigo": {"$in": data.codes}})
    return [CatalogProduct.from_document(document) for document in documents]


def product_document(request: Request, code: int, *, active_only: bool = True) -> dict:
    query = {"codigo": code, **({"ativo": True} if active_only else {})}
    document = request.app.state.database.produtos.find_one(query)
    if document is None:
        raise HTTPException(404, "Produto não encontrado no catálogo.")
    return document


PUBLIC = "/api/catalogo"
ADMIN = f"{PUBLIC}/admin/produtos"
ADMIN_ONLY = [Depends(require_admin)]
PriceQuery = Annotated[Decimal | None, Query(ge=0, le=Decimal("99999999.99"), decimal_places=2)]
PageQuery = Annotated[int, Query(ge=1, le=100000)]
LimitQuery = Annotated[int, Query(ge=1, le=20)]


@app.get(f"{PUBLIC}/produtos", response_model_exclude_none=True)
def list_products(
    request: Request,
    busca: Annotated[str, Query(max_length=120)] = "",
    categoria: Category | None = None,
    preco_min: PriceQuery = None,
    preco_max: PriceQuery = None,
    especificacao: Annotated[list[str] | None, Query(max_length=50)] = None,
    disponivel: bool = False,
    ordem: Literal["relevance", "low", "high", "name"] = "low",
    pagina: PageQuery = 1,
    limite: LimitQuery = 9,
) -> ProductPage:
    query = {"ativo": True}
    if busca.strip():
        query["nome"] = {"$regex": re.escape(busca.strip()), "$options": "i"}
    if categoria:
        query["categoria"] = categoria
    if preco_min is not None or preco_max is not None:
        query["preco_atual"] = {
            operator: Decimal128(price)
            for operator, price in (("$gte", preco_min), ("$lte", preco_max))
            if price is not None
        }
    if disponivel:
        codes = call_service("CART_SERVICE_URL", "http://127.0.0.1:8002", "/_interno/estoque/disponiveis")
        query["codigo"] = {"$in": codes}
    specs = {}
    for item in especificacao or []:
        key, delimiter, value = item.partition(":")
        if not delimiter or not key or len(key) > 80 or re.search(r"[.$\x00]", key) or not 0 < len(value) <= 160:
            raise HTTPException(422, "Filtro de especificação inválido.")
        if key == "taxa_atualizacao_hz":
            if not re.fullmatch(r"[0-9]{1,5}", value):
                raise HTTPException(422, "Taxa de atualização inválida.")
            value = int(value)
        specs.setdefault(f"especificacoes.{key}", []).append(value)
    for field, values in specs.items():
        query[field] = values[0] if len(values) == 1 else {"$in": values}
    sort = {
        "relevance": [("codigo", 1)],
        "low": [("preco_atual", 1), ("codigo", 1)],
        "high": [("preco_atual", -1), ("codigo", -1)],
        "name": [("nome", 1), ("codigo", 1)],
    }[ordem]
    products = request.app.state.database.produtos
    offset = (pagina - 1) * limite
    documents = products.find(query).sort(sort).skip(offset).limit(limite)
    return ProductPage(
        items=products_with_stock(documents),
        total=products.count_documents(query),
    )


@app.get(f"{PUBLIC}/filtros")
def list_filters(request: Request) -> CatalogFilters:
    counts = {}
    specs = {}
    maximum = Decimal("0")
    documents = request.app.state.database.produtos.find(
        {"ativo": True}, {"categoria": 1, "especificacoes": 1, "preco_atual": 1},
    )
    for document in documents:
        category = document["categoria"]
        counts[category] = counts.get(category, 0) + 1
        maximum = max(maximum, price_decimal(document["preco_atual"]))
        category_specs = specs.setdefault(category, {})
        for key, value in document.get("especificacoes", {}).items():
            category_specs.setdefault(key, set()).add(spec_display(key, value))
    return CatalogFilters(
        counts={CATEGORY_LABELS.get(key, key): count for key, count in counts.items()},
        maxPrice=float(maximum),
        specs={
            CATEGORY_LABELS.get(key, key): {
                spec_label(field): sorted(values) for field, values in fields.items()
            }
            for key, fields in specs.items()
        },
    )


@app.get(f"{PUBLIC}/produtos/{{code}}", response_model_exclude_none=True)
def product_details(request: Request, code: int) -> CatalogProduct:
    return products_with_stock([product_document(request, code)])[0]


def history_page(request: Request, product: dict, start, end, page: int) -> HistoryPage:
    query = {"produto_id": product["_id"]}
    if start is not None or end is not None:
        dates = {
            operator: value.replace(tzinfo=UTC) if value.tzinfo is None else value
            for operator, value in (("$gte", start), ("$lt", end)) if value is not None
        }
        if start and end and dates["$gte"] >= dates["$lt"]:
            raise HTTPException(422, "O início precisa ser anterior ao fim do período.")
        query["registrado_em"] = dates
    collection = request.app.state.database.historico_precos
    events = collection.find(query).sort([("registrado_em", -1), ("_id", -1)]).skip((page - 1) * 50).limit(50)
    return HistoryPage(
        items=[
            PriceEvent(id=str(event["_id"]), date=event["registrado_em"].replace(tzinfo=UTC),
                       price=float(price_decimal(event["preco"])))
            for event in events
        ],
        total=collection.count_documents(query),
    )


@app.get(f"{PUBLIC}/produtos/{{code}}/historico")
def price_history(
    request: Request, code: int, inicio: datetime | None = None,
    fim: datetime | None = None, pagina: PageQuery = 1,
) -> HistoryPage:
    return history_page(request, product_document(request, code), inicio, fim, pagina)


@app.get(ADMIN, dependencies=ADMIN_ONLY, response_model_exclude_none=True)
def list_admin_products(request: Request) -> list[CatalogProduct]:
    documents = request.app.state.database.produtos.find().sort("codigo")
    return products_with_stock(documents)


@app.post(ADMIN, status_code=201, dependencies=ADMIN_ONLY, response_model_exclude_none=True)
def create_admin_product(request: Request, product: ProductInput) -> CatalogProduct:
    document = persistence.create_product(request.app.state.database, product.as_document())
    return CatalogProduct.from_document(document)


@app.put(f"{ADMIN}/{{code}}", dependencies=ADMIN_ONLY, response_model_exclude_none=True)
def edit_admin_product(request: Request, code: int, product: ProductInput) -> CatalogProduct:
    document = persistence.update_product(request.app.state.database, code, product.as_document())
    if document is None:
        raise HTTPException(404, "Produto não encontrado no catálogo.")
    return CatalogProduct.from_document(document)


def change_product_status(request: Request, code: int, active: bool) -> CatalogProduct:
    document = request.app.state.database.produtos.find_one_and_update(
        {"codigo": code}, {"$set": {"ativo": active, "atualizado_em": datetime.now(UTC)}},
        return_document=ReturnDocument.AFTER,
    )
    if document is None:
        raise HTTPException(404, "Produto não encontrado no catálogo.")
    return CatalogProduct.from_document(document)


@app.delete(f"{ADMIN}/{{code}}", dependencies=ADMIN_ONLY, response_model_exclude_none=True)
def remove_admin_product(request: Request, code: int) -> CatalogProduct:
    return change_product_status(request, code, False)


@app.patch(f"{ADMIN}/{{code}}/reativar", dependencies=ADMIN_ONLY, response_model_exclude_none=True)
def reactivate_admin_product(request: Request, code: int) -> CatalogProduct:
    return change_product_status(request, code, True)


@app.get(f"{ADMIN}/{{code}}/historico", dependencies=ADMIN_ONLY)
def admin_price_history(
    request: Request, code: int, inicio: datetime | None = None,
    fim: datetime | None = None, pagina: PageQuery = 1,
) -> HistoryPage:
    return history_page(request, product_document(request, code, active_only=False), inicio, fim, pagina)
