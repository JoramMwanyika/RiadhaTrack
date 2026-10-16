import base64
import hashlib
import hmac
import os
import secrets


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, encoded_salt, encoded_digest = stored.split("$", 2)
        if algorithm != "scrypt":
            return False
        expected = hash_password(password, base64.b64decode(encoded_salt))
        return hmac.compare_digest(expected, stored)
    except (ValueError, UnicodeDecodeError):
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
