import type { NormalizedUsageEvent } from './normalise';

export type DailyAccountUsage = {
  day: string;
  account: string;
  eventCount: number;
  units: number;
};

function compareRows(
  left: Pick<DailyAccountUsage, 'day' | 'account'>,
  right: Pick<DailyAccountUsage, 'day' | 'account'>,
): number {
  if (left.day !== right.day) {
    return left.day.localeCompare(right.day);
  }

  return left.account.localeCompare(right.account);
}

export function aggregateUsage(events: readonly NormalizedUsageEvent[]): DailyAccountUsage[] {
  const rows = new Map<string, DailyAccountUsage>();

  for (const event of events) {
    const key = `${event.day}\u0000${event.account}`;
    const existing = rows.get(key);

    if (existing) {
      existing.eventCount += 1;
      existing.units += event.units;
      continue;
    }

    rows.set(key, {
      day: event.day,
      account: event.account,
      eventCount: 1,
      units: event.units,
    });
  }

  return [...rows.values()].sort(compareRows);
}
