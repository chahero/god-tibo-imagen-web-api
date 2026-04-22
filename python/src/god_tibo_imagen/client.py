from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .config import resolve_config
from .provider import create_private_codex_provider


@dataclass
class GenerateImageResult:
    mode: str
    warnings: list[str]
    response_id: str | None = None
    session_id: str | None = None
    saved_path: str | None = None
    revised_prompt: str | None = None
    request: dict[str, Any] | None = None
    response: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "GenerateImageResult":
        mode = payload.get("mode")
        if not isinstance(mode, str):
            raise ValueError("Result payload is missing mode.")
        return cls(
            mode=mode,
            warnings=payload.get("warnings", []),
            response_id=payload.get("responseId"),
            session_id=payload.get("sessionId"),
            saved_path=payload.get("savedPath"),
            revised_prompt=payload.get("revisedPrompt"),
            request=payload.get("request"),
            response=payload.get("response"),
        )


class Client:
    def __init__(self, **overrides: Any):
        self.config = resolve_config(overrides)
        self.provider = create_private_codex_provider(self.config)

    def generate_image(
        self,
        *,
        prompt: str,
        model: str | None = None,
        output_path: str | None = None,
        dry_run: bool = False,
        debug: bool = False,
        debug_dir: str | None = None,
        client=None,
    ) -> GenerateImageResult:
        payload = self.provider.generate_image(
            prompt=prompt,
            model=model or self.config["defaultModel"],
            output_path=output_path or self.config["defaultOutputPath"],
            dry_run=dry_run,
            debug=debug,
            debug_dir=debug_dir,
            client=client,
        )
        return GenerateImageResult.from_dict(payload)
