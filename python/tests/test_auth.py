from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import cast

import pytest

from src.god_tibo_imagen.auth import load_codex_session, validate_codex_session
from src.god_tibo_imagen.errors import CodexError
from .conftest import make_jwt


def test_load_codex_session_reads_expected_fields(tmp_path):
    auth_file = tmp_path / "auth.json"
    installation_file = tmp_path / "installation_id"
    auth_file.write_text(
        json.dumps(
            {
                "auth_mode": "chatgpt",
                "last_refresh": "2026-04-22T00:00:00Z",
                "tokens": {
                    "access_token": " access ",
                    "account_id": " account ",
                    "id_token": " id ",
                    "refresh_token": " refresh ",
                },
            }
        ),
        encoding="utf-8",
    )
    installation_file.write_text(" install-id ", encoding="utf-8")

    session = load_codex_session(auth_file=auth_file, installation_id_file=installation_file)

    assert session == {
        "authFile": str(auth_file),
        "authMode": "chatgpt",
        "lastRefresh": "2026-04-22T00:00:00Z",
        "accessToken": "access",
        "accountId": "account",
        "idToken": "id",
        "refreshToken": "refresh",
        "installationId": "install-id",
        "raw": json.loads(auth_file.read_text(encoding="utf-8")),
    }


def test_validate_codex_session_errors_and_warnings():
    expired = int((datetime.now(tz=timezone.utc) - timedelta(days=1)).timestamp())
    session = {
        "authMode": "oauth",
        "accessToken": make_jwt({"exp": expired}),
        "accountId": None,
        "installationId": None,
    }

    with pytest.raises(Exception) as exc_info:
        validate_codex_session(session)

    error = cast(CodexError, exc_info.value)
    assert error.code == "INVALID_CODEX_SESSION"
    assert getattr(error, "issues") == ["Missing tokens.account_id in Codex auth state."]
    warnings = getattr(error, "warnings")
    assert warnings[0] == "auth_mode is oauth; expected chatgpt for the private backend path."
    assert warnings[1] == (
        "Missing ~/.codex/installation_id; requests will omit x-codex-installation-id client metadata."
    )
    assert warnings[2].startswith("access token appears expired at ")


def test_validate_codex_session_success_without_expiry_warning():
    future = int((datetime.now(tz=timezone.utc) + timedelta(days=1)).timestamp())
    result = validate_codex_session(
        {
            "authMode": "chatgpt",
            "accessToken": make_jwt({"exp": future}),
            "accountId": "acct",
            "installationId": "iid",
        }
    )
    assert result == {"warnings": []}
