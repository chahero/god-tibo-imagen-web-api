import test from 'node:test';
import assert from 'node:assert/strict';

import { buildResponsesRequest, sanitizeHeaders, sanitizeRequestBody } from '../src/codex/buildResponsesRequest.js';

test('buildResponsesRequest emits expected private Codex request', () => {
  const request = buildResponsesRequest({
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    session: {
      accessToken: 'abc123',
      accountId: 'acct-123',
      installationId: 'install-123'
    },
    prompt: 'make a blue square',
    model: 'gpt-5.4',
    originator: 'codex_cli_rs',
    sessionId: 'session-123'
  });

  assert.equal(request.url, 'https://chatgpt.com/backend-api/codex/responses');
  assert.equal(request.headers.Authorization, 'Bearer abc123');
  assert.equal(request.headers['ChatGPT-Account-ID'], 'acct-123');
  assert.equal(request.headers.originator, 'codex_cli_rs');
  assert.equal(request.headers.session_id, 'session-123');
  assert.deepEqual(request.body.tools, [{ type: 'image_generation', output_format: 'png' }]);
  assert.equal(request.body.input[0].content[0].text, 'make a blue square');
  assert.equal(request.body.client_metadata['x-codex-installation-id'], 'install-123');
  assert.deepEqual(sanitizeHeaders(request.headers), {
    Authorization: 'Bearer [REDACTED]',
    'ChatGPT-Account-ID': '[REDACTED_ACCOUNT_ID]',
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    originator: 'codex_cli_rs',
    session_id: '[REDACTED_SESSION_ID]'
  });
  assert.deepEqual(request.sanitized.body.client_metadata, {
    'x-codex-installation-id': '[REDACTED_INSTALLATION_ID]'
  });
});

test('buildResponsesRequest appends input_image when image is provided', () => {
  const request = buildResponsesRequest({
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    session: {
      accessToken: 'abc123',
      accountId: 'acct-123',
      installationId: null
    },
    prompt: 'make a blue square',
    model: 'gpt-5.4',
    originator: 'codex_cli_rs',
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbwAAAABJRU5ErkJggg=='
  });

  const content = request.body.input[0].content;
  assert.equal(content.length, 2);
  assert.equal(content[0].type, 'input_text');
  assert.equal(content[0].text, 'make a blue square');
  assert.equal(content[1].type, 'input_image');
  assert.equal(content[1].image_url, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbwAAAABJRU5ErkJggg==');
});

test('sanitizeRequestBody redacts input_image.image_url', () => {
  const body = {
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'hello' },
          { type: 'input_image', image_url: 'data:image/png;base64,secret' }
        ]
      }
    ]
  };

  const sanitized = sanitizeRequestBody(body);
  assert.equal(sanitized.input[0].content[1].image_url, '[REDACTED_IMAGE_DATA]');
  assert.equal(sanitized.input[0].content[0].text, 'hello');
});
