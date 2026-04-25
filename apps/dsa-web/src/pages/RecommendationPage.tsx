import type React from 'react';
import { useEffect } from 'react';
import { useMarketRecommendation } from '../hooks/useMarketRecommendation';
import {
  MarketOverviewBlock,
  RecommendationCard,
  SessionTabs,
} from '../components/recommendation';

const RecommendationPage: React.FC = () => {
  const {
    session,
    data,
    loading,
    error,
    isNonTradingDay,
    open,
    switchSession,
    regenerate,
  } = useMarketRecommendation();

  useEffect(() => {
    document.title = '今日推荐 - DSA';
    open();
  }, [open]);

  return (
    <div className="flex h-[calc(100vh-5rem)] w-full flex-col overflow-hidden sm:h-[calc(100vh-5.5rem)] lg:h-[calc(100vh-2rem)]">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-3 pb-4 md:px-6">
        <header className="flex flex-shrink-0 items-center justify-between py-3 md:py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">今日推荐</h1>
            {data ? (
              <p className="text-xs text-secondary-text">生成于 {data.generated_at}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void regenerate()}
            disabled={loading || isNonTradingDay}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-secondary-text transition-colors hover:bg-hover hover:text-foreground disabled:opacity-50"
          >
            重新生成
          </button>
        </header>

        <SessionTabs
          current={session}
          autoDetected={session}
          onChange={(s) => void switchSession(s)}
        />

        <div className="flex-1 space-y-3 overflow-y-auto pt-3">
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
                <ul className="space-y-0.5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
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
                <ul className="space-y-0.5 border-t border-border pt-2 text-[11px] text-secondary-text">
                  {data.risk_notes.map((n, i) => <li key={i}>· {n}</li>)}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RecommendationPage;
