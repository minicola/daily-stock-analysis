/**
 * Minimal DOM + localStorage setup for vitest node-environment tests.
 *
 * jsdom 28 is incompatible with Node 20 CJS workers (html-encoding-sniffer 6 → @exodus/bytes
 * pure-ESM crash), so hook tests that need renderHook run under `@vitest-environment node`
 * and pull in this lightweight shim instead.
 *
 * Provides only the surface that @testing-library/react v16 renderHook needs:
 *   - document.body / document.createElement / document.createRange
 *   - MutationObserver (waitFor polling)
 *   - localStorage
 *   - IS_REACT_ACT_ENVIRONMENT flag
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Minimal DOM ───────────────────────────────────────────────────────────────

type Listener = (...args: unknown[]) => void;

class MinimalEmitter {
  private _l: Map<string, Listener[]> = new Map();
  on(t: string, fn: Listener) { (this._l.get(t) ?? (this._l.set(t, []), this._l.get(t)!)).push(fn); }
  off(t: string, fn: Listener) { this._l.set(t, (this._l.get(t) ?? []).filter(l => l !== fn)); }
  emit(t: string, ...a: unknown[]) { (this._l.get(t) ?? []).forEach(fn => fn(...a)); }
}

class MinimalNode extends MinimalEmitter {
  nodeType: number; childNodes: MinimalNode[] = []; parentNode: MinimalNode | null = null;
  ownerDocument: MinimalDocument | null = null; style: Record<string, string> = {};
  nodeValue: string | null = null;
  constructor(type: number) { super(); this.nodeType = type; }
  appendChild<T extends MinimalNode>(c: T) { c.parentNode = this; this.childNodes.push(c); this.emit('mutation', c); return c; }
  removeChild<T extends MinimalNode>(c: T) { this.childNodes = this.childNodes.filter(x => x !== c) as MinimalNode[]; c.parentNode = null; this.emit('mutation', c); return c; }
  insertBefore<T extends MinimalNode>(node: T, ref: MinimalNode | null) { const i = ref ? this.childNodes.indexOf(ref) : -1; if (i >= 0) this.childNodes.splice(i, 0, node); else this.childNodes.push(node); node.parentNode = this; this.emit('mutation', node); return node; }
  addEventListener(t: string, fn: Listener) { this.on(t, fn); }
  removeEventListener(t: string, fn: Listener) { this.off(t, fn); }
  dispatchEvent(e: { type: string }) { this.emit(e.type, e); return true; }
  contains(o: MinimalNode): boolean { return this === o || this.childNodes.some(c => c.contains(o)); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling(): MinimalNode | null { const i = this.parentNode?.childNodes.indexOf(this) ?? -1; return this.parentNode?.childNodes[i + 1] ?? null; }
  get textContent() { return ''; } set textContent(_: string) {}
  get innerHTML() { return ''; } set innerHTML(_: string) {}
  cloneNode() { return new MinimalNode(this.nodeType); }
  compareDocumentPosition() { return 0; }
}

class MinimalElement extends MinimalNode {
  tagName: string; localName: string; dir = '';
  private _a: Record<string, string> = {};
  constructor(tag: string, doc: MinimalDocument) { super(1); this.localName = tag.toLowerCase(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; }
  setAttribute(k: string, v: string) { this._a[k] = String(v); }
  getAttribute(k: string) { return this._a[k] ?? null; }
  hasAttribute(k: string) { return k in this._a; }
  removeAttribute(k: string) { delete this._a[k]; }
  get id() { return this._a['id'] ?? ''; } set id(v: string) { this._a['id'] = v; }
  get className() { return this._a['class'] ?? ''; } set className(v: string) { this._a['class'] = v; }
  focus() {} blur() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  matches() { return false; } querySelector() { return null; } querySelectorAll() { return [] as MinimalElement[]; } closest() { return null; }
  get outerHTML() { return `<${this.localName}></${this.localName}>`; }
  get outerText() { return ''; } get innerText() { return ''; }
  cloneNode() { const el = new MinimalElement(this.localName, this.ownerDocument!); Object.assign((el as any)._a, this._a); return el; }
}

class MinimalDocument extends MinimalNode {
  body: MinimalElement; head: MinimalElement; documentElement: MinimalElement;
  constructor() {
    super(9); this.ownerDocument = null;
    this.body = new MinimalElement('body', this);
    this.head = new MinimalElement('head', this);
    this.documentElement = new MinimalElement('html', this);
    this.documentElement.ownerDocument = this;
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.body.ownerDocument = this.head.ownerDocument = this;
  }
  createElement(tag: string) { const el = new MinimalElement(tag, this); el.ownerDocument = this; return el; }
  createTextNode(text: string) { const n = new MinimalNode(3); n.nodeValue = text; n.ownerDocument = this; return n; }
  createDocumentFragment() { const f = new MinimalNode(11); f.ownerDocument = this; return f; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createRange() { return { createContextualFragment: (_html: string) => this.createDocumentFragment() }; }
  getElementById() { return null; } querySelector() { return null; } querySelectorAll() { return [] as MinimalElement[]; }
  get defaultView() { return globalThis; }
  addEventListener() {} removeEventListener() {} dispatchEvent() { return true; }
}

const _doc = new MinimalDocument();
Object.defineProperty(globalThis, 'document', { value: _doc, writable: true, configurable: true });
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true, configurable: true });
if (!(globalThis as any).navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (Node.js test env)', language: 'en', languages: ['en'] },
    writable: true, configurable: true,
  });
}
if (!(globalThis as any).location) {
  Object.defineProperty(globalThis, 'location', {
    value: { protocol: 'http:', href: 'http://localhost/', hostname: 'localhost', port: '', pathname: '/' },
    writable: true, configurable: true,
  });
}
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).HTMLIFrameElement = class HTMLIFrameElement extends MinimalElement { constructor() { super('iframe', _doc); } };
(globalThis as any).HTMLElement = MinimalElement;
(globalThis as any).Node = MinimalNode;

// MutationObserver — needed by @testing-library/dom waitFor
(globalThis as any).MutationObserver = class MutationObserver {
  private _cb: MutationCallback;
  constructor(cb: MutationCallback) { this._cb = cb; }
  observe(node: MinimalNode) {
    const notify = () => { this._cb([] as unknown as MutationRecord[], this as unknown as globalThis.MutationObserver); };
    (node as any)._mutationObserverNotify = notify;
    node.on('mutation', notify);
  }
  disconnect() {} takeRecords() { return [] as MutationRecord[]; }
};

// ── localStorage shim ─────────────────────────────────────────────────────────

const _store: Record<string, string> = {};
const _methods = {
  getItem: (k: string) => _store[k] ?? null,
  setItem: (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
  clear: () => { Object.keys(_store).forEach(k => delete _store[k]); },
  get length() { return Object.keys(_store).length; },
  key: (i: number) => Object.keys(_store)[i] ?? null,
};
const localStorageMock = new Proxy(_methods, {
  get(target, prop: string) { if (prop in target) return (target as Record<string, unknown>)[prop]; return _store[prop]; },
  set(_t, prop: string, value: string) { _store[prop] = value; return true; },
  ownKeys() { return [...Object.keys(_store), ...Object.keys(_methods)]; },
  getOwnPropertyDescriptor(target, prop: string) {
    if (prop in _store) return { value: _store[prop], writable: true, enumerable: true, configurable: true };
    return Object.getOwnPropertyDescriptor(target, prop);
  },
  has(_t, prop: string) { return prop in _store || prop in _methods; },
});
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });
