import { isTimestamp, safeURL } from './data.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
function requireValue(condition, field) {
  if (!condition) throw new Error(`Invalid editorial: ${field}`);
}

export function validateEditorial(data) {
  requireValue(object(data) && data.schema_version === 1, 'schema version');
  requireValue(object(data.repositories), 'repositories');
  for (const [id, profile] of Object.entries(data.repositories)) {
    requireValue(/^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)), 'repository ID');
    requireValue(object(profile), 'profile');
    requireValue(text(profile.full_name, 200) && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(profile.full_name), 'full_name');
    requireValue(text(profile.overview, 3000), 'overview');
    for (const field of ['capabilities', 'use_cases', 'requirements']) {
      requireValue(Array.isArray(profile[field]) && profile[field].length <= 20 && profile[field].every(value => text(value, 1500)), field);
    }
    requireValue(Array.isArray(profile.sources) && profile.sources.length > 0 && profile.sources.length <= 20, 'sources');
    for (const source of profile.sources) {
      requireValue(object(source) && text(source.title, 300) && text(source.url, 2048) && safeURL(source.url) !== null, 'source');
    }
    requireValue(isTimestamp(profile.reviewed_at), 'reviewed_at');
    requireValue(profile.provenance === 'ai-assisted-source-review', 'provenance');
  }
  return data;
}

export function editorialText(profile) {
  return profile ? [profile.overview, ...profile.capabilities, ...profile.use_cases, ...profile.requirements].join(' ') : '';
}
