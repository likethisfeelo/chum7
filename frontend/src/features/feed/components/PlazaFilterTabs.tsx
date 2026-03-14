import type { PlazaFilter } from '@/features/feed/hooks/usePlazaFeed';

const FILTER_TABS: Array<{ key: PlazaFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'recruiting', label: '모집 중' },
  { key: 'ongoing', label: '진행 중' },
  { key: 'records', label: '인증 기록' },
];

interface Props {
  value: PlazaFilter;
  onChange: (filter: PlazaFilter) => void;
}

export function PlazaFilterTabs({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {FILTER_TABS.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-xl py-2 text-xs border transition-colors ${
              active
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-700 border-gray-200'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
