// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';

import { createProvider } from '../providers/createProvider.js';
import { resolveConfig } from '../config.js';

const MAX_BODY_BYTES = 25 * 1024 * 1024;

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  response.end(body);
}

function sendHtml(response, html) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html)
  });
  response.end(html);
}

function sendBinary(response, contentType, buffer) {
  response.writeHead(200, {
    'content-type': contentType,
    'content-length': buffer.length,
    'cache-control': 'no-store'
  });
  response.end(buffer);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413, code: 'PAYLOAD_TOO_LARGE' }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('error', reject);
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400, code: 'BAD_JSON' }));
      }
    });
  });
}

function getErrorStatus(error) {
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600) {
    return error.status;
  }
  return 500;
}

function toPublicError(error) {
  return {
    code: error?.code || 'INTERNAL_ERROR',
    message: error?.message || 'Unexpected server error.'
  };
}

function isInsideWorkspace(filePath) {
  const root = path.resolve(process.cwd());
  const resolved = path.resolve(filePath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function getImageContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return null;
}

function buildImageUrl(savedPath) {
  if (!savedPath || typeof savedPath !== 'string') {
    return null;
  }
  if (!isInsideWorkspace(savedPath) || !getImageContentType(savedPath)) {
    return null;
  }
  return `/api/image?path=${encodeURIComponent(path.resolve(savedPath))}`;
}

function renderIndex() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>got-tibo-imagen-web-api</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; background: #f6f7f9; color: #1b1f24; }
    main { width: min(880px, calc(100vw - 32px)); margin: 0 auto; padding: 40px 0; }
    h1 { margin: 0 0 20px; font-size: 28px; font-weight: 700; }
    form { display: grid; gap: 14px; }
    label { display: grid; gap: 6px; font-size: 13px; font-weight: 650; color: #4b5563; }
    textarea, input, select { border: 1px solid #cfd6df; border-radius: 8px; padding: 10px 12px; font: inherit; background: #fff; color: #111827; }
    textarea { min-height: 130px; resize: vertical; }
    .row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    button { width: fit-content; border: 0; border-radius: 8px; padding: 10px 16px; font: inherit; font-weight: 700; background: #111827; color: #fff; cursor: pointer; }
    .viewer { margin-top: 18px; display: grid; gap: 14px; }
    .image-frame { display: grid; place-items: center; min-height: 280px; border: 1px solid #d8dee8; border-radius: 8px; background: #fff; overflow: hidden; }
    .image-frame img { display: none; width: 100%; height: auto; max-height: 70vh; object-fit: contain; }
    pre { overflow: auto; min-height: 90px; border: 1px solid #d8dee8; border-radius: 8px; padding: 14px; background: #fff; color: #111827; }
    @media (max-width: 720px) { .row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>got-tibo-imagen-web-api</h1>
    <form id="generate-form">
      <label>Prompt<textarea name="prompt" required placeholder="flat blue square icon"></textarea></label>
      <div class="row">
        <label>Provider<select name="provider"><option value="private-codex">private-codex</option><option value="auto">auto</option><option value="codex-cli">codex-cli</option></select></label>
        <label>Model<input name="model" placeholder="gpt-5.5"></label>
        <label>Output path<input name="outputPath" placeholder="./out.png"></label>
      </div>
      <button type="submit">Generate</button>
    </form>
    <section class="viewer">
      <div class="image-frame"><img id="generated-image" alt="Generated image"></div>
      <pre id="result">{}</pre>
    </section>
  </main>
  <script>
    const form = document.querySelector('#generate-form');
    const result = document.querySelector('#result');
    const image = document.querySelector('#generated-image');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      result.textContent = 'Generating...';
      image.style.display = 'none';
      image.removeAttribute('src');
      const data = Object.fromEntries(new FormData(form).entries());
      for (const key of Object.keys(data)) {
        if (!data[key]) delete data[key];
      }
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      });
      const body = await response.json();
      if (body.imageUrl) {
        image.src = body.imageUrl + '&t=' + Date.now();
        image.style.display = 'block';
      }
      result.textContent = JSON.stringify(body, null, 2);
    });
  </script>
</body>
</html>`;
}

export function createHttpHandler({
  resolveConfigImpl = resolveConfig,
  createProviderImpl = createProvider
} = {}) {
  return async function handleRequest(request, response) {
    const url = new URL(request.url || '/', 'http://localhost');

    try {
      if (request.method === 'GET' && url.pathname === '/') {
        sendHtml(response, renderIndex());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/image') {
        const filePath = url.searchParams.get('path');
        if (!filePath || !isInsideWorkspace(filePath)) {
          sendJson(response, 403, { error: { code: 'FORBIDDEN', message: 'Image path is not allowed.' } });
          return;
        }
        const contentType = getImageContentType(filePath);
        if (!contentType) {
          sendJson(response, 400, { error: { code: 'BAD_REQUEST', message: 'Unsupported image type.' } });
          return;
        }
        const bytes = await fs.readFile(path.resolve(filePath));
        sendBinary(response, contentType, bytes);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/generate') {
        const body = await readJsonBody(request);
        if (!body.prompt || typeof body.prompt !== 'string' || !body.prompt.trim()) {
          sendJson(response, 400, { error: { code: 'BAD_REQUEST', message: 'prompt is required.' } });
          return;
        }

        const config = resolveConfigImpl({
          provider: body.provider,
          defaultModel: body.model,
          defaultOutputPath: body.outputPath,
          baseUrl: body.baseUrl,
          codexHome: body.codexHome
        });
        const provider = createProviderImpl(config);
        const result = await provider.generateImage({
          prompt: body.prompt,
          model: body.model || config.defaultModel,
          outputPath: body.outputPath || config.defaultOutputPath,
          dryRun: Boolean(body.dryRun),
          debug: Boolean(body.debug),
          debugDir: body.debugDir,
          images: Array.isArray(body.images) ? body.images : undefined
        });

        sendJson(response, 200, {
          provider: result.provider || config.provider,
          savedPath: result.savedPath,
          imageUrl: buildImageUrl(result.savedPath),
          responseId: result.responseId,
          sessionId: result.sessionId,
          revisedPrompt: result.revisedPrompt,
          warnings: result.warnings || []
        });
        return;
      }

      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    } catch (error) {
      sendJson(response, getErrorStatus(error), { error: toPublicError(error) });
    }
  };
}
