from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier, Event
from time import sleep

from bson import ObjectId

from .carga import request, summarize

FILTER_PATH = (
    "/api/catalogo/produtos?categoria=placa-mae&especificacao=soquete:AM5"
    "&especificacao=tipo_memoria:DDR5"
)
EXPIRATION_TARGET = 60
EXPIRATION_PRODUCT = 1001
USER_PAUSE_SECONDS = 2


def explain_technical_filter(database):
    query = {
        "ativo": True,
        "categoria": "placa-mae",
        "especificacoes.soquete": "AM5",
        "especificacoes.tipo_memoria": "DDR5",
    }
    plan = database.command(
        "explain",
        {
            "find": "produtos", "filter": query, "sort": {"preco_atual": 1, "codigo": 1},
            "limit": 9,
        },
        verbosity="executionStats",
    )
    return {
        **{key: plan[key] for key in ("queryPlanner", "executionStats", "command")},
        "mongodb_version": plan["serverInfo"]["version"],
    }


def expiration_under_load(base, purchases, users):
    count = len(users)
    now = datetime.now(UTC)
    expires_at = now.replace(microsecond=now.microsecond // 1000 * 1000) + timedelta(seconds=4)
    deadline = expires_at + timedelta(seconds=EXPIRATION_TARGET)
    purchases.estoques.insert_one({
        "produto_id": EXPIRATION_PRODUCT, "quantidade_total": count, "quantidade_reservada": count,
    })
    # Use distinct cart owners so traffic cannot trigger lazy expiration of these carts.
    ids = purchases.carrinhos.insert_many([
        {
            "usuario_id": ObjectId(), "status": "ativo", "expira_em": expires_at,
            "ultima_atividade_em": expires_at - timedelta(minutes=30),
            "itens": [{"produto_id": EXPIRATION_PRODUCT, "quantidade": 1}],
        }
        for _ in users
    ]).inserted_ids

    stop = Event()
    barrier = Barrier(count + 1, timeout=15)
    paths = ("/api/catalogo/produtos", FILTER_PATH, "/api/carrinho")

    def run_user(index, user):
        operations, errors = 0, 0
        cookie = "techparts_session=" + user[1]
        barrier.wait()
        while not stop.is_set():
            try:
                request(base, paths[(index + operations) % len(paths)], cookie=cookie)
            except (OSError, ValueError, RuntimeError):
                errors += 1
            operations += 1
            stop.wait(USER_PAUSE_SECONDS)
        return operations, errors

    pending = set(ids)
    observations = []
    with ThreadPoolExecutor(max_workers=count) as pool:
        workers = [pool.submit(run_user, index, user) for index, user in enumerate(users)]
        try:
            barrier.wait()
            while pending and datetime.now(UTC) <= deadline:
                expired = list(purchases.carrinhos.find(
                    {"_id": {"$in": list(pending)}, "status": "expirado"}, {"_id": 1},
                ))
                observed_at = datetime.now(UTC)
                for cart in expired:
                    pending.remove(cart["_id"])
                    observations.append((max(0, (observed_at - expires_at).total_seconds()), None))
                if pending:
                    sleep(0.2)
        finally:
            stop.set()
        traffic = [worker.result() for worker in workers]

    stock = purchases.estoques.find_one({"produto_id": EXPIRATION_PRODUCT})
    other_stock = purchases.estoques.find_one({"produto_id": 1000})
    summary = summarize(
        observations + [(0, "Reserva não observada no prazo.") for _ in pending],
        EXPIRATION_TARGET,
    )
    return {
        **summary,
        "usuarios_concorrentes": count,
        "pausa_entre_requisicoes_s": USER_PAUSE_SECONDS,
        "requisicoes_durante_observacao": sum(ops for ops, _ in traffic),
        "erros_durante_observacao": sum(errors for _, errors in traffic),
        "reservas_de_teste_restantes": stock["quantidade_reservada"],
        "reservas_dos_usuarios_de_carga": other_stock["quantidade_reservada"],
        "atrasos_observados_s": [round(duration, 3) for duration, _ in observations],
    }
