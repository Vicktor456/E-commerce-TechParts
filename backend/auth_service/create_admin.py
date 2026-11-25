import argparse
from getpass import getpass

from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from backend.database import mongo_client, service_database

from .accounts import Registration, create_account


def main() -> None:
    parser = argparse.ArgumentParser(description="Cria uma conta administrativa do TechParts.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Administrador")
    args = parser.parse_args()
    password = getpass("Senha (mínimo de 15 caracteres): ")
    if password != getpass("Confirme a senha: "):
        parser.exit(1, "As senhas não coincidem.\n")
    try:
        data = Registration(name=args.name, email=args.email, password=password)
    except ValidationError:
        parser.exit(1, "Informe nome, e-mail e senha válidos.\n")
    try:
        with mongo_client() as client:
            users = service_database(client, "auth").usuarios
            users.create_index("email", unique=True)
            create_account(users, data, "administrador")
    except DuplicateKeyError:
        parser.exit(1, "Este e-mail já pertence a uma conta.\n")
    print("Conta administrativa criada.")


if __name__ == "__main__":
    main()
