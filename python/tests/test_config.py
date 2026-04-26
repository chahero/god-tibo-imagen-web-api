from __future__ import annotations

from src.gti.config import PRIVATE_CODEX_PROVIDER, resolve_config


def test_resolve_config_uses_env_defaults(monkeypatch, tmp_path):
    monkeypatch.setenv("CODEX_HOME", str(tmp_path / "codex-home"))
    monkeypatch.setenv("CODEX_IMAGEGEN_BASE_URL", "https://example.com/base")
    monkeypatch.setenv("CODEX_IMAGEGEN_PROVIDER", "private-codex")
    monkeypatch.setenv("CODEX_IMAGEGEN_MODEL", "model-x")
    monkeypatch.setenv("CODEX_IMAGEGEN_ORIGINATOR", "origin-x")
    monkeypatch.setenv("CODEX_IMAGEGEN_OUTPUT", str(tmp_path / "out.png"))

    config = resolve_config()

    assert config["codexHome"].endswith("codex-home")
    assert config["baseUrl"] == "https://example.com/base"
    assert config["authFile"].endswith("auth.json")
    assert config["installationIdFile"].endswith("installation_id")
    assert config["generatedImagesDir"].endswith("generated_images")
    assert config["provider"] == PRIVATE_CODEX_PROVIDER
    assert config["defaultModel"] == "model-x"
    assert config["defaultOriginator"] == "origin-x"
    assert config["defaultOutputPath"] == str(tmp_path / "out.png")


def test_resolve_config_defaults_to_gpt_55(monkeypatch):
    monkeypatch.delenv("CODEX_IMAGEGEN_MODEL", raising=False)
    monkeypatch.delenv("CODEX_MODEL", raising=False)

    config = resolve_config({"defaultOutputPath": "./out.png"})

    assert config["defaultModel"] == "gpt-5.5"


def test_resolve_config_uses_generated_images_output_dir(monkeypatch):
    monkeypatch.delenv("CODEX_IMAGEGEN_OUTPUT", raising=False)

    config = resolve_config()

    assert config["defaultOutputPath"].endswith(".png")
    assert "generated_images" in config["defaultOutputPath"]
