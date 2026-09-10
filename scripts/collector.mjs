import { compareRepos, safeURL, isTimestamp, validateConfig, validateDataset } from '../shared/data.js';

export class CollectionError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function queryFor(topic, query) {
  return `${query} is:public${topic.allowArchived ? '' : ' archived:false'}${topic.allowForks ? ' fork:true' : ' fork:false'} stars:>=${topic.minStars}`;
}

export function normalizeRepo(raw, fetchedAt) {
  if (!raw || !Number.isSafeInteger(raw.id) || raw.id <= 0 || typeof raw.full_name !== 'string'
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw.full_name)
    || safeURL(raw.html_url, true) !== `https://github.com/${raw.full_name}`
    || !Number.isSafeInteger(raw.stargazers_count) || raw.stargazers_count < 0
    || !['private', 'archived', 'fork'].every(key => typeof raw[key] === 'boolean')
    || !(raw.description === null || typeof raw.description === 'string')
    || !(raw.language === null || typeof raw.language === 'string')
    || !Array.isArray(raw.topics) || !raw.topics.every(topic => typeof topic === 'string')
    || !['created_at', 'pushed_at'].every(key => raw[key] === null || isTimestamp(raw[key]))) {
    throw new CollectionError('invalid-response');
  }
  return {
    id: raw.id, full_name: raw.full_name, description: raw.description,
    html_url: `https://github.com/${raw.full_name}`, homepage: safeURL(raw.homepage),
    stars: raw.stargazers_count, language: raw.language,
    license: typeof raw.license?.name === 'string' && raw.license.key !== 'other' ? raw.license.name : null,
    topics: [...new Set(raw.topics)], created_at: raw.created_at,
    pushed_at: raw.pushed_at, fetched_at: fetchedAt,
  };
}

export function eligible(raw, topic) {
  const text = `${raw.full_name} ${raw.description ?? ''} ${raw.topics.join(' ')}`.toLowerCase();
  return !raw.private && (raw.visibility === undefined || raw.visibility === 'public')
    && (topic.allowArchived || !raw.archived) && (topic.allowForks || !raw.fork)
    && raw.stargazers_count >= topic.minStars
    && !topic.exclude.some(value => value.toLowerCase() === raw.full_name.toLowerCase() || value === String(raw.id))
    && !topic.excludeKeywords.some(keyword => text.includes(keyword.toLowerCase()));
}

// Fixed endpoint, no redirects, no raw response bodies in errors or public data.
export function createSearchClient({ fetchImpl = globalThis.fetch, token = '', sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, timeoutMs = 12_000, maxRetries = 2, maxWaitMs = 30_000, budgetMs = 300_000 } = {}) {
  const deadline = now() + budgetMs;
  const stats = { requests: 0 };
  let blockedUntil = 0;
  return {
    stats,
    async search(topic, query) {
      const url = new URL('https://api.github.com/search/repositories');
      url.search = new URLSearchParams({ q: queryFor(topic, query), sort: 'stars', order: 'desc', per_page: String(topic.candidatesPerQuery), page: '1' });
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (now() >= deadline) throw new CollectionError('timeout');
        const wait = Math.max(0, blockedUntil - now());
        if (wait > maxWaitMs || now() + wait >= deadline) throw new CollectionError('rate-limit');
        if (wait) await sleep(wait);
        if (now() >= deadline) throw new CollectionError('timeout');
        const controller = new AbortController();
        let timer;
        let response;
        let body;
        try {
          const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'RepoRadar-metadata-collector' };
          if (token) headers.Authorization = `Bearer ${token}`;
          stats.requests++;
          [response, body] = await Promise.race([
            (async () => {
              const result = await fetchImpl(url, { headers, signal: controller.signal, redirect: 'error' });
              if (result.ok) return [result, await result.json()];
              // Error bodies are unused. Cancel and abort without awaiting cleanup:
              // an open stream (or its cancellation hook) must not stall the run.
              try { void result.body?.cancel().catch(() => {}); }
              catch { /* Abort also releases a body that cannot be cancelled directly. */ }
              controller.abort();
              return [result, null];
            })(),
            new Promise((_, reject) => {
              timer = setTimeout(() => { controller.abort(); reject(new CollectionError('timeout')); }, Math.min(timeoutMs, deadline - now()));
            }),
          ]);
        } catch (error) {
          const code = error instanceof CollectionError ? error.code : error instanceof SyntaxError ? 'invalid-response' : 'network';
          if (attempt === maxRetries || code === 'invalid-response') throw new CollectionError(code);
          blockedUntil = now() + 500 * 2 ** attempt;
          continue;
        } finally { clearTimeout(timer); }

        const retryAfter = response.headers.get('retry-after');
        const retryMs = retryAfter === null ? 0 : /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - now()) || 0;
        const resetMs = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        const exhausted = response.headers.get('x-ratelimit-remaining') === '0';
        if (exhausted && resetMs > now()) blockedUntil = Math.max(blockedUntil, resetMs + 1000);
        if (response.ok) {
          if (!body || body.incomplete_results !== false || !Array.isArray(body.items) || body.items.length > topic.candidatesPerQuery || !Number.isSafeInteger(body.total_count) || body.total_count < body.items.length) {
            throw new CollectionError(body?.incomplete_results === true ? 'incomplete' : 'invalid-response');
          }
          return body.items;
        }
        const limited = response.status === 429 || (response.status === 403 && (exhausted || retryAfter !== null));
        const retryable = limited || response.status >= 500;
        // Cooldowns belong to the shared client, even when this query is done retrying.
        if (retryable) blockedUntil = Math.max(blockedUntil, now() + Math.max(retryMs, 500 * 2 ** attempt));
        if (!retryable || attempt === maxRetries) throw new CollectionError(limited ? 'rate-limit' : 'http');
      }
      throw new CollectionError('http');
    },
  };
}

export async function collect(config, previous, { client = createSearchClient(), timestamp = new Date().toISOString() } = {}) {
  validateConfig(config);
  validateDataset(previous);
  const next = structuredClone(previous);
  const reports = [];
  const successful = new Set();
  for (const topic of config.filter(topic => topic.id !== 'trending')) {
    const started = Date.now();
    const startRequests = client.stats.requests;
    let candidates = 0;
    const scope = { queries: topic.queries.map(query => queryFor(topic, query)), candidates_per_query: topic.candidatesPerQuery };
    try {
      const byId = new Map();
      for (const query of topic.queries) {
        const items = await client.search(topic, query);
        candidates += items.length;
        for (const raw of items) {
          const repo = normalizeRepo(raw, timestamp);
          if (eligible(raw, topic)) byId.set(repo.id, repo);
        }
      }
      const selected = [...byId.values()].sort(compareRepos).slice(0, topic.limit);
      for (const repo of selected) next.repositories[repo.id] = repo;
      next.topics[topic.id] = { ...previous.topics[topic.id], ids: selected.map(repo => repo.id), status: 'success', error: null, last_attempt_at: timestamp, last_success_at: timestamp, scope };
      successful.add(topic.id);
      reports.push({ topic: topic.id, status: 'success', candidates, selected: selected.length, requests: client.stats.requests - startRequests, elapsed_ms: Date.now() - started });
    } catch (error) {
      const code = error instanceof CollectionError ? error.code : 'invalid-response';
      next.topics[topic.id] = { ...previous.topics[topic.id], status: 'error', error: code, last_attempt_at: timestamp, scope: previous.topics[topic.id].scope ?? scope };
      reports.push({ topic: topic.id, status: 'error', error: code, candidates, selected: previous.topics[topic.id].ids.length, requests: client.stats.requests - startRequests, elapsed_ms: Date.now() - started });
    }
  }
  if (!successful.size) return { data: previous, changed: false, outcome: 'failed', reports };
  // Shared metadata may have changed later in the run. Reorder successful lists only;
  // failed lists retain their exact last-success membership and ordering.
  for (const id of successful) next.topics[id].ids.sort((a, b) => compareRepos(next.repositories[a], next.repositories[b]));
  const used = new Set(Object.values(next.topics).flatMap(topic => topic.ids).map(String));
  next.repositories = Object.fromEntries(Object.entries(next.repositories).filter(([id]) => used.has(id)));
  next.generated_at = timestamp;
  validateDataset(next);
  return { data: next, changed: true, outcome: reports.some(report => report.status === 'error') ? 'partial' : 'success', reports };
}
