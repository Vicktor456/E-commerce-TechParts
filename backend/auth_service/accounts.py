import re
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .passwords import hash_password


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise ValueError("Informe um e-mail válido.")
        return email


class Registration(Credentials):
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=15, max_length=128)

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class Profile(BaseModel):
    id: str
    name: str
    email: str
    role: Literal["client", "admin"]

    @classmethod
    def from_user(cls, document: dict) -> "Profile":
        return cls(
            id=str(document["_id"]), name=document["nome"], email=document["email"],
            role="admin" if document["perfil"] == "administrador" else "client",
        )


def create_account(users, data: Registration, role: Literal["cliente", "administrador"]) -> Profile:
    document = {
        "nome": data.name,
        "email": data.email,
        "senha_hash": hash_password(data.password),
        "perfil": role,
        "criado_em": datetime.now(UTC),
    }
    users.insert_one(document)
    return Profile.from_user(document)
