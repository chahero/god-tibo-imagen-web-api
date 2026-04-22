from __future__ import annotations

import json
from typing import Any

from .errors import make_error


def _parse_event_block(block: str) -> dict[str, Any]:
    lines = block.splitlines()
    event = "message"
    data_lines: list[str] = []

    for line in lines:
        if not line or line.startswith(":"):
            continue
        if line.startswith("event:"):
            event = line[6:].strip()
            continue
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip())

    data_text = "\n".join(data_lines)
    data = None
    if data_text:
        try:
            data = json.loads(data_text)
        except json.JSONDecodeError as error:
            raise make_error(
                f"Malformed SSE JSON payload for event {event}: {error.msg}",
                code="MALFORMED_SSE_JSON",
                event=event,
                payload=data_text,
            ) from error

    return {"event": event, "data": data, "raw": block}


def summarize_events(events: list[dict[str, Any]]) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    response_id = None

    for event in events:
        data = event.get("data") or {}
        event_type = data.get("type")
        if event_type == "response.created":
            response_id = data.get("response", {}).get("id") or response_id
        if event_type == "response.output_item.done" and data.get("item"):
            items.append(data["item"])
        if event_type == "response.completed":
            response_id = data.get("response", {}).get("id") or response_id

    return {"events": events, "items": items, "responseId": response_id}


def parse_sse_text(text: str) -> dict[str, Any]:
    normalized = text.replace("\r\n", "\n")
    chunks = [value.strip() for value in __import__("re").split(r"\n\n+", normalized) if value.strip()]
    events = [_parse_event_block(chunk) for chunk in chunks]
    return summarize_events(events)
