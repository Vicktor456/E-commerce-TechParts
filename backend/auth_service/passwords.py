from hashlib import scrypt
from hmac import compare_digest
from secrets import token_bytes


def derive(password: str, salt: bytes) -> bytes:
    return scrypt(password.encode("utf-8"), salt=salt, n=2**15, r=8, p=3,
                  maxmem=64 * 1024**2)


def hash_password(password: str) -> str:
    salt = token_bytes(16)
    return f"{salt.hex()}:{derive(password, salt).hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    # Derive a hash even for unknown e-mails to avoid a fast rejection path.
    salt, expected = stored.split(":") if stored else ("00" * 16, "00" * 64)
    matches = compare_digest(derive(password, bytes.fromhex(salt)), bytes.fromhex(expected))
    return stored is not None and matches
