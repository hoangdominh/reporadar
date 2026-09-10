import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { sourceFiles, ROOT, absolute, readJSON } from './files.mjs';
import { validateConfig, validateDataset } from '../shared/data.js';
import { validateEditorial } from '../shared/editorial.js';

let count = 0;
for (const file of await sourceFiles()) {
  if (/\.m?js$/.test(file)) {
    const result = spawnSync(process.execPath, ['--check', absolute(file)], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(1);
    count++;
  }
  if (file.endsWith('.json')) await readJSON(new URL(file, ROOT));
}
const html = await readFile(new URL('index.html', ROOT), 'utf8');
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (!match[1].trim()) continue;
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: match[1], stdio: ['pipe', 'inherit', 'inherit'] });
  if (result.status !== 0) process.exit(1);
  count++;
}
validateConfig(await readJSON(new URL('config/topics.json', ROOT)));
validateDataset(await readJSON(new URL('data/repositories.json', ROOT)));
validateEditorial(await readJSON(new URL('data/editorial.json', ROOT)));
console.log(`Syntax OK: ${count} JavaScript sources (including inline script); JSON and production schema valid. No TypeScript is used.`);
