from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .errors import make_error


def _normalize_string(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _decode_jwt_payload(token: str | None) -> dict[str, Any] | None:
    if not token or not isinstance(token, str):
        return None

    parts = token.split(".")
    if len(parts) < 2:
        return None

    try:
        payload = parts[1].replace("-", "+").replace("_", "/")
        pad_length = (4 - (len(payload) % 4 or 4)) % 4
        padded = payload + ("=" * pad_length)
        decoded = base64.b64decode(padded).decode("utf-8")
        parsed = json.loads(decoded)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def load_codex_session(*, auth_file: str | Path, installation_id_file: str | Path) -> dict[str, Any]:
    auth_path = Path(auth_file)
    installation_path = Path(installation_id_file)

    auth_raw = auth_path.read_text(encoding="utf-8")
    auth_json = json.loads(auth_raw)
    tokens = auth_json.get("tokens") if isinstance(auth_json, dict) else {}
    if not isinstance(tokens, dict):
        tokens = {}

    installation_id = None
    try:
        installation_id = _normalize_string(installation_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        installation_id = None

    return {
        "authFile": str(auth_file),
        "authMode": _normalize_string(auth_json.get("auth_mode") if isinstance(auth_json, dict) else None),
        "lastRefresh": _normalize_string(auth_json.get("last_refresh") if isinstance(auth_json, dict) else None),
        "accessToken": _normalize_string(tokens.get("access_token")),
        "accountId": _normalize_string(tokens.get("account_id")),
        "idToken": _normalize_string(tokens.get("id_token")),
        "refreshToken": _normalize_string(tokens.get("refresh_token")),
        "installationId": installation_id,
        "raw": auth_json,
    }


def validate_codex_session(session: dict[str, Any] | None) -> dict[str, list[str]]:
    issues: list[str] = []
    warnings: list[str] = []

    if not session:
        issues.append("Missing session object.")

    if session and session.get("authMode") and session.get("authMode") != "chatgpt":
        warnings.append(
            f"auth_mode is {session.get('authMode')}; expected chatgpt for the private backend path."
        )

    if not session or not session.get("accessToken"):
        issues.append("Missing tokens.access_token in Codex auth state.")

    if not session or not session.get("accountId"):
        issues.append("Missing tokens.account_id in Codex auth state.")

    if not session or not session.get("installationId"):
        warnings.append(
            "Missing ~/.codex/installation_id; requests will omit x-codex-installation-id client metadata."
        )

    access_payload = _decode_jwt_payload(session.get("accessToken") if session else None)
    if access_payload and access_payload.get("exp"):
        try:
            expires_at = datetime.fromtimestamp(access_payload["exp"], tz=timezone.utc)
            if expires_at.timestamp() <= datetime.now(tz=timezone.utc).timestamp():
                warnings.append(f"access token appears expired at {expires_at.isoformat().replace('+00:00', 'Z')}.")
        except Exception:
            pass

    if issues:
        raise make_error(
            f"Invalid Codex session: {' '.join(issues)}",
            code="INVALID_CODEX_SESSION",
            issues=issues,
            warnings=warnings,
        )

    return {"warnings": warnings}
