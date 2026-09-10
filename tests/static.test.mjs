import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, copyFile, readFile, writeFile, readdir, symlink, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { build } from '../scripts/build.mjs';
import { createPreview } from '../scripts/preview.mjs';
import { PUBLIC_FILES, ROOT } from '../scripts/files.mjs';
import { temporaryRoot } from './fixtures.mjs';

async function sourceRoot(t) {
  const root = await temporaryRoot(t);
  await writeFile(new URL('data/editorial.json', root), JSON.stringify({ schema_version: 1, repositories: {} }));
  for (const file of PUBLIC_FILES.filter(file => !file.endsWith('.json'))) {
    await mkdir(dirname(fileURLToPath(new URL(file, root))), { recursive: true });
    await copyFile(new URL(file, ROOT), new URL(file, root));
  }
  return root;
}

test('build publishes exactly the static allowlist and no fixture, credentials, source scripts or docs', async t => {
  const root = await sourceRoot(t);
  await writeFile(new URL('.env', root), 'PRIVATE_TEST_VALUE');
  assert.deepEqual(await build(root), PUBLIC_FILES);
  assert.deepEqual((await readdir(new URL('dist/', root))).sort(), ['.nojekyll', '.reporadar-build', 'assets', 'config', 'data', 'index.html', 'shared']);
  for (const file of PUBLIC_FILES) assert.equal(await readFile(new URL(`dist/${file}`, root), 'utf8'), await readFile(new URL(file, root), 'utf8'));
  const html = await readFile(new URL('dist/index.html', root), 'utf8');
  assert.match(html, /src="\.\/assets\/app.js"/);
  const favicon = html.match(/<link rel="icon" type="image\/svg\+xml" sizes="any" href="(data:image\/svg\+xml,[^"]+)"/);
  assert.ok(favicon, 'Build must include the self-contained radar favicon');
  const svg = decodeURIComponent(favicon[1].split(',')[1]);
  assert.match(svg, /viewBox='0 0 32 32'/);
  assert.match(svg, /<circle/);
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|\son\w+=/i);
  assert.doesNotMatch(html, /const repos\s*=|repo mẫu|Ngày thêm mẫu/);
  await build(root);
  assert.equal((await readdir(root)).some(file => file.startsWith('.dist-')), false);
});

test('invalid dataset fails before replacing a valid build', async t => {
  const root = await sourceRoot(t);
  await build(root);
  const before = await readFile(new URL('dist/data/repositories.json', root), 'utf8');
  await writeFile(new URL('data/repositories.json', root), '{"schema_version":999}');
  await assert.rejects(build(root));
  assert.equal(await readFile(new URL('dist/data/repositories.json', root), 'utf8'), before);
});

test('invalid editorial fails build without replacing published editorial or metadata', async t => {
  const root = await sourceRoot(t);
  assert.ok(PUBLIC_FILES.includes('data/editorial.json'));
  assert.ok(PUBLIC_FILES.includes('shared/editorial.js'));
  await build(root);
  const before = await readFile(new URL('dist/data/editorial.json', root), 'utf8');
  await writeFile(new URL('data/editorial.json', root), '{"schema_version":999}');
  await assert.rejects(build(root), /Invalid editorial/);
  assert.equal(await readFile(new URL('dist/data/editorial.json', root), 'utf8'), before);
});

test('build refuses unowned dist directories and public source symlinks', async t => {
  const root = await sourceRoot(t);
  await mkdir(new URL('dist/', root));
  await writeFile(new URL('dist/user-file.txt', root), 'preserve');
  await assert.rejects(build(root), /unowned/);
  assert.equal(await readFile(new URL('dist/user-file.txt', root), 'utf8'), 'preserve');
  await rm(new URL('dist/', root), { recursive: true });
  await rm(new URL('assets/app.js', root));
  await symlink(fileURLToPath(new URL('index.html', root)), new URL('assets/app.js', root));
  await assert.rejects(build(root), /regular public files/);
});

function get(server, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('preview serves project-base-path assets, supports HEAD, blocks secrets/traversal and non-GET', async t => {
  const root = await sourceRoot(t);
  const server = await createPreview({ root, base: '/reporadar/' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const page = await get(server, '/reporadar/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /img-src 'self' data:;/);
  assert.match(page.body, /rel="icon"/);
  const script = await get(server, '/reporadar/assets/app.js');
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /javascript/);
  assert.equal(script.headers['x-content-type-options'], 'nosniff');
  assert.equal((await get(server, '/reporadar/data/repositories.json?cache=1')).status, 200);
  assert.equal((await get(server, '/reporadar/data/editorial.json')).status, 200);
  assert.equal((await get(server, '/reporadar/shared/editorial.js')).status, 200);
  assert.equal((await get(server, '/reporadar/', 'HEAD')).body, '');
  for (const path of ['/reporadar/.env', '/reporadar/.git/config', '/reporadar/scripts/refresh.mjs', '/reporadar/../InterviewRepo.md', '/reporadar/%2e%2e/.env', '/reporadar/assets%5capp.js', '/reporadar/%00', '/reporadar/%FF', '/', '/reporadar/tests/fixtures.mjs']) assert.equal((await get(server, path)).status, 404, path);
  assert.equal((await get(server, '/reporadar/', 'POST')).status, 405);
});

test('preview blocks escaping symlinks even for an allowlisted filename', async t => {
  const root = await sourceRoot(t);
  const other = await temporaryRoot(t);
  await rm(new URL('assets/app.js', root));
  await symlink(fileURLToPath(new URL('data/repositories.json', other)), new URL('assets/app.js', root));
  const server = await createPreview({ root });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal((await get(server, '/assets/app.js')).status, 404);
  await rm(new URL('assets/app.js', root));
  await writeFile(new URL('private.json', root), '{"private":"not-public"}');
  await symlink(fileURLToPath(new URL('private.json', root)), new URL('assets/app.js', root));
  assert.equal((await get(server, '/assets/app.js')).status, 404);
});

test('deployment draft is inert and contains only desired triggers with no invented SHA pins', async () => {
  const files = await readdir(new URL('.github/workflows/', ROOT));
  assert.equal(files.some(file => /\.ya?ml$/.test(file)), false);
  const draft = await readFile(new URL('.github/workflows/refresh.yml.disabled', ROOT), 'utf8');
  assert.match(draft, /cron: '0 17 \* \* \*'/);
  assert.match(draft, /workflow_dispatch:/);
  assert.doesNotMatch(draft, /pull_request:|\n  push:/);
  assert.match(draft, /cancel-in-progress: false/);
  assert.match(draft, /Pending trusted SHA verification/);
});
