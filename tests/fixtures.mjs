import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { emptyDataset } from '../shared/data.js';
import { normalizeRepo } from '../scripts/collector.mjs';

export const config = JSON.parse(await readFile(new URL('../config/topics.json', import.meta.url), 'utf8'));
export const NOW = '2026-09-10T17:00:00.000Z';
export const OLD = '2026-09-07T17:00:00.000Z';

export function rawRepo(id = 1, changes = {}) {
  return {
    id, full_name: `fixture/repo-${id}`, html_url: `https://github.com/fixture/repo-${id}`,
    description: 'Offline test metadata', topics: ['fixture'], language: 'JavaScript',
    stargazers_count: 100, private: false, visibility: 'public', archived: false, fork: false,
    created_at: '2025-01-01T00:00:00Z', pushed_at: '2026-09-01T00:00:00Z',
    license: { name: 'MIT License', key: 'mit' }, homepage: 'https://example.com/project', ...changes,
  };
}

export function snapshot(ids = [1, 2]) {
  const data = emptyDataset();
  data.generated_at = OLD;
  for (const id of ids) data.repositories[id] = normalizeRepo(rawRepo(id), OLD);
  data.topics['agent-skills'] = {
    ...data.topics['agent-skills'], ids, status: 'success', last_attempt_at: OLD, last_success_at: OLD,
    scope: { queries: ['topic:agent-skills is:public archived:false fork:false stars:>=0'], candidates_per_query: 100 },
  };
  return data;
}

export const response = (items = [], { status = 200, headers = {}, incomplete = false } = {}) => new Response(JSON.stringify({ total_count: items.length, incomplete_results: incomplete, items }), { status, headers });

export function fakeClient(handler = () => []) {
  const stats = { requests: 0 };
  return { stats, async search(topic, query) { stats.requests++; return handler(topic, query); } };
}

export async function temporaryRoot(t, data = emptyDataset()) {
  const directory = await mkdtemp('/tmp/opencode/reporadar-test-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = pathToFileURL(`${directory}/`);
  for (const dir of ['config', 'data']) await mkdir(new URL(`${dir}/`, root));
  await writeFile(new URL('config/topics.json', root), JSON.stringify(config));
  await writeFile(new URL('data/repositories.json', root), JSON.stringify(data));
  return root;
}
