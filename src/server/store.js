// @ts-nocheck
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STORE_DIR = path.resolve(process.cwd(), 'generated_images');
const HISTORY_FILE = 'index.json';
const PROMPTS_FILE = 'prompts.json';
const REFERENCES_FILE = 'references.json';
const REFERENCES_DIR = 'references';
const MAX_IMAGE_DATA_BYTES = 15 * 1024 * 1024;
const MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function resolveInside(baseDir, targetPath) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(targetPath);
  return resolved === base || resolved.startsWith(`${base}${path.sep}`);
}

function getImageContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return null;
}

function parseImageDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    const error = new Error('Reference image must be a PNG, JPG, GIF, or WEBP data URL.');
    error.status = 400;
    error.code = 'BAD_REQUEST';
    throw error;
  }
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_DATA_BYTES) {
    const error = new Error('Reference image is empty or too large.');
    error.status = 400;
    error.code = 'BAD_REQUEST';
    throw error;
  }
  return {
    contentType,
    extension: MIME_TO_EXTENSION[contentType],
    buffer
  };
}

async function readJsonFile(filePath, fallback) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return fallback;
    }
    if (error instanceof SyntaxError) {
      const corruptPath = `${filePath}.corrupt-${Date.now()}`;
      await fs.rename(filePath, corruptPath).catch(() => {});
      return fallback;
    }
    throw error;
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function normalizeListPayload(payload) {
  if (!payload || !Array.isArray(payload.items)) {
    return { items: [] };
  }
  return { items: payload.items };
}

export function createGalleryStore({
  rootDir = process.cwd(),
  storeDir = DEFAULT_STORE_DIR
} = {}) {
  const resolvedRootDir = path.resolve(rootDir);
  const resolvedStoreDir = path.resolve(storeDir);
  const referencesDir = path.join(resolvedStoreDir, REFERENCES_DIR);
  const historyPath = path.join(resolvedStoreDir, HISTORY_FILE);
  const promptsPath = path.join(resolvedStoreDir, PROMPTS_FILE);
  const referencesPath = path.join(resolvedStoreDir, REFERENCES_FILE);

  async function readHistoryPayload() {
    return normalizeListPayload(await readJsonFile(historyPath, { items: [] }));
  }

  async function writeHistoryPayload(payload) {
    await writeJsonFile(historyPath, normalizeListPayload(payload));
  }

  async function readPromptsPayload() {
    return normalizeListPayload(await readJsonFile(promptsPath, { items: [] }));
  }

  async function writePromptsPayload(payload) {
    await writeJsonFile(promptsPath, normalizeListPayload(payload));
  }

  async function readReferencesPayload() {
    return normalizeListPayload(await readJsonFile(referencesPath, { items: [] }));
  }

  async function writeReferencesPayload(payload) {
    await writeJsonFile(referencesPath, normalizeListPayload(payload));
  }

  return {
    rootDir: resolvedRootDir,
    storeDir: resolvedStoreDir,

    isReadableImage(filePath) {
      return Boolean(filePath && resolveInside(resolvedRootDir, filePath) && getImageContentType(filePath));
    },

    isDeletableGeneratedImage(filePath) {
      return Boolean(filePath && resolveInside(resolvedStoreDir, filePath) && getImageContentType(filePath));
    },

    buildImageUrl(filePath) {
      if (!this.isReadableImage(filePath)) {
        return null;
      }
      return `/api/image?path=${encodeURIComponent(path.resolve(filePath))}`;
    },

    async listHistory() {
      const payload = await readHistoryPayload();
      return payload.items
        .slice()
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    },

    async addHistory(entry) {
      const payload = await readHistoryPayload();
      const item = {
        id: entry.id || createId('img'),
        prompt: String(entry.prompt || ''),
        provider: entry.provider || null,
        model: entry.model || null,
        savedPath: entry.savedPath ? path.resolve(entry.savedPath) : null,
        imageUrl: entry.savedPath ? this.buildImageUrl(entry.savedPath) : null,
        responseId: entry.responseId || null,
        sessionId: entry.sessionId || null,
        revisedPrompt: entry.revisedPrompt || null,
        references: Array.isArray(entry.references) ? entry.references : [],
        warnings: Array.isArray(entry.warnings) ? entry.warnings : [],
        createdAt: entry.createdAt || nowIso()
      };
      payload.items = [item, ...payload.items.filter((existing) => existing.id !== item.id)];
      await writeHistoryPayload(payload);
      return item;
    },

    async getHistory(id) {
      const payload = await readHistoryPayload();
      return payload.items.find((item) => item.id === id) || null;
    },

    async deleteHistory(id) {
      const payload = await readHistoryPayload();
      const item = payload.items.find((entry) => entry.id === id) || null;
      if (!item) {
        return null;
      }
      payload.items = payload.items.filter((entry) => entry.id !== id);
      await writeHistoryPayload(payload);
      if (this.isDeletableGeneratedImage(item.savedPath)) {
        await fs.unlink(path.resolve(item.savedPath)).catch((error) => {
          if (error?.code !== 'ENOENT') {
            throw error;
          }
        });
      }
      return item;
    },

    async clearHistory() {
      const payload = await readHistoryPayload();
      const deleted = [];
      const failed = [];
      for (const item of payload.items) {
        if (!this.isDeletableGeneratedImage(item.savedPath)) {
          continue;
        }
        try {
          await fs.unlink(path.resolve(item.savedPath));
          deleted.push(item.savedPath);
        } catch (error) {
          if (error?.code === 'ENOENT') {
            deleted.push(item.savedPath);
          } else {
            failed.push({ id: item.id, savedPath: item.savedPath, message: error.message });
          }
        }
      }
      if (failed.length === 0) {
        await writeHistoryPayload({ items: [] });
      } else {
        const failedIds = new Set(failed.map((item) => item.id));
        await writeHistoryPayload({ items: payload.items.filter((item) => failedIds.has(item.id)) });
      }
      return {
        ok: failed.length === 0,
        deletedCount: deleted.length,
        failed
      };
    },

    async getImageDataUrl(id) {
      const item = await this.getHistory(id);
      if (!item || !this.isReadableImage(item.savedPath)) {
        return null;
      }
      const resolvedPath = path.resolve(item.savedPath);
      const stat = await fs.stat(resolvedPath);
      if (!stat.isFile() || stat.size > MAX_IMAGE_DATA_BYTES) {
        return null;
      }
      const contentType = getImageContentType(resolvedPath);
      const buffer = await fs.readFile(resolvedPath);
      return {
        id: item.id,
        filename: path.basename(resolvedPath),
        imageUrl: item.imageUrl || this.buildImageUrl(resolvedPath),
        dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`
      };
    },

    async listPrompts() {
      const payload = await readPromptsPayload();
      return payload.items
        .slice()
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    },

    async addPrompt({ title, prompt }) {
      if (!prompt || !String(prompt).trim()) {
        const error = new Error('prompt is required.');
        error.status = 400;
        error.code = 'BAD_REQUEST';
        throw error;
      }
      const payload = await readPromptsPayload();
      const item = {
        id: createId('prompt'),
        title: title && String(title).trim() ? String(title).trim() : String(prompt).trim().slice(0, 80),
        prompt: String(prompt).trim(),
        createdAt: nowIso()
      };
      payload.items = [item, ...payload.items];
      await writePromptsPayload(payload);
      return item;
    },

    async deletePrompt(id) {
      const payload = await readPromptsPayload();
      const item = payload.items.find((entry) => entry.id === id) || null;
      if (!item) {
        return null;
      }
      payload.items = payload.items.filter((entry) => entry.id !== id);
      await writePromptsPayload(payload);
      return item;
    },

    async listReferences() {
      const payload = await readReferencesPayload();
      return payload.items
        .slice()
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    },

    async addReference({ name, dataUrl }) {
      const parsed = parseImageDataUrl(dataUrl);
      const payload = await readReferencesPayload();
      const contentHash = hashBuffer(parsed.buffer);
      let migrated = false;
      for (const item of payload.items) {
        if (item.contentHash === contentHash && item.contentType === parsed.contentType) {
          return item;
        }
        if (!item.contentHash && item.savedPath && resolveInside(referencesDir, item.savedPath)) {
          try {
            const existingBuffer = await fs.readFile(path.resolve(item.savedPath));
            const existingHash = hashBuffer(existingBuffer);
            if (existingHash === contentHash && item.contentType === parsed.contentType) {
              item.contentHash = existingHash;
              await writeReferencesPayload(payload);
              return item;
            }
            item.contentHash = existingHash;
            migrated = true;
          } catch (error) {
            if (error?.code !== 'ENOENT') {
              throw error;
            }
          }
        }
      }
      if (migrated) {
        await writeReferencesPayload(payload);
      }
      const id = createId('ref');
      const safeName = name && String(name).trim() ? String(name).trim() : `reference.${parsed.extension}`;
      const savedPath = path.join(referencesDir, `${id}.${parsed.extension}`);
      await fs.mkdir(referencesDir, { recursive: true });
      await fs.writeFile(savedPath, parsed.buffer);
      const item = {
        id,
        name: safeName,
        savedPath,
        imageUrl: this.buildImageUrl(savedPath),
        contentType: parsed.contentType,
        contentHash,
        createdAt: nowIso(),
        lastUsedAt: null
      };
      payload.items = [item, ...payload.items];
      await writeReferencesPayload(payload);
      return item;
    },

    async getReference(id) {
      const payload = await readReferencesPayload();
      return payload.items.find((item) => item.id === id) || null;
    },

    async touchReferences(ids) {
      if (!Array.isArray(ids) || ids.length === 0) {
        return [];
      }
      const idSet = new Set(ids);
      const timestamp = nowIso();
      const payload = await readReferencesPayload();
      let changed = false;
      const touched = [];
      payload.items = payload.items.map((item) => {
        if (!idSet.has(item.id)) {
          return item;
        }
        changed = true;
        const next = { ...item, lastUsedAt: timestamp };
        touched.push(next);
        return next;
      });
      if (changed) {
        await writeReferencesPayload(payload);
      }
      return touched;
    },

    async deleteReference(id) {
      const payload = await readReferencesPayload();
      const item = payload.items.find((entry) => entry.id === id) || null;
      if (!item) {
        return null;
      }
      payload.items = payload.items.filter((entry) => entry.id !== id);
      await writeReferencesPayload(payload);
      if (item.savedPath && resolveInside(referencesDir, item.savedPath) && getImageContentType(item.savedPath)) {
        await fs.unlink(path.resolve(item.savedPath)).catch((error) => {
          if (error?.code !== 'ENOENT') {
            throw error;
          }
        });
      }
      return item;
    },

    async getReferenceDataUrl(id) {
      const item = await this.getReference(id);
      if (!item || !this.isReadableImage(item.savedPath)) {
        return null;
      }
      const resolvedPath = path.resolve(item.savedPath);
      const stat = await fs.stat(resolvedPath);
      if (!stat.isFile() || stat.size > MAX_IMAGE_DATA_BYTES) {
        return null;
      }
      const contentType = getImageContentType(resolvedPath);
      const buffer = await fs.readFile(resolvedPath);
      return {
        id: item.id,
        filename: item.name || path.basename(resolvedPath),
        imageUrl: item.imageUrl || this.buildImageUrl(resolvedPath),
        dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`
      };
    }
  };
}

export const galleryStoreInternals = {
  getImageContentType,
  parseImageDataUrl,
  resolveInside,
  readJsonFile
};
