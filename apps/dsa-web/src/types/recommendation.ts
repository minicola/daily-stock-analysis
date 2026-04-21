// apps/dsa-web/src/types/recommendation.ts
export type Session = 'morning' | 'afternoon';

export interface ScoreBreakdown {
  trend: number;
  volume_price: number;
  kline: number;
  space: number;
  momentum: number;
  divergence_deduction: number;
  total: number;
}

export interface RecommendedStock {
  code: string;
  name: string;
  price: number;
  change_pct: number;
  score: number;
  score_breakdown: ScoreBreakdown;
  trend_summary: string;
  operation: 'buy' | 'watch' | 'hold';
  quantity: number;
  cost_estimate: number;
  fee_estimate: number;
  entry_hint: string;
  stop_loss: number;
  target: number;
  rationale: string;
}

export interface SectorEntry {
  name: string;
  change_pct: number;
}

export interface MarketOverview {
  sh_index_value: number;
  sh_index_change_pct: number;
  top_sectors: SectorEntry[];
  up_count: number;
  down_count: number;
  limit_up_count: number;
  limit_down_count: number;
}

export interface RecommendationResult {
  session: Session;
  generated_at: string;
  overview: MarketOverview;
  recommendations: RecommendedStock[];
  warnings: string[];
  risk_notes: string[];
}
