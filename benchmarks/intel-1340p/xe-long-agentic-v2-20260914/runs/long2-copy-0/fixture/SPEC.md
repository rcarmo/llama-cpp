# Usage reporting benchmark specification

## Goal

Implement a small deterministic library that turns raw meter events into an account/day usage report. The benchmark is intentionally split across four cumulative milestones so the implementation evolves in realistic steps instead of one large rewrite.

The seed code already exports the required functions and types from four source files:

- `src/normalise.ts`
- `src/aggregate.ts`
- `src/report.ts`
- `src/main.ts`

The existing implementations are incomplete and partly wrong. Fix them without adding dependencies, async code, I/O, global state, or randomness.

## Public API

These exports must remain available from `./src/main`:

```ts
export type UsageEventInput = {
  account: string;
  occurredAt: string | Date;
  units: number;
  eventId?: string;
};

export type NormalizedUsageEvent = {
  account: string;
  day: string;
  units: number;
  eventId?: string;
};

export type DailyAccountUsage = {
  day: string;
  account: string;
  eventCount: number;
  units: number;
};

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

export function normalizeUsageEvent(event: UsageEventInput): NormalizedUsageEvent;
export function normalizeUsageEvents(events: readonly UsageEventInput[]): NormalizedUsageEvent[];
export function aggregateUsage(events: readonly NormalizedUsageEvent[]): DailyAccountUsage[];
export function buildUsageReport(rows: readonly DailyAccountUsage[]): UsageReport;
export function createUsageReport(events: readonly UsageEventInput[]): UsageReport;
```

`main.ts` should continue to re-export the public functions and types from the other modules.

## Milestone 1: normalize raw events

`normalizeUsageEvent` converts one raw event into a canonical normalized event.

Required behaviour:

1. `account` must be a string.
2. Trim leading and trailing whitespace from `account`.
3. After trimming, the account name must not be empty.
4. `occurredAt` must be either a string or a `Date` instance.
5. Convert `occurredAt` into a UTC calendar day string in `YYYY-MM-DD` form.
6. `units` must be a finite, non-negative integer.
7. Return a fresh object and do not mutate the input.

`normalizeUsageEvents` applies the same rules to a batch, preserves the original event order, and must not mutate the input array or its items.

### Errors for milestone 1

Use only these error classes for validation:

- `TypeError`
  - `account` is not a string
  - `occurredAt` is neither a string nor a `Date`
  - `units` is not a number
- `RangeError`
  - trimmed `account` is empty
  - `occurredAt` cannot be parsed into a valid date
  - `units` is negative, fractional, `NaN`, or infinite

Do not silently coerce invalid values.

## Milestone 2: aggregate normalized events

`aggregateUsage` receives normalized events and groups them by the pair `(day, account)`.

Required behaviour:

1. Sum `units` for each `(day, account)` group.
2. Count how many events contributed to each group in `eventCount`.
3. Return a new array.
4. Do not mutate the input array.
5. Do not rely on caller ordering.
6. Return rows in deterministic ascending order by `day`, then by `account`.

The output rows must use the exact `DailyAccountUsage` shape shown above.

## Milestone 3: build a report

`buildUsageReport` converts aggregated rows into a final report object.

Required behaviour:

1. `totals.eventCount`: sum of all row `eventCount` values.
2. `totals.units`: sum of all row `units` values.
3. `totals.dayCount`: number of distinct `day` values across all rows.
4. `totals.accountCount`: number of distinct accounts across all rows.
5. `accounts[account].eventCount`: sum of that account's row `eventCount` values.
6. `accounts[account].units`: sum of that account's row `units` values.
7. `accounts[account].dayCount`: number of distinct days present for that account.
8. `rows`: a deterministically ordered copy of the supplied rows.

### Determinism and JSON-safe output

- An empty report must use plain JSON-safe zero values.
- For empty input, return:
  - `totals.eventCount = 0`
  - `totals.units = 0`
  - `totals.dayCount = 0`
  - `totals.accountCount = 0`
  - `accounts = {}`
  - `rows = []`
- Avoid `undefined`, `NaN`, `Infinity`, `Map`, `Set`, class instances, or custom prototypes in the public output.
- `accounts` key insertion order must be deterministic. Sort account names ascending before writing them into the output object.
- `rows` must remain sorted by `day`, then `account`, even if the input rows arrive unsorted.

`createUsageReport` is the end-to-end entry point. It should compose the earlier steps in order:

1. normalize raw events
2. aggregate normalized events
3. build the final report

## Milestone 4: retry idempotency with event IDs

Raw events may contain an optional `eventId`. This supports retry-safe ingestion.

Additional required behaviour:

1. If `eventId` is absent, the event is always counted normally.
2. If `eventId` is present, it must be a string.
3. Trim leading and trailing whitespace from `eventId`.
4. After trimming, `eventId` must not be empty.
5. Batch normalization becomes idempotent by event ID.
6. Two events with the same normalized `eventId` are considered the same retried event only if their normalized `account`, normalized `day`, and `units` are all identical.
7. If a later event repeats the same `eventId` with the same normalized content, keep only one copy in `normalizeUsageEvents`.
8. If a later event repeats the same `eventId` but changes normalized `account`, normalized `day`, or `units`, throw a `RangeError` for a duplicate conflict.
9. `createUsageReport` must inherit this behaviour end to end without breaking earlier milestones.

### Errors for milestone 4

Additional validation rules:

- `TypeError`
  - `eventId` is present but not a string
- `RangeError`
  - trimmed `eventId` is empty
  - the same normalized `eventId` appears with conflicting normalized content

## Important behavioural notes

- All functions must be synchronous and side-effect free.
- Do not mutate caller-owned arrays or objects.
- Preserve earlier milestone behaviour when adding later milestone features.
- Duplicate handling is based on normalized values, not raw string formatting.
  - Example: surrounding whitespace differences in `account` or `eventId` do not create distinct events.
  - Example: two timestamps on the same UTC day may still be duplicates if the rest of the normalized event matches.
- Events without `eventId` are never deduplicated, even if they otherwise look identical.

## Non-goals

- No streaming interfaces
- No async APIs
- No database adapters
- No file or network access
- No time-zone libraries or third-party date helpers
- No support for partial success; validation errors should throw immediately

The benchmark is small on purpose. Prefer straightforward code over abstraction-heavy designs.
