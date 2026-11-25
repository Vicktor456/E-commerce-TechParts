from contextlib import asynccontextmanager
from typing import Annotated

from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import PyMongoError

from backend.database import mongo_client
from backend.service_http import ProductCodes, authenticate, call_service, require_admin

from . import persistence


@asynccontextmanager
async def lifespan(app: FastAPI):
    with mongo_client() as client:
        app.state.database = client.compras
        persistence.initialize_cart(app.state.database)
        yield


app = FastAPI(title="TechParts — Carrinho e Estoque", lifespan=lifespan)


@app.middleware("http")
async def no_cache(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(PyMongoError)
async def database_unavailable(_request: Request, _error: PyMongoError):
    return JSONResponse(status_code=503, content={"detail": "Banco de compras indisponível."})


class Quantity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quantity: int = Field(ge=0, le=1_000_000, strict=True)


class StockTotal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    total: int = Field(ge=0, le=1_000_000, strict=True)


def client_id(request: Request) -> ObjectId:
    user = authenticate(request)
    if user["role"] != "client":
        raise HTTPException(403, "O carrinho é exclusivo para clientes.")
    return ObjectId(user["id"])


Customer = Annotated[ObjectId, Depends(client_id)]


def product_refs(codes):
    if not codes:
        return {}
    products = call_service(
        "CATALOG_SERVICE_URL", "http://127.0.0.1:8000", "/_interno/catalogo/produtos",
        body={"codes": codes},
    )
    return {product["id"]: product for product in products}


@app.post("/_interno/estoque/saldos")
def stock_batch(request: Request, data: ProductCodes):
    stocks = request.app.state.database.estoques.find({"produto_id": {"$in": data.codes}})
    return {stock["produto_id"]: persistence.stock_values(stock) for stock in stocks}


@app.get("/_interno/estoque/disponiveis")
def stocked_products(request: Request):
    stocks = request.app.state.database.estoques.find(
        {"$expr": persistence.availability_query(1)}, {"produto_id": 1},
    )
    return [stock["produto_id"] for stock in stocks]


@app.put("/api/estoque/{code}", dependencies=[Depends(require_admin)])
def update_stock(request: Request, code: int, data: StockTotal):
    if code not in product_refs([code]):
        raise HTTPException(404, "Produto não encontrado.")
    return persistence.set_stock(request.app.state.database, code, data.total)


@app.get("/api/carrinho")
def get_cart(request: Request, user_id: Customer):
    cart = request.app.state.database.carrinhos.find_one(persistence.active_cart(user_id))
    items = cart["itens"] if cart else []
    refs = product_refs([item["produto_id"] for item in items])
    return {"items": [
        {"id": item["produto_id"], "quantity": item["quantidade"],
         "product": refs.get(item["produto_id"])}
        for item in items
    ]}


@app.put("/api/carrinho/itens/{code}", status_code=204)
def update_cart(request: Request, user_id: Customer, code: int, data: Quantity):
    product = product_refs([code]).get(code) if data.quantity else None
    active = bool(product and product["active"])
    persistence.set_cart_quantity(request.app.state.database, user_id, code, data.quantity, active)
    return Response(status_code=204)
