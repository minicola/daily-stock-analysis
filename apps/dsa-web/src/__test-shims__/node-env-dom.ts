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
  // DOM node type constants (instance + will be set as static below)
  readonly ELEMENT_NODE = 1;
  readonly TEXT_NODE = 3;
  readonly COMMENT_NODE = 8;
  readonly DOCUMENT_NODE = 9;
  readonly DOCUMENT_FRAGMENT_NODE = 11;

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
  // textContent: for text nodes return nodeValue; for others concatenate descendants
  get textContent(): string {
    if (this.nodeType === 3 || this.nodeType === 8) return this.nodeValue ?? '';
    return this.childNodes.map(c => c.textContent).join('');
  }
  set textContent(v: string) {
    this.childNodes = [];
    if (v) {
      const t = new MinimalNode(3); t.nodeValue = v; t.parentNode = this; this.childNodes.push(t);
    }
    this.emit('mutation', this);
  }
  get innerHTML() { return ''; } set innerHTML(_: string) {}
  cloneNode() { return new MinimalNode(this.nodeType); }
  compareDocumentPosition() { return 0; }
  getRootNode(): MinimalNode {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: MinimalNode = this;
    while (node.parentNode) node = node.parentNode;
    return node;
  }
}

class MinimalElement extends MinimalNode {
  tagName: string; localName: string; dir = '';
  private _a: Record<string, string> = {};
  constructor(tag: string, doc: MinimalDocument) { super(1); this.localName = tag.toLowerCase(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; }
  setAttribute(k: string, v: string) { this._a[k] = String(v); }
  getAttribute(k: string) { return this._a[k] ?? null; }
  hasAttribute(k: string) { return k in this._a; }
  removeAttribute(k: string) { delete this._a[k]; }
  getAttributeNode(k: string): { name: string; value: string; specified: boolean } | null {
    if (!(k in this._a)) return null;
    return { name: k, value: this._a[k], specified: true };
  }
  get attributes(): Array<{ name: string; value: string }> {
    return Object.entries(this._a).map(([name, value]) => ({ name, value }));
  }
  get id() { return this._a['id'] ?? ''; } set id(v: string) { this._a['id'] = v; }
  get className() { return this._a['class'] ?? ''; } set className(v: string) { this._a['class'] = v; }
  focus() {} blur() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  matches(selector: string): boolean {
    // Handle comma-separated multi-selectors
    if (selector.includes(',')) {
      return selector.split(',').some(s => this.matches(s.trim()));
    }
    if (selector === '*') return true;
    // Extract tag part and attribute parts
    // e.g. "*[role~="button"]" → tag="*", attrs=[{name:"role", op:"~=", val:"button"}]
    // e.g. "button" → tag="button"
    // e.g. ".className" → class check
    // e.g. "#id" → id check
    if (selector.startsWith('.')) return this.className.split(' ').filter(Boolean).includes(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);

    // Parse tag + attributes
    const tagMatch = selector.match(/^([*\w-]*)(\[.*)?$/);
    if (!tagMatch) return false;
    const tag = tagMatch[1];
    const attrPart = tagMatch[2];
    // Check tag
    if (tag && tag !== '*' && tag !== this.localName && tag !== this.tagName.toLowerCase()) return false;
    // Check attributes
    if (attrPart) {
      // Parse all attribute selectors e.g. [role~="button"][aria-label="x"]
      const attrRe = /\[([^\]~|^$*!=]+)([~|^$*!]?=)"?([^"\]]*)"?\]/g;
      let attrM: RegExpExecArray | null;
      while ((attrM = attrRe.exec(attrPart)) !== null) {
        const attrName = attrM[1].trim();
        const op = attrM[2];
        const val = attrM[3];
        const elVal = this.getAttribute(attrName);
        if (elVal === null) return false;
        if (op === '~') { if (!elVal.split(/\s+/).includes(val)) return false; }
        else if (op === '^') { if (!elVal.startsWith(val)) return false; }
        else if (op === '$') { if (!elVal.endsWith(val)) return false; }
        else if (op === '*') { if (!elVal.includes(val)) return false; }
        else { if (elVal !== val) return false; }
      }
      // Also handle bare attribute presence [attr]
      const bareAttrRe = /\[([^\]=~|^$*!]+)\]/g;
      let bareM: RegExpExecArray | null;
      while ((bareM = bareAttrRe.exec(attrPart)) !== null) {
        const attrName = bareM[1].trim();
        if (this.getAttribute(attrName) === null) return false;
      }
    }
    return true;
  }
  _allDescendants(): MinimalElement[] {
    const result: MinimalElement[] = [];
    const walk = (n: MinimalNode) => {
      for (const c of n.childNodes) {
        if (c instanceof MinimalElement) { result.push(c); walk(c); }
        else walk(c);
      }
    };
    walk(this);
    return result;
  }
  querySelector(selector: string): MinimalElement | null {
    const all = this._allDescendants();
    return all.find(el => el.matches(selector)) ?? null;
  }
  querySelectorAll(selector: string): MinimalElement[] {
    const all = this._allDescendants();
    if (selector === '*') return all;
    return all.filter(el => el.matches(selector));
  }
  closest(selector: string): MinimalElement | null {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let el: MinimalNode | null = this;
    while (el instanceof MinimalElement) {
      if (el.matches(selector)) return el;
      el = el.parentNode;
    }
    return null;
  }
  get outerHTML() { return `<${this.localName}></${this.localName}>`; }
  get children(): MinimalElement[] { return this.childNodes.filter(n => n instanceof MinimalElement) as MinimalElement[]; }
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
    // Make documentElement point back to the document so getRootNode() traversal
    // reaches the document node. toBeInTheDocument checks element.ownerDocument === getRootNode().
    this.documentElement.parentNode = this;
  }
  createElement(tag: string) { const el = new MinimalElement(tag, this); el.ownerDocument = this; return el; }
  createTextNode(text: string) { const n = new MinimalNode(3); n.nodeValue = text; n.ownerDocument = this; return n; }
  createComment(data: string) { const n = new MinimalNode(8); n.nodeValue = data; n.ownerDocument = this; return n; }
  createDocumentFragment() { const f = new MinimalNode(11); f.ownerDocument = this; return f; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createRange() { return { createContextualFragment: (_html: string) => this.createDocumentFragment() }; }
  getElementById(id: string) { return this.body.querySelector(`#${id}`); }
  querySelector(selector: string) { return this.body.querySelector(selector); }
  querySelectorAll(selector: string) { return this.body.querySelectorAll(selector); }
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

// ── Keyboard / Mouse Event constructors ──────────────────────────────────────
// Node 20 has Event but not KeyboardEvent / MouseEvent / FocusEvent.
// @testing-library's fireEvent.keyDown creates `new KeyboardEvent(...)` and
// the component handler checks `e.key`. We need a constructor that exposes key.

if (!(globalThis as any).KeyboardEvent) {
  (globalThis as any).KeyboardEvent = class KeyboardEvent extends Event {
    key: string; code: string; keyCode: number; which: number;
    altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean;
    constructor(type: string, init: Record<string, unknown> = {}) {
      super(type, init as EventInit);
      this.key = (init.key as string) ?? '';
      this.code = (init.code as string) ?? '';
      this.keyCode = (init.keyCode as number) ?? 0;
      this.which = (init.which as number) ?? this.keyCode;
      this.altKey = Boolean(init.altKey); this.ctrlKey = Boolean(init.ctrlKey);
      this.metaKey = Boolean(init.metaKey); this.shiftKey = Boolean(init.shiftKey);
    }
  };
}
if (!(globalThis as any).MouseEvent) {
  (globalThis as any).MouseEvent = class MouseEvent extends Event {
    button: number; buttons: number; clientX: number; clientY: number;
    constructor(type: string, init: Record<string, unknown> = {}) {
      super(type, init as EventInit);
      this.button = (init.button as number) ?? 0;
      this.buttons = (init.buttons as number) ?? 0;
      this.clientX = (init.clientX as number) ?? 0;
      this.clientY = (init.clientY as number) ?? 0;
    }
  };
}
if (!(globalThis as any).FocusEvent) {
  (globalThis as any).FocusEvent = class FocusEvent extends Event {
    constructor(type: string, init: Record<string, unknown> = {}) { super(type, init as EventInit); }
  };
}
if (!(globalThis as any).InputEvent) {
  (globalThis as any).InputEvent = class InputEvent extends Event {
    data: string;
    constructor(type: string, init: Record<string, unknown> = {}) {
      super(type, init as EventInit);
      this.data = (init.data as string) ?? '';
    }
  };
}

// ── Window event listener shim ────────────────────────────────────────────────
// `window` is aliased to globalThis, but Node's globalThis doesn't have
// addEventListener/removeEventListener. The drawer component uses
// window.addEventListener('keydown', …) for Esc-key handling.
// fireEvent.keyDown(window, …) from @testing-library also needs dispatchEvent.

if (!(globalThis as any).addEventListener) {
  const _winListeners: Map<string, Set<Listener>> = new Map();
  (globalThis as any).addEventListener = (type: string, fn: Listener) => {
    if (!_winListeners.has(type)) _winListeners.set(type, new Set());
    _winListeners.get(type)!.add(fn);
  };
  (globalThis as any).removeEventListener = (type: string, fn: Listener) => {
    _winListeners.get(type)?.delete(fn);
  };
  (globalThis as any).dispatchEvent = (e: { type: string; [k: string]: unknown }) => {
    (_winListeners.get(e.type) ?? new Set()).forEach(fn => fn(e as unknown));
    return true;
  };
}

// ── getComputedStyle stub ─────────────────────────────────────────────────────
// @testing-library/dom uses getComputedStyle to check element visibility.
if (!(globalThis as any).getComputedStyle) {
  (globalThis as any).getComputedStyle = () => ({
    getPropertyValue: () => '',
    display: '',
    visibility: '',
    opacity: '1',
  });
}

// ── requestAnimationFrame ─────────────────────────────────────────────────────
// React 19 concurrent rendering uses requestAnimationFrame. Under node +
// fake timers vitest shims this, but if it's missing before vitest sets up,
// add a fallback. Node 18+ has global scheduler but no rAF.
if (!(globalThis as any).requestAnimationFrame) {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 16);
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

// ── @testing-library/dom getElementError override ────────────────────────────
// The default getElementError calls prettyDOM which tries to pretty-print our
// minimal DOM via pretty-format's DOMElementFilter. The filter's isCustomElement
// check calls `const { tagName } = val` on null values (e.g. MinimalNode.parentNode
// which is null by default) and throws "Cannot destructure property 'tagName' of
// 'val' as it is null". Override getElementError to produce a plain error.
// @testing-library/dom is a CJS module, require() works in Vitest's CJS workers.
try {
  // Use globalThis.require (available in Vitest's CJS worker context) to patch
  // @testing-library/dom before tests run. The `require` identifier isn't in
  // tsconfig.app.json's types, so we access it through globalThis to avoid
  // tsc errors while still being callable at runtime.
  const _require = (globalThis as Record<string, unknown>)['require'] as ((id: string) => { configure: (opts: unknown) => void }) | undefined;
  if (_require) {
    const rtlDom = _require('@testing-library/dom');
    rtlDom.configure({
      getElementError: (message: string | null) => {
        const err = new Error(message ?? 'Element not found');
        err.name = 'TestingLibraryElementError';
        return err;
      },
    });
  }
} catch {
  // Not available at shim load time; test file must configure manually.
}
