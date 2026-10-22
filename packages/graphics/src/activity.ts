import type { Activity } from '@cool-profile/data/types';

export interface CalendarCell {
  date: string;
  value: number;
  level: number;
  column: number;
  row: number;
}

export function activityGrid(activity: Activity) {
  const offset = new Date(activity.from + 'T00:00:00Z').getUTCDay();
  const cells: CalendarCell[] = activity.days.map((day, index) => ({
    ...day,
    column: Math.floor((offset + index) / 7),
    row: (offset + index) % 7,
  }));
  return {
    cells,
    columns: Math.ceil((offset + cells.length) / 7),
    total: cells.reduce((sum, cell) => sum + cell.value, 0),
    activeDays: cells.filter((cell) => cell.value > 0).length,
  };
}

export function activityLabel(metric: Activity['metric'], locale: string): string {
  return locale === 'zh-CN'
    ? metric === 'activity-score'
      ? '活跃分'
      : '贡献'
    : metric === 'activity-score'
      ? 'activity points'
      : 'contributions';
}
