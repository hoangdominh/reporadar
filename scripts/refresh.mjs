import { readFile, open, rename, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { validateDataset } from '../shared/data.js';
import { collect, createSearchClient } from './collector.mjs';

export async function atomicWrite(file, data) {
  validateDataset(data);
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, file);
  } finally {
    await handle?.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function refresh({ root = new URL('../', import.meta.url), client = createSearchClient({ token: process.env.GITHUB_TOKEN ?? '' }), timestamp } = {}) {
  const lock = new URL('data/.refresh.lock', root);
  // Exclusive local lock: concurrent refreshes fail rather than overwrite a newer snapshot.
  const handle = await open(lock, 'wx', 0o600);
  try {
    const config = JSON.parse(await readFile(new URL('config/topics.json', root), 'utf8'));
    const file = new URL('data/repositories.json', root);
    const previous = JSON.parse(await readFile(file, 'utf8'));
    const result = await collect(config, previous, { client, timestamp });
    if (result.changed) await atomicWrite(fileURLToPath(file), result.data);
    return result;
  } finally {
    await handle.close();
    await unlink(lock);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const started = Date.now();
  try {
    const result = await refresh();
    console.log(JSON.stringify({ outcome: result.outcome, elapsed_ms: Date.now() - started, topics: result.reports }, null, 2));
    process.exitCode = result.outcome === 'failed' ? 1 : result.outcome === 'partial' ? 2 : 0;
  } catch {
    console.error('Refresh stopped: check local config, dataset and refresh lock. Existing data was not replaced unless atomic publication completed.');
    process.exitCode = 1;
  }
}
