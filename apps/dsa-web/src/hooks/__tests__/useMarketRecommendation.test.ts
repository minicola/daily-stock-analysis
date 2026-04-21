// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
// jsdom 28 / html-encoding-sniffer 6 / @exodus/bytes (pure-ESM) cannot boot under Node 20 CJS
// workers. We use the node environment + a shared DOM/localStorage shim instead.
import '../../__test-shims__/node-env-dom';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor, configure } from '@testing-library/react';
import { useMarketRecommendation, __test_only } from '../useMarketRecommendation';

configure({
  getElementError: (message: string | null) => {
    const err = new Error(message ?? 'waitFor timed out');
    err.name = 'TestingLibraryElementError';
    return err;
  },
});

vi.mock('../../api/recommendation', () => ({
  recommendationApi: { fetch: vi.fn() },
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
