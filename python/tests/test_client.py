from __future__ import annotations

import json

import httpx

from src.god_tibo_imagen.client import Client
from .conftest import fixture_text, make_jwt


def test_client_generate_image_returns_result_dataclass(tmp_path):
    auth_file = tmp_path / "auth.json"
    installation_file = tmp_path / "installation_id"
    auth_file.write_text(
        json.dumps(
            {
                "auth_mode": "chatgpt",
                "tokens": {
                    "access_token": make_jwt({"exp": 32503680000}),
                    "account_id": "acct-123",
                },
            }
        ),
        encoding="utf-8",
    )
    installation_file.write_text("iid-123", encoding="utf-8")

    client = Client(authFile=str(auth_file), installationIdFile=str(installation_file), baseUrl="https://chatgpt.com/backend-api/codex")

    transport = httpx.MockTransport(
        lambda _: httpx.Response(200, headers={"content-type": "text/event-stream"}, text=fixture_text("success.sse"))
    )
    result = client.generate_image(
        prompt="blue square",
        output_path=str(tmp_path / "result.png"),
        client=httpx.Client(transport=transport),
    )

    assert result.mode == "live"
    assert result.response_id == "resp_success_1"
    assert result.saved_path is not None
    assert result.saved_path.endswith("result.png")
