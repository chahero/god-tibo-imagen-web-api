from __future__ import annotations

import json

import httpx
import pytest

from src.gti.errors import CodexError
from src.gti.provider import create_private_codex_provider
from .conftest import fixture_text, make_jwt
from typing import cast


def _write_auth_state(tmp_path, *, exp_offset_seconds=3600):
    auth_file = tmp_path / "auth.json"
    installation_file = tmp_path / "installation_id"
    token = make_jwt({"exp": 32503680000 if exp_offset_seconds else 1})
    auth_file.write_text(
        json.dumps(
            {
                "auth_mode": "chatgpt",
                "tokens": {
                    "access_token": token,
                    "account_id": "acct-123",
                },
            }
        ),
        encoding="utf-8",
    )
    installation_file.write_text("iid-123", encoding="utf-8")
    return auth_file, installation_file


def test_provider_dry_run_returns_sanitized_request(tmp_path):
    auth_file, installation_file = _write_auth_state(tmp_path)
    provider = create_private_codex_provider(
        {
            "authFile": str(auth_file),
            "installationIdFile": str(installation_file),
            "baseUrl": "https://chatgpt.com/backend-api/codex",
            "defaultOriginator": "codex_cli_rs",
        }
    )
    result = provider.generate_image(
        prompt="blue square", model="gpt-5.4", output_path=str(tmp_path / "out.png"), dry_run=True
    )
    assert result["mode"] == "dry-run"
    assert result["request"]["headers"]["Authorization"] == "Bearer [REDACTED]"


def test_provider_live_sse_success_and_debug_artifacts(tmp_path):
    auth_file, installation_file = _write_auth_state(tmp_path)
    debug_dir = tmp_path / "debug"

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["originator"] == "codex_cli_rs"
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream", "x-oai-request-id": "req_1", "set-cookie": "secret=1"},
            text=fixture_text("success.sse"),
        )

    provider = create_private_codex_provider(
        {
            "authFile": str(auth_file),
            "installationIdFile": str(installation_file),
            "baseUrl": "https://chatgpt.com/backend-api/codex",
            "defaultOriginator": "codex_cli_rs",
        }
    )
    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = provider.generate_image(
        prompt="blue square",
        model="gpt-5.4",
        output_path=str(tmp_path / "out.png"),
        debug=True,
        debug_dir=debug_dir,
        client=client,
    )

    assert result["mode"] == "live"
    assert result["responseId"] == "resp_success_1"
    assert result["savedPath"].endswith("out.png")
    assert (debug_dir / "request.json").exists()
    response_dump = json.loads((debug_dir / "response.json").read_text(encoding="utf-8"))
    assert response_dump["headers"] == {"content-type": "text/event-stream", "x-oai-request-id": "req_1"}
    assert response_dump["body"]["eventCounts"]["response.output_item.done"] == 1


def test_provider_unauthorized_classification(tmp_path):
    auth_file, installation_file = _write_auth_state(tmp_path)

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(401, headers={"content-type": "application/json"}, text=fixture_text("unauthorized.json"))

    provider = create_private_codex_provider(
        {
            "authFile": str(auth_file),
            "installationIdFile": str(installation_file),
            "baseUrl": "https://chatgpt.com/backend-api/codex",
            "defaultOriginator": "codex_cli_rs",
        }
    )
    client = httpx.Client(transport=httpx.MockTransport(handler))
    with pytest.raises(Exception) as exc_info:
        provider.generate_image(
            prompt="blue square", model="gpt-5.4", output_path=str(tmp_path / "out.png"), client=client
        )
    error = cast(CodexError, exc_info.value)
    assert error.code == "UNAUTHORIZED"
    assert getattr(error, "status") == 401


def test_provider_rethrows_malformed_sse(tmp_path):
    auth_file, installation_file = _write_auth_state(tmp_path)

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, text=fixture_text("malformed.sse"))

    provider = create_private_codex_provider(
        {
            "authFile": str(auth_file),
            "installationIdFile": str(installation_file),
            "baseUrl": "https://chatgpt.com/backend-api/codex",
            "defaultOriginator": "codex_cli_rs",
        }
    )
    client = httpx.Client(transport=httpx.MockTransport(handler))
    with pytest.raises(Exception) as exc_info:
        provider.generate_image(
            prompt="blue square", model="gpt-5.4", output_path=str(tmp_path / "out.png"), client=client
        )
    error = cast(CodexError, exc_info.value)
    assert error.code == "MALFORMED_SSE_JSON"


def test_provider_forwards_image_to_request_body(tmp_path):
    auth_file, installation_file = _write_auth_state(tmp_path)

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        content = body["input"][0]["content"]
        assert len(content) == 2
        assert content[1]["type"] == "input_image"
        assert content[1]["image_url"] == "data:image/png;base64,abc123"
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            text=fixture_text("success.sse"),
        )

    provider = create_private_codex_provider(
        {
            "authFile": str(auth_file),
            "installationIdFile": str(installation_file),
            "baseUrl": "https://chatgpt.com/backend-api/codex",
            "defaultOriginator": "codex_cli_rs",
        }
    )
    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = provider.generate_image(
        prompt="blue square",
        model="gpt-5.4",
        output_path=str(tmp_path / "out.png"),
        image="data:image/png;base64,abc123",
        client=client,
    )
    assert result["mode"] == "live"
