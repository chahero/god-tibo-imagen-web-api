// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';

import { createProvider } from '../providers/createProvider.js';
import { resolveConfig } from '../config.js';
import { createGalleryStore } from './store.js';

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

function getImageContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return null;
}

function renderIndex() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>got-tibo-imagen-web-api</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #eef1f5; color: #171b22; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #eef1f5; color: #171b22; }
    button, input, select, textarea { font: inherit; }
    button { border: 1px solid #c8d0dc; border-radius: 8px; padding: 9px 12px; font-weight: 700; background: #fff; color: #18202c; cursor: pointer; }
    button.primary { border-color: #111827; background: #111827; color: #fff; }
    button.danger { color: #a42323; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    main { width: min(1360px, calc(100vw - 32px)); margin: 0 auto; padding: 28px 0 40px; }
    header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
    .status { min-height: 22px; color: #526071; font-size: 13px; }
    .layout { display: grid; grid-template-columns: minmax(360px, 480px) minmax(420px, 1fr); gap: 18px; align-items: start; }
    section, aside { background: #fff; border: 1px solid #d9e0ea; border-radius: 8px; padding: 16px; }
    .panel-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    h2 { margin: 0; font-size: 16px; }
    form { display: grid; gap: 12px; }
    label { display: grid; gap: 6px; font-size: 13px; font-weight: 700; color: #485466; }
    textarea, input, select { width: 100%; border: 1px solid #cbd3df; border-radius: 8px; padding: 10px 11px; background: #fff; color: #121821; }
    textarea { min-height: 150px; resize: vertical; line-height: 1.45; }
    details { border: 1px solid #dbe2ec; border-radius: 8px; padding: 10px; }
    summary { cursor: pointer; font-weight: 750; color: #313b49; }
    .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .dropzone { display: grid; place-items: center; min-height: 118px; border: 1px dashed #98a6b8; border-radius: 8px; background: #f8fafc; color: #4b596b; text-align: center; padding: 16px; }
    .dropzone.dragover { border-color: #111827; background: #eef2f7; color: #111827; }
    .thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
    .thumb { position: relative; overflow: hidden; border: 1px solid #d8e0eb; border-radius: 8px; background: #f7f9fc; }
    .thumb img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; cursor: zoom-in; }
    .thumb button { position: absolute; right: 6px; top: 6px; width: 24px; height: 24px; display: grid; place-items: center; padding: 0; border-color: rgba(160,35,35,.35); border-radius: 999px; background: rgba(255,255,255,.94); color: #b42323; font-size: 14px; font-weight: 900; line-height: 1; }
    .ref-index { position: absolute; left: 6px; top: 6px; min-width: 24px; height: 24px; display: grid; place-items: center; border-radius: 999px; background: rgba(17,24,39,.92); color: #fff; font-size: 12px; font-weight: 800; }
    .result-frame { display: grid; place-items: center; min-height: 280px; max-height: 430px; border: 1px solid #d8e0eb; border-radius: 8px; background: #f8fafc; overflow: hidden; }
    .result-frame img { display: none; width: auto; max-width: 100%; max-height: 430px; object-fit: contain; cursor: zoom-in; }
    .image-dialog { width: min(1180px, calc(100vw - 32px)); max-width: none; max-height: calc(100vh - 32px); padding: 0; border: 0; border-radius: 8px; background: #0f1722; overflow: hidden; }
    .image-dialog::backdrop { background: rgba(10, 15, 25, .76); }
    .image-dialog-bar { display: flex; justify-content: flex-end; padding: 8px; background: #0f1722; }
    .image-dialog-bar button { border-color: rgba(255,255,255,.18); background: rgba(255,255,255,.08); color: #fff; }
    .image-dialog img { display: block; width: 100%; max-height: calc(100vh - 88px); object-fit: contain; background: #0f1722; }
    .tabs { display: flex; gap: 8px; margin: 18px 0 12px; }
    .tabs button.active { border-color: #111827; background: #111827; color: #fff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
    .card { border: 1px solid #d8e0eb; border-radius: 8px; overflow: hidden; background: #fff; }
    .card img { width: 100%; aspect-ratio: 1.25; object-fit: cover; background: #f4f6f9; cursor: zoom-in; }
    .card-body { display: grid; gap: 8px; padding: 10px; }
    .prompt { margin: 0; color: #263241; font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
    .meta { color: #6b7788; font-size: 12px; }
    .card-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .card-actions button { padding: 7px 8px; font-size: 12px; }
    .prompt-list { display: grid; gap: 10px; }
    .prompt-item { display: grid; gap: 8px; border: 1px solid #d8e0eb; border-radius: 8px; padding: 10px; background: #fff; }
    pre { overflow: auto; max-height: 180px; border: 1px solid #d8e0eb; border-radius: 8px; padding: 12px; background: #f8fafc; color: #172033; font-size: 12px; }
    .hidden { display: none !important; }
    @media (max-width: 980px) { .layout { grid-template-columns: 1fr; } .row { grid-template-columns: 1fr; } header { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>got-tibo-imagen-web-api</h1>
        <div class="status" id="status">Ready</div>
      </div>
      <button id="refresh-button" type="button">Refresh</button>
    </header>

    <div class="layout">
      <section>
        <div class="panel-title">
          <h2>Generate</h2>
          <button id="save-prompt-button" type="button">Save prompt</button>
        </div>
        <form id="generate-form">
          <label>Prompt<textarea name="prompt" required placeholder="Describe the image you want to create"></textarea></label>
          <label>Reference images</label>
          <div id="dropzone" class="dropzone">
            <div>Drop images here or click to select PNG, JPG, GIF, or WEBP files</div>
            <input id="image-picker" class="hidden" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple>
          </div>
          <div id="reference-list" class="thumbs"></div>
          <details>
            <summary>Advanced settings</summary>
            <div class="row">
              <label>Provider<select name="provider"><option value="private-codex">private-codex</option><option value="auto">auto</option><option value="codex-cli">codex-cli</option></select></label>
              <label>Model<input name="model" placeholder="gpt-5.5"></label>
              <label>Output path<input name="outputPath" placeholder="generated_images/generated-*.png"></label>
            </div>
          </details>
          <div class="actions">
            <button class="primary" id="generate-button" type="submit">Generate</button>
            <button id="clear-references-button" type="button">Clear references</button>
          </div>
        </form>
      </section>

      <section>
        <div class="panel-title">
          <h2>Latest result</h2>
        </div>
        <div class="result-frame"><img id="generated-image" alt="Generated image" title="Click to enlarge"></div>
        <pre id="result">{}</pre>
      </section>
    </div>

    <dialog id="image-dialog" class="image-dialog" aria-label="Generated image preview">
      <div class="image-dialog-bar"><button id="image-dialog-close" type="button">Close</button></div>
      <img id="image-dialog-image" alt="Generated image preview">
    </dialog>

    <div class="tabs">
      <button class="active" id="history-tab" type="button">History</button>
      <button id="references-tab" type="button">References</button>
      <button id="prompts-tab" type="button">Saved prompts</button>
    </div>

    <section id="history-panel">
      <div class="panel-title">
        <h2>Generated images</h2>
        <button class="danger" id="clear-history-button" type="button">Clear generated</button>
      </div>
      <div id="history-grid" class="grid"></div>
    </section>

    <section id="prompts-panel" class="hidden">
      <div class="panel-title">
        <h2>Saved prompts</h2>
      </div>
      <div id="prompt-list" class="prompt-list"></div>
    </section>

    <section id="references-panel" class="hidden">
      <div class="panel-title">
        <h2>Reference library</h2>
      </div>
      <div id="reference-grid" class="grid"></div>
    </section>
  </main>
  <script>
    const form = document.querySelector('#generate-form');
    const status = document.querySelector('#status');
    const result = document.querySelector('#result');
    const image = document.querySelector('#generated-image');
    const imageDialog = document.querySelector('#image-dialog');
    const imageDialogImage = document.querySelector('#image-dialog-image');
    const imageDialogClose = document.querySelector('#image-dialog-close');
    const generateButton = document.querySelector('#generate-button');
    const dropzone = document.querySelector('#dropzone');
    const imagePicker = document.querySelector('#image-picker');
    const referenceList = document.querySelector('#reference-list');
    const clearReferencesButton = document.querySelector('#clear-references-button');
    const clearHistoryButton = document.querySelector('#clear-history-button');
    const historyGrid = document.querySelector('#history-grid');
    const referenceGrid = document.querySelector('#reference-grid');
    const promptList = document.querySelector('#prompt-list');
    const refreshButton = document.querySelector('#refresh-button');
    const savePromptButton = document.querySelector('#save-prompt-button');
    const historyTab = document.querySelector('#history-tab');
    const referencesTab = document.querySelector('#references-tab');
    const promptsTab = document.querySelector('#prompts-tab');
    const historyPanel = document.querySelector('#history-panel');
    const referencesPanel = document.querySelector('#references-panel');
    const promptsPanel = document.querySelector('#prompts-panel');
    const references = [];

    function setStatus(message) {
      status.textContent = message;
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function formatDate(value) {
      if (!value) return '';
      return new Date(value).toLocaleString();
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    async function addFiles(files) {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const dataUrl = await readFileAsDataUrl(file);
        const saved = await api('/api/references', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: file.name, dataUrl })
        });
        addReferenceSelection({ id: saved.id, name: saved.name, dataUrl, imageUrl: saved.imageUrl, source: 'library' });
      }
      await loadReferences();
    }

    function addReferenceSelection(ref) {
      if (ref.id && references.some((item) => item.id === ref.id)) {
        renderReferences();
        return false;
      }
      if (!ref.id && references.some((item) => item.dataUrl === ref.dataUrl)) {
        renderReferences();
        return false;
      }
      references.push(ref);
      renderReferences();
      return true;
    }

    function renderReferences() {
      referenceList.innerHTML = references.map((ref, index) => \`
        <div class="thumb">
          <img src="\${ref.dataUrl}" alt="\${escapeHtml(ref.name)}" title="Click to enlarge" data-preview-src="\${ref.dataUrl}">
          <span class="ref-index" title="Reference image \${index + 1}">\${index + 1}</span>
          <button type="button" data-remove-ref="\${index}" title="Remove reference image \${index + 1}" aria-label="Remove reference image \${index + 1}">X</button>
        </div>
      \`).join('');
    }

    async function api(path, options) {
      const response = await fetch(path, options);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error?.message || \`Request failed with HTTP \${response.status}\`);
      }
      return body;
    }

    async function loadHistory() {
      const body = await api('/api/history');
      historyGrid.innerHTML = body.items.length ? body.items.map((item) => \`
        <article class="card">
          \${item.imageUrl ? \`<img src="\${item.imageUrl}&t=\${Date.now()}" alt="\${escapeHtml(item.prompt)}" title="Click to enlarge" data-preview-src="\${escapeHtml(item.imageUrl)}">\` : ''}
          <div class="card-body">
            <p class="prompt">\${escapeHtml(item.prompt)}</p>
            <div class="meta">\${escapeHtml(item.provider || '')} \${escapeHtml(item.model || '')}<br>\${escapeHtml(formatDate(item.createdAt))}</div>
            \${Array.isArray(item.references) && item.references.length ? \`<div class="meta">References: \${item.references.map((ref, index) => escapeHtml(ref.name || ref.id || \`#\${index + 1}\`)).join(', ')}</div>\` : ''}
            <div class="card-actions">
              <button type="button" title="Use as reference" data-use-ref="\${item.id}">Use as ref.</button>
              <button type="button" data-load-prompt="\${escapeHtml(item.prompt)}">Load prompt</button>
              <button class="danger" type="button" data-delete-history="\${item.id}">Delete</button>
            </div>
          </div>
        </article>
      \`).join('') : '<div class="meta">No generated images yet.</div>';
    }

    async function loadPrompts() {
      const body = await api('/api/prompts');
      promptList.innerHTML = body.items.length ? body.items.map((item) => \`
        <article class="prompt-item">
          <strong>\${escapeHtml(item.title)}</strong>
          <p class="prompt">\${escapeHtml(item.prompt)}</p>
          <div class="card-actions">
            <button type="button" data-load-prompt="\${escapeHtml(item.prompt)}">Load prompt</button>
            <button class="danger" type="button" data-delete-prompt="\${item.id}">Delete</button>
          </div>
        </article>
      \`).join('') : '<div class="meta">No saved prompts yet.</div>';
    }

    async function loadReferences() {
      const body = await api('/api/references');
      referenceGrid.innerHTML = body.items.length ? body.items.map((item) => \`
        <article class="card">
          \${item.imageUrl ? \`<img src="\${item.imageUrl}&t=\${Date.now()}" alt="\${escapeHtml(item.name)}" title="Click to enlarge" data-preview-src="\${escapeHtml(item.imageUrl)}">\` : ''}
          <div class="card-body">
            <p class="prompt">\${escapeHtml(item.name)}</p>
            <div class="meta">Saved \${escapeHtml(formatDate(item.createdAt))}\${item.lastUsedAt ? \`<br>Last used \${escapeHtml(formatDate(item.lastUsedAt))}\` : ''}</div>
            <div class="card-actions">
              <button type="button" title="Use as reference" data-use-library-ref="\${item.id}">Use as ref.</button>
              <button class="danger" type="button" data-delete-reference="\${item.id}">Delete</button>
            </div>
          </div>
        </article>
      \`).join('') : '<div class="meta">No uploaded reference images yet.</div>';
    }

    async function refreshAll() {
      await Promise.all([loadHistory(), loadPrompts(), loadReferences()]);
    }

    dropzone.addEventListener('click', () => imagePicker.click());
    dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', async (event) => {
      event.preventDefault();
      dropzone.classList.remove('dragover');
      await addFiles(event.dataTransfer.files);
    });
    imagePicker.addEventListener('change', async () => {
      await addFiles(imagePicker.files);
      imagePicker.value = '';
    });
    referenceList.addEventListener('click', (event) => {
      const previewImage = event.target.closest('[data-preview-src]');
      const button = event.target.closest('[data-remove-ref]');
      if (previewImage) {
        openImageDialog(previewImage.dataset.previewSrc);
        return;
      }
      if (!button) return;
      references.splice(Number(button.dataset.removeRef), 1);
      renderReferences();
    });
    clearReferencesButton.addEventListener('click', () => {
      references.splice(0, references.length);
      renderReferences();
    });
    function openImageDialog(src) {
      if (!src) return;
      imageDialogImage.src = src;
      if (typeof imageDialog.showModal === 'function') {
        imageDialog.showModal();
      }
    }

    image.addEventListener('click', () => {
      if (!image.src || image.style.display === 'none') return;
      openImageDialog(image.src);
    });
    imageDialogClose.addEventListener('click', () => imageDialog.close());
    imageDialog.addEventListener('click', (event) => {
      if (event.target === imageDialog) imageDialog.close();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus('Generating...');
      generateButton.disabled = true;
      result.textContent = '{}';
      image.style.display = 'none';
      image.removeAttribute('src');
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        for (const key of Object.keys(data)) {
          if (!data[key]) delete data[key];
        }
        data.images = references.map((ref) => ref.dataUrl);
        data.references = references.map((ref, index) => ({
          id: ref.id || null,
          name: ref.name || \`Reference image \${index + 1}\`,
          index: index + 1,
          source: ref.source || 'inline'
        }));
        const body = await api('/api/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (body.imageUrl) {
          image.src = body.imageUrl + '&t=' + Date.now();
          image.style.display = 'block';
        }
        result.textContent = JSON.stringify(body, null, 2);
        setStatus('Generated');
        await refreshAll();
      } catch (error) {
        result.textContent = JSON.stringify({ error: error.message }, null, 2);
        setStatus(error.message);
      } finally {
        generateButton.disabled = false;
      }
    });

    historyGrid.addEventListener('click', async (event) => {
      const previewImage = event.target.closest('[data-preview-src]');
      const refButton = event.target.closest('[data-use-ref]');
      const promptButton = event.target.closest('[data-load-prompt]');
      const deleteButton = event.target.closest('[data-delete-history]');
      if (previewImage) {
        openImageDialog(previewImage.dataset.previewSrc);
        return;
      }
      if (refButton) {
        setStatus('Loading reference image...');
        const body = await api('/api/image-data?id=' + encodeURIComponent(refButton.dataset.useRef));
        const added = addReferenceSelection({ name: body.filename, dataUrl: body.dataUrl });
        setStatus(added ? 'Reference image added' : 'Reference image already selected');
      }
      if (promptButton) {
        form.elements.prompt.value = promptButton.dataset.loadPrompt;
        setStatus('Prompt loaded');
      }
      if (deleteButton) {
        await api('/api/history/' + encodeURIComponent(deleteButton.dataset.deleteHistory), { method: 'DELETE' });
        await loadHistory();
        setStatus('History item deleted');
      }
    });

    referenceGrid.addEventListener('click', async (event) => {
      const previewImage = event.target.closest('[data-preview-src]');
      const useButton = event.target.closest('[data-use-library-ref]');
      const deleteButton = event.target.closest('[data-delete-reference]');
      if (previewImage) {
        openImageDialog(previewImage.dataset.previewSrc);
        return;
      }
      if (useButton) {
        setStatus('Loading saved reference...');
        const body = await api('/api/reference-data?id=' + encodeURIComponent(useButton.dataset.useLibraryRef));
        const added = addReferenceSelection({ id: body.id, name: body.filename, dataUrl: body.dataUrl, imageUrl: body.imageUrl, source: 'library' });
        setStatus(added ? 'Saved reference added' : 'Saved reference already selected');
      }
      if (deleteButton) {
        await api('/api/references/' + encodeURIComponent(deleteButton.dataset.deleteReference), { method: 'DELETE' });
        await loadReferences();
        setStatus('Reference image deleted');
      }
    });

    promptList.addEventListener('click', async (event) => {
      const promptButton = event.target.closest('[data-load-prompt]');
      const deleteButton = event.target.closest('[data-delete-prompt]');
      if (promptButton) {
        form.elements.prompt.value = promptButton.dataset.loadPrompt;
        setStatus('Prompt loaded');
      }
      if (deleteButton) {
        await api('/api/prompts/' + encodeURIComponent(deleteButton.dataset.deletePrompt), { method: 'DELETE' });
        await loadPrompts();
        setStatus('Saved prompt deleted');
      }
    });

    savePromptButton.addEventListener('click', async () => {
      const prompt = form.elements.prompt.value.trim();
      if (!prompt) {
        setStatus('Enter a prompt before saving');
        return;
      }
      await api('/api/prompts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      await loadPrompts();
      setStatus('Prompt saved');
    });

    clearHistoryButton.addEventListener('click', async () => {
      const ok = window.confirm('Delete all generated history entries and generated image files tracked by this app? Saved prompts will be kept.');
      if (!ok) return;
      const body = await api('/api/history', { method: 'DELETE' });
      await loadHistory();
      setStatus(\`Cleared \${body.deletedCount} generated image file(s)\`);
    });

    refreshButton.addEventListener('click', async () => {
      await refreshAll();
      setStatus('Refreshed');
    });

    historyTab.addEventListener('click', () => {
      historyTab.classList.add('active');
      referencesTab.classList.remove('active');
      promptsTab.classList.remove('active');
      historyPanel.classList.remove('hidden');
      referencesPanel.classList.add('hidden');
      promptsPanel.classList.add('hidden');
    });
    referencesTab.addEventListener('click', () => {
      referencesTab.classList.add('active');
      historyTab.classList.remove('active');
      promptsTab.classList.remove('active');
      referencesPanel.classList.remove('hidden');
      historyPanel.classList.add('hidden');
      promptsPanel.classList.add('hidden');
    });
    promptsTab.addEventListener('click', () => {
      promptsTab.classList.add('active');
      historyTab.classList.remove('active');
      referencesTab.classList.remove('active');
      promptsPanel.classList.remove('hidden');
      historyPanel.classList.add('hidden');
      referencesPanel.classList.add('hidden');
    });

    refreshAll().catch((error) => setStatus(error.message));
  </script>
</body>
</html>`;
}

export function createHttpHandler({
  resolveConfigImpl = resolveConfig,
  createProviderImpl = createProvider,
  createStoreImpl = createGalleryStore
} = {}) {
  const store = createStoreImpl();

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

      if (request.method === 'GET' && url.pathname === '/api/history') {
        sendJson(response, 200, { items: await store.listHistory() });
        return;
      }

      if (request.method === 'DELETE' && url.pathname === '/api/history') {
        sendJson(response, 200, await store.clearHistory());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/image-data') {
        const id = url.searchParams.get('id');
        const data = id ? await store.getImageDataUrl(id) : null;
        if (!data) {
          sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Image not found.' } });
          return;
        }
        sendJson(response, 200, data);
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/history/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/history/'.length));
        const deleted = id ? await store.deleteHistory(id) : null;
        if (!deleted) {
          sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'History item not found.' } });
          return;
        }
        sendJson(response, 200, { ok: true, deleted });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/prompts') {
        sendJson(response, 200, { items: await store.listPrompts() });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/prompts') {
        const body = await readJsonBody(request);
        const prompt = await store.addPrompt({ title: body.title, prompt: body.prompt });
        sendJson(response, 201, prompt);
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/prompts/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/prompts/'.length));
        const deleted = id ? await store.deletePrompt(id) : null;
        if (!deleted) {
          sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Saved prompt not found.' } });
          return;
        }
        sendJson(response, 200, { ok: true, deleted });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/references') {
        sendJson(response, 200, { items: await store.listReferences() });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/references') {
        const body = await readJsonBody(request);
        const reference = await store.addReference({ name: body.name, dataUrl: body.dataUrl });
        sendJson(response, 201, reference);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/reference-data') {
        const id = url.searchParams.get('id');
        const data = id ? await store.getReferenceDataUrl(id) : null;
        if (!data) {
          sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Reference image not found.' } });
          return;
        }
        sendJson(response, 200, data);
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/references/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/references/'.length));
        const deleted = id ? await store.deleteReference(id) : null;
        if (!deleted) {
          sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Reference image not found.' } });
          return;
        }
        sendJson(response, 200, { ok: true, deleted });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/image') {
        const filePath = url.searchParams.get('path');
        if (!filePath || !store.isReadableImage(filePath)) {
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
        const references = Array.isArray(body.references) ? body.references : [];
        await store.touchReferences(references.map((item) => item.id).filter(Boolean));

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

        const historyItem = result.savedPath
          ? await store.addHistory({
            prompt: body.prompt,
            provider: result.provider || config.provider,
            model: body.model || config.defaultModel,
            savedPath: result.savedPath,
            responseId: result.responseId,
            sessionId: result.sessionId,
            revisedPrompt: result.revisedPrompt,
            references,
            warnings: result.warnings || []
          })
          : null;

        sendJson(response, 200, {
          provider: result.provider || config.provider,
          savedPath: result.savedPath,
          imageUrl: historyItem?.imageUrl || store.buildImageUrl(result.savedPath),
          historyItem,
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
