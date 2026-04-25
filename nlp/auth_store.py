"""Local demo auth backed by JSON (no real database)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
USERS_JSON = ROOT / "nlp" / "data" / "demo_users.json"


def _load_users_raw() -> List[Dict[str, Any]]:
    if not USERS_JSON.exists():
        return []
    with USERS_JSON.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    users = payload.get("users", [])
    return users if isinstance(users, list) else []


def public_user(record: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in record.items() if k != "password"}


def authenticate(email: str, password: str, role: str) -> Optional[Dict[str, Any]]:
    needle = (email or "").strip().lower()
    for row in _load_users_raw():
        if not isinstance(row, dict):
            continue
        if row.get("role") != role:
            continue
        if str(row.get("email", "")).strip().lower() != needle:
            continue
        if str(row.get("password", "")) != str(password or ""):
            continue
        return public_user(row)
    return None


def example_email_for_role(role: str) -> str:
    for row in _load_users_raw():
        if isinstance(row, dict) and row.get("role") == role and row.get("email"):
            return str(row["email"])
    return ""
