import argparse
import json
import os
import subprocess
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from secrets import token_urlsafe
from tempfile import TemporaryDirectory
from time import perf_counter
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from bson import BSON

from backend.cart_service.seed import main as seed_stock
from backend.catalog_service.seed import main as seed_catalog
from backend.database import mongo_client

from .disponibilidade import probe
from .executar import SERVICES, start_services, stop_processes, wait_http

NAMES = ("auth", "catalogo", "compras")
URLS = {name: f"http://127.0.0.1:{port}" for name, port in SERVICES.items()}
MONGO_URI = "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true"


def call(base, path, expected, secrets, *, body=None, cookie=None, method=None):
    headers = {"Cookie": cookie} if cookie else {}
    if body is not None:
        headers["Content-Type"] = "application/json"
    data = json.dumps(body).encode() if body is not None else None
    try:
        response = urlopen(Request(base + path, data=data, headers=headers, method=method), timeout=10)
    except HTTPError as error:
        response = error
    with response:
        raw = response.read()
        serialized = response.headers.as_bytes() + raw
        assert all(secret.encode() not in serialized for secret in secrets), f"Senha na resposta de {path}."
        assert b'"senha_hash"' not in raw and b'"password"' not in raw and b'"senha"' not in raw
        assert response.status == expected, f"{path}: HTTP {response.status}; esperado {expected}."
        return json.loads(raw) if raw else None, response.headers


def audit_auth(password, wrong, short):
    secrets = [password, wrong, short]
    auth = URLS["auth"]
    credentials = {"email": "poc-operacional@example.com", "password": password}
    registration = {"name": "Cliente da PoC", **credentials}
    invalid = {"password": wrong, "email": "inválido"}
    call(auth, "/api/auth/cadastro", 201, secrets, body=registration)
    call(auth, "/api/auth/cadastro", 409, secrets, body=registration)
    call(auth, "/api/auth/cadastro", 422, secrets, body={**registration, "password": short})
    call(auth, "/api/auth/login", 422, secrets, body=invalid)
    call(auth, "/api/auth/login", 401, secrets, body={**credentials, "password": wrong})
    user, headers = call(auth, "/api/auth/login", 200, secrets, body=credentials)
    cookie = headers["Set-Cookie"].partition(";")[0]
    call(auth, "/api/auth/me", 200, secrets, cookie=cookie)
    call(auth, "/api/auth/admin", 403, secrets, cookie=cookie)
    call(URLS["catalog"], "/api/catalogo/admin/produtos", 403, secrets, cookie=cookie)
    call(URLS["cart"], "/api/carrinho", 401, secrets)
    return credentials, user, cookie


def fingerprint(database):
    collections = {}
    for name in sorted(database.list_collection_names()):
        collection = database[name]
        digest = sha256()
        total = 0
        for doc in collection.find().sort("_id", 1):
            digest.update(BSON.encode(doc))
            total += 1
        indexes = {
            key: {option: settings[option] for option in (
                "key", "unique", "expireAfterSeconds", "partialFilterExpression", "weights", "default_language",
            ) if option in settings}
            for key, settings in collection.index_information().items()
        }
        collections[name] = {"documentos": total, "hash": digest.hexdigest(), "indices": indexes}
    return collections


def launch(environment, prefix, logs):
    processes = start_services({**environment, "MONGODB_DB_PREFIX": prefix}, log=logs)
    try:
        wait_http(URLS["catalog"] + "/api/catalogo/produtos", 200, processes)
        wait_http(URLS["auth"] + "/api/auth/me", 401, processes)
    except BaseException:
        stop_processes(processes)
        raise
    return processes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tools", type=Path, required=True, help="Pasta com mongodump e mongorestore.")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if os.getenv("MONGODB_URI", MONGO_URI) != MONGO_URI:
        parser.error("O ensaio de recuperação usa o MongoDB local do TechParts. Remova MONGODB_URI personalizada.")
    suffix = ".exe" if os.name == "nt" else ""
    dump, restore = (str((args.tools / (tool + suffix)).resolve()) for tool in ("mongodump", "mongorestore"))
    for executable in (dump, restore):
        if not Path(executable).is_file():
            parser.error(f"Executável não encontrado: {Path(executable).name}")
    prefix = f"poc_ops_{uuid4().hex[:10]}_"
    restored = prefix + "rest_"
    os.environ["MONGODB_DB_PREFIX"] = prefix
    environment = {
        **os.environ, "AUTH_SERVICE_URL": URLS["auth"], "CATALOG_SERVICE_URL": URLS["catalog"],
        "CART_SERVICE_URL": URLS["cart"], "AUTH_COOKIE_SECURE": "0",
    }
    password, wrong, short = token_urlsafe(24), token_urlsafe(24), token_urlsafe(9)
    secrets = [password, wrong, short]
    processes = []
    with TemporaryDirectory(prefix="techparts-restore-") as folder, mongo_client() as mongo:
        directory = Path(folder)
        log_path = directory / "services.log"
        with log_path.open("w+b") as logs:
            try:
                seed_catalog()
                seed_stock()
                processes = launch(environment, prefix, logs)
                credentials, user, cookie = audit_auth(*secrets)
                account = mongo[prefix + "auth"].usuarios.find_one({"email": credentials["email"]})
                assert account["senha_hash"] != password and "senha" not in account and "password" not in account
                availability, _ = probe({"catalogo": URLS["catalog"], "auth": URLS["auth"],
                                          "carrinho": URLS["cart"]}, credentials, None)
                assert all(availability.values())
                call(URLS["cart"], "/api/carrinho/itens/1", 204, secrets, cookie=cookie,
                     method="PUT", body={"cartId": None, "quantity": 1})
                original_cart, _ = call(URLS["cart"], "/api/carrinho", 200, secrets, cookie=cookie)
                assert original_cart["items"][0]["quantity"] == 1
                stop_processes(processes)
                processes = []
                cutoff = datetime.now(UTC)
                before = {name: fingerprint(mongo[prefix + name]) for name in NAMES}
                for name in NAMES:
                    subprocess.run([dump, "--uri", MONGO_URI, "--db", prefix + name,
                                    f"--archive={directory / (name + '.gz')}", "--gzip", "--quiet"],
                                   check=True, timeout=90)
                marker = mongo[prefix + "catalogo"].contadores.insert_one({"_id": "apos_backup"}).inserted_id
                incident = datetime.now(UTC)
                start = perf_counter()
                for name in NAMES:
                    subprocess.run([restore, "--uri", MONGO_URI, f"--archive={directory / (name + '.gz')}",
                                    "--gzip", "--nsFrom", f"{prefix}{name}.*", "--nsTo", f"{restored}{name}.*",
                                    "--stopOnError", "--quiet"], check=True, timeout=90)
                assert {name: fingerprint(mongo[restored + name]) for name in NAMES} == before
                assert mongo[restored + "catalogo"].contadores.find_one({"_id": marker}) is None
                processes = launch(environment, restored, logs)
                restored_profile, _ = call(URLS["auth"], "/api/auth/me", 200, secrets, cookie=cookie)
                restored_cart, _ = call(URLS["cart"], "/api/carrinho", 200, secrets, cookie=cookie)
                assert restored_profile == user and restored_cart == original_cart
                product, _ = call(URLS["catalog"], "/api/catalogo/produtos/1", 200, secrets)
                assert product["baseReserved"] == 1
                elapsed = perf_counter() - start
                call(URLS["auth"], "/api/auth/logout", 204, secrets, cookie=cookie, body={})
                call(URLS["auth"], "/api/auth/me", 401, secrets, cookie=cookie)
                stop_processes(processes)
                processes = []
                logs.seek(0)
                content = logs.read()
                assert b"/api/auth/login" in content and b"/api/auth/cadastro" in content
                assert all(secret.encode() not in content for secret in secrets), "Senha nos logs capturados."
                assert account["senha_hash"].encode() not in content
                rpo = (incident - cutoff).total_seconds()
                assert rpo <= 24 * 3600 and elapsed <= 60 * 60
                results = {
                    "rnf08_amostra_sintetica": availability,
                    "rnf09": {"respostas_auditadas": 17, "senhas_em_respostas": 0, "senhas_nos_logs": 0,
                              "logs_bytes": len(content), "hash_no_banco": True, "permissoes_testadas": True},
                    "rnf10": {"rpo_ensaio_s": round(rpo, 3), "rto_ensaio_s": round(elapsed, 3),
                              "ponto_backup_utc": cutoff.isoformat(), "incidente_simulado_utc": incident.isoformat(),
                              "arquivos": {name: (directory / (name + ".gz")).stat().st_size for name in NAMES},
                              "documentos_verificados": {name: sum(c["documentos"] for c in values.values())
                                                          for name, values in before.items()},
                              "indices_verificados": True, "apis_restauradas": True,
                              "gravacao_posterior_ausente": True},
                }
                args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                print(json.dumps(results, ensure_ascii=False, indent=2))
            finally:
                stop_processes(processes)
                for name in NAMES:
                    for owner in (prefix, restored):
                        mongo.drop_database(owner + name)


if __name__ == "__main__":
    main()
