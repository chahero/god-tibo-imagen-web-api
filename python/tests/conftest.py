from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import pytest


FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"
SRC_DIR = Path(__file__).resolve().parents[1] / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


def fixture_text(name: str) -> str:
    return (FIXTURES_DIR / name).read_text(encoding="utf-8")


def make_jwt(payload: dict) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).decode().rstrip("=")
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"{header}.{body}."


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES_DIR
