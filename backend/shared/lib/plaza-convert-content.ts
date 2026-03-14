export function buildPlazaFallbackContent(item: Record<string, any>): string {
  const normalizedTodayNote = typeof item.todayNote === 'string' ? item.todayNote.trim() : '';
  const normalizedTomorrowPromise = typeof item.tomorrowPromise === 'string' ? item.tomorrowPromise.trim() : '';

  if (normalizedTodayNote) return normalizedTodayNote;
  if (normalizedTomorrowPromise) return normalizedTomorrowPromise;

  if (item.day !== undefined && item.day !== null) {
    const parsedDay = Number(item.day);
    if (Number.isFinite(parsedDay) && parsedDay > 0) {
      return `Day ${Math.floor(parsedDay)} 인증을 완료했어요.`;
    }
  }

  return '인증을 완료했어요.';
}
