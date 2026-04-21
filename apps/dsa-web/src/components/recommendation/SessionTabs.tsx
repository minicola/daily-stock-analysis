// apps/dsa-web/src/components/recommendation/SessionTabs.tsx
import type React from 'react';
import type { Session } from '../../types/recommendation';

interface Props {
  current: Session;
  autoDetected: Session;
  onChange: (session: Session) => void;
}

const TABS: { value: Session; label: string }[] = [
  { value: 'morning', label: '上午盘' },
  { value: 'afternoon', label: '下午盘' },
];

export const SessionTabs: React.FC<Props> = ({ current, autoDetected, onChange }) => (
  <div className="flex gap-1 border-b border-border">
    {TABS.map(tab => {
      const active = current === tab.value;
      return (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
            active
              ? 'border-primary text-primary font-medium'
              : 'border-transparent text-secondary-text hover:text-foreground'
          }`}
        >
          {tab.label}
          {tab.value === autoDetected ? (
            <span className="ml-1 text-xs text-primary/70">·当前</span>
          ) : null}
        </button>
      );
    })}
  </div>
);
