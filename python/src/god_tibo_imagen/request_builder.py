from __future__ import annotations

import uuid
from copy import deepcopy
from typing import Any

from .errors import make_error

REDACTED_ACCOUNT_ID = "[REDACTED_ACCOUNT_ID]"
REDACTED_SESSION_ID = "[REDACTED_SESSION_ID]"
REDACTED_INSTALLATION_ID = "[REDACTED_INSTALLATION_ID]"


def sanitize_headers(headers: dict[str, Any]) -> dict[str, Any]:
    clone = dict(headers)
    if clone.get("Authorization"):
        clone["Authorization"] = "Bearer [REDACTED]"
    if clone.get("ChatGPT-Account-ID"):
        clone["ChatGPT-Account-ID"] = REDACTED_ACCOUNT_ID
    if clone.get("session_id"):
        clone["session_id"] = REDACTED_SESSION_ID
    return clone


def sanitize_request_body(body: dict[str, Any]) -> dict[str, Any]:
    if not body.get("client_metadata"):
        return body

    cloned = deepcopy(body)
    cloned["client_metadata"]["x-codex-installation-id"] = REDACTED_INSTALLATION_ID
    return cloned


def build_responses_request(
    *,
    base_url: str,
    session: dict[str, Any],
    prompt: str,
    model: str,
    originator: str,
    include_reasoning: bool = True,
    session_id: str | None = None,
) -> dict[str, Any]:
    if not prompt or not prompt.strip():
        raise make_error("Prompt is required.")

    base = f"{base_url}/" if not base_url.endswith("/") else base_url
    url = f"{base}responses"
    session_id = session_id or str(uuid.uuid4())

    headers = {
        "Authorization": f"Bearer {session['accessToken']}",
        "ChatGPT-Account-ID": session["accountId"],
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "originator": originator,
        "session_id": session_id,
    }

    body = {
        "model": model,
        "instructions": "",
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": prompt}],
            }
        ],
        "tools": [{"type": "image_generation", "output_format": "png"}],
        "tool_choice": "auto",
        "parallel_tool_calls": False,
        "reasoning": None,
        "store": False,
        "stream": True,
        "include": ["reasoning.encrypted_content"] if include_reasoning else [],
        "client_metadata": (
            {"x-codex-installation-id": session["installationId"]} if session.get("installationId") else None
        ),
    }

    return {
        "url": url,
        "session_id": session_id,
        "sessionId": session_id,
        "headers": headers,
        "body": body,
        "sanitized": {
            "url": url,
            "headers": sanitize_headers(headers),
            "body": sanitize_request_body(body),
        },
    }
