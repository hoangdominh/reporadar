import { TOPIC_IDS, compareRepos, isTimestamp } from '../shared/data.js';
import { editorialText } from '../shared/editorial.js';

export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const topicHash = id => `#/topic/${id}`;
export const detailHash = (id, repoId) => `${topicHash(id)}/repo/${repoId}`;

export function parseRoute(hash) {
  const match = /^#\/topic\/([a-z-]+)(?:\/repo\/([1-9]\d*))?$/.exec(hash);
  const valid = match && TOPIC_IDS.includes(match[1]) && (!match[2] || Number.isSafeInteger(Number(match[2])));
  return valid ? { topic: match[1], repoId: match[2] ? Number(match[2]) : null, invalid: false }
    : { topic: TOPIC_IDS[0], repoId: null, invalid: Boolean(hash && hash !== '#content') };
}

export function filterRepos(repos, { query = '', language = 'all', sort = 'rank' } = {}, editorial = {}) {
  const needle = query.trim().toLocaleLowerCase('vi');
  const result = repos.filter(repo => (language === 'all' || (repo.language ?? 'unknown') === language)
    && `${repo.full_name} ${repo.description ?? ''} ${repo.topics.join(' ')} ${editorialText(editorial[repo.id])}`.toLocaleLowerCase('vi').includes(needle));
  if (sort === 'name') result.sort((a, b) => a.full_name.localeCompare(b.full_name) || a.id - b.id);
  if (sort === 'stars') result.sort(compareRepos);
  if (sort === 'pushed') result.sort((a, b) => (Date.parse(b.pushed_at) || 0) - (Date.parse(a.pushed_at) || 0) || a.id - b.id);
  return result;
}

export function formatTime(timestamp) {
  return isTimestamp(timestamp) ? `${new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))} (UTC+7)` : 'Chưa có dữ liệu';
}

export function isStale(timestamp, now = Date.now()) {
  return isTimestamp(timestamp) && now - Date.parse(timestamp) > 48 * 60 * 60 * 1000;
}

export function trapFocus(event, dialog, document) {
  if (event.key !== 'Tab') return;
  const targets = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')];
  const first = targets[0];
  const last = targets.at(-1);
  if (!first) { event.preventDefault(); dialog.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || !targets.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !targets.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
}

export function restoreFocus(target, fallback) {
  (target?.isConnected ? target : fallback)?.focus({ preventScroll: true });
}
