// Minimal controllable DOM/history model for unit tests, NOT a browser emulator.
class Target {
  listeners = new Map();
  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  emit(type, event = {}) { for (const listener of this.listeners.get(type) ?? []) listener({ preventDefault() {}, ...event }); }
}

class Element extends Target {
  constructor(document, id = '') {
    super(); this.document = document; this.id = id; this.value = ''; this.textContent = ''; this.attributes = {}; this.open = false; this.isConnected = true; this.children = []; this.html = '';
  }
  set innerHTML(value) {
    for (const child of this.children) {
      child.isConnected = false;
      if (child.id) this.document.nodes.delete(child.id);
    }
    this.children = [];
    this.html = value;
    for (const match of value.matchAll(/<(a|button|h2)[^>]*>/g)) {
      const tag = match[0];
      const id = /id="([^"]+)"/.exec(tag)?.[1] ?? '';
      const child = new Element(this.document, id);
      child.tagName = match[1].toUpperCase();
      child.attributes.href = /href="([^"]+)"/.exec(tag)?.[1];
      child.isDetail = tag.includes('data-detail');
      if (id) this.document.nodes.set(id, child);
      this.children.push(child);
    }
  }
  get innerHTML() { return this.html; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  focus() { this.document.activeElement = this; }
  scrollIntoView(options) { this.scrollIntoViewOptions = options; }
  closest(selector) { return selector === 'a[data-detail]' && this.isDetail ? this : null; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  querySelectorAll() { return this.children.filter(child => child.tagName === 'BUTTON' || child.tagName === 'A'); }
}

export function domStub(hash = '#/topic/agent-skills') {
  const document = new Target();
  document.nodes = new Map();
  document.getElementById = id => document.nodes.get(id) ?? null;
  const classes = new Set(['dark']);
  document.documentElement = { classList: { contains: value => classes.has(value), toggle(value) { if (classes.has(value)) { classes.delete(value); return false; } classes.add(value); return true; } } };
  for (const id of ['skip-link', 'content', 'detail', 'detail-body', 'close-detail', 'search', 'language', 'sort', 'theme', 'repositories', 'topics', 'crumb', 'topic-title', 'topic-description', 'freshness', 'editorial-notice', 'result-count']) document.nodes.set(id, new Element(document, id));
  document.getElementById('language').value = 'all';
  document.getElementById('sort').value = 'rank';
  document.activeElement = document.getElementById('topic-title');
  const window = new Target();
  window.scrollY = 0;
  window.scrollTo = (_, y) => { window.scrollY = y; };
  window.location = { hash, href: `http://127.0.0.1:4173/reporadar/${hash}` };
  window.setInterval = () => 1;
  window.clearInterval = () => {};
  window.localStorage = { setItem() {} };
  const stack = [{ hash, state: null }];
  let index = 0;
  const update = entry => { window.location.hash = entry.hash; window.location.href = `http://127.0.0.1:4173/reporadar/${entry.hash}`; };
  window.history = {
    get state() { return stack[index].state; },
    pushState(state, _, hash) { stack.splice(index + 1); stack.push({ state, hash }); index++; update(stack[index]); },
    replaceState(state, _, hash) { stack[index] = { state, hash }; update(stack[index]); },
    back() { if (index > 0) { index--; update(stack[index]); window.emit('popstate'); window.emit('hashchange'); } },
    forward() { if (index < stack.length - 1) { index++; update(stack[index]); window.emit('popstate'); window.emit('hashchange'); } },
  };
  const go = hash => { window.history.pushState(null, '', hash); window.emit('hashchange'); };
  return {
    document, window, el: id => document.getElementById(id), go,
    // Model just the anchor's default hash action so tests detect a missing
    // preventDefault; this does not emulate browser keyboard/scroll behavior.
    skip() {
      let prevented = false;
      document.getElementById('skip-link').emit('click', { button: 0, detail: 0, preventDefault: () => { prevented = true; } });
      if (!prevented) go('#content');
      return prevented;
    },
  };
}
