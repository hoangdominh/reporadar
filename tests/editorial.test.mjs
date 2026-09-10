import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { validateEditorial } from '../shared/editorial.js';
import { filterRepos } from '../assets/state.js';
import { cardHTML, detailHTML, mount } from '../assets/app.js';
import { refresh } from '../scripts/refresh.mjs';
import { config, NOW, snapshot, temporaryRoot, fakeClient, rawRepo } from './fixtures.mjs';
import { domStub } from './dom-stub.mjs';

const profile = () => ({
  full_name: 'fixture/old-name', overview: 'Mô tả tiếng Việt <script> & "test"',
  capabilities: ['Khả năng thử nghiệm'], use_cases: ['Tình huống ngoại tuyến'], requirements: ['Yêu cầu giả lập'],
  sources: [{ title: '<Nguồn thử nghiệm>', url: 'https://example.com/docs?q="test"' }],
  reviewed_at: NOW, provenance: 'ai-assisted-source-review',
});
const editorial = () => ({ schema_version: 1, repositories: { 1: profile(), 999: profile() } });

test('editorial schema permits empty store and retained/renamed IDs, rejects malformed content', () => {
  assert.ok(validateEditorial({ schema_version: 1, repositories: {} }));
  assert.ok(validateEditorial(editorial()));
  for (const id of ['0', '-1', '01', '1.5', '9007199254740992', '__proto__']) {
    assert.throws(() => validateEditorial({ schema_version: 1, repositories: { [id]: profile() } }));
  }
  for (const change of [
    { overview: '' }, { overview: 'x'.repeat(3001) }, { full_name: 'bad' },
    { capabilities: [''] }, { use_cases: 'text' }, { requirements: Array(21).fill('x') },
    { requirements: ['x'.repeat(1501)] }, { reviewed_at: '2026-02-30T00:00:00Z' },
    { reviewed_at: '2026-01-01T00:00:00+07:00' }, { provenance: 'manual' },
    { sources: [] }, { sources: [null] }, { sources: [{ title: '', url: 'https://example.com' }] },
    ...['javascript:alert(1)', 'data:text/html,test', '//example.com', 'https://user:pass@example.com'].map(url => ({ sources: [{ title: 'test', url }] })),
  ]) assert.throws(() => validateEditorial({ schema_version: 1, repositories: { 1: { ...profile(), ...change } } }));
  for (const data of [null, [], {}, { schema_version: 2, repositories: {} }, { schema_version: 1, repositories: [] }]) assert.throws(() => validateEditorial(data));
});

test('editorial search covers each Vietnamese section without changing metadata or membership', () => {
  const data = snapshot();
  const before = structuredClone(data);
  for (const query of ['TIẾNG VIỆT', 'khả năng', 'tình huống', 'yêu cầu']) {
    assert.deepEqual(filterRepos(Object.values(data.repositories), { query }, editorial().repositories).map(repo => repo.id), [1]);
  }
  assert.deepEqual(data, before);
});

test('editorial render prioritizes purpose and lists, attributes sources and escapes all supplied text', () => {
  const repo = snapshot().repositories[1];
  const card = cardHTML(repo, 'agent-skills', 1, profile());
  assert.match(card, /Biên soạn tiếng Việt/);
  assert.doesNotMatch(card, /Offline test metadata|<script>/);
  const detail = detailHTML(repo, profile());
  assert.ok(detail.indexOf('Repo này dùng') < detail.indexOf('Khả năng cụ thể'));
  assert.ok(detail.indexOf('Yêu cầu và lưu ý') < detail.indexOf('<h3>Metadata'));
  for (const text of ['AI hỗ trợ biên soạn một lần', 'không tự động cập nhật', 'không phải kiểm chứng độc lập', 'Mô tả gốc từ GitHub', 'Offline test metadata', 'UTC+7', 'fixture/old-name', '&lt;Nguồn thử nghiệm&gt;', '&lt;script&gt;']) assert.ok(detail.includes(text), text);
  assert.doesNotMatch(detail, /<script>|<Nguồn/);
  assert.doesNotMatch(detailHTML(repo, { ...profile(), capabilities: [], use_cases: [], requirements: [], sources: [{ title: 'unsafe', url: 'javascript:alert(1)' }] }), /Khả năng cụ thể|Trường hợp sử dụng|Yêu cầu và lưu ý|href="javascript:/);
});

test('DOM: third optional fetch enriches deep-linked details and search with project-base URLs', async () => {
  const stub = domStub('#/topic/agent-skills/repo/1');
  const urls = [];
  await mount(stub.document, stub.window, async url => {
    urls.push(url.href);
    return Response.json(url.pathname.endsWith('editorial.json') ? editorial() : url.pathname.endsWith('topics.json') ? config : snapshot());
  }).ready;
  assert.equal(urls.length, 3);
  assert.ok(urls.every(url => url.startsWith('http://127.0.0.1:4173/reporadar/')));
  assert.match(stub.el('detail-body').innerHTML, /Biên soạn tiếng Việt/);
  assert.equal(stub.el('editorial-notice').textContent, '');
  stub.el('search').value = 'tình huống';
  stub.el('search').emit('input');
  assert.equal(stub.el('result-count').textContent, 'Đang hiển thị 1/2 repo');
});

test('DOM: optional missing, network, JSON and schema failures leave metadata usable with notice', async () => {
  for (const failure of [() => new Response('', { status: 404 }), () => { throw new Error('offline'); }, () => new Response('{'), () => Response.json({ schema_version: 9 })]) {
    const stub = domStub();
    await mount(stub.document, stub.window, async url => url.pathname.endsWith('editorial.json') ? failure() : Response.json(url.pathname.endsWith('topics.json') ? config : snapshot())).ready;
    assert.match(stub.el('repositories').innerHTML, /Offline test metadata/);
    assert.match(stub.el('editorial-notice').textContent, /Không tải được phần biên soạn/);
    assert.doesNotMatch(stub.el('repositories').innerHTML, /Không tải được dữ liệu/);
  }
});

test('DOM: slow optional load does not delay metadata rendering', async () => {
  const stub = domStub();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const app = mount(stub.document, stub.window, async url => url.pathname.endsWith('editorial.json') ? pending : Response.json(url.pathname.endsWith('topics.json') ? config : snapshot()));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(stub.el('repositories').innerHTML, /Offline test metadata/);
  assert.equal(stub.el('repositories').attributes['aria-busy'], 'false');
  release(Response.json(editorial()));
  await app.ready;
});

for (const [label, response] of [
  ['success', () => Response.json(editorial())],
  ['empty success', () => Response.json({ schema_version: 1, repositories: {} })],
  ['failure', () => new Response('', { status: 404 })],
]) {
  test(`DOM: delayed editorial ${label} preserves modal opener, filters, scroll and history`, async () => {
    for (const linkIndex of [0, 1]) {
      const stub = domStub();
      let release;
      const pending = new Promise(resolve => { release = resolve; });
      const app = mount(stub.document, stub.window, async url => url.pathname.endsWith('editorial.json') ? pending : Response.json(url.pathname.endsWith('topics.json') ? config : snapshot()));
      await new Promise(resolve => setImmediate(resolve));
      stub.el('search').value = 'repo-1';
      stub.el('language').value = 'JavaScript';
      stub.el('sort').value = 'name';
      stub.el('search').emit('input');
      stub.window.scrollY = 321;
      const links = () => stub.el('repositories').children.filter(child => child.isDetail);
      const original = links()[linkIndex];
      stub.el('repositories').emit('click', { target: original, button: 0 });
      release(response());
      await app.ready;
      const replacement = links()[linkIndex];
      assert.notEqual(replacement, original);
      assert.equal(original.isConnected, false);
      assert.equal(replacement.getAttribute('href'), original.getAttribute('href'));
      assert.equal(stub.el('detail').open, true);
      assert.equal(stub.document.activeElement, stub.el('close-detail'));
      const assertState = () => {
        assert.equal(stub.el('search').value, 'repo-1');
        assert.equal(stub.el('language').value, 'JavaScript');
        assert.equal(stub.el('sort').value, 'name');
        assert.equal(stub.el('result-count').textContent, 'Đang hiển thị 1/2 repo');
        assert.equal(stub.window.scrollY, 321);
      };
      assertState();
      stub.window.history.back();
      assert.equal(stub.el('detail').open, false);
      assert.equal(stub.document.activeElement, replacement);
      assertState();
      stub.window.history.forward();
      assert.equal(stub.el('detail').open, true);
      assert.equal(stub.document.activeElement, stub.el('close-detail'));
      stub.el('detail').emit('cancel');
      assert.equal(stub.el('detail').open, false);
      assert.equal(stub.document.activeElement, replacement);
      assertState();
    }
  });
}

test('DOM: removed modal opener falls back to topic heading without focusing background early', async () => {
  const stub = domStub();
  await mount(stub.document, stub.window, async url => Response.json(url.pathname.endsWith('editorial.json') ? editorial() : url.pathname.endsWith('topics.json') ? config : snapshot())).ready;
  const link = stub.el('repositories').children.find(child => child.isDetail);
  stub.el('repositories').emit('click', { target: link, button: 0 });
  // Simulate a list update that genuinely removes the opener's repository.
  stub.el('search').value = 'no-match';
  stub.el('search').emit('input');
  assert.equal(stub.document.activeElement, stub.el('close-detail'));
  stub.window.history.back();
  assert.equal(stub.document.activeElement, stub.el('topic-title'));
});

test('offline metadata refresh preserves editorial bytes through success and full failure', async t => {
  const root = await temporaryRoot(t, snapshot());
  const file = new URL('data/editorial.json', root);
  const bytes = JSON.stringify(editorial(), null, 2) + '\n';
  await writeFile(file, bytes);
  const success = await refresh({ root, client: fakeClient(() => [rawRepo(3)]), timestamp: NOW });
  assert.equal(success.changed, true);
  assert.equal(await readFile(file, 'utf8'), bytes);
  await refresh({ root, client: fakeClient(() => { throw new Error('offline'); }), timestamp: NOW });
  assert.equal(await readFile(file, 'utf8'), bytes);
});
