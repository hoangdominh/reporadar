import { copyFile, mkdir, mkdtemp, rename, rm, lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ROOT, PUBLIC_FILES, readJSON } from './files.mjs';
import { validateConfig, validateDataset } from '../shared/data.js';
import { validateEditorial } from '../shared/editorial.js';

export async function build(root = ROOT) {
  const sourceRoot = await realpath(root);
  for (const file of PUBLIC_FILES) {
    const source = new URL(file, root);
    if (!(await lstat(source)).isFile() || !(await realpath(source)).startsWith(sourceRoot + sep)) throw new Error(`Only regular public files inside the project may be built: ${file}`);
  }
  validateConfig(await readJSON(new URL('config/topics.json', root)));
  validateDataset(await readJSON(new URL('data/repositories.json', root)));
  validateEditorial(await readJSON(new URL('data/editorial.json', root)));
  const destination = new URL('dist/', root);
  let exists = false;
  try {
    const info = await lstat(destination);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('dist must be an owned directory');
    if (await readFile(new URL('.reporadar-build', destination), 'utf8') !== 'RepoRadar static build\n') throw new Error('Unrecognized dist directory');
    exists = true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; else if (await lstat(destination).catch(() => null)) throw new Error('Refusing to replace an unowned dist directory'); }
  const stage = await mkdtemp(new URL('.dist-stage-', root));
  const backup = new URL(`.dist-backup-${randomUUID()}/`, root);
  let moved = false;
  try {
    for (const file of PUBLIC_FILES) {
      const source = new URL(file, root);
      if (!(await lstat(source)).isFile()) throw new Error(`Only regular public files may be built: ${file}`);
      const target = join(stage, file);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    }
    // Validate the copied snapshot too: a concurrent local refresh must not let
    // validation of one source version stand in for another published artifact.
    validateConfig(JSON.parse(await readFile(join(stage, 'config/topics.json'), 'utf8')));
    validateDataset(JSON.parse(await readFile(join(stage, 'data/repositories.json'), 'utf8')));
    validateEditorial(JSON.parse(await readFile(join(stage, 'data/editorial.json'), 'utf8')));
    await writeFile(join(stage, '.nojekyll'), '');
    await writeFile(join(stage, '.reporadar-build'), 'RepoRadar static build\n');
    if (exists) { await rename(destination, backup); moved = true; }
    try { await rename(stage, destination); }
    catch (error) { if (moved) { await rename(backup, destination); moved = false; } throw error; }
    if (moved) await rm(backup, { recursive: true });
    return PUBLIC_FILES;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(`Build OK: ${(await build()).length} public files + .nojekyll and ownership marker → dist/. No dependencies or remote operations.`); }
  catch (error) { console.error(`Build stopped: ${error.message}`); process.exitCode = 1; }
}
