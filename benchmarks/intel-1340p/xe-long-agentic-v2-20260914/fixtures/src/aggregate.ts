import type { NormalizedUsageEvent } from './normalise';

export type DailyAccountUsage = {
  day: string;
  account: string;
  eventCount: number;
  units: number;
};

export function aggregateUsage(events: readonly NormalizedUsageEvent[]): DailyAccountUsage[] {
  return [...events]
    .sort((left, right) => left.account.localeCompare(right.account))
    .map((event) => ({
      day: event.day,
      account: event.account,
      eventCount: 1,
      units: event.units,
    }));
}
