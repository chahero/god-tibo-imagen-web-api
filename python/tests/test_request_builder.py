from __future__ import annotations

import pytest

from src.god_tibo_imagen.request_builder import (
    REDACTED_ACCOUNT_ID,
    REDACTED_INSTALLATION_ID,
    REDACTED_SESSION_ID,
    build_responses_request,
)


def test_build_responses_request_matches_shape():
    session = {"accessToken": "token-1", "accountId": "acct-1", "installationId": "iid-1"}
    result = build_responses_request(
        base_url="https://chatgpt.com/backend-api/codex",
        session=session,
        prompt="flat blue square icon",
        model="gpt-5.4",
        originator="codex_cli_rs",
        session_id="session-123",
    )

    assert result["url"] == "https://chatgpt.com/backend-api/codex/responses"
    assert result["sessionId"] == "session-123"
    assert result["headers"]["Authorization"] == "Bearer token-1"
    assert result["body"]["include"] == ["reasoning.encrypted_content"]
    assert result["sanitized"]["headers"]["Authorization"] == "Bearer [REDACTED]"
    assert result["sanitized"]["headers"]["ChatGPT-Account-ID"] == REDACTED_ACCOUNT_ID
    assert result["sanitized"]["headers"]["session_id"] == REDACTED_SESSION_ID
    assert result["sanitized"]["body"]["client_metadata"]["x-codex-installation-id"] == REDACTED_INSTALLATION_ID


def test_build_responses_request_requires_prompt():
    with pytest.raises(Exception) as exc_info:
        build_responses_request(
            base_url="https://example.com",
            session={"accessToken": "a", "accountId": "b"},
            prompt="   ",
            model="gpt-5.4",
            originator="orig",
        )
    assert str(exc_info.value) == "Prompt is required."
