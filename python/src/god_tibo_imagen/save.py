from __future__ import annotations

import base64
import re
from pathlib import Path

from .errors import make_error


def _assert_standard_base64(value: str) -> None:
    if re.match(r"^data:", value, re.IGNORECASE):
        raise make_error("Expected raw base64 PNG bytes, not a data URL.", code="UNSUPPORTED_DATA_URL")

    if not re.match(r"^[A-Za-z0-9+/=\s]+$", value):
        raise make_error("Image payload is not standard base64.", code="INVALID_BASE64")


def save_image(*, result_base64: str, output_path: str | Path) -> str:
    _assert_standard_base64(result_base64)

    try:
        bytes_data = base64.b64decode(result_base64.strip(), validate=False)
    except Exception as error:
        raise make_error("Image payload is not standard base64.", code="INVALID_BASE64") from error

    if not bytes_data:
        raise make_error("Decoded image payload is empty.", code="EMPTY_IMAGE_PAYLOAD")

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(bytes_data)
    return str(output)
