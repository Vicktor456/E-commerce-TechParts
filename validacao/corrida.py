import json
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from secrets import token_urlsafe
from threading import Event, Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from backend.auth_service.accounts import Registration, create_account
from backend.database import mongo_client, service_database

from .carga import request
from .executar import SERVICES, start_services, stop_processes, wait_http

URLS = {name: f"http://127.0.0.1:{port}" for name, port in SERVICES.items()}
PRODUCT_REFS = "/_interno/catalogo/produtos"


@contextmanager
def catalog_gate(catalog_read, allow_reply, target):
    class CatalogRelay(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != PRODUCT_REFS:
                self.send_error(404)
                return
            body = self.rfile.read(int(self.headers["Content-Length"]))
            upstream = Request(URLS["catalog"] + self.path, body, {"Content-Type": "application/json"})
            with urlopen(upstream, timeout=2) as response:
                payload = response.read()
            if target and not catalog_read.is_set() and json.loads(body)["codes"] == target:
                products = json.loads(payload)
                if products and products[0]["active"]:
                    catalog_read.set()
                    if not allow_reply.wait(3):
                        self.send_error(504)
                        return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_args):
            pass

    with ThreadingHTTPServer(("127.0.0.1", 0), CatalogRelay) as relay:
        thread = Thread(target=relay.serve_forever)
        thread.start()
        try:
            yield f"http://127.0.0.1:{relay.server_port}"
        finally:
            allow_reply.set()
            relay.shutdown()
            thread.join()


def login(email, password):
    body = json.dumps({"email": email, "password": password}).encode()
    login_request = Request(URLS["auth"] + "/api/auth/login", body, {"Content-Type": "application/json"})
    with urlopen(login_request, timeout=10) as response:
        return response.headers["Set-Cookie"].split(";", 1)[0]


def expect_error(base, path, status, **options):
    try:
        request(base, path, **options)
    except HTTPError as error:
        with error:
            assert error.code == status, (path, error.code)
            return json.load(error)
    raise AssertionError(f"{path} deveria ter retornado HTTP {status}.")


def verify_race(database, admin, customer, another_customer, target, catalog_read, allow_reply):
    catalog, cart = URLS["catalog"], URLS["cart"]
    created = request(catalog, "/api/catalogo/admin/produtos", 201, method="POST", cookie=admin, body={
        "name": "Mouse para prova de concorrência", "category": "mouse", "brand": "TechParts",
        "description": "Produto temporário para testar remoção concorrente.", "price": "100.00", "specs": {},
    })
    code = created["id"]
    request(cart, f"/api/estoque/{code}", method="PUT", cookie=admin, body={"total": 3})
    item = f"/api/carrinho/itens/{code}"

    def reserved():
        stock = database.estoques.find_one({"produto_id": code})
        assert stock["quantidade_total"] == 3
        assert 0 <= stock["quantidade_reservada"] <= stock["quantidade_total"]
        return stock["quantidade_reservada"]

    target.append(code)
    with ThreadPoolExecutor(max_workers=1) as executor:
        reservation = executor.submit(
            request, cart, item, 204, method="PUT", cookie=customer, body={"cartId": None, "quantity": 1},
        )
        try:
            assert catalog_read.wait(3), "O Cart Service não chegou à consulta de produto ativo."
            assert reserved() == 0
            removed = request(
                catalog, f"/api/catalogo/admin/produtos/{code}", method="DELETE", cookie=admin,
            )
            assert removed["active"] is False
            expect_error(catalog, f"/api/catalogo/produtos/{code}", 404)
            assert reserved() == 0
        finally:
            allow_reply.set()
        reservation.result(timeout=5)

    reconciled = request(cart, "/api/carrinho", cookie=customer)
    assert len(reconciled["items"]) == 1
    position = reconciled["items"][0]
    assert position["id"] == code and position["quantity"] == 1
    assert position["product"]["active"] is False
    assert reserved() == 1

    denied = expect_error(cart, item, 409, method="PUT", cookie=customer,
                          body={"cartId": reconciled["id"], "quantity": 2})
    assert "removido" in denied["detail"]
    denied = expect_error(cart, item, 409, method="PUT", cookie=another_customer,
                          body={"cartId": None, "quantity": 1})
    assert "removido" in denied["detail"]
    assert request(cart, "/api/carrinho", cookie=another_customer)["items"] == []
    assert reserved() == 1

    for _ in range(2):
        request(cart, item, 204, method="PUT", cookie=customer,
                body={"cartId": reconciled["id"], "quantity": 0})
        assert reserved() == 0
    assert request(cart, "/api/carrinho", cookie=customer)["items"] == []
    history = request(catalog, f"/api/catalogo/admin/produtos/{code}/historico", cookie=admin)
    assert history["total"] == 1 and history["items"][0]["price"] == 100
    print("Corrida validada: produto inativo detectado no carrinho, novas reservas bloqueadas "
          "com HTTP 409 e saldo reservado 0 → 1 → 1 → 0 → 0. Histórico preservado.", flush=True)


def main():
    prefix = f"poc_corrida_{uuid4().hex[:10]}_"
    os.environ["MONGODB_DB_PREFIX"] = prefix
    catalog_read, allow_reply, target = Event(), Event(), []
    processes = []
    with mongo_client() as mongo, catalog_gate(catalog_read, allow_reply, target) as relay:
        try:
            environment = {
                **os.environ, "CATALOG_SERVICE_URL": relay, "CART_SERVICE_URL": URLS["cart"],
                "AUTH_SERVICE_URL": URLS["auth"], "AUTH_COOKIE_SECURE": "0",
            }
            processes = start_services(environment)
            wait_http(URLS["catalog"] + "/api/catalogo/filtros", 200, processes)
            wait_http(URLS["auth"] + "/api/auth/me", 401, processes)
            wait_http(URLS["cart"] + "/_interno/estoque/disponiveis", 200, processes)
            accounts = service_database(mongo, "auth").usuarios
            sessions = []
            for name, profile in (("admin", "administrador"), ("cliente", "cliente"), ("outro", "cliente")):
                email, password = f"{name}@example.com", token_urlsafe(24)
                create_account(accounts, Registration(name=name, email=email, password=password), profile)
                sessions.append(login(email, password))
            verify_race(service_database(mongo, "compras"), *sessions, target, catalog_read, allow_reply)
        finally:
            allow_reply.set()
            stop_processes(processes)
            for service in ("auth", "catalogo", "compras"):
                mongo.drop_database(prefix + service)


if __name__ == "__main__":
    main()
