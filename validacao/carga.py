import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from threading import Barrier
from time import perf_counter
from urllib.request import Request, urlopen

from bson import ObjectId
from bson.decimal128 import Decimal128

from backend.auth_service.main import session_key

LIMITS = {"catalogo": 2, "filtro": 3, "carrinho": 2}


def seed_load(catalog, purchases, auth):
    now = datetime.now(UTC)
    catalog.produtos.insert_many([
        {
            "codigo": code,
            "nome": f"Placa-mãe de carga {code}",
            "marca": "TechParts PoC",
            "categoria": "placa-mae",
            "descricao": "Produto usado na validação isolada.",
            "ativo": True,
            "preco_atual": Decimal128(str(500 + code % 400)),
            "especificacoes": {"tipo_memoria": "DDR5", "soquete": "AM5", "chipset": "B650"},
            "criado_em": now,
            "atualizado_em": now,
            "historico_inicializado": True,
        }
        for code in range(1000, 1988)
    ])
    users = []
    for index in range(100):
        user_id = ObjectId()
        token = token_urlsafe(24)
        users.append((user_id, token))
        auth.usuarios.insert_one({
            "_id": user_id, "nome": f"Cliente de carga {index}",
            "email": f"carga-{index}@example.com", "perfil": "cliente",
        })
        auth.sessoes.insert_one({
            "_id": session_key(token), "usuario_id": user_id, "expira_em": now + timedelta(hours=1),
        })
    purchases.estoques.insert_one({"produto_id": 1000, "quantidade_total": 100, "quantidade_reservada": 0})
    return users


def request(base, path, expected=200, *, body=None, cookie=None, method=None, server_timing=False):
    headers = {"Content-Type": "application/json"} if body is not None else {}
    if cookie:
        headers["Cookie"] = cookie
    data = json.dumps(body).encode() if body is not None else None
    with urlopen(Request(base + path, data=data, headers=headers, method=method), timeout=20) as response:
        if response.status != expected:
            raise RuntimeError(f"{path}: esperado {expected}, obtido {response.status}")
        content = response.read()
        if server_timing:
            duration = response.headers.get("Server-Timing", "")
            if not duration.startswith("cart;dur="):
                raise RuntimeError("O servidor não informou a duração da operação do carrinho.")
            return float(duration.removeprefix("cart;dur=")) / 1000
        return json.loads(content) if content else None


def measure(base, users, *, server_timing=False):
    workload = (
        ("catalogo", "/api/catalogo/produtos?categoria=placa-mae&preco_min=500&preco_max=900"),
        ("filtro", "/api/catalogo/produtos?categoria=placa-mae&especificacao=soquete:AM5&especificacao=tipo_memoria:DDR5"),
        ("carrinho", "/api/carrinho/itens/1000"),
    )
    barrier = Barrier(len(users))

    def run_user(index, user):
        cookie = "techparts_session=" + user[1]
        measurements = []
        for turn in range(len(workload)):
            key, path = workload[(index + turn) % len(workload)]
            barrier.wait(timeout=30)
            start = perf_counter()
            server_duration = None
            try:
                if key == "carrinho":
                    server_duration = request(
                        base, path, 204, body={"cartId": None, "quantity": 1},
                        cookie=cookie, method="PUT", server_timing=server_timing,
                    )
                else:
                    assert request(base, path)["items"]
            except Exception as error:
                measurements.append((key, perf_counter() - start, str(error)))
                if key == "carrinho" and server_timing:
                    measurements.append(("carrinho_servidor", 0, str(error)))
            else:
                measurements.append((key, perf_counter() - start, None))
                if server_duration is not None:
                    measurements.append(("carrinho_servidor", server_duration, None))
        return measurements

    with ThreadPoolExecutor(max_workers=len(users)) as executor:
        results = list(executor.map(run_user, range(len(users)), users))

    limits = {**LIMITS, "carrinho_servidor": LIMITS["carrinho"]} if server_timing else LIMITS
    summary = {}
    for category, limit in limits.items():
        group = [(duration, error) for batch in results for key, duration, error in batch if key == category]
        summary[category] = summarize(group, limit)
    return summary


def summarize(group, limit):
    successful = sorted(duration for duration, error in group if error is None)
    return {
        "total": len(group), "erros": len(group) - len(successful), "limite_s": limit,
        "p95_s": round(successful[math.ceil(0.95 * len(successful)) - 1], 3) if successful else None,
        "max_s": round(successful[-1], 3) if successful else None,
        "fora_da_meta": sum(duration > limit for duration in successful),
        "primeiro_erro": next((error for _, error in group if error), None),
    }
