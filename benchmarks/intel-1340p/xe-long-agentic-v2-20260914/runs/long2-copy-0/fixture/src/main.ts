export * from './normalise';
export * from './aggregate';
export * from './report';

import { aggregateUsage } from './aggregate';
import { normalizeUsageEvents, type UsageEventInput } from './normalise';
import { buildUsageReport, type UsageReport } from './report';

export function createUsageReport(events: readonly UsageEventInput[]): UsageReport {
  const normalized = normalizeUsageEvents(events);
  const rows = aggregateUsage(normalized);
  return buildUsageReport(rows);
}