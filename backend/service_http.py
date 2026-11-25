import json
from os import getenv
from urllib.error import HTTPError, URLError
from urllib.request import Request as HttpRequest, urlopen

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field


class ProductCodes(BaseModel):
    codes: list[int] = Field(max_length=5000)


def call_service(variable, default_url, path, *, body=None, cookie=None):
    url = getenv(variable, default_url).rstrip("/")
    headers = {}
    if cookie:
        headers["Cookie"] = cookie
    if body is not None:
        headers["Content-Type"] = "application/json"
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urlopen(HttpRequest(url + path, data=data, headers=headers), timeout=4) as response:
            return None if response.status == 204 else json.load(response)
    except HTTPError as error:
        if error.code in (401, 403):
            raise HTTPException(error.code, "Acesso restrito.") from error
        raise HTTPException(503, "Serviço dependente indisponível.") from error
    except (URLError, TimeoutError, ValueError) as error:
        raise HTTPException(503, "Serviço dependente indisponível.") from error


def require_admin(request: Request) -> None:
    authenticate(request, "/api/auth/admin")


def authenticate(request: Request, path="/api/auth/me"):
    cookie = request.headers.get("cookie")
    if not cookie:
        raise HTTPException(401, "Faça login para continuar.")
    return call_service("AUTH_SERVICE_URL", "http://127.0.0.1:8001", path, cookie=cookie)
