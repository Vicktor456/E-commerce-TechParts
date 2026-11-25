import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pymongo.errors import DuplicateKeyError, PyMongoError

from backend.database import mongo_client, service_database

from .accounts import Credentials, Profile, Registration, create_account
from .passwords import verify_password

SESSION_COOKIE = "techparts_session"
SESSION_SECONDS = 8 * 60 * 60
COOKIE_OPTIONS = {
    "httponly": True,
    "samesite": "strict",
    "secure": os.getenv("AUTH_COOKIE_SECURE") == "1",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    with mongo_client() as client:
        database = service_database(client, "auth")
        database.usuarios.create_index("email", unique=True)
        database.sessoes.create_index("expira_em", expireAfterSeconds=0)
        app.state.database = database
        yield


app = FastAPI(title="TechParts — Autenticação", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, _error: RequestValidationError):
    # The default validation response may include the supplied password.
    return JSONResponse(status_code=422, content={"detail": "Confira os dados informados."})


@app.exception_handler(PyMongoError)
async def database_unavailable(_request: Request, _error: PyMongoError):
    return JSONResponse(status_code=503, content={"detail": "Autenticação indisponível."})


def session_key(token: str) -> str:
    return sha256(token.encode()).hexdigest()


def revoke_session(request: Request) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        request.app.state.database.sessoes.delete_one({"_id": session_key(token)})


def current_user(request: Request) -> Profile:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        database = request.app.state.database
        session = database.sessoes.find_one({
            "_id": session_key(token), "expira_em": {"$gt": datetime.now(UTC)},
        })
        if session:
            user = database.usuarios.find_one({"_id": session["usuario_id"]})
            if user:
                return Profile.from_user(user)
    raise HTTPException(401, "Faça login para continuar.")


CurrentUser = Annotated[Profile, Depends(current_user)]


def require_admin(user: CurrentUser) -> Profile:
    if user.role != "admin":
        raise HTTPException(403, "Acesso administrativo restrito.")
    return user


@app.post("/api/auth/cadastro", status_code=201)
def register(data: Registration, request: Request) -> Profile:
    try:
        return create_account(request.app.state.database.usuarios, data, "cliente")
    except DuplicateKeyError as error:
        raise HTTPException(409, "Este e-mail já está cadastrado.") from error


@app.post("/api/auth/login")
def login(data: Credentials, request: Request, response: Response) -> Profile:
    database = request.app.state.database
    user = database.usuarios.find_one({"email": data.email})
    if not verify_password(data.password, user["senha_hash"] if user else None):
        raise HTTPException(401, "E-mail ou senha incorretos.")

    revoke_session(request)
    token = token_urlsafe(32)
    database.sessoes.insert_one({
        "_id": session_key(token),
        "usuario_id": user["_id"],
        "expira_em": datetime.now(UTC) + timedelta(seconds=SESSION_SECONDS),
    })
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_SECONDS, **COOKIE_OPTIONS)
    response.headers["Cache-Control"] = "no-store"
    return Profile.from_user(user)


@app.get("/api/auth/me")
def me(user: CurrentUser, response: Response) -> Profile:
    response.headers["Cache-Control"] = "no-store"
    return user


@app.get("/api/auth/admin", status_code=204, dependencies=[Depends(require_admin)])
def admin() -> Response:
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request) -> Response:
    if request.headers.get("content-type", "").split(";", 1)[0] != "application/json":
        raise HTTPException(415, "Use Content-Type: application/json.")
    revoke_session(request)
    response = Response(status_code=204, headers={"Cache-Control": "no-store"})
    response.delete_cookie(SESSION_COOKIE, **COOKIE_OPTIONS)
    return response
