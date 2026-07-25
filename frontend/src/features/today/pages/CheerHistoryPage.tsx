import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { apiClient } from '@/lib/api-client';

type ViewMode = 'monthly' | 'weekly' | 'daily';
type CheerTab = 'received' | 'sent';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const cheerDate = (c: any) => new Date(c.sentAt || c.createdAt);
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

export const CheerHistoryPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<CheerTab>('received');
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [cursorMonth, setCursorMonth] = useState<Date>(startOfMonth(new Date()));

  const { data: received } = useQuery({
    queryKey: ['cheer-history', 'received'],
    queryFn: async () => {
      const res = await apiClient.get('/ch/cheers/my?type=received&limit=100');
      return res.data.data.cheers as any[];
    },
  });
  const { data: sent } = useQuery({
    queryKey: ['cheer-history', 'sent'],
    queryFn: async () => {
      const res = await apiClient.get('/ch/cheers/my?type=sent&limit=100');
      return res.data.data.cheers as any[];
    },
  });

  const currentAll = useMemo(() => {
    const src = tab === 'received' ? received : sent;
    return (src || []).filter((c: any) => c.status === 'sent');
  }, [tab, received, sent]);

  // 캘린더 점 표시용 — 현재 탭 응원이 있는 날짜 집합
  const daysWithCheer = useMemo(
    () => new Set(currentAll.map((c: any) => dayKey(cheerDate(c)))),
    [currentAll],
  );

  // 선택 필터에 맞는 목록
  const filtered = useMemo(() => {
    return currentAll
      .filter((c: any) => {
        const d = cheerDate(c);
        if (viewMode === 'daily') return isSameDay(d, selectedDate);
        if (viewMode === 'weekly') return isSameWeek(d, selectedDate, { weekStartsOn: 0 });
        return isSameMonth(d, selectedDate);
      })
      .sort((a: any, b: any) => cheerDate(b).getTime() - cheerDate(a).getTime());
  }, [currentAll, viewMode, selectedDate]);

  // 캘린더 셀 (해당 월 주 단위로 채움)
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursorMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursorMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursorMonth]);

  const goMonth = (dir: -1 | 1) => {
    const next = dir === 1 ? addMonths(cursorMonth, 1) : subMonths(cursorMonth, 1);
    setCursorMonth(next);
    setSelectedDate(startOfMonth(next));
    setViewMode('monthly');
  };

  const pickDay = (d: Date) => {
    setSelectedDate(d);
    setViewMode('daily');
    if (!isSameMonth(d, cursorMonth)) setCursorMonth(startOfMonth(d));
  };

  const rangeLabel = (() => {
    if (viewMode === 'daily') return format(selectedDate, 'M월 d일 (E)', { locale: ko });
    if (viewMode === 'weekly') {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 0 });
      return `${format(ws, 'M.d')} ~ ${format(we, 'M.d')}`;
    }
    return format(selectedDate, 'yyyy년 M월', { locale: ko });
  })();

  return (
    <motion.div
      className="min-h-screen bg-white"
      initial={{ x: '100%', opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'tween', duration: 0.28, ease: 'easeOut' }}
    >
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="뒤로"
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-gray-900">응원 이력</h1>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* 캘린더 */}
        <div className="rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => goMonth(-1)} className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500">◀</button>
            <span className="text-sm font-bold text-gray-900">{format(cursorMonth, 'yyyy년 M월', { locale: ko })}</span>
            <button onClick={() => goMonth(1)} className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500">▶</button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`text-center text-[11px] font-medium ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((d) => {
              const inMonth = isSameMonth(d, cursorMonth);
              const selected = isSameDay(d, selectedDate) && viewMode === 'daily';
              const inWeek = viewMode === 'weekly' && isSameWeek(d, selectedDate, { weekStartsOn: 0 });
              const has = daysWithCheer.has(dayKey(d));
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => pickDay(d)}
                  className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-colors ${
                    selected
                      ? 'bg-primary-500 text-white font-bold'
                      : inWeek
                      ? 'bg-primary-50 text-gray-800'
                      : inMonth
                      ? 'text-gray-700 hover:bg-gray-100'
                      : 'text-gray-300'
                  }`}
                >
                  <span>{format(d, 'd')}</span>
                  {has && (
                    <span className={`absolute bottom-1 w-1 h-1 rounded-full ${selected ? 'bg-white' : 'bg-primary-500'}`} />
                  )}
                  {isToday(d) && !selected && (
                    <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-amber-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 월별/주간/일별 필터 */}
        <div className="flex items-center gap-2">
          {([['monthly', '월별'], ['weekly', '주간'], ['daily', '일별']] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                viewMode === mode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400">{rangeLabel}</span>
        </div>

        {/* 받은/보낸 탭 */}
        <div className="relative flex gap-5 border-b border-gray-100">
          {(['received', 'sent'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative pb-2 text-sm font-semibold ${tab === t ? 'text-gray-900' : 'text-gray-400'}`}
            >
              {t === 'received' ? '받은 응원' : '보낸 응원'}
              {tab === t && (
                <motion.span layoutId="cheer-history-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-gray-900" />
              )}
            </button>
          ))}
          <span className="ml-auto self-center text-xs text-gray-400">{filtered.length}건</span>
        </div>

        {/* 목록 */}
        <div className="space-y-2.5 pb-8">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">
              해당 기간에 {tab === 'received' ? '받은' : '보낸'} 응원이 없어요
            </p>
          ) : (
            filtered.map((c: any) => {
              const senderName = c.senderAlias || '익명의 응원자';
              const msg =
                c.message ||
                (c.delta ? `${c.delta}분 일찍 인증하고 응원을 보냈어요 💪` : '응원을 보냈어요 💪');
              return (
                <div key={c.cheerId} className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg flex-shrink-0">💌</span>
                    <div className="flex-1 min-w-0">
                      {tab === 'received' && (
                        <p className="text-xs font-semibold text-gray-700 mb-0.5">{senderName}</p>
                      )}
                      <p className="text-sm text-gray-700 leading-relaxed">{msg}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-gray-400">
                          {format(cheerDate(c), 'M/d HH:mm', { locale: ko })}
                        </span>
                        {c.reactionType && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">리액션 {c.reactionType}</span>
                        )}
                        {c.replyMessage && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">답장</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
};
