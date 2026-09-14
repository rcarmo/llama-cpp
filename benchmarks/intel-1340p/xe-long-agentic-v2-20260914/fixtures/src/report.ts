import type { DailyAccountUsage } from './aggregate';

export type AccountUsageTotals = {
  eventCount: number;
  units: number;
  dayCount: number;
};

export type UsageReport = {
  totals: {
    eventCount: number;
    units: number;
    dayCount: number;
    accountCount: number;
  };
  accounts: Record<string, AccountUsageTotals>;
  rows: DailyAccountUsage[];
};

export function buildUsageReport(rows: readonly DailyAccountUsage[]): UsageReport {
  const accounts: Record<string, AccountUsageTotals> = {};

  for (const row of rows) {
    accounts[row.account] = {
      eventCount: row.eventCount,
      units: row.units,
      dayCount: 1,
    };
  }

  return {
    totals: {
      eventCount: rows.length,
      units: rows.length,
      dayCount: rows.length,
      accountCount: Object.keys(accounts).length,
    },
    accounts,
    rows: [...rows],
  };
}
