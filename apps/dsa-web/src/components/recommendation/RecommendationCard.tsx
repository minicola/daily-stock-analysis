// apps/dsa-web/src/components/recommendation/RecommendationCard.tsx
import type React from 'react';
import type { RecommendedStock } from '../../types/recommendation';

interface Props {
  stock: RecommendedStock;
}

const OP_LABEL: Record<RecommendedStock['operation'], string> = {
  buy: '建议买入',
  watch: '建议观望',
  hold: '建议持有',
};

const formatPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const colorOf = (n: number) => (n >= 0 ? 'text-red-500' : 'text-green-500');

export const RecommendationCard: React.FC<Props> = ({ stock }) => (
  <div className="rounded-md border border-border p-3 text-sm">
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <span className="font-medium">{stock.name}</span>
        <span className="ml-1 text-xs text-secondary-text">{stock.code}</span>
      </div>
      <div className="text-right">
        <div className="font-medium">{stock.price.toFixed(2)}</div>
        <div className={`text-xs ${colorOf(stock.change_pct)}`}>
          {formatPct(stock.change_pct)}
        </div>
      </div>
    </div>

    <div className="mt-2 flex items-center gap-2">
      <div className="flex-1 text-xs text-secondary-text">评分</div>
      <div className="flex-[3] h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className="h-full bg-primary"
          style={{ width: `${Math.min(100, stock.score)}%` }}
        />
      </div>
      <div className="w-8 text-right text-xs">{stock.score}</div>
    </div>

    <div className="mt-2 text-xs text-secondary-text">{stock.trend_summary}</div>

    <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
      <div><span className="text-secondary-text">操作：</span>{OP_LABEL[stock.operation]}</div>
      <div><span className="text-secondary-text">数量：</span>{stock.quantity} 股</div>
      <div><span className="text-secondary-text">所需资金：</span>约 {stock.cost_estimate.toFixed(0)} 元</div>
      <div><span className="text-secondary-text">含费：</span>{stock.fee_estimate.toFixed(2)} 元</div>
      <div><span className="text-secondary-text">止损：</span>{stock.stop_loss.toFixed(2)}</div>
      <div><span className="text-secondary-text">目标：</span>{stock.target.toFixed(2)}</div>
    </div>

    <div className="mt-2 text-xs">
      <div className="text-secondary-text">介入时机</div>
      <div>{stock.entry_hint}</div>
    </div>

    <div className="mt-1 text-xs text-secondary-text">{stock.rationale}</div>
  </div>
);
