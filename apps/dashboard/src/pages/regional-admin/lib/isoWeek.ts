// Shared by SchedulingPage and NotificationCenterPage — both need "what ISO week/year is it
// right now" to query /staffing/week for the current week, and duplicating this in two files
// risks the definitions drifting apart.
export function getIsoWeek(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { isoYear: d.getUTCFullYear(), isoWeek };
}
