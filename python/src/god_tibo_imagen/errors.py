from __future__ import annotations

from typing import Any


class CodexError(Exception):
    """Base error that supports a JS-style code field."""

    code: str | None

    def __init__(self, message: str, *, code: str | None = None, **attrs):
        super().__init__(message)
        self.code = code
        for key, value in attrs.items():
            setattr(self, key, value)


def make_error(message: str, *, code: str | None = None, **attrs: Any) -> CodexError:
    return CodexError(message, code=code, **attrs)
