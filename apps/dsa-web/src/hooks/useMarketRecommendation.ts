import { useCallback, useRef, useState } from 'react';
import { recommendationApi } from '../api/recommendation';
import { toApiErrorMessage } from '../api/error';
import type { RecommendationResult, Session } from '../types/recommendation';

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = `dsa:recommendation:${CACHE_VERSION}:`;

function formatShanghaiDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function getShanghaiMinutesOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function detectSession(d: Date = new Date()): Session {
  return getShanghaiMinutesOfDay(d) < 11 * 60 + 30 ? 'morning' : 'afternoon';
}

function isShanghaiWeekend(d: Date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', weekday: 'short',
  }).format(d);
  return weekday === 'Sat' || weekday === 'Sun';
}

function cacheKey(session: Session, d: Date = new Date()): string {
  return `${CACHE_PREFIX}${formatShanghaiDate(d)}:${session}`;
}

function readCache(key: string): RecommendationResult | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RecommendationResult) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: RecommendationResult) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota / privacy mode, ignore
  }
}

export interface UseMarketRecommendation {
  isOpen: boolean;
  session: Session;
  data: RecommendationResult | null;
  loading: boolean;
  error: string | null;
  isNonTradingDay: boolean;
  open: () => void;
  close: () => void;
  switchSession: (s: Session) => Promise<void>;
  regenerate: () => Promise<void>;
}

export function useMarketRecommendation(): UseMarketRecommendation {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<Session>(() => detectSession());
  const [data, setData] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNonTradingDay = isShanghaiWeekend();
  const inflight = useRef<Promise<void> | null>(null);

  const load = useCallback(async (s: Session, force = false): Promise<void> => {
    if (isNonTradingDay) return;
    const key = cacheKey(s);
    if (!force) {
      const cached = readCache(key);
      if (cached) {
        setData(cached);
        setError(null);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const fresh = await recommendationApi.fetch(s);
      writeCache(key, fresh);
      setData(fresh);
    } catch (err) {
      setError(toApiErrorMessage(err, '生成失败，请重试'));
    } finally {
      setLoading(false);
    }
  }, [isNonTradingDay]);

  const open = useCallback(() => {
    setIsOpen(true);
    const s = detectSession();
    setSession(s);
    if (inflight.current) return;
    inflight.current = load(s).finally(() => { inflight.current = null; });
  }, [load]);

  const close = useCallback(() => setIsOpen(false), []);

  const switchSession = useCallback(async (s: Session) => {
    setSession(s);
    if (inflight.current) {
      await inflight.current;
    }
    const p = load(s);
    inflight.current = p.finally(() => {
      if (inflight.current === p) inflight.current = null;
    });
    await p;
  }, [load]);

  const regenerate = useCallback(async () => {
    if (inflight.current) return;
    localStorage.removeItem(cacheKey(session));
    const p = load(session, true);
    inflight.current = p.finally(() => {
      if (inflight.current === p) inflight.current = null;
    });
    await p;
  }, [load, session]);

  return { isOpen, session, data, loading, error, isNonTradingDay, open, close, switchSession, regenerate };
}

export const __test_only = { detectSession, isShanghaiWeekend, formatShanghaiDate };
