import { useMemo, useRef, useState } from 'react';

/**
 * 검색형 셀렉트 — 어드민의 "전체 리스트 드롭다운"(챌린지 선택 등) 대체.
 *  - 타이핑으로 라벨/보조텍스트/값을 부분 일치 검색
 *  - multiple: 다중 선택(칩 표시, ✕로 제거) / 단일 선택(선택 즉시 닫힘)
 *  - 항상 value는 string[] — 단일 모드에서도 [id] 형태로 통일해 콜러 어댑터가 단순하다
 */
export interface SearchableOption {
  value: string;
  label: string;
  /** 보조 라벨 (상태·ID 등) — 검색 대상에 포함 */
  sub?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  multiple = false,
  placeholder = '검색해서 선택하세요',
  disabled = false,
}: {
  options: SearchableOption[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const selected = value.filter((v) => byValue.has(v) || v); // 옵션 로딩 전에도 유지

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sub ?? '').toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q),
    );
  }, [options, keyword]);

  const toggle = (v: string) => {
    if (multiple) {
      onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      inputRef.current?.focus();
    } else {
      onChange([v]);
      setOpen(false);
      setKeyword('');
    }
  };

  const labelOf = (v: string) => byValue.get(v)?.label ?? v;

  return (
    <div className="relative">
      {/* 닫힘/열림 공용 컨트롤 — 칩 + 검색 입력 */}
      <div
        className={`min-h-[42px] w-full px-2.5 py-1.5 border rounded-xl bg-white flex items-center gap-1.5 flex-wrap cursor-text ${
          open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-300'
        } ${disabled ? 'bg-gray-50 cursor-not-allowed' : ''}`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {selected.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium max-w-[240px]"
          >
            <span className="truncate">{labelOf(v)}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(selected.filter((x) => x !== v));
                }}
                className="text-indigo-400 hover:text-indigo-700"
                aria-label="선택 해제"
              >
                ✕
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          value={keyword}
          disabled={disabled}
          onChange={(e) => {
            setKeyword(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length > 0) toggle(filtered[0].value);
            }
            if (e.key === 'Backspace' && !keyword && selected.length > 0) {
              onChange(selected.slice(0, -1));
            }
          }}
          placeholder={selected.length === 0 ? placeholder : multiple ? '더 검색…' : ''}
          className="flex-1 min-w-[120px] text-sm outline-none bg-transparent py-1"
        />
        {multiple && selected.length > 0 && (
          <span className="text-[11px] text-gray-400 whitespace-nowrap">{selected.length}개 선택</span>
        )}
      </div>

      {open && !disabled && (
        <>
          {/* 바깥 클릭 닫기 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400">검색 결과가 없어요</p>
            ) : (
              filtered.map((o) => {
                const isSelected = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-indigo-50 ${
                      isSelected ? 'bg-indigo-50/60' : ''
                    }`}
                  >
                    {multiple && (
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] flex-shrink-0 ${
                          isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'
                        }`}
                      >
                        {isSelected ? '✓' : ''}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-gray-800">{o.label}</span>
                      {o.sub && <span className="block text-[11px] text-gray-400 truncate">{o.sub}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
