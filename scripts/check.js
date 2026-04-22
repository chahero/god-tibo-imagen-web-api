import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL('..', import.meta.url).pathname);
const targets = ['src', 'tests', 'scripts'];

async function collectJavaScriptFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJavaScriptFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = [];
for (const target of targets) {
  files.push(...(await collectJavaScriptFiles(path.join(root, target))));
}

for (const file of files) {
  await execFileAsync(process.execPath, ['--check', file]);
}

console.log(`Syntax check passed for ${files.length} files.`);
