import { validateConfig, validateDataset, DESCRIPTION_FALLBACK, safeURL } from '../shared/data.js';
import { validateEditorial } from '../shared/editorial.js';
import { escapeHTML as esc, topicHash, detailHash, parseRoute, filterRepos, formatTime, isStale, trapFocus, restoreFocus } from './state.js';

const external = (url, label, className = 'github', accessibleLabel = label) => safeURL(url) ? `<a class="${esc(className)}" href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(accessibleLabel)}, tab mới">${esc(label)} ↗</a>` : esc(label);
const description = repo => repo.description?.trim() ? repo.description : DESCRIPTION_FALLBACK;

export function cardHTML(repo, topic, rank, profile) {
  const [owner, name] = repo.full_name.split('/');
  const href = detailHash(topic, repo.id);
  return `<article class="repo"><div class="avatar" aria-label="Thứ hạng ${rank}">${rank}</div><div><h3><a data-detail href="${href}"><span class="owner">${esc(owner)} / </span>${esc(name)}</a></h3>${profile ? '<p class="editorial-label">Biên soạn tiếng Việt</p>' : ''}<p class="description">${esc(profile?.overview ?? description(repo))}</p><div class="tags">${repo.topics.map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div><div class="metadata"><span class="language">${esc(repo.language || 'Chưa rõ ngôn ngữ')}</span><span>Push: ${esc(formatTime(repo.pushed_at))}</span></div></div><div class="repo-aside"><span class="stars">☆ ${repo.stars.toLocaleString('vi-VN')}</span><a class="detail-link" data-detail href="${href}" aria-label="Xem chi tiết ${esc(repo.full_name)}">Xem chi tiết</a>${external(repo.html_url, 'GitHub', 'github', `Mở ${repo.full_name} trên GitHub`)}</div></article>`;
}

export function detailHTML(repo, profile) {
  if (!repo) return '<h2 id="detail-title">Repo không còn trong danh sách</h2><p>Repo này không thuộc chủ đề trong dữ liệu hiện tại. Đóng chi tiết để quay lại chủ đề.</p>';
  const homepage = safeURL(repo.homepage);
  const list = (title, items) => items.length ? `<section class="detail-section"><h3>${title}</h3><ul class="editorial-list">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>` : '';
  const purpose = profile
    ? `<p class="editorial-label">Biên soạn tiếng Việt</p><section class="detail-purpose"><h3>Repo này dùng để làm gì?</h3><p class="description">${esc(profile.overview)}</p></section>${list('Khả năng cụ thể', profile.capabilities)}${list('Trường hợp sử dụng', profile.use_cases)}${list('Yêu cầu và lưu ý', profile.requirements)}<section class="detail-section editorial-context"><h3>Nguồn biên soạn</h3><p>AI hỗ trợ biên soạn một lần từ tài liệu nguồn; không tự động cập nhật. Nhận định theo nguồn, không phải kiểm chứng độc lập về công năng, chất lượng hay an toàn.</p><p>Đọc nguồn lúc ${esc(formatTime(profile.reviewed_at))}.${profile.full_name !== repo.full_name ? ` Tên repo khi biên soạn: ${esc(profile.full_name)}.` : ''}</p><ul class="editorial-list">${profile.sources.map(source => `<li>${external(source.url, source.title)}</li>`).join('')}</ul></section><section class="detail-section"><h3>Mô tả gốc từ GitHub</h3><p class="description">${esc(description(repo))}</p><p class="editorial-label">Nguyên văn do chủ repo cung cấp, không phải phần biên soạn.</p></section>`
    : `<section class="detail-purpose"><h3>Repo này dùng để làm gì?</h3><p class="description">${esc(description(repo))}</p><p class="editorial-label">Mô tả gốc từ GitHub, do chủ repo cung cấp.</p><p>Chưa có phần giới thiệu công năng bổ sung. Xem nguồn gốc để tìm hiểu đầy đủ.</p></section>`;
  return `<h2 id="detail-title">${esc(repo.full_name)}</h2>${purpose}<section class="detail-section"><h3>Metadata</h3><dl><dt>Star</dt><dd>${repo.stars.toLocaleString('vi-VN')}</dd><dt>Ngôn ngữ</dt><dd>${esc(repo.language || 'Chưa rõ ngôn ngữ')}</dd><dt>License</dt><dd>${esc(repo.license || 'GitHub chưa nhận diện license.')}</dd><dt>Tạo repo</dt><dd>${esc(formatTime(repo.created_at))}</dd><dt>Push gần nhất</dt><dd>${esc(formatTime(repo.pushed_at))}</dd></dl><div class="tags">${repo.topics.map(tag => `<span class="tag">${esc(tag)}</span>`).join('') || 'Chưa có topic.'}</div></section><section class="detail-section"><h3>Nguồn và độ mới metadata</h3><p>Metadata từ GitHub REST API, lấy lúc ${esc(formatTime(repo.fetched_at))}. Thời điểm này không thể hiện độ mới của phần biên soạn hay tài liệu nguồn.</p><div class="detail-links">${external(repo.html_url, 'GitHub — nguồn gốc')}${homepage ? external(homepage, 'Homepage do chủ repo khai báo') : ''}</div><p>Link ngoài chưa được thẩm định an toàn. License là nhận diện của GitHub, không phải tư vấn pháp lý.</p></section>`;
}

export function mount(document, window, fetchImpl = globalThis.fetch) {
  const el = id => document.getElementById(id);
  let config;
  let data;
  let editorial = {};
  let activeTopic = null;
  let opener = null;
  let modalScroll = 0;
  let loadVersion = 0;
  const states = new Map();
  const dialog = el('detail');
  window.history.scrollRestoration = 'manual';
  const getState = () => ({ query: el('search').value, language: el('language').value, sort: el('sort').value, scroll: window.scrollY });
  const selection = () => data.topics[activeTopic];
  const selectedRepos = () => selection().ids.map(id => data.repositories[id]);

  function freshness() {
    if (!data || !activeTopic) return;
    const topic = selection();
    const stale = isStale(topic.last_success_at);
    el('freshness').className = `freshness${stale || topic.status === 'error' ? ' warning' : ''}`;
    el('freshness').textContent = activeTopic === 'trending' ? 'Chưa thu thập: định nghĩa Trending chưa được chốt.'
      : `${topic.last_success_at ? `Cập nhật thành công: ${formatTime(topic.last_success_at)}.` : 'Chưa có lần cập nhật thành công.'}${topic.status === 'error' ? ` Lần thử ${formatTime(topic.last_attempt_at)} thất bại; giữ danh sách lần thành công trước (nếu có).` : ''}${stale ? ' Dữ liệu đã cũ hơn 48 giờ.' : ''}${topic.scope ? ` Phạm vi: ${topic.scope.queries.length} query × tối đa ${topic.scope.candidates_per_query} ứng viên.` : ''}`;
  }

  function renderList() {
    if (!data) return;
    // Remember which of a repo's two detail links opened the modal. Rebinding
    // after replacement must not move focus out of the still-open dialog.
    const openerHref = dialog.open ? opener?.getAttribute('href') : null;
    const openerLinks = () => [...el('repositories').querySelectorAll('a[data-detail]')].filter(link => link.getAttribute('href') === openerHref);
    const openerIndex = openerHref ? openerLinks().indexOf(opener) : -1;
    const repos = selectedRepos();
    const matches = filterRepos(repos, getState(), editorial);
    el('result-count').textContent = `Đang hiển thị ${matches.length}/${repos.length} repo`;
    el('repositories').innerHTML = matches.length ? matches.map(repo => cardHTML(repo, activeTopic, selection().ids.indexOf(repo.id) + 1, editorial[repo.id])).join('')
      : `<div class="empty"><h3>${activeTopic === 'trending' ? 'Chờ định nghĩa Trending' : !selection().last_success_at ? 'Chưa có dữ liệu lần đầu' : repos.length ? 'Không khớp bộ lọc' : 'Chưa có repo phù hợp trong tập truy vấn'}</h3><p>${activeTopic === 'trending' ? 'Chưa xếp hạng repo mới nổi. Không dùng tổng star toàn thời gian để thay thế.' : repos.length ? 'Thử từ khóa khác hoặc xóa bộ lọc trong danh sách đã chọn.' : 'Chọn chủ đề khác hoặc quay lại sau lần cập nhật dữ liệu.'}</p>${repos.length ? '<button class="reset" id="reset" type="button">Xóa bộ lọc</button>' : ''}</div>`;
    if (openerIndex !== -1) opener = openerLinks()[openerIndex] ?? null;
    el('reset')?.addEventListener('click', () => { el('search').value = ''; el('language').value = 'all'; renderList(); el('search').focus(); });
    freshness();
  }

  function hideDetail() {
    if (!dialog.open) return;
    dialog.close();
    window.scrollTo(0, modalScroll);
    restoreFocus(opener, el('topic-title'));
    opener = null;
  }

  function navigate() {
    if (!data) return;
    const route = parseRoute(window.location.hash);
    if (route.invalid || window.location.hash === '#content') {
      window.history.replaceState(null, '', topicHash(route.topic));
    }
    const topic = config.find(topic => topic.id === route.topic);
    if (activeTopic !== topic.id) {
      hideDetail();
      if (activeTopic) states.set(activeTopic, getState());
      activeTopic = topic.id;
      el('topics').innerHTML = config.map(item => `<a class="nav-link" href="${topicHash(item.id)}" ${item.id === activeTopic ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${esc(item.icon)}</span>${esc(item.name)}<span class="nav-count">${data.topics[item.id].ids.length}</span></a>`).join('');
      el('crumb').textContent = topic.name;
      el('topic-title').textContent = topic.name;
      el('topic-description').textContent = topic.description;
      const state = states.get(activeTopic) ?? { query: '', language: 'all', sort: 'rank', scroll: 0 };
      const languages = [...new Set(selectedRepos().map(repo => repo.language ?? 'unknown'))].sort();
      el('language').innerHTML = '<option value="all">Tất cả ngôn ngữ</option>' + languages.map(language => `<option value="${esc(language)}">${esc(language === 'unknown' ? 'Chưa rõ ngôn ngữ' : language)}</option>`).join('');
      el('search').value = state.query;
      el('language').value = state.language;
      el('sort').value = state.sort;
      renderList();
      window.scrollTo(0, state.scroll);
    }
    document.title = `${topic.name} — RepoRadar`;
    if (route.repoId) {
      const repo = selection().ids.includes(route.repoId) ? data.repositories[route.repoId] : null;
      el('detail-body').innerHTML = detailHTML(repo, repo ? editorial[repo.id] : undefined);
      document.title = `${repo?.full_name ?? 'Repo không còn trong danh sách'} — RepoRadar`;
      if (!dialog.open) {
        opener = document.activeElement;
        modalScroll = window.scrollY;
        dialog.showModal();
        el('close-detail').focus();
      }
    } else hideDetail();
  }

  function closeDetail() {
    const base = topicHash(activeTopic);
    if (window.history.state?.reporadarDetailFrom === base) window.history.back();
    else { window.history.replaceState(null, '', base); navigate(); }
  }

  async function load() {
    const version = ++loadVersion;
    el('repositories').setAttribute('aria-busy', 'true');
    el('repositories').innerHTML = '<div class="empty"><p>Đang tải dữ liệu…</p></div>';
    try {
      const get = async path => {
        const response = await fetchImpl(new URL(path, window.location.href), { cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error('load');
        return response.json();
      };
      // Catch optional failures immediately, even if the required metadata fails first.
      const profiles = get('./data/editorial.json').then(validateEditorial).catch(() => null);
      el('editorial-notice').textContent = 'Đang tải phần biên soạn tiếng Việt; mô tả gốc vẫn có sẵn.';
      const [topics, dataset] = await Promise.all([get('./config/topics.json'), get('./data/repositories.json')]);
      validateConfig(topics);
      validateDataset(dataset);
      if (version !== loadVersion) return;
      config = topics;
      data = dataset;
      const route = parseRoute(window.location.hash);
      // Seed a same-topic history entry for directly opened detail URLs as well.
      if (route.repoId && !window.history.state?.reporadarDetailFrom) {
        const hash = window.location.hash;
        window.history.replaceState(null, '', topicHash(route.topic));
        window.history.pushState({ reporadarDetailFrom: topicHash(route.topic) }, '', hash);
      }
      navigate();
      el('repositories').setAttribute('aria-busy', 'false');
      const result = await profiles;
      if (version !== loadVersion) return;
      editorial = result?.repositories ?? {};
      el('editorial-notice').textContent = result ? '' : 'Không tải được phần biên soạn tiếng Việt (thiếu, lỗi tải hoặc dữ liệu không hợp lệ). Đang dùng mô tả gốc từ GitHub; metadata vẫn hoạt động.';
      renderList();
      navigate();
    } catch {
      if (version !== loadVersion) return;
      el('repositories').innerHTML = '<div class="empty" role="alert"><h3>Không tải được dữ liệu</h3><p>Kiểm tra kết nối rồi thử lại. Đây là lỗi tải, không phải danh sách rỗng.</p><button id="retry" class="reset" type="button">Thử lại</button></div>';
      el('retry')?.addEventListener('click', load);
    } finally { if (version === loadVersion) el('repositories').setAttribute('aria-busy', 'false'); }
  }

  el('skip-link').addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    el('content').focus({ preventScroll: true });
    el('content').scrollIntoView({ block: 'start' });
  });
  el('repositories').addEventListener('click', event => {
    const link = event.target.closest('a[data-detail]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    link.focus();
    window.history.pushState({ reporadarDetailFrom: topicHash(activeTopic) }, '', link.getAttribute('href'));
    navigate();
  });
  el('close-detail').addEventListener('click', closeDetail);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
  dialog.addEventListener('keydown', event => trapFocus(event, dialog, document));
  for (const [id, event] of [['search', 'input'], ['language', 'change'], ['sort', 'change']]) el(id).addEventListener(event, renderList);
  const themeButton = () => {
    const dark = document.documentElement.classList.contains('dark');
    el('theme').textContent = dark ? '☀ Giao diện sáng' : '◐ Giao diện tối';
    el('theme').setAttribute('aria-pressed', String(dark));
  };
  el('theme').addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    try { window.localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* Storage can be disabled. Theme still works for this page. */ }
    themeButton();
  });
  window.addEventListener('hashchange', navigate);
  window.addEventListener('popstate', navigate);
  document.addEventListener('visibilitychange', freshness);
  const freshnessTimer = window.setInterval(freshness, 60_000);
  window.addEventListener('pagehide', event => { if (!event.persisted) window.clearInterval(freshnessTimer); });
  themeButton();
  return { ready: load(), navigate };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') mount(document, window);
