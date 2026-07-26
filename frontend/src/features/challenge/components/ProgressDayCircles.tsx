// 챌린지 진행 현황 — 가로 원형 체크 (챌린지 피드의 "진행 현황"과 동일 스타일)
interface ProgressDayCirclesProps {
  durationDays: number;
  todayDay: number;
  isDayDone: (day: number) => boolean;
  isDayPartial?: (day: number) => boolean;
  note?: string;
}

export function ProgressDayCircles({
  durationDays,
  todayDay,
  isDayDone,
  isDayPartial,
  note,
}: ProgressDayCirclesProps) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: durationDays }, (_, i) => i + 1).map((day) => {
          const isToday = day === todayDay;
          const isDone = isDayDone(day);
          const isPartial = !isDone && Boolean(isDayPartial?.(day));
          const isPastMissed = day < todayDay && !isDone;
          return (
            <div
              key={day}
              title={
                isDone && isToday ? `Day ${day} 완료 (오늘)` :
                isDone ? `Day ${day} 완료` :
                isToday ? '오늘' :
                isPastMissed ? `Day ${day} 미인증` :
                `Day ${day}`
              }
              className={[
                'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                isDone && isToday
                  ? 'bg-emerald-500 text-white ring-2 ring-offset-1 ring-blue-400'
                  : isDone
                  ? 'bg-emerald-500 text-white'
                  : isPartial
                  ? 'bg-yellow-300 text-yellow-800'
                  : isToday
                  ? 'bg-gray-100 text-gray-600 ring-2 ring-blue-400'
                  : isPastMissed
                  ? 'bg-red-50 text-red-300 border border-red-100'
                  : 'bg-gray-100 text-gray-400',
              ].join(' ')}
            >
              {isDone ? '✓' : day}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> 인증완료</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-100 ring-1 ring-blue-400 inline-block" /> 오늘</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 ring-1 ring-blue-400 ring-offset-1 inline-block" /> 오늘+완료</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-50 border border-red-100 inline-block" /> 미인증</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-100 inline-block" /> 예정</span>
        {note && <span className="text-gray-400">{note}</span>}
      </div>
    </div>
  );
}
