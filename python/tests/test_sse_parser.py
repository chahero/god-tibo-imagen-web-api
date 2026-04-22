from __future__ import annotations

from typing import cast

import pytest

from src.god_tibo_imagen.errors import CodexError
from src.god_tibo_imagen.sse_parser import parse_sse_text
from .conftest import fixture_text


def test_parse_sse_text_success_fixture():
    parsed = parse_sse_text(fixture_text("success.sse"))
    assert parsed["responseId"] == "resp_success_1"
    assert len(parsed["events"]) == 3
    assert len(parsed["items"]) == 1
    assert parsed["items"][0]["id"] == "ig_success_1"


def test_parse_sse_text_partial_image_fixture():
    parsed = parse_sse_text(fixture_text("partial-image.sse"))
    assert parsed["responseId"] == "resp_partial_1"
    assert len(parsed["events"]) == 4
    assert parsed["items"] == []


def test_parse_sse_text_malformed_fixture_raises_exact_code():
    with pytest.raises(Exception) as exc_info:
        parse_sse_text(fixture_text("malformed.sse"))
    error = cast(CodexError, exc_info.value)
    assert error.code == "MALFORMED_SSE_JSON"
    assert getattr(error, "event") == "response.output_item.done"
    assert getattr(error, "payload") == '{"type":"response.output_item.done","item":'
