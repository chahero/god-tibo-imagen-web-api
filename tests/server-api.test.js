import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';

import { createHttpHandler } from '../src/server/app.js';
import { createGalleryStore } from '../src/server/store.js';
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
  const rootDir = await fs.mkdtemp(path.join(process.cwd(), 'server-api-'));
  const storeDir = path.join(rootDir, 'generated_images');
  const imagePath = path.join(storeDir, 'generated-test-viewer.png');
  const { server, baseUrl } = await listen(createHttpHandler({
    resolveConfigImpl: (overrides) => ({
      provider: overrides.provider || 'private-codex',
      defaultModel: 'gpt-5.5',
      defaultOutputPath: imagePath
    }),
    createStoreImpl: () => createGalleryStore({ rootDir, storeDir }),
    createProviderImpl: () => ({
      async generateImage(args) {
        calls.push(args);
        await fs.mkdir(path.dirname(imagePath), { recursive: true });
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
    assert.match(homeHtml, /id="dropzone"/);
    assert.match(homeHtml, /ref-index/);
    assert.match(homeHtml, /Generated images/);

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
    assert.equal(generateBody.provider, 'private-codex');
    assert.equal(generateBody.savedPath, imagePath);
    assert.equal(generateBody.imageUrl, `/api/image?path=${encodeURIComponent(path.resolve(imagePath))}`);
    assert.equal(generateBody.responseId, 'resp_123');
    assert.equal(generateBody.sessionId, 'session_123');
    assert.equal(generateBody.revisedPrompt, 'revised prompt');
    assert.deepEqual(generateBody.warnings, []);
    assert.equal(generateBody.historyItem.prompt, 'flat blue square');
    assert.equal(generateBody.historyItem.savedPath, imagePath);

    const history = await fetch(`${baseUrl}/api/history`);
    assert.equal(history.status, 200);
    const historyBody = await history.json();
    assert.equal(historyBody.items.length, 1);
    assert.equal(historyBody.items[0].id, generateBody.historyItem.id);

    const data = await fetch(`${baseUrl}/api/image-data?id=${encodeURIComponent(generateBody.historyItem.id)}`);
    assert.equal(data.status, 200);
    assert.match((await data.json()).dataUrl, /^data:image\/png;base64,/);

    const image = await fetch(`${baseUrl}${generateBody.imageUrl}`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.ok((await image.arrayBuffer()).byteLength > 10);
    assert.equal(calls[0].prompt, 'flat blue square');
    assert.equal(calls[0].model, 'gpt-5.5');
    assert.equal(calls[0].outputPath, imagePath);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
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

test('home page includes face grid prompt helper', async () => {
  const { server, baseUrl } = await listen(createHttpHandler());

  try {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /id="face-grid-prompt-button"/);
    assert.match(html, /Face grid/);
    assert.match(html, /Add a minimal structured interference pattern to every visible face/);
    assert.match(html, /Face grid prompt added/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('home page renders browser script with valid JavaScript syntax', async () => {
  const { server, baseUrl } = await listen(createHttpHandler());

  try {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();
    const match = html.match(/<script>([\s\S]*)<\/script>/);

    assert.equal(response.status, 200);
    assert.ok(match, 'expected inline browser script');
    assert.doesNotThrow(() => new vm.Script(match[1]));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server stores and deletes saved prompts', async () => {
  const rootDir = await fs.mkdtemp(path.join(process.cwd(), 'server-prompts-'));
  const storeDir = path.join(rootDir, 'generated_images');
  const { server, baseUrl } = await listen(createHttpHandler({
    createStoreImpl: () => createGalleryStore({ rootDir, storeDir })
  }));

  try {
    const created = await fetch(`${baseUrl}/api/prompts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Saved', prompt: 'cinematic product photo' })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.title, 'Saved');
    assert.equal(createdBody.prompt, 'cinematic product photo');

    const list = await fetch(`${baseUrl}/api/prompts`);
    const listBody = await list.json();
    assert.equal(listBody.items.length, 1);
    assert.equal(listBody.items[0].id, createdBody.id);

    const deleted = await fetch(`${baseUrl}/api/prompts/${encodeURIComponent(createdBody.id)}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    const empty = await fetch(`${baseUrl}/api/prompts`);
    assert.deepEqual((await empty.json()).items, []);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server clears generated history without deleting saved prompts', async () => {
  const rootDir = await fs.mkdtemp(path.join(process.cwd(), 'server-clear-'));
  const storeDir = path.join(rootDir, 'generated_images');
  const store = createGalleryStore({ rootDir, storeDir });
  const imagePath = path.join(storeDir, 'clear-me.png');
  await fs.mkdir(storeDir, { recursive: true });
  await fs.writeFile(imagePath, Buffer.from(PNG_BASE64, 'base64'));
  await store.addHistory({ prompt: 'clear me', savedPath: imagePath });
  const prompt = await store.addPrompt({ prompt: 'keep prompt' });
  const { server, baseUrl } = await listen(createHttpHandler({
    createStoreImpl: () => store
  }));

  try {
    const response = await fetch(`${baseUrl}/api/history`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, deletedCount: 1, failed: [] });
    assert.deepEqual(await store.listHistory(), []);
    assert.equal((await store.listPrompts())[0].id, prompt.id);
    await assert.rejects(fs.stat(imagePath), { code: 'ENOENT' });
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server stores and reuses uploaded reference images', async () => {
  const rootDir = await fs.mkdtemp(path.join(process.cwd(), 'server-refs-'));
  const storeDir = path.join(rootDir, 'generated_images');
  const store = createGalleryStore({ rootDir, storeDir });
  const { server, baseUrl } = await listen(createHttpHandler({
    createStoreImpl: () => store,
    resolveConfigImpl: (overrides) => ({
      provider: overrides.provider || 'private-codex',
      defaultModel: 'gpt-5.5',
      defaultOutputPath: path.join(storeDir, 'generated.png')
    }),
    createProviderImpl: () => ({
      async generateImage(args) {
        await fs.mkdir(storeDir, { recursive: true });
        await fs.writeFile(args.outputPath, Buffer.from(PNG_BASE64, 'base64'));
        return {
          mode: 'live',
          provider: 'private-codex',
          warnings: [],
          responseId: 'resp_ref',
          sessionId: 'session_ref',
          savedPath: args.outputPath,
          revisedPrompt: null,
          response: { status: 200 }
        };
      }
    })
  }));

  try {
    const created = await fetch(`${baseUrl}/api/references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'pose.png', dataUrl: `data:image/png;base64,${PNG_BASE64}` })
    });
    assert.equal(created.status, 201);
    const reference = await created.json();
    assert.equal(reference.name, 'pose.png');

    const data = await fetch(`${baseUrl}/api/reference-data?id=${encodeURIComponent(reference.id)}`);
    assert.equal(data.status, 200);
    assert.match((await data.json()).dataUrl, /^data:image\/png;base64,/);

    const generate = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'use saved reference',
        images: [`data:image/png;base64,${PNG_BASE64}`],
        references: [{ id: reference.id, name: reference.name, index: 1, source: 'library' }]
      })
    });
    assert.equal(generate.status, 200);
    const generated = await generate.json();
    assert.equal(generated.historyItem.references[0].id, reference.id);
    assert.ok((await store.getReference(reference.id)).lastUsedAt);

    const deleted = await fetch(`${baseUrl}/api/references/${encodeURIComponent(reference.id)}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await store.listReferences(), []);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
});
