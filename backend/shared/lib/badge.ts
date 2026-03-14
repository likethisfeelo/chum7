export function evaluateBadgeIds(input: {
  day: number;
  consecutiveDays: number;
  isRemedy?: boolean;
}): string[] {
  if (input.isRemedy) return [];

  const newBadges: string[] = [];
  if (input.consecutiveDays === 3) {
    newBadges.push('3-day-streak');
  }
  if (input.day === 7 && input.consecutiveDays === 7) {
    newBadges.push('7-day-master');
  }

  return newBadges;
}
