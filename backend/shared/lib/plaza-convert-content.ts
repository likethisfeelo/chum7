export type PlazaFallbackContentSource =
  | 'todayNote'
  | 'tomorrowPromise'
  | 'generatedDay'
  | 'generatedDefault';

export function resolvePlazaFallbackContent(
  item: Record<string, any>
): { content: string; source: PlazaFallbackContentSource } {
  const normalizedTodayNote = typeof item.todayNote === 'string' ? item.todayNote.trim() : '';
  const normalizedTomorrowPromise = typeof item.tomorrowPromise === 'string' ? item.tomorrowPromise.trim() : '';

  if (normalizedTodayNote) return { content: normalizedTodayNote, source: 'todayNote' };
  if (normalizedTomorrowPromise) return { content: normalizedTomorrowPromise, source: 'tomorrowPromise' };

  if (item.day !== undefined && item.day !== null) {
    const parsedDay = Number(item.day);
    if (Number.isFinite(parsedDay) && parsedDay > 0) {
      return { content: `Day ${Math.floor(parsedDay)} 인증을 완료했어요.`, source: 'generatedDay' };
    }
  }

  return { content: '인증을 완료했어요.', source: 'generatedDefault' };
}

export function buildPlazaFallbackContent(item: Record<string, any>): string {
  return resolvePlazaFallbackContent(item).content;
}
