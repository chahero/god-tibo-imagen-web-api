from __future__ import annotations

import pytest

from src.god_tibo_imagen.errors import CodexError
from src.god_tibo_imagen.save import save_image
from typing import cast


PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbwAAAABJRU5ErkJggg=="


def test_save_image_writes_bytes(tmp_path):
    output = tmp_path / "nested" / "image.png"
    saved = save_image(result_base64=PNG_B64, output_path=output)
    assert saved == str(output)
    assert output.exists()
    assert output.read_bytes().startswith(b"\x89PNG")


def test_save_image_rejects_data_url(tmp_path):
    with pytest.raises(Exception) as exc_info:
        save_image(result_base64="data:image/png;base64,abc", output_path=tmp_path / "x.png")
    error = cast(CodexError, exc_info.value)
    assert error.code == "UNSUPPORTED_DATA_URL"


def test_save_image_rejects_empty_payload(tmp_path):
    with pytest.raises(Exception) as exc_info:
        save_image(result_base64="   ", output_path=tmp_path / "x.png")
    error = cast(CodexError, exc_info.value)
    assert error.code == "EMPTY_IMAGE_PAYLOAD"
