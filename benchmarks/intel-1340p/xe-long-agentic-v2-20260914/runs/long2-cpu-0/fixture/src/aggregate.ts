import type { NormalizedUsageEvent } from './normalise';

export type DailyAccountUsage = {
  day: string;
  account: string;
  eventCount: number;
  units: number;
};

export function aggregateUsage(events: readonly NormalizedUsageEvent[]): DailyAccountUsage[] {
  const groups = new Map<string, { day: string; account: string; eventCount: number; units: number }>();

  for (const event of events) {
    const key = `${event.day}|${event.account}`;
    if (!groups.has(key)) {
      groups.set(key, { day: event.day, account: event.account, eventCount: 0, units: 0 });
    }
    const group = groups.get(key)!;
    group.eventCount += 1;
    group.units += event.units;
  }

  // Convert map values to array
  const result = Array.from(groups.values());

  // Sort deterministically: by day, then by account
  result.sort((a, b) => {
    if (a.day !== b.day) {
      return a.day.localeCompare(b.day);
    }
    return a.account.localeCompare(b.account);
  });

  return result;
}