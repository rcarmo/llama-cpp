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
  let totalEventCount = 0;
  let totalUnits = 0;
  const distinctDays = new Set<string>();

  for (const row of rows) {
    totalEventCount += row.eventCount;
    totalUnits += row.units;
    distinctDays.add(row.day);

    if (!accounts[row.account]) {
      accounts[row.account] = { eventCount: 0, units: 0, dayCount: 0 };
    }
    accounts[row.account].eventCount += row.eventCount;
    accounts[row.account].units += row.units;
    accounts[row.account].dayCount += 1;
  }

  // Sort account names for deterministic output
  const sortedAccountKeys = Object.keys(accounts).sort();
  const finalAccounts: Record<string, AccountUsageTotals> = {};
  for (const key of sortedAccountKeys) {
    finalAccounts[key] = accounts[key];
  }

  return {
    totals: {
      eventCount: totalEventCount,
      units: totalUnits,
      dayCount: distinctDays.size,
      accountCount: sortedAccountKeys.length,
    },
    accounts: finalAccounts,
    rows: rows, // Rows are already sorted by aggregateUsage
  };
}