import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from secrets import token_urlsafe
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
from uuid import uuid4

from pymongo.errors import PyMongoError

from backend.auth_service.accounts import Registration, create_account
from backend.cart_service.seed import main as seed_stock
from backend.catalog_service.seed import main as seed_catalog
from backend.database import mongo_client, service_database

from .carga import measure, request, seed_load

SERVICES = {"catalog": 8270, "auth": 8271, "cart": 8272}
BASE = "http://127.0.0.1:5273"
PREVIEW = """
import { preview } from 'vite';
const proxy = {
  '/api/catalogo': process.env.CATALOG_SERVICE_URL,
  '/api/auth': process.env.AUTH_SERVICE_URL,
  '/api/carrinho': process.env.CART_SERVICE_URL,
  '/api/estoque': process.env.CART_SERVICE_URL,
};
await preview({preview: {host: '127.0.0.1', port: 5273, strictPort: true, proxy}});
"""
NEWMAN = """
const path = require('node:path');
const fs = require('node:fs');
const settings = JSON.parse(process.env.POC_SETTINGS);
const newman = require(path.join(process.env.POC_TOOLS, 'node_modules/newman'));
newman.run({
  collection: JSON.parse(fs.readFileSync('validacao/TechParts.postman_collection.json', 'utf8')),
  envVar: Object.entries(settings).map(([key, value]) => ({key, value})),
  reporters: [],
  timeoutRequest: 10000,
}, (error, summary) => {
  if (error) { console.error(error.message); process.exitCode = 1; return; }
  const { requests, assertions, testScripts } = summary.run.stats;
  console.log(JSON.stringify({postman: {requests, assertions, testScripts}}, null, 2));
  if (summary.run.failures.length) {
    for (const failure of summary.run.failures) {
      console.error(failure.source?.name || failure.at, '-', failure.error.message);
    }
    process.exitCode = 1;
  }
});
"""


def start_services(environment):
    return [
        subprocess.Popen([
            sys.executable, "-m", "uvicorn", f"backend.{name}_service.main:app",
            "--port", str(port), "--no-access-log",
        ], env=environment)
        for name, port in SERVICES.items()
    ]


def stop_processes(processes):
    for process in processes:
        if process.poll() is None:
            process.terminate()
    for process in processes:
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def wait_http(url, expected, processes):
    for _ in range(80):
        if any(process.poll() is not None for process in processes):
            raise RuntimeError("Um processo de validação terminou antes da verificação.")
        try:
            with urlopen(url, timeout=5) as response:
                if response.status == expected:
                    return
        except HTTPError as error:
            if error.code == expected:
                return
        except (URLError, TimeoutError):
            pass
        time.sleep(0.25)
    raise RuntimeError(f"Serviço indisponível: {url}")


def restart_mongo(docker):
    subprocess.run([docker, "compose", "restart", "mongo"], check=True, timeout=60)
    for _ in range(30):
        try:
            with mongo_client() as mongo:
                if mongo.admin.command("hello")["isWritablePrimary"]:
                    return
        except (OSError, PyMongoError):
            pass
        time.sleep(0.4)
    raise RuntimeError("MongoDB não voltou ao estado primário.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--restart-mongo", action="store_true")
    parser.add_argument("--docker", default=shutil.which("docker") or "docker")
    args = parser.parse_args()
    if not os.getenv("POC_TOOLS"):
        parser.error("Defina POC_TOOLS com o diretório onde Newman e jsdom foram instalados.")
    prefix = f"poc_{uuid4().hex[:10]}_"
    os.environ["MONGODB_DB_PREFIX"] = prefix
    environment = {
        **os.environ,
        **{f"{name.upper()}_SERVICE_URL": f"http://127.0.0.1:{port}" for name, port in SERVICES.items()},
        "AUTH_COOKIE_SECURE": "0",
    }
    settings = {
        "baseUrl": BASE, "adminEmail": "admin@example.com", "adminPassword": token_urlsafe(24),
        "customerEmail": "cliente-postman@example.com", "customerPassword": token_urlsafe(24),
        "uiEmail": "cliente-interface@example.com",
    }
    environment["POC_SETTINGS"] = json.dumps(settings)
    processes, preview = [], None
    try:
        seed_catalog()
        seed_stock()
        with mongo_client() as mongo:
            catalog, purchases, auth = (service_database(mongo, service)
                                        for service in ("catalogo", "compras", "auth"))
            create_account(auth.usuarios, Registration(
                name="Admin PoC", email=settings["adminEmail"], password=settings["adminPassword"],
            ), "administrador")
            users = seed_load(catalog, purchases, auth)
            assert catalog.produtos.count_documents({"ativo": True}) == 1000

        processes = start_services(environment)
        preview = subprocess.Popen(["node", "--input-type=module", "-e", PREVIEW], env=environment)
        wait_http(BASE + "/api/catalogo/produtos", 200, [preview, *processes])
        workloads = measure(BASE, users)
        print(json.dumps({"produtos": 1000, "usuarios": len(users), "carga": workloads}, ensure_ascii=False), flush=True)
        assert all(group["erros"] == 0 and group["fora_da_meta"] == 0 for group in workloads.values())

        cookie = "techparts_session=" + users[0][1]
        before = request(BASE, "/api/carrinho", cookie=cookie)
        assert before["items"][0]["id"] == 1000 and before["items"][0]["quantity"] == 1
        stop_processes(processes)
        processes = []
        if args.restart_mongo:
            restart_mongo(args.docker)
        processes = start_services(environment)
        wait_http(BASE + "/api/catalogo/produtos", 200, [preview, *processes])
        assert request(BASE, "/api/carrinho", cookie=cookie) == before
        with mongo_client() as mongo:
            assert service_database(mongo, "catalogo").produtos.count_documents({"ativo": True}) == 1000
            stock = service_database(mongo, "compras").estoques.find_one({"produto_id": 1000})
            assert stock["quantidade_reservada"] == 100
        print("Persistência verificada após reiniciar os três serviços"
              + (" e o contêiner MongoDB." if args.restart_mongo else "."), flush=True)

        subprocess.run(["node", "-e", NEWMAN], env=environment, check=True, timeout=90)
        subprocess.run(["node", "validacao/telas.cjs"], env=environment, check=True, timeout=90)
    finally:
        stop_processes([*processes, *([preview] if preview else [])])
        with mongo_client() as mongo:
            for service in ("catalogo", "compras", "auth"):
                mongo.drop_database(prefix + service)


if __name__ == "__main__":
    main()
