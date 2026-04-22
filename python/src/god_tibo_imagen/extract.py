from __future__ import annotations

from typing import Any

from .errors import make_error


def _normalize_source(source: Any) -> dict[str, list[dict[str, Any]]]:
    if isinstance(source, list):
        return {"items": source, "events": []}
    return {"items": (source or {}).get("items", []), "events": (source or {}).get("events", [])}


def extract_image_generation(source: Any) -> dict[str, Any]:
    normalized = _normalize_source(source)
    items = normalized["items"]
    events = normalized["events"]

    image_item = next(
        (
            item
            for item in reversed(items)
            if item and item.get("type") == "image_generation_call" and item.get("result")
        ),
        None,
    )

    if image_item:
        return {
            "callId": image_item.get("id"),
            "revisedPrompt": image_item.get("revised_prompt"),
            "resultBase64": image_item.get("result"),
            "item": image_item,
        }

    partial_image_event = next(
        (
            event
            for event in reversed(events)
            if event
            and (event.get("data") or {}).get("type") == "response.image_generation_call.partial_image"
            and (event.get("data") or {}).get("partial_image_b64")
        ),
        None,
    )

    if partial_image_event:
        data = partial_image_event["data"]
        return {
            "callId": data.get("item_id"),
            "revisedPrompt": data.get("revised_prompt"),
            "resultBase64": data.get("partial_image_b64"),
            "item": {
                "type": "image_generation_call",
                "id": data.get("item_id"),
                "status": "completed",
                "revised_prompt": data.get("revised_prompt"),
                "result": data.get("partial_image_b64"),
            },
        }

    raise make_error(
        "The response stream completed without an image_generation_call result.",
        code="MISSING_IMAGE_GENERATION_OUTPUT",
    )
