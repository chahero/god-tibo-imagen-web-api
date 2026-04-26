import test from 'node:test';
import assert from 'node:assert/strict';

import path from 'node:path';

import { resolveConfig } from '../src/config.js';

test('resolveConfig defaults to gpt-5.5 when no model override is provided', () => {
  const previousImagegenModel = process.env.CODEX_IMAGEGEN_MODEL;
  const previousCodexModel = process.env.CODEX_MODEL;
  delete process.env.CODEX_IMAGEGEN_MODEL;
  delete process.env.CODEX_MODEL;

  try {
    const config = resolveConfig({ defaultOutputPath: './out.png' });
    assert.equal(config.defaultModel, 'gpt-5.5');
  } finally {
    if (previousImagegenModel === undefined) {
      delete process.env.CODEX_IMAGEGEN_MODEL;
    } else {
      process.env.CODEX_IMAGEGEN_MODEL = previousImagegenModel;
    }
    if (previousCodexModel === undefined) {
      delete process.env.CODEX_MODEL;
    } else {
      process.env.CODEX_MODEL = previousCodexModel;
    }
  }
});

test('resolveConfig stores generated images under generated_images by default', () => {
  const previousOutput = process.env.CODEX_IMAGEGEN_OUTPUT;
  delete process.env.CODEX_IMAGEGEN_OUTPUT;

  try {
    const config = resolveConfig();
    assert.equal(path.dirname(config.defaultOutputPath), path.resolve(process.cwd(), 'generated_images'));
    assert.match(path.basename(config.defaultOutputPath), /^generated-\d+\.png$/);
  } finally {
    if (previousOutput === undefined) {
      delete process.env.CODEX_IMAGEGEN_OUTPUT;
    } else {
      process.env.CODEX_IMAGEGEN_OUTPUT = previousOutput;
    }
  }
});
