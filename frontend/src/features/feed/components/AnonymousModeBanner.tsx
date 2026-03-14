import { useMemo } from 'react';
import { format, nextMonday } from 'date-fns';
import { ko } from 'date-fns/locale';

const ANONYMOUS_NAMES = ['새벽의 곰', '조용한 호랑이', '집중하는 올빼미', '묵묵한 이무기'];

interface Props {
  isActive: boolean;
  onToggle: () => void;
}

export function AnonymousModeBanner({ isActive, onToggle }: Props) {
  const alias = useMemo(() => ANONYMOUS_NAMES[new Date().getMonth() % ANONYMOUS_NAMES.length], []);
  const nextApplyDate = useMemo(() => format(nextMonday(new Date()), 'M월 d일(E)', { locale: ko }), []);

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            마당 댓글 익명 활동명: <span className="text-primary-700">{alias}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            댓글 작성 시 적용 · 다음 변경일 {nextApplyDate}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`px-3 py-1.5 text-xs rounded-xl border shrink-0 transition-colors ${
            isActive
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-gray-700 border-gray-300'
          }`}
        >
          익명 {isActive ? 'ON' : 'OFF'}
        </button>
      </div>
    </section>
  );
}
