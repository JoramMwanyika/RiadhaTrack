"""Set a new password for the local bootstrap administrator.

Run with: $env:RIADHA_NEW_ADMIN_PASSWORD = '...'; python scripts/reset_admin_password.py
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.database import connection, initialize_database
from app.security import hash_password


password = os.getenv("RIADHA_NEW_ADMIN_PASSWORD")
if not password or len(password) < 12:
    raise SystemExit("Set RIADHA_NEW_ADMIN_PASSWORD to a password of at least 12 characters.")

initialize_database()
with connection() as db:
    updated = db.execute(
        "UPDATE users SET password_hash = ? WHERE username = ?",
        (hash_password(password), settings.admin_username),
    ).rowcount
if updated != 1:
    raise SystemExit("Administrator account was not found.")
print(f"Password updated for {settings.admin_username}.")
