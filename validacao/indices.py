import argparse
import json
import os
from pathlib import Path
from uuid import uuid4

from backend.catalog_service.seed import main as seed_catalog
from backend.database import mongo_client, service_database

from .carga import seed_products

CASES = {
    "am5_ddr5": {"categoria": "placa-mae", "especificacoes.soquete": "AM5",
                 "especificacoes.tipo_memoria": "DDR5"},
    "painel_ips": {"categoria": "monitor", "especificacoes.painel": "IPS"},
    "chipset_raro": {"categoria": "placa-mae", "especificacoes.chipset": "X670E"},
}


def stages(plan):
    if isinstance(plan, dict):
        if "stage" in plan:
            yield {"etapa": plan["stage"], **({"indice": plan["indexName"]} if "indexName" in plan else {})}
        for node in plan.values():
            yield from stages(node)
    if isinstance(plan, list):
        for node in plan:
            yield from stages(node)


def measure_query(database, criteria):
    query = {"ativo": True, **criteria}
    explanation = database.command("explain", {
        "find": "produtos", "filter": query, "sort": {"preco_atual": 1, "codigo": 1}, "limit": 10,
    }, verbosity="executionStats")
    return {
        "filtro": query,
        "plano": list(stages(explanation["queryPlanner"]["winningPlan"])),
        **{key: explanation["executionStats"][key] for key in (
            "nReturned", "totalKeysExamined", "totalDocsExamined", "executionTimeMillis",
        )},
    }


def measure(database):
    return {name: measure_query(database, criteria) for name, criteria in CASES.items()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    os.environ["MONGODB_DB_PREFIX"] = f"poc_indices_{uuid4().hex[:10]}_"
    with mongo_client() as mongo:
        database = service_database(mongo, "catalogo")
        try:
            seed_catalog()
            seed_products(database)
            database.produtos.update_many(
                {"codigo": {"$gte": 1968}}, {"$set": {"especificacoes.chipset": "X670E"}},
            )
            database.produtos.drop_index("ix05_especificacoes")
            before = measure(database)
            name = database.produtos.create_index("especificacoes.$**", name="ix05_especificacoes")
            after = measure(database)
            stats = database.command("collStats", "produtos")
            report = {
                "produtos": database.produtos.count_documents({}),
                "sem_ix05": before, "com_ix05": after,
                "ix05_bytes": stats["indexSizes"][name],
                "ix06_nome": measure_query(database, {"$text": {"$search": "Kumara"}}),
                "ix06_descricao": measure_query(database, {"$text": {"$search": "isolada"}}),
            }
            assert all(before[key]["nReturned"] == after[key]["nReturned"] for key in CASES)
            args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(report, ensure_ascii=False))
        finally:
            mongo.drop_database(database.name)


if __name__ == "__main__":
    main()
