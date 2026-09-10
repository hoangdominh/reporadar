import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterRepos, parseRoute, detailHash, escapeHTML, formatTime, isStale, trapFocus, restoreFocus } from '../assets/state.js';
import { cardHTML, detailHTML, mount } from '../assets/app.js';
import { normalizeRepo } from '../scripts/collector.mjs';
import { emptyDataset } from '../shared/data.js';
import { config, NOW, rawRepo, snapshot } from './fixtures.mjs';
import { domStub } from './dom-stub.mjs';

const fetchData = (data = snapshot()) => async url => new Response(JSON.stringify(url.pathname.endsWith('topics.json') ? config : url.pathname.endsWith('editorial.json') ? { schema_version: 1, repositories: {} } : data));

test('frontend filters only selected membership, raw metadata and language; sort never mutates source', () => {
  const repos = [normalizeRepo(rawRepo(2, { language: null, description: null, topics: ['find-me'] }), NOW), normalizeRepo(rawRepo(1, { stargazers_count: 300 }), NOW)];
  assert.deepEqual(filterRepos(repos).map(repo => repo.id), [2, 1]);
  assert.deepEqual(filterRepos(repos, { query: '  FIND-ME  ' }).map(repo => repo.id), [2]);
  assert.deepEqual(filterRepos(repos, { language: 'unknown' }).map(repo => repo.id), [2]);
  assert.deepEqual(filterRepos(repos, { sort: 'stars' }).map(repo => repo.id), [1, 2]);
  assert.deepEqual(filterRepos(repos, { sort: 'name' }).map(repo => repo.id), [1, 2]);
  assert.deepEqual(filterRepos(repos, { query: 'no-match' }), []);
  assert.deepEqual(repos.map(repo => repo.id), [2, 1]);
});

test('hash routes validate topic and stable ID, tolerate default and missing repository', () => {
  assert.deepEqual(parseRoute(detailHash('mcp-servers', 123)), { topic: 'mcp-servers', repoId: 123, invalid: false });
  for (const hash of ['#/topic/nope', '#/topic/devops/repo/-1', '#/topic/devops/repo/1<script>', '#/topic/devops/repo/999999999999999999999']) assert.equal(parseRoute(hash).invalid, true);
  assert.equal(parseRoute('').topic, 'agent-skills');
  assert.equal(parseRoute('#content').invalid, false);
});

test('rendered metadata is escaped with distinct detail/GitHub actions and safe fallback copy', () => {
  const repo = normalizeRepo(rawRepo(1, { description: '<img src=x onerror="alert(1)"> & text', topics: ['<script>'], homepage: 'javascript:alert(1)', license: null, language: null }), NOW);
  const card = cardHTML(repo, 'agent-skills', 1);
  assert.match(card, /&lt;img/);
  assert.doesNotMatch(card, /<img|<script>/);
  assert.match(card, /href="#\/topic\/agent-skills\/repo\/1"/);
  assert.match(card, /href="https:\/\/github.com\/fixture\/repo-1"/);
  assert.match(card, /noopener noreferrer/);
  const detail = detailHTML(repo);
  assert.doesNotMatch(detail, /href="javascript:|Homepage do chủ repo/);
  assert.match(detail, /GitHub chưa nhận diện license/);
  assert.match(detail, /Chưa có phần giới thiệu công năng bổ sung/);
  assert.match(detailHTML({ ...repo, description: null }), /Chủ repo chưa cung cấp mô tả/);
  assert.match(detailHTML(undefined), /Repo không còn trong danh sách/);
  assert.equal(escapeHTML('"<>&\''), '&quot;&lt;&gt;&amp;&#39;');
});

test('freshness uses UTC age and explicit Vietnam timezone including midnight rollover', () => {
  assert.match(formatTime(NOW), /11 thg 9, 2026|11\/9\/2026|11 thg 9 2026/);
  assert.match(formatTime(NOW), /00:00.*UTC\+7/);
  assert.equal(formatTime(null), 'Chưa có dữ liệu');
  assert.equal(isStale(NOW, Date.parse(NOW) + 48 * 3600_000), false);
  assert.equal(isStale(NOW, Date.parse(NOW) + 48 * 3600_000 + 1), true);
  assert.equal(isStale(null), false);
});

test('DOM stub: focus wraps forward/backward and detached opener falls back', () => {
  const { document, el } = domStub();
  const first = el('close-detail');
  const last = el('theme');
  const dialog = { querySelectorAll: () => [first, last] };
  let prevented = 0;
  last.focus();
  trapFocus({ key: 'Tab', shiftKey: false, preventDefault: () => prevented++ }, dialog, document);
  assert.equal(document.activeElement, first);
  trapFocus({ key: 'Tab', shiftKey: true, preventDefault: () => prevented++ }, dialog, document);
  assert.equal(document.activeElement, last);
  assert.equal(prevented, 2);
  first.isConnected = false;
  restoreFocus(first, last);
  assert.equal(document.activeElement, last);
});

test('DOM stub: empty production state renders six menus and pending Trending without sample data', async () => {
  const stub = domStub();
  await mount(stub.document, stub.window, fetchData(emptyDataset())).ready;
  assert.equal((stub.el('topics').innerHTML.match(/class="nav-link"/g) ?? []).length, 6);
  assert.match(stub.el('repositories').innerHTML, /Chưa có dữ liệu lần đầu/);
  assert.equal(stub.el('result-count').textContent, 'Đang hiển thị 0/0 repo');
  stub.go('#/topic/trending');
  assert.match(stub.el('repositories').innerHTML, /Chờ định nghĩa Trending/);
  assert.doesNotMatch(stub.el('repositories').innerHTML, /fixture|90 ngày/);
});

test('DOM stub: filters, details, Escape/cancel, focus, scroll, Back and Forward lifecycle', async () => {
  const stub = domStub();
  await mount(stub.document, stub.window, fetchData()).ready;
  stub.el('search').value = 'repo-2';
  stub.el('search').emit('input');
  assert.equal(stub.el('result-count').textContent, 'Đang hiển thị 1/2 repo');
  stub.window.scrollY = 321;
  const link = stub.el('repositories').children.find(child => child.isDetail);
  stub.el('repositories').emit('click', { target: link, button: 0 });
  assert.equal(stub.el('detail').open, true);
  assert.equal(stub.document.activeElement, stub.el('close-detail'));
  assert.equal(stub.window.location.hash, '#/topic/agent-skills/repo/2');
  stub.el('detail').emit('cancel');
  assert.equal(stub.el('detail').open, false);
  assert.equal(stub.document.activeElement, link);
  assert.equal(stub.window.scrollY, 321);
  assert.equal(stub.el('search').value, 'repo-2');
  stub.window.history.forward();
  assert.equal(stub.el('detail').open, true);
  stub.window.history.back();
  assert.equal(stub.el('detail').open, false);
  stub.go('#/topic/devops');
  stub.go('#/topic/agent-skills');
  assert.equal(stub.el('search').value, 'repo-2');
  assert.equal(stub.window.scrollY, 321);
});

test('DOM stub: deep-link load seeds Back-to-topic and missing repo has explicit panel message', async () => {
  const stub = domStub('#/topic/agent-skills/repo/999');
  const urls = [];
  const fetchImpl = async url => { urls.push(url.href); return fetchData()(url); };
  await mount(stub.document, stub.window, fetchImpl).ready;
  assert.equal(stub.el('detail').open, true);
  assert.match(stub.el('detail-body').innerHTML, /Repo không còn trong danh sách/);
  assert.equal(urls.every(url => url.startsWith('http://127.0.0.1:4173/reporadar/')), true);
  stub.window.history.back();
  assert.equal(stub.window.location.hash, '#/topic/agent-skills');
  assert.equal(stub.el('detail').open, false);
});

test('DOM stub: load/validation errors are distinct from empty state and retry succeeds', async () => {
  const stub = domStub();
  let fail = true;
  await mount(stub.document, stub.window, async url => fail ? new Response('{}') : fetchData(emptyDataset())(url)).ready;
  assert.match(stub.el('repositories').innerHTML, /Không tải được dữ liệu/);
  assert.equal(stub.el('repositories').attributes['aria-busy'], 'false');
  assert.ok(stub.el('retry'));
  fail = false;
  stub.el('retry').emit('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(stub.el('repositories').innerHTML, /Chưa có dữ liệu lần đầu/);
});

test('DOM stub: skip-link initial hash still loads topic; theme works with storage denied', async () => {
  const stub = domStub('#content');
  stub.window.localStorage.setItem = () => { throw new Error('denied'); };
  await mount(stub.document, stub.window, fetchData()).ready;
  assert.match(stub.el('repositories').innerHTML, /fixture/);
  assert.equal(stub.window.location.hash, '#/topic/agent-skills');
  stub.el('theme').emit('click');
  assert.equal(stub.el('theme').attributes['aria-pressed'], 'false');
});

test('DOM stub: Back from details opened after a skip link closes without losing the current topic', async () => {
  const stub = domStub();
  await mount(stub.document, stub.window, fetchData()).ready;
  assert.equal(stub.skip(), true);
  assert.equal(stub.window.location.hash, '#/topic/agent-skills');
  const link = stub.el('repositories').children.find(child => child.isDetail);
  stub.el('repositories').emit('click', { target: link, button: 0 });
  assert.equal(stub.el('detail').open, true);
  stub.window.history.back();
  assert.equal(stub.el('detail').open, false);
  assert.equal(stub.el('topic-title').textContent, 'Agent Skills');
  assert.equal(stub.window.location.hash, '#/topic/agent-skills');
  assert.equal(stub.document.activeElement, link);
  stub.window.history.forward();
  assert.equal(stub.el('detail').open, true);
  stub.el('detail').emit('cancel');
  assert.equal(stub.el('detail').open, false);
  assert.equal(stub.window.location.hash, '#/topic/agent-skills');
});

test('skip target markup supports programmatic focus without adding a tab stop', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<a\b[^>]*id="skip-link"[^>]*href="#content"/);
  assert.match(html, /<main\b[^>]*id="content"[^>]*tabindex="-1"/);
});

test('DOM stub: skip activation requests focus/scroll without changing cross-topic Back and Forward', async () => {
  const stub = domStub();
  await mount(stub.document, stub.window, fetchData()).ready;
  stub.el('search').value = 'repo-2';
  stub.el('search').emit('input');
  stub.el('skip-link').focus();
  assert.equal(stub.skip(), true);
  assert.equal(stub.document.activeElement, stub.el('content'));
  assert.deepEqual(stub.el('content').scrollIntoViewOptions, { block: 'start' });
  assert.equal(stub.window.location.hash, '#/topic/agent-skills');
  stub.go('#/topic/devops');
  assert.equal(stub.skip(), true);
  assert.equal(stub.window.location.hash, '#/topic/devops');
  stub.window.history.back();
  assert.equal(stub.window.location.hash, '#/topic/agent-skills');
  assert.equal(stub.el('topic-title').textContent, 'Agent Skills');
  assert.equal(stub.el('search').value, 'repo-2');
  stub.window.history.forward();
  assert.equal(stub.window.location.hash, '#/topic/devops');
  assert.equal(stub.el('topic-title').textContent, 'DevOps');
});
