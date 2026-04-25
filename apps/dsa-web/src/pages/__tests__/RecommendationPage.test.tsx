// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import '../../__test-shims__/node-env-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RecommendationPage from '../RecommendationPage';

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
    sh_index_value: 3200, sh_index_change_pct: 0.5,
    top_sectors: [{ name: '半导体', change_pct: 2.1 }],
    up_count: 3000, down_count: 2000, limit_up_count: 50, limit_down_count: 5,
  },
  recommendations: [{
    code: '600519', name: '贵州茅台', price: 1680.0, change_pct: 1.2,
    score: 78,
    score_breakdown: { trend: 24, volume_price: 19, kline: 16, space: 12, momentum: 7, divergence_deduction: 0, total: 78 },
    trend_summary: '均线多头', operation: 'buy' as const, quantity: 100,
    cost_estimate: 168050.0, fee_estimate: 50.0,
    entry_hint: '回踩MA5', stop_loss: 1629.6, target: 1764.0,
    rationale: '评分78',
  }],
  warnings: [],
  risk_notes: ['总仓位不超40%'],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // 2026-04-21 is a Tuesday in Asia/Shanghai → trading day
  vi.useFakeTimers({ now: new Date('2026-04-21T01:00:00Z'), shouldAdvanceTime: true });
});

describe('RecommendationPage', () => {
  it('renders heading and loads data on mount', async () => {
    (recommendationApi.fetch as any).mockResolvedValue(sample);
    render(<RecommendationPage />);
    expect(screen.getByRole('heading', { name: /今日推荐/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/贵州茅台/)).toBeInTheDocument());
    expect(screen.getByText(/上证指数/)).toBeInTheDocument();
  });

  it('shows error with retry button on failure', async () => {
    (recommendationApi.fetch as any).mockRejectedValue(new Error('boom'));
    render(<RecommendationPage />);
    await waitFor(() => expect(screen.getByText(/boom|生成失败/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('renders non-trading-day hint on weekends', async () => {
    // 2026-04-19 is a Sunday in Asia/Shanghai
    vi.setSystemTime(new Date('2026-04-19T01:00:00Z'));
    render(<RecommendationPage />);
    expect(await screen.findByText(/今日非交易日/)).toBeInTheDocument();
    expect(recommendationApi.fetch).not.toHaveBeenCalled();
  });
});
