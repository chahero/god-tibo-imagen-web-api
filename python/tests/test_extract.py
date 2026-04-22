from __future__ import annotations

import pytest
from typing import cast

from src.god_tibo_imagen.errors import CodexError
from src.god_tibo_imagen.extract import extract_image_generation
from src.god_tibo_imagen.sse_parser import parse_sse_text
from .conftest import fixture_text


def test_extract_image_generation_from_success_items():
    parsed = parse_sse_text(fixture_text("success.sse"))
    result = extract_image_generation(parsed)
    assert result["callId"] == "ig_success_1"
    assert result["revisedPrompt"] == "a tiny blue square"
    assert result["item"]["type"] == "image_generation_call"


def test_extract_image_generation_from_partial_event():
    parsed = parse_sse_text(fixture_text("partial-image.sse"))
    result = extract_image_generation(parsed)
    assert result["callId"] == "ig_partial_1"
    assert result["revisedPrompt"] == "tiny blue square"
    assert result["item"]["status"] == "completed"


def test_extract_image_generation_missing_output():
    parsed = parse_sse_text(fixture_text("no-image.sse"))
    with pytest.raises(Exception) as exc_info:
        extract_image_generation(parsed)
    error = cast(CodexError, exc_info.value)
    assert error.code == "MISSING_IMAGE_GENERATION_OUTPUT"
