// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Note: this file uses the 'node' environment (not jsdom) to avoid a known incompatibility
// between jsdom 28 / html-encoding-sniffer 6 and @exodus/bytes (pure-ESM) under Node 20 CJS workers.
// localStorage and React DOM are shimmed below so the hook tests work identically to a browser.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMarketRecommendation, __test_only } from '../useMarketRecommendation';

// ── Minimal DOM + localStorage shim ─────────────────────────────────────────
// react-dom/client is imported above with no window.document.createElement,
// so canUseDOM = false — safe to add DOM globals afterwards.

// Inline minimal event-emitter so we don't need 'events' (Node built-in) or @types/node.
type Listener = (...args: unknown[]) => void;
class MinimalEmitter {
  private _listeners: Map<string, Listener[]> = new Map();
  on(type: string, fn: Listener) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type)!.push(fn);
  }
  off(type: string, fn: Listener) {
    const list = this._listeners.get(type) ?? [];
    this._listeners.set(type, list.filter(l => l !== fn));
  }
  emit(type: string, ...args: unknown[]) {
    (this._listeners.get(type) ?? []).forEach(fn => fn(...args));
  }
}

class MinimalNode extends MinimalEmitter {
  nodeType: number;
  childNodes: MinimalNode[] = [];
  parentNode: MinimalNode | null = null;
  ownerDocument: MinimalDocument | null = null;
  style: Record<string, string> = {};
  nodeValue: string | null = null;

  constructor(type: number) { super(); this.nodeType = type; }

  appendChild<T extends MinimalNode>(child: T): T {
    child.parentNode = this; this.childNodes.push(child);
    this.emit('mutation', child);
    return child;
  }
  removeChild<T extends MinimalNode>(child: T): T {
    this.childNodes = this.childNodes.filter(c => c !== child) as MinimalNode[];
    child.parentNode = null;
    this.emit('mutation', child);
    return child;
  }
  insertBefore<T extends MinimalNode>(node: T, ref: MinimalNode | null): T {
    const idx = ref ? this.childNodes.indexOf(ref) : -1;
    if (idx >= 0) this.childNodes.splice(idx, 0, node); else this.childNodes.push(node);
    node.parentNode = this;
    this.emit('mutation', node);
    return node;
  }
  addEventListener(type: string, fn: (...args: unknown[]) => void) { this.on(type, fn); }
  removeEventListener(type: string, fn: (...args: unknown[]) => void) { this.off(type, fn); }
  dispatchEvent(e: { type: string }) { this.emit(e.type, e); return true; }
  contains(other: MinimalNode): boolean {
    if (this === other) return true;
    return this.childNodes.some(c => c.contains(other));
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling(): MinimalNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[idx + 1] ?? null;
  }
  get textContent() { return ''; }
  set textContent(_v: string) {}
  get innerHTML() { return ''; }
  set innerHTML(_v: string) {}
  cloneNode() { return new MinimalNode(this.nodeType); }
  compareDocumentPosition() { return 0; }
}

class MinimalElement extends MinimalNode {
  tagName: string;
  localName: string;
  dir = '';
  private _attrs: Record<string, string> = {};

  constructor(tag: string, doc: MinimalDocument) {
    super(1);
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
  }
  setAttribute(k: string, v: string) { this._attrs[k] = String(v); }
  getAttribute(k: string) { return this._attrs[k] ?? null; }
  hasAttribute(k: string) { return k in this._attrs; }
  removeAttribute(k: string) { delete this._attrs[k]; }
  get id() { return this._attrs['id'] ?? ''; }
  set id(v: string) { this._attrs['id'] = v; }
  get className() { return this._attrs['class'] ?? ''; }
  set className(v: string) { this._attrs['class'] = v; }
  focus() {} blur() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  matches() { return false; }
  querySelector() { return null; }
  querySelectorAll() { return [] as MinimalElement[]; }
  closest() { return null; }
  get outerHTML() { return `<${this.localName}></${this.localName}>`; }
  get outerText() { return ''; }
  get innerText() { return ''; }
  cloneNode() {
    const el = new MinimalElement(this.localName, this.ownerDocument!);
    Object.assign((el as any)._attrs, this._attrs);
    return el;
  }
}

class MinimalDocument extends MinimalNode {
  body: MinimalElement;
  head: MinimalElement;
  documentElement: MinimalElement;

  constructor() {
    super(9);
    this.ownerDocument = null;
    this.body = new MinimalElement('body', this);
    this.head = new MinimalElement('head', this);
    this.documentElement = new MinimalElement('html', this);
    this.documentElement.ownerDocument = this;
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.body.ownerDocument = this;
    this.head.ownerDocument = this;
  }
  createElement(tag: string): MinimalElement {
    const el = new MinimalElement(tag, this);
    el.ownerDocument = this;
    return el;
  }
  createTextNode(text: string): MinimalNode {
    const n = new MinimalNode(3);
    n.nodeValue = text; n.ownerDocument = this;
    return n;
  }
  createDocumentFragment(): MinimalNode {
    const f = new MinimalNode(11);
    f.ownerDocument = this;
    return f;
  }
  getElementById() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return [] as MinimalElement[]; }
  get defaultView() { return globalThis; }
  addEventListener() {} removeEventListener() {} dispatchEvent() { return true; }
}

const _doc = new MinimalDocument();
Object.defineProperty(globalThis, 'document', { value: _doc, writable: true, configurable: true });
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true, configurable: true });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// React DOM checks for these globals during commit phase
(globalThis as any).HTMLIFrameElement = class HTMLIFrameElement extends MinimalElement {
  constructor() { super('iframe', _doc); }
};
(globalThis as any).HTMLElement = MinimalElement;
(globalThis as any).Node = MinimalNode;

// Override @testing-library/dom's getElementError to avoid prettyDOM crashing
// on our MinimalElement (which isn't a real DOM element).
import { configure } from '@testing-library/react';
configure({
  getElementError: (message: string | null) => {
    const error = new Error(message ?? 'waitFor timed out');
    error.name = 'TestingLibraryElementError';
    return error;
  },
});

// @testing-library/dom's waitFor needs MutationObserver to detect re-renders
(globalThis as any).MutationObserver = class MutationObserver {
  private _cb: MutationCallback;
  constructor(cb: MutationCallback) { this._cb = cb; }
  observe(node: MinimalNode) {
    // Fire callback immediately on any future state changes by listening to
    // childList mutations on the container. We approximate this by calling
    // the callback on the next tick so waitFor's interval polling also works.
    const notify = () => { this._cb([] as unknown as MutationRecord[], this as unknown as globalThis.MutationObserver); };
    // Store reference on the node so disconnect can clean up
    (node as any)._mutationObserverNotify = notify;
    node.on('mutation', notify);
  }
  disconnect() {}
  takeRecords() { return [] as MutationRecord[]; }
};

// ── localStorage shim ─────────────────────────────────────────────────────────
// Uses a Proxy so Object.keys(localStorage) returns stored keys — matching what
// browsers provide and what the tests assert via Object.keys(localStorage).
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
  get(target, prop: string) {
    if (prop in target) return (target as Record<string, unknown>)[prop];
    return _store[prop];
  },
  set(_target, prop: string, value: string) { _store[prop] = value; return true; },
  ownKeys() { return [...Object.keys(_store), ...Object.keys(_methods)]; },
  getOwnPropertyDescriptor(target, prop: string) {
    if (prop in _store) return { value: _store[prop], writable: true, enumerable: true, configurable: true };
    return Object.getOwnPropertyDescriptor(target, prop);
  },
  has(_target, prop: string) { return prop in _store || prop in _methods; },
});
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../api/recommendation', () => ({
  recommendationApi: {
    fetch: vi.fn(),
  },
}));

import { recommendationApi } from '../../api/recommendation';

const sample = {
  session: 'morning' as const,
  generated_at: '2026-04-20T10:00:00+08:00',
  overview: {
    sh_index_value: 3200, sh_index_change_pct: 0.5, top_sectors: [],
    up_count: 0, down_count: 0, limit_up_count: 0, limit_down_count: 0,
  },
  recommendations: [], warnings: [], risk_notes: [],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('detectSession', () => {
  it('returns morning before 11:30 Shanghai time', () => {
    expect(__test_only.detectSession(new Date('2026-04-20T03:29:00Z'))).toBe('morning');
    // 2026-04-20T03:29:00Z = Shanghai 11:29
  });
  it('returns afternoon at 11:30 Shanghai time', () => {
    expect(__test_only.detectSession(new Date('2026-04-20T03:30:00Z'))).toBe('afternoon');
  });
  it('returns afternoon late evening', () => {
    expect(__test_only.detectSession(new Date('2026-04-20T14:00:00Z'))).toBe('afternoon');
  });
});

describe('useMarketRecommendation', () => {
  // Pin the clock to a weekday morning in Shanghai (2026-04-21 09:00 CST = 2026-04-21T01:00:00Z)
  // so detectSession() always returns 'morning' regardless of when the test suite runs.
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-04-21T01:00:00Z'), shouldAdvanceTime: true });
  });

  it('fetches on first open and caches result in localStorage', async () => {
    (recommendationApi.fetch as any).mockResolvedValue(sample);
    const { result } = renderHook(() => useMarketRecommendation());
    act(() => { result.current.open(); });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data?.session).toBe('morning');
    });
    expect(recommendationApi.fetch).toHaveBeenCalledTimes(1);
    const storedKeys = Object.keys(localStorage).filter(k => k.startsWith('dsa:recommendation:v1:'));
    expect(storedKeys.length).toBe(1);
  });

  it('uses cache on second open without refetching', async () => {
    (recommendationApi.fetch as any).mockResolvedValue(sample);
    const { result } = renderHook(() => useMarketRecommendation());
    act(() => { result.current.open(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.close(); });
    act(() => { result.current.open(); });
    await waitFor(() => expect(result.current.data?.session).toBe('morning'));
    expect(recommendationApi.fetch).toHaveBeenCalledTimes(1);
  });

  it('regenerate bypasses cache', async () => {
    (recommendationApi.fetch as any).mockResolvedValue(sample);
    const { result } = renderHook(() => useMarketRecommendation());
    act(() => { result.current.open(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { void result.current.regenerate(); });
    await waitFor(() => expect(recommendationApi.fetch).toHaveBeenCalledTimes(2));
  });

  it('switchSession fetches for the other session', async () => {
    (recommendationApi.fetch as any).mockResolvedValue(sample);
    const { result } = renderHook(() => useMarketRecommendation());
    act(() => { result.current.open(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    (recommendationApi.fetch as any).mockResolvedValue({ ...sample, session: 'afternoon' });
    act(() => { void result.current.switchSession('afternoon'); });
    await waitFor(() => expect(result.current.data?.session).toBe('afternoon'));
    expect(recommendationApi.fetch).toHaveBeenCalledTimes(2);
  });
});
