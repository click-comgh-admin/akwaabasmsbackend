// src/utils/date.ts
import { format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';

export function getDateRange(frequency: string, lastSent?: Date) {
  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;

  switch (frequency) {
    case 'Daily':
      startDate = lastSent || subDays(now, 1);
      break;
    case 'Weekly':
      startDate = lastSent || subDays(now, 7);
      break;
    case 'Monthly':
      startDate = lastSent || startOfMonth(subMonths(now, 1));
      endDate = endOfMonth(startDate);
      break;
    case 'Quarterly':
      startDate = lastSent || startOfMonth(subMonths(now, 3));
      endDate = endOfMonth(subMonths(now, 1));
      break;
    default:
      throw new Error('Invalid frequency');
  }

  return {
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd')
  };
}