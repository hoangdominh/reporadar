export const TOPIC_IDS = ['agent-skills', 'mcp-servers', 'developer-tools', 'devops', 'self-hosted', 'trending'];
export const RANKING = 'stars-desc,pushed_at-desc,id-asc';
export const DESCRIPTION_FALLBACK = 'Chủ repo chưa cung cấp mô tả.';

function requireValue(condition, message) {
  if (!condition) throw new Error(`Invalid data: ${message}`);
}

export function isTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === (value.length === 20 ? value.replace('Z', '.000Z') : value);
}

export function safeURL(value, github = false) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (github && (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || !/^\/[^/]+\/[^/]+\/?$/.test(url.pathname) || url.search || url.hash)) return null;
    return url.href;
  } catch { return null; }
}

export function compareRepos(a, b) {
  return b.stars - a.stars || (Date.parse(b.pushed_at) || 0) - (Date.parse(a.pushed_at) || 0) || a.id - b.id;
}

export function validateConfig(config) {
  requireValue(Array.isArray(config) && config.length === TOPIC_IDS.length, 'six topics required');
  requireValue(new Set(config.map(topic => topic.id)).size === TOPIC_IDS.length, 'duplicate topics');
  for (const topic of config) {
    requireValue(TOPIC_IDS.includes(topic.id), 'unknown topic');
    for (const key of ['name', 'description', 'icon', 'policy']) requireValue(typeof topic[key] === 'string' && topic[key].length > 0, key);
    requireValue(topic.publicOnly === true && typeof topic.allowArchived === 'boolean' && typeof topic.allowForks === 'boolean', 'visibility policy');
    requireValue(topic.limit === 10 && Number.isInteger(topic.candidatesPerQuery) && topic.candidatesPerQuery > 10 && topic.candidatesPerQuery <= 100, 'query budget');
    requireValue(Number.isSafeInteger(topic.minStars) && topic.minStars >= 0, 'minStars');
    for (const key of ['exclude', 'excludeKeywords']) requireValue(Array.isArray(topic[key]) && topic[key].every(value => typeof value === 'string' && value.length > 0), key);
    requireValue(Array.isArray(topic.queries) && topic.queries.length <= 3 && (topic.id === 'trending' ? topic.queries.length === 0 : topic.queries.length > 0), 'query count');
    for (const query of topic.queries) requireValue(typeof query === 'string' && /^(?:topic:[a-z0-9-]+|"[a-zA-Z0-9 -]+" in:name,description)$/.test(query), 'metadata-only query');
  }
  return config;
}

export function emptyDataset() {
  return {
    schema_version: 1, generated_at: null, repositories: {},
    topics: Object.fromEntries(TOPIC_IDS.map(id => [id, {
      ids: [], status: id === 'trending' ? 'pending' : 'never',
      last_attempt_at: null, last_success_at: null, error: null, ranking_basis: RANKING,
      scope: null,
    }])),
  };
}

export function validateDataset(data) {
  requireValue(data && data.schema_version === 1, 'schema version');
  requireValue(data.generated_at === null || isTimestamp(data.generated_at), 'generated_at');
  requireValue(data.repositories && typeof data.repositories === 'object' && !Array.isArray(data.repositories), 'repositories');
  requireValue(data.topics && Object.keys(data.topics).length === TOPIC_IDS.length, 'topic selections');
  for (const [key, repo] of Object.entries(data.repositories)) {
    requireValue(repo && Number.isSafeInteger(repo.id) && repo.id > 0 && String(repo.id) === key, 'repository ID');
    requireValue(typeof repo.full_name === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.full_name), 'full_name');
    requireValue(safeURL(repo.html_url, true) === `https://github.com/${repo.full_name}`, 'GitHub URL');
    requireValue(repo.homepage === null || safeURL(repo.homepage) !== null, 'homepage');
    requireValue(Number.isSafeInteger(repo.stars) && repo.stars >= 0, 'stars');
    for (const field of ['description', 'language', 'license']) requireValue(repo[field] === null || typeof repo[field] === 'string', field);
    requireValue(Array.isArray(repo.topics) && repo.topics.every(topic => typeof topic === 'string'), 'repository topics');
    requireValue(isTimestamp(repo.fetched_at), 'fetched_at');
    requireValue(isTimestamp(data.generated_at) && Date.parse(repo.fetched_at) <= Date.parse(data.generated_at), 'metadata generation chronology');
    for (const field of ['created_at', 'pushed_at']) requireValue(repo[field] === null || isTimestamp(repo[field]), field);
  }
  const referenced = new Set();
  for (const id of TOPIC_IDS) {
    const selection = data.topics[id];
    requireValue(selection && Array.isArray(selection.ids) && selection.ids.length <= 10 && new Set(selection.ids).size === selection.ids.length, 'selection size/duplicates');
    requireValue(['never', 'pending', 'success', 'error'].includes(selection.status), 'status');
    requireValue(selection.ranking_basis === RANKING, 'ranking basis');
    for (const field of ['last_attempt_at', 'last_success_at']) requireValue(selection[field] === null || isTimestamp(selection[field]), field);
    requireValue(selection.error === null || ['http', 'rate-limit', 'timeout', 'network', 'incomplete', 'invalid-response'].includes(selection.error), 'safe error code');
    if (id === 'trending') requireValue(selection.status === 'pending' && selection.ids.length === 0 && selection.last_attempt_at === null && selection.last_success_at === null, 'Trending pending');
    else requireValue(selection.status !== 'pending', 'unexpected pending');
    if (selection.status === 'never' || selection.status === 'pending') requireValue(selection.ids.length === 0 && selection.last_success_at === null && selection.last_attempt_at === null && selection.error === null && selection.scope === null, 'initial state');
    else {
      requireValue(isTimestamp(selection.last_attempt_at), 'attempt required');
      requireValue(isTimestamp(data.generated_at) && Date.parse(selection.last_attempt_at) <= Date.parse(data.generated_at), 'manifest attempt chronology');
      requireValue(selection.status === 'error' ? selection.error !== null : selection.error === null && selection.last_success_at === selection.last_attempt_at, 'status timestamps/error');
      requireValue(selection.last_success_at === null ? selection.ids.length === 0 : Date.parse(selection.last_success_at) <= Date.parse(selection.last_attempt_at), 'success chronology');
      requireValue(selection.scope && Array.isArray(selection.scope.queries) && selection.scope.queries.length > 0 && selection.scope.queries.length <= 3 && selection.scope.queries.every(q => typeof q === 'string') && Number.isInteger(selection.scope.candidates_per_query) && selection.scope.candidates_per_query > 10 && selection.scope.candidates_per_query <= 100, 'scope');
    }
    for (const repoId of selection.ids) {
      requireValue(Number.isSafeInteger(repoId) && Object.hasOwn(data.repositories, repoId), 'dangling repository ID');
      referenced.add(String(repoId));
    }
    if (selection.status === 'success') {
      const repos = selection.ids.map(repoId => data.repositories[repoId]);
      requireValue(repos.every((repo, index) => index === 0 || compareRepos(repos[index - 1], repo) <= 0), 'selection ranking');
    }
  }
  requireValue(Object.keys(data.repositories).every(id => referenced.has(id)), 'unreferenced metadata');
  return data;
}
