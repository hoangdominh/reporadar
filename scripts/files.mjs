import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const ROOT = new URL('../', import.meta.url);
export const PUBLIC_FILES = ['index.html', 'assets/app.js', 'assets/state.js', 'shared/data.js', 'shared/editorial.js', 'config/topics.json', 'data/repositories.json', 'data/editorial.json'];
export const readJSON = async url => JSON.parse(await readFile(url, 'utf8'));

export async function sourceFiles() {
  const files = ['index.html', 'package.json', 'README.md', '.gitignore'];
  async function walk(relative) {
    for (const entry of await readdir(new URL(`${relative}/`, ROOT), { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Unexpected source symlink: ${path}`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && !entry.name.endsWith('.tmp') && entry.name !== '.refresh.lock') files.push(path);
    }
  }
  for (const directory of ['assets', 'shared', 'config', 'data', 'scripts', 'tests', '.github/workflows']) await walk(directory);
  return files.sort();
}

export const absolute = relative => fileURLToPath(new URL(relative, ROOT));
