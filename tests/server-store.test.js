import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createGalleryStore } from '../src/server/store.js';
import { PNG_BASE64 } from './helpers.js';

async function makeTempStore() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gti-store-'));
  const storeDir = path.join(rootDir, 'generated_images');
  return { rootDir, storeDir, store: createGalleryStore({ rootDir, storeDir }) };
}

test('gallery store records history and returns image data URLs', async () => {
  const { rootDir, store } = await makeTempStore();
  const imagePath = path.join(rootDir, 'generated_images', 'sample.png');
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(imagePath, Buffer.from(PNG_BASE64, 'base64'));

  const item = await store.addHistory({
    prompt: 'flat blue square',
    provider: 'private-codex',
    model: 'gpt-5.5',
    savedPath: imagePath,
    responseId: 'resp_123'
  });

  const history = await store.listHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].id, item.id);
  assert.equal(history[0].prompt, 'flat blue square');
  assert.equal(history[0].imageUrl, `/api/image?path=${encodeURIComponent(path.resolve(imagePath))}`);

  const data = await store.getImageDataUrl(item.id);
  assert.equal(data.filename, 'sample.png');
  assert.match(data.dataUrl, /^data:image\/png;base64,/);
});

test('gallery store deletes only generated image files from history entries', async () => {
  const { rootDir, store } = await makeTempStore();
  const generatedPath = path.join(rootDir, 'generated_images', 'delete-me.png');
  const externalPath = path.join(rootDir, 'keep-me.png');
  await fs.mkdir(path.dirname(generatedPath), { recursive: true });
  await fs.writeFile(generatedPath, Buffer.from(PNG_BASE64, 'base64'));
  await fs.writeFile(externalPath, Buffer.from(PNG_BASE64, 'base64'));

  const generated = await store.addHistory({ prompt: 'generated', savedPath: generatedPath });
  const external = await store.addHistory({ prompt: 'external', savedPath: externalPath });

  assert.ok(await fs.stat(generatedPath));
  assert.ok(await fs.stat(externalPath));

  await store.deleteHistory(generated.id);
  await assert.rejects(fs.stat(generatedPath), { code: 'ENOENT' });

  await store.deleteHistory(external.id);
  assert.ok(await fs.stat(externalPath));
});

test('gallery store clears generated history while preserving saved prompts', async () => {
  const { rootDir, store } = await makeTempStore();
  const firstPath = path.join(rootDir, 'generated_images', 'first.png');
  const secondPath = path.join(rootDir, 'generated_images', 'second.png');
  await fs.mkdir(path.dirname(firstPath), { recursive: true });
  await fs.writeFile(firstPath, Buffer.from(PNG_BASE64, 'base64'));
  await fs.writeFile(secondPath, Buffer.from(PNG_BASE64, 'base64'));

  await store.addHistory({ prompt: 'first', savedPath: firstPath });
  await store.addHistory({ prompt: 'second', savedPath: secondPath });
  const prompt = await store.addPrompt({ prompt: 'keep this prompt' });

  const result = await store.clearHistory();
  assert.deepEqual(result, { ok: true, deletedCount: 2, failed: [] });
  assert.deepEqual(await store.listHistory(), []);
  assert.equal((await store.listPrompts())[0].id, prompt.id);
  await assert.rejects(fs.stat(firstPath), { code: 'ENOENT' });
  await assert.rejects(fs.stat(secondPath), { code: 'ENOENT' });
});

test('gallery store saves reusable reference images', async () => {
  const { store } = await makeTempStore();
  const saved = await store.addReference({
    name: 'style.png',
    dataUrl: `data:image/png;base64,${PNG_BASE64}`
  });

  assert.equal(saved.name, 'style.png');
  assert.match(saved.imageUrl, /\/api\/image\?path=/);

  const references = await store.listReferences();
  assert.equal(references.length, 1);
  assert.equal(references[0].id, saved.id);

  const data = await store.getReferenceDataUrl(saved.id);
  assert.equal(data.filename, 'style.png');
  assert.match(data.dataUrl, /^data:image\/png;base64,/);

  await store.touchReferences([saved.id]);
  const touched = await store.getReference(saved.id);
  assert.ok(touched.lastUsedAt);

  await store.deleteReference(saved.id);
  assert.deepEqual(await store.listReferences(), []);
  await assert.rejects(fs.stat(saved.savedPath), { code: 'ENOENT' });
});

test('gallery store persists saved prompts', async () => {
  const { store } = await makeTempStore();
  const saved = await store.addPrompt({ title: 'Icon prompt', prompt: 'flat icon with sharp edges' });

  const prompts = await store.listPrompts();
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].id, saved.id);
  assert.equal(prompts[0].title, 'Icon prompt');
  assert.equal(prompts[0].prompt, 'flat icon with sharp edges');

  await store.deletePrompt(saved.id);
  assert.deepEqual(await store.listPrompts(), []);
});

test('gallery store recovers from corrupt JSON files', async () => {
  const { storeDir, store } = await makeTempStore();
  await fs.mkdir(storeDir, { recursive: true });
  await fs.writeFile(path.join(storeDir, 'index.json'), '{bad json', 'utf8');

  assert.deepEqual(await store.listHistory(), []);
  const files = await fs.readdir(storeDir);
  assert.ok(files.some((file) => file.startsWith('index.json.corrupt-')));
});
