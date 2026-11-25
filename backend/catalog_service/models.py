from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from bson.decimal128 import Decimal128
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

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
REQUIRED_SPECS = {
    "placa-mae": ("soquete", "chipset", "tipo_memoria"),
    "monitor": ("painel", "taxa_atualizacao_hz"),
}
Category = Literal["placa-mae", "monitor", "processador", "memoria", "teclado", "mouse"]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
SpecKey = Annotated[str, StringConstraints(min_length=1, max_length=80, pattern=r"^[^:.$\x00]+$")]


def spec_label(key: str) -> str:
    return SPEC_LABELS.get(key, key)


def spec_display(key: str, value: str | int) -> str:
    return f"{value} Hz" if key == "taxa_atualizacao_hz" else str(value)


def price_decimal(value) -> Decimal:
    return value.to_decimal() if isinstance(value, Decimal128) else Decimal(str(value))


class ProductInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: ShortText
    brand: ShortText
    category: Category
    description: str = Field(min_length=1, max_length=4000)
    price: Decimal = Field(ge=0, le=Decimal("99999999.99"), decimal_places=2)
    specs: dict[SpecKey, ShortText] = Field(max_length=30)

    @model_validator(mode="after")
    def validate_specs(self):
        missing = set(REQUIRED_SPECS.get(self.category, ())) - self.specs.keys()
        if missing:
            raise ValueError("Preencha as especificações obrigatórias da categoria.")
        refresh = self.specs.get("taxa_atualizacao_hz")
        if refresh is not None and (not refresh.isascii() or not refresh.isdecimal()
                                    or len(refresh) > 5 or int(refresh) <= 0):
            raise ValueError("Informe uma taxa de atualização inteira positiva em Hz.")
        self.description = self.description.strip()
        if not self.description:
            raise ValueError("Informe a descrição do produto.")
        return self

    def as_document(self) -> dict:
        specs: dict[str, str | int] = dict(self.specs)
        if "taxa_atualizacao_hz" in specs:
            specs["taxa_atualizacao_hz"] = int(specs["taxa_atualizacao_hz"])
        return {
            "nome": self.name, "marca": self.brand, "categoria": self.category,
            "descricao": self.description, "preco_atual": Decimal128(self.price),
            "especificacoes": specs,
        }


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
    badge: str | None = None

    @classmethod
    def from_document(cls, document: dict, stock: dict | None = None):
        demo = document.get("demonstracao", {})
        stock = stock or {}
        return cls(
            id=document["codigo"], name=document["nome"], brand=document["marca"],
            category=CATEGORY_LABELS.get(document["categoria"], document["categoria"]),
            price=float(price_decimal(document["preco_atual"])),
            total=stock.get("total", 0), baseReserved=stock.get("baseReserved", 0),
            active=document["ativo"], description=document["descricao"],
            specs={spec_label(key): spec_display(key, value)
                   for key, value in document.get("especificacoes", {}).items()},
            badge=demo.get("destaque"),
        )


class PriceEvent(BaseModel):
    id: str
    date: datetime
    price: float


class ProductPage(BaseModel):
    items: list[CatalogProduct]
    total: int
    nextCursor: str | None = None


class HistoryPage(BaseModel):
    items: list[PriceEvent]
    total: int
    nextCursor: str | None = None


class CatalogFilters(BaseModel):
    counts: dict[str, int]
    maxPrice: float
    specs: dict[str, dict[str, list[str]]]
