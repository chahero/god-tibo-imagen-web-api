import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { createHttpHandler } from '../src/server/app.js';
import { PNG_BASE64 } from './helpers.js';

function listen(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

test('server exposes health and generate API endpoints', async () => {
  const calls = [];
  const imagePath = path.join(process.cwd(), 'generated-test-viewer.png');
  const { server, baseUrl } = await listen(createHttpHandler({
    resolveConfigImpl: (overrides) => ({
      provider: overrides.provider || 'private-codex',
      defaultModel: 'gpt-5.5',
      defaultOutputPath: '/tmp/generated.png'
    }),
    createProviderImpl: () => ({
      async generateImage(args) {
        calls.push(args);
        await fs.writeFile(imagePath, Buffer.from(PNG_BASE64, 'base64'));
        return {
          mode: 'live',
          provider: 'private-codex',
          warnings: [],
          responseId: 'resp_123',
          sessionId: 'session_123',
          savedPath: imagePath,
          revisedPrompt: 'revised prompt',
          response: { status: 200 }
        };
      }
    })
  }));

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const home = await fetch(`${baseUrl}/`);
    const homeHtml = await home.text();
    assert.equal(home.status, 200);
    assert.match(homeHtml, /<title>got-tibo-imagen-web-api<\/title>/);
    assert.match(homeHtml, /<h1>got-tibo-imagen-web-api<\/h1>/);

    const generate = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'flat blue square',
        provider: 'auto'
      })
    });

    assert.equal(generate.status, 200);
    const generateBody = await generate.json();
    assert.deepEqual(generateBody, {
      provider: 'private-codex',
      savedPath: imagePath,
      imageUrl: `/api/image?path=${encodeURIComponent(imagePath)}`,
      responseId: 'resp_123',
      sessionId: 'session_123',
      revisedPrompt: 'revised prompt',
      warnings: []
    });
    const image = await fetch(`${baseUrl}${generateBody.imageUrl}`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.ok((await image.arrayBuffer()).byteLength > 10);
    assert.equal(calls[0].prompt, 'flat blue square');
    assert.equal(calls[0].model, 'gpt-5.5');
    assert.equal(calls[0].outputPath, '/tmp/generated.png');
  } finally {
    await fs.unlink(imagePath).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server rejects missing prompts before calling provider', async () => {
  let called = false;
  const { server, baseUrl } = await listen(createHttpHandler({
    createProviderImpl: () => ({
      async generateImage() {
        called = true;
      }
    })
  }));

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'BAD_REQUEST');
    assert.equal(called, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
