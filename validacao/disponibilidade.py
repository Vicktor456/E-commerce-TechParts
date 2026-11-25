import argparse
import json
import os
import sqlite3
from datetime import UTC, datetime
from math import ceil
from pathlib import Path
from time import sleep, time
from urllib.error import URLError
from urllib.request import Request, urlopen

APIS = ("catalogo", "auth", "carrinho")
INTERVAL = 60


def check(base, path, *, body=None, cookie=None):
    headers = {"Cookie": cookie} if cookie else {}
    if body is not None:
        headers["Content-Type"] = "application/json"
    data = json.dumps(body).encode() if body is not None else None
    with urlopen(Request(base.rstrip("/") + path, data=data, headers=headers), timeout=5) as response:
        return json.load(response), response.headers


def probe(urls, credentials, cookie):
    results = dict.fromkeys(APIS, False)
    try:
        result, _ = check(urls["catalogo"], "/api/catalogo/produtos?limite=1")
        results["catalogo"] = isinstance(result["items"], list)
    except (OSError, URLError, ValueError, KeyError, TypeError):
        pass
    try:
        profile, headers = check(urls["auth"], "/api/auth/login", body=credentials, cookie=cookie)
        candidate = headers.get("Set-Cookie", "").partition(";")[0]
        results["auth"] = profile["role"] == "client" and candidate.startswith("techparts_session=")
        if results["auth"]:
            cookie = candidate
    except (OSError, URLError, ValueError, KeyError, TypeError):
        pass
    if cookie:
        try:
            cart, _ = check(urls["carrinho"], "/api/carrinho", cookie=cookie)
            results["carrinho"] = isinstance(cart["items"], list)
        except (OSError, URLError, ValueError, KeyError, TypeError):
            pass
    return results, cookie


def collect(store, urls, credentials, once):
    cookie = None
    while True:
        slot = int(time()) // INTERVAL
        results, cookie = probe(urls, credentials, cookie)
        with store:
            store.executemany("INSERT OR IGNORE INTO samples VALUES (?, ?, ?)",
                              [(slot, api, int(success)) for api, success in results.items()])
        print(json.dumps({"utc": datetime.fromtimestamp(slot * INTERVAL, UTC).isoformat(),
                          **results}), flush=True)
        if once:
            return
        sleep(max(0.01, (slot + 1) * INTERVAL - time()))


def maintenance_slots(path, start, end):
    if path is None:
        return set()
    windows = json.loads(path.read_text(encoding="utf-8"))
    excluded = set()
    for window in windows:
        begin, finish, approved = [datetime.fromisoformat(window[key])
                                   for key in ("inicio", "fim", "aprovado_em")]
        if any(value.utcoffset() is None for value in (begin, finish, approved)):
            raise ValueError("Informe o fuso horário de cada instante de manutenção.")
        if not window["referencia"].strip() or not approved < begin < finish:
            raise ValueError("Use apenas manutenções com aprovação anterior ao início.")
        first = ceil(begin.timestamp() / INTERVAL)
        last = int(finish.timestamp()) // INTERVAL
        excluded.update(range(max(start, first), min(end, last)))
    return excluded


def report(store, month, maintenance, now=None):
    start_date = datetime.strptime(month, "%Y-%m").replace(tzinfo=UTC)
    year, number = start_date.year, start_date.month
    end_date = datetime(year + (number == 12), number % 12 + 1, 1, tzinfo=UTC)
    start, end = (int(value.timestamp()) // INTERVAL for value in (start_date, end_date))
    current = int((datetime.now(UTC) if now is None else now).timestamp()) // INTERVAL
    excluded = maintenance_slots(maintenance, start, end)
    expected = end - start - len(excluded)
    elapsed = max(0, min(end, current) - start) - sum(slot < current for slot in excluded)
    output = {"mes_utc": month, "janela_encerrada": current >= end, "minutos_previstos": expected,
              "minutos_manutencao": len(excluded), "minutos_decorridos": elapsed,
              "minutos_a_decorrer": expected - elapsed, "apis": {}}
    for api in APIS:
        rows = store.execute("SELECT slot, ok FROM samples WHERE api = ? AND slot >= ? AND slot < ?",
                             (api, start, min(end, current))).fetchall()
        data = [success for slot, success in rows if slot not in excluded]
        good = sum(data)
        coverage_complete = current >= end and expected > 0 and len(data) == expected
        rate = good / expected if coverage_complete else None
        output["apis"][api] = {
            "sucesso": good, "falha": len(data) - good, "sem_amostra": elapsed - len(data),
            "percentual_mensal": None if rate is None else round(rate * 100, 4),
            "atingiu_meta": None if rate is None else rate >= 0.995,
        }
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, required=True)
    commands = parser.add_subparsers(dest="operation", required=True)
    run = commands.add_parser("coletar")
    run.add_argument("--catalogo", default="http://127.0.0.1:8000")
    run.add_argument("--auth", default="http://127.0.0.1:8001")
    run.add_argument("--carrinho", default="http://127.0.0.1:8002")
    run.add_argument("--once", action="store_true")
    review = commands.add_parser("relatorio")
    review.add_argument("mes", help="AAAA-MM em UTC")
    review.add_argument("--manutencao", type=Path)
    args = parser.parse_args()
    with sqlite3.connect(args.database) as store:
        store.execute("CREATE TABLE IF NOT EXISTS samples (slot INTEGER, api TEXT, ok INTEGER, PRIMARY KEY (slot, api))")
        if args.operation == "coletar":
            credentials = {"email": os.getenv("POC_MONITOR_EMAIL"), "password": os.getenv("POC_MONITOR_PASSWORD")}
            if not all(credentials.values()):
                parser.error("Defina POC_MONITOR_EMAIL e POC_MONITOR_PASSWORD para um cliente de teste.")
            collect(store, {api: getattr(args, api) for api in APIS}, credentials, args.once)
        else:
            print(json.dumps(report(store, args.mes, args.manutencao), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
