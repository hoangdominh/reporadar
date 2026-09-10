import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { emptyDataset, validateConfig, validateDataset, compareRepos, safeURL } from '../shared/data.js';
import { collect, createSearchClient, queryFor, normalizeRepo, eligible, CollectionError } from '../scripts/collector.mjs';
import { atomicWrite, refresh } from '../scripts/refresh.mjs';
import { config, NOW, OLD, rawRepo, snapshot, response, fakeClient, temporaryRoot } from './fixtures.mjs';

test('config has six explicit bounded metadata-only topics; Trending never collects', () => {
  assert.equal(validateConfig(config), config);
  assert.equal(config.reduce((sum, topic) => sum + topic.queries.length, 0), 14);
  for (const topic of config) for (const query of topic.queries) {
    assert.match(queryFor(topic, query), /is:public archived:false fork:false stars:>=\d+$/);
    assert.doesNotMatch(query, /readme/i);
  }
  const bad = structuredClone(config);
  bad[0].queries = ['skills in:readme'];
  assert.throws(() => validateConfig(bad));
  bad[0].queries = ['topic:agent-skills'];
  bad[5].queries = ['topic:trending'];
  assert.throws(() => validateConfig(bad));
});

test('per-topic public/archive/fork/star/exclusion policy', () => {
  const topic = { ...config[0], minStars: 50, exclude: ['fixture/repo-2', '3'], excludeKeywords: ['tutorial'] };
  assert.equal(eligible(rawRepo(), topic), true);
  for (const changes of [{ private: true }, { visibility: 'internal' }, { archived: true }, { fork: true }, { stargazers_count: 49 }, { description: 'Tutorial for skills' }, { topics: ['tutorial'] }]) assert.equal(eligible(rawRepo(1, changes), topic), false);
  assert.equal(eligible(rawRepo(2), topic), false);
  assert.equal(eligible(rawRepo(3), topic), false);
  assert.equal(eligible(rawRepo(1, { fork: true, archived: true }), { ...topic, allowForks: true, allowArchived: true }), true);
});

test('ranking handles stars, push ties, absent push, stable numeric IDs', () => {
  const repos = [rawRepo(9, { pushed_at: null }), rawRepo(3), rawRepo(2), rawRepo(4, { pushed_at: '2026-09-09T00:00:00Z' }), rawRepo(10, { stargazers_count: 101 })].map(repo => normalizeRepo(repo, NOW));
  assert.deepEqual(repos.sort(compareRepos).map(repo => repo.id), [10, 4, 2, 3, 9]);
});

test('normalization preserves description, missing metadata, rename identity and URL safety', () => {
  const raw = rawRepo(4, { full_name: 'new-owner/renamed', html_url: 'https://github.com/new-owner/renamed', description: '<script>untrusted</script>', homepage: 'javascript:alert(1)', license: null, language: null, pushed_at: null });
  const repo = normalizeRepo(raw, NOW);
  assert.equal(repo.id, 4);
  assert.equal(repo.description, raw.description);
  assert.equal(repo.homepage, null);
  assert.equal(repo.license, null);
  assert.equal(repo.pushed_at, null);
  for (const url of ['data:text/html,test', '//evil.example', 'https://user:pass@example.com', 'not a url']) assert.equal(safeURL(url), null);
  assert.equal(safeURL('http://example.com'), 'http://example.com/');
  for (const url of ['https://github.com.evil/a/b', 'http://github.com/a/b', 'https://github.com/a/b?redirect=bad']) assert.equal(safeURL(url, true), null);
  assert.throws(() => normalizeRepo(rawRepo(1, { private: undefined }), NOW));
  assert.throws(() => normalizeRepo(rawRepo(1, { html_url: 'https://example.com/a/b' }), NOW));
});

test('independent queries union and dedup by ID, rank top ten, allow cross-topic membership', async () => {
  const client = fakeClient((topic, query) => query === topic.queries[0] ? Array.from({ length: 12 }, (_, index) => rawRepo(index + 1)) : [rawRepo(1), rawRepo(20, { stargazers_count: 1000 })]);
  const result = await collect(config, emptyDataset(), { client, timestamp: NOW });
  assert.equal(result.outcome, 'success');
  assert.equal(client.stats.requests, 14);
  for (const topic of config.slice(0, 5)) {
    assert.deepEqual(result.data.topics[topic.id].ids, [20, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
  assert.equal(Object.keys(result.data.repositories).length, 10);
  assert.equal(result.data.topics.trending.status, 'pending');
  assert.equal(result.data.topics.trending.last_attempt_at, null);
  const again = await collect(config, result.data, { client, timestamp: NOW });
  assert.deepEqual(again.data, result.data);
});

test('partial failure preserves old selection, required metadata and last success; shared metadata updates', async () => {
  const previous = snapshot();
  const result = await collect(config, previous, { timestamp: NOW, client: fakeClient(topic => {
    if (topic.id === 'agent-skills') throw new CollectionError('incomplete');
    return [rawRepo(1, { full_name: 'fixture/renamed', html_url: 'https://github.com/fixture/renamed', stargazers_count: 2_000 }), rawRepo(3)];
  }) });
  assert.equal(result.outcome, 'partial');
  assert.deepEqual(result.data.topics['agent-skills'].ids, [1, 2]);
  assert.equal(result.data.topics['agent-skills'].last_success_at, OLD);
  assert.equal(result.data.repositories[2].fetched_at, OLD);
  assert.equal(result.data.repositories[1].full_name, 'fixture/renamed');
  assert.equal(result.data.repositories[1].fetched_at, NOW);
  assert.equal(previous.repositories[1].full_name, 'fixture/repo-1');
  assert.equal(validateDataset(result.data), result.data);
});

test('later required query failure discards earlier successful query metadata', async () => {
  const result = await collect(config, snapshot(), { timestamp: NOW, client: fakeClient((topic, query) => {
    if (topic.id === 'agent-skills' && query !== topic.queries[0]) throw new CollectionError('http');
    return topic.id === 'agent-skills' ? [rawRepo(1, { stargazers_count: 9999 })] : [];
  }) });
  assert.equal(result.data.repositories[1].stars, 100);
  assert.equal(result.data.topics['agent-skills'].status, 'error');
});

test('valid empty success clears selection and unreferenced metadata; not a failed refresh', async () => {
  const result = await collect(config, snapshot(), { client: fakeClient(), timestamp: NOW });
  assert.equal(result.outcome, 'success');
  assert.deepEqual(result.data.repositories, {});
  assert.deepEqual(result.data.topics['agent-skills'].ids, []);
  assert.equal(result.data.topics['agent-skills'].last_success_at, NOW);
});

test('full failure returns previous object untouched including manifest', async () => {
  for (const previous of [snapshot(), emptyDataset()]) {
    const before = JSON.stringify(previous);
    const result = await collect(config, previous, { timestamp: NOW, client: fakeClient(() => { throw new CollectionError('timeout'); }) });
    assert.equal(result.data, previous);
    assert.equal(result.changed, false);
    assert.equal(result.outcome, 'failed');
    assert.equal(JSON.stringify(previous), before);
  }
});

test('first-run partial failure remains empty and marked error without invented success', async () => {
  const result = await collect(config, emptyDataset(), { timestamp: NOW, client: fakeClient(topic => {
    if (topic.id === 'devops') throw new CollectionError('network');
    return [];
  }) });
  assert.equal(result.data.topics.devops.last_success_at, null);
  assert.equal(result.data.topics.devops.status, 'error');
  assert.deepEqual(result.data.topics.devops.ids, []);
});

test('REST request pins endpoint and metadata sort, token header only, bounded first page', async () => {
  let called;
  const client = createSearchClient({ token: 'TEST-ONLY-NOT-A-CREDENTIAL', fetchImpl: async (url, options) => { called = { url, options }; return response(); } });
  assert.deepEqual(await client.search(config[0], config[0].queries[0]), []);
  assert.equal(called.url.origin, 'https://api.github.com');
  assert.equal(called.url.pathname, '/search/repositories');
  assert.equal(called.url.searchParams.get('sort'), 'stars');
  assert.equal(called.url.searchParams.get('order'), 'desc');
  assert.equal(called.url.searchParams.get('per_page'), '100');
  assert.equal(called.url.searchParams.get('page'), '1');
  assert.equal(called.options.headers.Authorization, 'Bearer TEST-ONLY-NOT-A-CREDENTIAL');
  assert.equal(called.options.redirect, 'error');
  assert.doesNotMatch(called.url.href, /TEST-ONLY/);
});

test('rate-limit retry honors Retry-After seconds and reset with fake clock', async () => {
  let now = 1_000_000;
  const waits = [];
  let requests = 0;
  const client = createSearchClient({ now: () => now, sleep: async ms => { waits.push(ms); now += ms; }, fetchImpl: async () => ++requests === 1 ? response([], { status: 429, headers: { 'retry-after': '2', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1003' } }) : response() });
  await client.search(config[0], config[0].queries[0]);
  assert.deepEqual(waits, [4000]);
  assert.equal(requests, 2);
});

test('Retry-After HTTP date and 503 bounded backoff are honored', async () => {
  let now = Date.parse(NOW);
  let count = 0;
  const waits = [];
  const client = createSearchClient({ now: () => now, sleep: async ms => { waits.push(ms); now += ms; }, fetchImpl: async () => ++count === 1 ? response([], { status: 503, headers: { 'retry-after': new Date(now + 5000).toUTCString() } }) : response() });
  await client.search(config[0], config[0].queries[0]);
  assert.deepEqual(waits, [5000]);
  assert.equal(count, 2);
});

test('terminal Retry-After cooldown carries over to the next topic', async () => {
  for (const status of [429, 503]) {
    let now = 0;
    const times = [];
    const client = createSearchClient({
      now: () => now, sleep: async ms => { now += ms; },
      fetchImpl: async () => {
        times.push(now);
        return times.length <= 3 ? response([], { status, headers: { 'retry-after': '2' } }) : response();
      },
    });
    await assert.rejects(client.search(config[0], config[0].queries[0]), { code: status === 429 ? 'rate-limit' : 'http' });
    assert.deepEqual(await client.search(config[1], config[1].queries[0]), []);
    assert.deepEqual(times, [0, 2000, 4000, 6000]);
  }
});

test('terminal cooldown still respects shared maximum wait and run deadline', async () => {
  for (const limits of [{ maxWaitMs: 1000 }, { budgetMs: 2000 }]) {
    const client = createSearchClient({
      ...limits, now: () => 0, maxRetries: 0,
      sleep: async () => assert.fail('cooldown exceeds allowed wait or remaining budget'),
      fetchImpl: async () => response([], { status: 429, headers: { 'retry-after': '2' } }),
    });
    await assert.rejects(client.search(config[0], config[0].queries[0]), { code: 'rate-limit' });
    await assert.rejects(client.search(config[1], config[1].queries[0]), { code: 'rate-limit' });
    assert.equal(client.stats.requests, 1);
  }
});

test('long reset does not sleep or hammer later topics; successful exhausted response is retained', async () => {
  let count = 0;
  const client = createSearchClient({ now: () => 1_000_000, sleep: async () => assert.fail('must not wait'), fetchImpl: async () => { count++; return response([], { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000' } }); } });
  assert.deepEqual(await client.search(config[0], config[0].queries[0]), []);
  await assert.rejects(client.search(config[0], config[0].queries[1]), { code: 'rate-limit' });
  assert.equal(count, 1);
});

test('authentication and forbidden failures do not retry or expose response body', async () => {
  for (const status of [401, 403, 422]) {
    const client = createSearchClient({ fetchImpl: async () => new Response('sensitive upstream error', { status }) });
    await assert.rejects(client.search(config[0], config[0].queries[0]), error => error.code === 'http' && !error.message.includes('sensitive'));
    assert.equal(client.stats.requests, 1);
  }
});

test('unused streaming error bodies are cancelled and aborted without awaiting cleanup', { timeout: 2000 }, async () => {
  for (const status of [403, 429, 503]) for (const cleanup of ['pending', 'rejecting']) {
    let cancelled = 0;
    let signal;
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('sensitive streaming error')); },
      cancel() {
        cancelled++;
        return cleanup === 'pending' ? new Promise(() => {}) : Promise.reject(new Error('cleanup failure'));
      },
    });
    const client = createSearchClient({ maxRetries: 0, fetchImpl: async (_, options) => {
      signal = options.signal;
      return new Response(body, { status });
    } });
    await assert.rejects(client.search(config[0], config[0].queries[0]), { code: status === 429 ? 'rate-limit' : 'http' });
    assert.equal(cancelled, 1);
    assert.equal(signal.aborted, true);
    assert.equal(client.stats.requests, 1);
  }
});

test('incomplete or malformed response fails without accepting items', async () => {
  for (const makeResponse of [() => response([rawRepo()], { incomplete: true }), () => new Response('{}'), () => new Response('not json')]) {
    const client = createSearchClient({ fetchImpl: async () => makeResponse() });
    await assert.rejects(client.search(config[0], config[0].queries[0]), error => ['incomplete', 'invalid-response'].includes(error.code));
    assert.equal(client.stats.requests, 1);
  }
});

test('timeout covers hung fetch and hung body even if fake fetch ignores abort', async () => {
  for (const fetchImpl of [() => new Promise(() => {}), async () => ({ ok: true, json: () => new Promise(() => {}) })]) {
    const client = createSearchClient({ fetchImpl, timeoutMs: 5, maxRetries: 0 });
    await assert.rejects(client.search(config[0], config[0].queries[0]), { code: 'timeout' });
    assert.equal(client.stats.requests, 1);
  }
});

test('network retries are bounded and global deadline stops additional requests', async () => {
  let now = 0;
  const client = createSearchClient({ now: () => now, sleep: async ms => { now += ms; }, fetchImpl: async () => { throw new Error('secret network internals'); } });
  await assert.rejects(client.search(config[0], config[0].queries[0]), { code: 'network' });
  assert.equal(client.stats.requests, 3);
  const expired = createSearchClient({ now: () => now, budgetMs: 1, fetchImpl: async () => assert.fail('no request') });
  now += 2;
  await assert.rejects(expired.search(config[0], config[0].queries[0]));
  assert.equal(expired.stats.requests, 0);
});

test('schema rejects bad references, >10, duplicates, invalid ranking, URLs and timestamps', () => {
  for (const mutate of [
    data => { data.topics['agent-skills'].ids.push(99); },
    data => { data.topics['agent-skills'].ids = Array(11).fill(1); },
    data => { data.topics['agent-skills'].ids = [1, 1]; },
    data => { data.topics['agent-skills'].ids = [2, 1]; },
    data => { data.repositories[1].homepage = 'javascript:alert(1)'; },
    data => { data.repositories[1].fetched_at = 'yesterday'; },
    data => { data.repositories[1].created_at = '2026-02-31T00:00:00Z'; },
    data => { data.generated_at = null; },
    data => { data.repositories[1].fetched_at = NOW; },
    data => { data.topics.trending.status = 'success'; },
    data => { data.repositories[99] = normalizeRepo(rawRepo(99), NOW); },
  ]) { const data = snapshot(); mutate(data); assert.throws(() => validateDataset(data)); }
});

test('atomic persistence rejects invalid data without touching original and leaves no temp files', async t => {
  const root = await temporaryRoot(t, snapshot());
  const file = new URL('data/repositories.json', root);
  const before = await readFile(file, 'utf8');
  const bad = snapshot();
  bad.topics['agent-skills'].ids.push(999);
  await assert.rejects(atomicWrite(fileURLToPath(file), bad));
  assert.equal(await readFile(file, 'utf8'), before);
  await atomicWrite(fileURLToPath(file), emptyDataset());
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), emptyDataset());
  assert.deepEqual(await readdir(new URL('data/', root)), ['repositories.json']);
});

test('atomic publication rename failure preserves existing files and removes staged JSON', async t => {
  const root = await temporaryRoot(t, snapshot());
  const original = new URL('data/repositories.json', root);
  const before = await readFile(original, 'utf8');
  const blocked = new URL('data/blocked.json', root);
  await mkdir(blocked);
  const existing = new URL('data/blocked.json/preserve.txt', root);
  await writeFile(existing, 'existing user file');
  await assert.rejects(atomicWrite(fileURLToPath(blocked), emptyDataset()), { code: 'EISDIR' });
  assert.equal(await readFile(original, 'utf8'), before);
  assert.equal(await readFile(existing, 'utf8'), 'existing user file');
  assert.deepEqual((await readdir(new URL('data/', root))).sort(), ['blocked.json', 'repositories.json']);
});

test('refresh integration persists reusable JSON, full failure preserves exact bytes, local lock prevents races', async t => {
  const root = await temporaryRoot(t, snapshot());
  const file = new URL('data/repositories.json', root);
  const before = await readFile(file, 'utf8');
  const failure = await refresh({ root, timestamp: NOW, client: fakeClient(() => { throw new CollectionError('http'); }) });
  assert.equal(failure.outcome, 'failed');
  assert.equal(await readFile(file, 'utf8'), before);
  await writeFile(new URL('data/.refresh.lock', root), '');
  await assert.rejects(refresh({ root, client: fakeClient() }), { code: 'EEXIST' });
  const { unlink } = await import('node:fs/promises');
  await unlink(new URL('data/.refresh.lock', root));
  await refresh({ root, timestamp: NOW, client: fakeClient(() => [rawRepo(5)]) });
  const persisted = validateDataset(JSON.parse(await readFile(file, 'utf8')));
  assert.deepEqual(persisted.topics.devops.ids, [5]);
  await refresh({ root, timestamp: NOW, client: fakeClient(() => [rawRepo(5)]) });
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), persisted);
});

test('REST-to-file integration persists partial success and preserves incomplete topic selection', async t => {
  const root = await temporaryRoot(t, snapshot());
  const client = createSearchClient({ fetchImpl: async url => response([], { incomplete: url.searchParams.get('q').startsWith('topic:agent-skills ') }) });
  const result = await refresh({ root, client, timestamp: NOW });
  assert.equal(result.outcome, 'partial');
  const persisted = validateDataset(JSON.parse(await readFile(new URL('data/repositories.json', root), 'utf8')));
  assert.deepEqual(persisted.topics['agent-skills'].ids, [1, 2]);
  assert.equal(persisted.topics['agent-skills'].error, 'incomplete');
  assert.equal(persisted.topics['agent-skills'].last_success_at, OLD);
  assert.equal(persisted.topics.devops.last_success_at, NOW);
  assert.equal(persisted.repositories[2].fetched_at, OLD);
});

test('two overlapping refreshes cannot publish over each other', async t => {
  const root = await temporaryRoot(t);
  let release;
  let signalEntered;
  const entered = new Promise(resolve => { signalEntered = resolve; });
  const paused = new Promise(resolve => { release = resolve; });
  let first = true;
  const client = fakeClient(async () => {
    if (first) { first = false; signalEntered(); await paused; }
    return [];
  });
  const running = refresh({ root, client, timestamp: NOW });
  await entered;
  try { await assert.rejects(refresh({ root, client: fakeClient(), timestamp: NOW }), { code: 'EEXIST' }); }
  finally { release(); }
  assert.equal((await running).outcome, 'success');
  assert.deepEqual(await readdir(new URL('data/', root)), ['repositories.json']);
});
