from contextlib import asynccontextmanager
from os import getenv
from urllib.error import HTTPError, URLError
from urllib.request import Request as AuthRequest, urlopen

from bson.decimal128 import Decimal128
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from pydantic import BaseModel
from pymongo.errors import PyMongoError

from backend.database import mongo_client


CATEGORY_LABELS = {
    "placa-mae": "Placas-mãe",
    "monitor": "Monitores",
    "processador": "Processadores",
    "memoria": "Memórias",
    "teclado": "Teclados",
    "mouse": "Mouses",
}
SPEC_LABELS = {
    "soquete": "Soquete",
    "chipset": "Chipset",
    "tipo_memoria": "Tipo de memória",
    "painel": "Tipo de painel",
    "taxa_atualizacao_hz": "Taxa de atualização",
}


class PriceSample(BaseModel):
    date: str
    price: float


class CatalogProduct(BaseModel):
    id: int
    name: str
    brand: str
    category: str
    price: float
    total: int
    baseReserved: int
    active: bool
    specs: dict[str, str]
    description: str
    history: list[PriceSample]
    badge: str | None = None


def to_catalog_product(document: dict) -> CatalogProduct:
    demo = document.get("demonstracao", {})
    price = document["preco_atual"]
    if isinstance(price, Decimal128):
        price = price.to_decimal()
    return CatalogProduct(
        id=document["codigo"],
        name=document["nome"],
        brand=document["marca"],
        category=CATEGORY_LABELS.get(document["categoria"], document["categoria"]),
        price=price,
        total=demo.get("estoque_total", 0),
        baseReserved=demo.get("estoque_reservado", 0),
        active=document["ativo"],
        specs={
            SPEC_LABELS.get(key, key): f"{value} Hz" if key == "taxa_atualizacao_hz" else str(value)
            for key, value in document.get("especificacoes", {}).items()
        },
        description=document["descricao"],
        history=demo.get("historico", []),
        badge=demo.get("destaque"),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    with mongo_client() as client:
        app.state.products = client.catalogo.produtos
        yield


app = FastAPI(title="TechParts — Catálogo", lifespan=lifespan)


def require_admin(request: Request) -> None:
    cookie = request.headers.get("cookie")
    if not cookie:
        raise HTTPException(401, "Faça login para continuar.")
    url = getenv("AUTH_SERVICE_URL", "http://127.0.0.1:8001")
    auth_request = AuthRequest(f"{url.rstrip('/')}/api/auth/admin", headers={"Cookie": cookie})
    try:
        with urlopen(auth_request, timeout=4):
            pass
    except HTTPError as error:
        if error.code in (401, 403):
            raise HTTPException(error.code, "Acesso administrativo restrito.") from error
        raise HTTPException(503, "Serviço de autenticação indisponível.") from error
    except (URLError, TimeoutError) as error:
        raise HTTPException(503, "Serviço de autenticação indisponível.") from error


def load_products(request: Request, response: Response, query: dict) -> list[CatalogProduct]:
    response.headers["Cache-Control"] = "no-store"
    try:
        documents = request.app.state.products.find(query).sort("codigo")
        return [to_catalog_product(document) for document in documents]
    except PyMongoError as error:
        raise HTTPException(503, "Banco de dados do catálogo indisponível.") from error


@app.get("/api/catalogo/produtos", response_model_exclude_none=True)
def list_products(request: Request, response: Response) -> list[CatalogProduct]:
    return load_products(request, response, {"ativo": True})


@app.get("/api/catalogo/admin/produtos", dependencies=[Depends(require_admin)],
         response_model_exclude_none=True)
def list_admin_products(request: Request, response: Response) -> list[CatalogProduct]:
    return load_products(request, response, {})
