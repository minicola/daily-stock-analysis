// apps/dsa-web/src/components/recommendation/MarketOverviewBlock.tsx
import type React from 'react';
import type { MarketOverview } from '../../types/recommendation';

interface Props {
  overview: MarketOverview;
}

const formatPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const colorOf = (n: number) => (n >= 0 ? 'text-red-500' : 'text-green-500');

export const MarketOverviewBlock: React.FC<Props> = ({ overview }) => (
  <div className="rounded-md border border-border bg-background-subtle p-3 text-sm">
    <div className="flex items-baseline justify-between">
      <span className="font-medium">上证指数</span>
      <span>
        {overview.sh_index_value.toFixed(2)}{' '}
        <span className={colorOf(overview.sh_index_change_pct)}>
          {formatPct(overview.sh_index_change_pct)}
        </span>
      </span>
    </div>
    <div className="mt-1.5 text-xs text-secondary-text">
      涨 {overview.up_count} · 跌 {overview.down_count} · 涨停 {overview.limit_up_count} · 跌停 {overview.limit_down_count}
    </div>
    {overview.top_sectors.length > 0 ? (
      <div className="mt-2">
        <div className="text-xs text-secondary-text">领涨板块</div>
        <ul className="mt-1 space-y-0.5">
          {overview.top_sectors.map(s => (
            <li key={s.name} className="flex justify-between text-xs">
              <span>{s.name}</span>
              <span className={colorOf(s.change_pct)}>{formatPct(s.change_pct)}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null}
  </div>
);
