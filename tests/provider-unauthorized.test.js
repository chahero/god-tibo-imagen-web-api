import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createPrivateCodexProvider } from '../src/providers/privateCodexProvider.js';
import { createFetchResponse, makeTempDir, writeAuthFixture } from './helpers.js';

const fixturesDir = new URL('../fixtures/', import.meta.url);

test('private provider classifies 401 responses', async () => {
  const dir = await makeTempDir();
  const fixture = await writeAuthFixture(dir);
  const outputPath = path.join(dir, 'out.png');
  const unauthorizedBody = await fs.readFile(new URL('unauthorized.json', fixturesDir), 'utf8');

  const provider = createPrivateCodexProvider({
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    authFile: fixture.authPath,
    installationIdFile: fixture.installationIdPath,
    defaultOriginator: 'codex_cli_rs'
  });

  await assert.rejects(
    provider.generateImage({
      prompt: 'make a blue square',
      model: 'gpt-5.4',
      outputPath,
      fetchImpl: async () =>
        createFetchResponse({
          ok: false,
          status: 401,
          body: unauthorizedBody,
          headers: { 'content-type': 'application/json' }
        })
    }),
    (error) => {
      assert.equal(error.code, 'UNAUTHORIZED');
      return true;
    }
  );
});
