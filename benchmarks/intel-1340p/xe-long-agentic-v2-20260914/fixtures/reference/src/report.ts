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

type MutableAccountTotals = {
  eventCount: number;
  units: number;
  days: Set<string>;
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

export function buildUsageReport(inputRows: readonly DailyAccountUsage[]): UsageReport {
  const rows = inputRows.map((row) => ({ ...row })).sort(compareRows);
  const totals = {
    eventCount: 0,
    units: 0,
    dayCount: 0,
    accountCount: 0,
  };

  const allDays = new Set<string>();
  const allAccounts = new Set<string>();
  const accountTotals = new Map<string, MutableAccountTotals>();

  for (const row of rows) {
    totals.eventCount += row.eventCount;
    totals.units += row.units;
    allDays.add(row.day);
    allAccounts.add(row.account);

    let account = accountTotals.get(row.account);
    if (!account) {
      account = { eventCount: 0, units: 0, days: new Set<string>() };
      accountTotals.set(row.account, account);
    }

    account.eventCount += row.eventCount;
    account.units += row.units;
    account.days.add(row.day);
  }

  totals.dayCount = allDays.size;
  totals.accountCount = allAccounts.size;

  const accounts: Record<string, AccountUsageTotals> = {};
  for (const accountName of [...accountTotals.keys()].sort((left, right) => left.localeCompare(right))) {
    const account = accountTotals.get(accountName)!;
    accounts[accountName] = {
      eventCount: account.eventCount,
      units: account.units,
      dayCount: account.days.size,
    };
  }

  return {
    totals,
    accounts,
    rows,
  };
}
