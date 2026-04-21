// apps/dsa-web/src/components/recommendation/RecommendationDrawer.tsx
import type React from 'react';
import { useEffect } from 'react';
import { useMarketRecommendation } from '../../hooks/useMarketRecommendation';
import { SessionTabs } from './SessionTabs';
import { MarketOverviewBlock } from './MarketOverviewBlock';
import { RecommendationCard } from './RecommendationCard';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const RecommendationDrawer: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    session, data, loading, error, isNonTradingDay,
    open, switchSession, regenerate,
  } = useMarketRecommendation();

  useEffect(() => {
    if (isOpen) open();
  }, [isOpen, open]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative z-10 flex w-96 lg:w-[28rem] flex-col bg-background shadow-2xl overflow-y-auto">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-medium">今日推荐</h2>
            {data ? (
              <p className="text-xs text-secondary-text">生成于 {data.generated_at}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void regenerate()}
              disabled={loading || isNonTradingDay}
              className="text-xs text-secondary-text hover:text-foreground disabled:opacity-50"
            >
              重新生成
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-secondary-text hover:text-foreground"
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        </header>

        <SessionTabs
          current={session}
          autoDetected={session}
          onChange={(s) => void switchSession(s)}
        />

        <div className="flex-1 p-3 space-y-3">
          {isNonTradingDay ? (
            <div className="text-sm text-secondary-text">
              今日非交易日，暂无实时推荐。
            </div>
          ) : loading ? (
            <div className="text-sm text-secondary-text">分析领涨板块…</div>
          ) : error ? (
            <div className="space-y-2">
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
              <button
                type="button"
                onClick={() => void regenerate()}
                className="btn-primary text-xs"
              >
                重试
              </button>
            </div>
          ) : data ? (
            <>
              {data.warnings.length > 0 ? (
                <ul className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning space-y-0.5">
                  {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              ) : null}
              <MarketOverviewBlock overview={data.overview} />
              <div className="space-y-2">
                {data.recommendations.length === 0 ? (
                  <div className="text-xs text-secondary-text">暂无符合条件的推荐。</div>
                ) : data.recommendations.map(s => (
                  <RecommendationCard key={s.code} stock={s} />
                ))}
              </div>
              {data.risk_notes.length > 0 ? (
                <ul className="pt-2 border-t border-border text-[11px] text-secondary-text space-y-0.5">
                  {data.risk_notes.map((n, i) => <li key={i}>· {n}</li>)}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
};
