// READ-ONLY HIDDEN BENCHMARK TEST
import { expect, test } from 'bun:test';
import {
  aggregateUsage,
  buildUsageReport,
  createUsageReport,
  normalizeUsageEvent,
  normalizeUsageEvents,
  type DailyAccountUsage,
  type NormalizedUsageEvent,
  type UsageEventInput,
} from './src/main';

test('hidden 0: UTC day conversion handles offsets and year boundaries', () => {
  expect(
    normalizeUsageEvent({
      account: '\tomega\t',
      occurredAt: '2026-12-31T23:30:00-02:00',
      units: 4,
    }),
  ).toEqual({
    account: 'omega',
    day: '2027-01-01',
    units: 4,
  });

  expect(
    normalizeUsageEvent({
      account: 'north',
      occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
      units: 0,
    }),
  ).toEqual({
    account: 'north',
    day: '2026-01-01',
    units: 0,
  });
});

test('hidden 0: batch normalization preserves order and caller input data', () => {
  const events: UsageEventInput[] = [
    { account: ' red ', occurredAt: '2026-05-02T23:00:00-02:00', units: 1 },
    { account: 'blue', occurredAt: '2026-05-02T00:30:00+03:00', units: 2 },
    { account: 'green', occurredAt: '2026-05-01T23:59:59Z', units: 3 },
  ];
  const snapshot = events.map((event) => ({ ...event }));
  const normalized = normalizeUsageEvents(events);

  expect(normalized).toEqual([
    { account: 'red', day: '2026-05-03', units: 1 },
    { account: 'blue', day: '2026-05-01', units: 2 },
    { account: 'green', day: '2026-05-01', units: 3 },
  ]);
  expect(events).toEqual(snapshot);
});

test('hidden 0: invalid Date instances and non-number units are rejected', () => {
  expect(() =>
    normalizeUsageEvent({
      account: 'acme',
      occurredAt: new Date('invalid date'),
      units: 1,
    }),
  ).toThrow(RangeError);

  expect(() =>
    normalizeUsageEvent({
      account: 'acme',
      occurredAt: { when: '2026-01-01' } as unknown as string,
      units: 1,
    }),
  ).toThrow(TypeError);

  expect(() =>
    normalizeUsageEvent({
      account: 'acme',
      occurredAt: '2026-01-01T00:00:00Z',
      units: null as unknown as number,
    }),
  ).toThrow(TypeError);
});

test('hidden 1: aggregateUsage sums units and counts across multiple groups', () => {
  const events = Object.freeze([
    Object.freeze({ account: 'zeta', day: '2026-06-02', units: 5 }),
    Object.freeze({ account: 'alpha', day: '2026-06-01', units: 0 }),
    Object.freeze({ account: 'alpha', day: '2026-06-01', units: 4 }),
    Object.freeze({ account: 'beta', day: '2026-06-01', units: 1 }),
    Object.freeze({ account: 'alpha', day: '2026-06-03', units: 2 }),
  ]) as readonly NormalizedUsageEvent[];

  expect(aggregateUsage(events)).toEqual([
    { day: '2026-06-01', account: 'alpha', eventCount: 2, units: 4 },
    { day: '2026-06-01', account: 'beta', eventCount: 1, units: 1 },
    { day: '2026-06-02', account: 'zeta', eventCount: 1, units: 5 },
    { day: '2026-06-03', account: 'alpha', eventCount: 1, units: 2 },
  ]);
});

test('hidden 1: aggregateUsage does not mutate mutable caller arrays either', () => {
  const events: NormalizedUsageEvent[] = [
    { account: 'm', day: '2026-02-02', units: 3 },
    { account: 'a', day: '2026-02-01', units: 1 },
    { account: 'm', day: '2026-02-02', units: 2 },
  ];
  const snapshot = events.map((event) => ({ ...event }));

  aggregateUsage(events);

  expect(events).toEqual(snapshot);
});

test('hidden 2: buildUsageReport sorts rows and computes distinct day/account totals', () => {
  const rows: DailyAccountUsage[] = [
    { day: '2026-06-03', account: 'alpha', eventCount: 1, units: 2 },
    { day: '2026-06-01', account: 'beta', eventCount: 1, units: 1 },
    { day: '2026-06-02', account: 'zeta', eventCount: 1, units: 5 },
    { day: '2026-06-01', account: 'alpha', eventCount: 2, units: 4 },
  ];
  const snapshot = rows.map((row) => ({ ...row }));
  const report = buildUsageReport(rows);

  expect(report).toEqual({
    totals: {
      eventCount: 5,
      units: 12,
      dayCount: 3,
      accountCount: 3,
    },
    accounts: {
      alpha: { eventCount: 3, units: 6, dayCount: 2 },
      beta: { eventCount: 1, units: 1, dayCount: 1 },
      zeta: { eventCount: 1, units: 5, dayCount: 1 },
    },
    rows: [
      { day: '2026-06-01', account: 'alpha', eventCount: 2, units: 4 },
      { day: '2026-06-01', account: 'beta', eventCount: 1, units: 1 },
      { day: '2026-06-02', account: 'zeta', eventCount: 1, units: 5 },
      { day: '2026-06-03', account: 'alpha', eventCount: 1, units: 2 },
    ],
  });

  expect(Object.keys(report.accounts)).toEqual(['alpha', 'beta', 'zeta']);
  expect(rows).toEqual(snapshot);
});

test('hidden 2: createUsageReport stays deterministic from raw input', () => {
  const events: UsageEventInput[] = [
    { account: 'zeta', occurredAt: '2026-06-02T08:00:00Z', units: 5 },
    { account: ' alpha ', occurredAt: '2026-06-01T00:30:00Z', units: 0 },
    { account: 'beta', occurredAt: '2026-06-01T09:00:00Z', units: 1 },
    { account: 'alpha', occurredAt: '2026-06-01T10:00:00Z', units: 4 },
    { account: 'alpha', occurredAt: '2026-06-03T10:00:00Z', units: 2 },
  ];

  expect(createUsageReport(events)).toEqual({
    totals: {
      eventCount: 5,
      units: 12,
      dayCount: 3,
      accountCount: 3,
    },
    accounts: {
      alpha: { eventCount: 3, units: 6, dayCount: 2 },
      beta: { eventCount: 1, units: 1, dayCount: 1 },
      zeta: { eventCount: 1, units: 5, dayCount: 1 },
    },
    rows: [
      { day: '2026-06-01', account: 'alpha', eventCount: 2, units: 4 },
      { day: '2026-06-01', account: 'beta', eventCount: 1, units: 1 },
      { day: '2026-06-02', account: 'zeta', eventCount: 1, units: 5 },
      { day: '2026-06-03', account: 'alpha', eventCount: 1, units: 2 },
    ],
  });
});

test('hidden 3: matching retry ids dedupe after normalization, including whitespace and UTC-day normalization', () => {
  const events: UsageEventInput[] = [
    {
      account: ' beta ',
      occurredAt: '2026-08-01T23:30:00-02:00',
      units: 7,
      eventId: ' retry-7 ',
    },
    {
      account: 'beta',
      occurredAt: '2026-08-02T00:45:00Z',
      units: 7,
      eventId: 'retry-7',
    },
    {
      account: 'beta',
      occurredAt: '2026-08-02T10:00:00Z',
      units: 1,
    },
  ];

  expect(normalizeUsageEvents(events)).toEqual([
    { account: 'beta', day: '2026-08-02', units: 7, eventId: 'retry-7' },
    { account: 'beta', day: '2026-08-02', units: 1 },
  ]);

  expect(createUsageReport(events)).toEqual({
    totals: {
      eventCount: 2,
      units: 8,
      dayCount: 1,
      accountCount: 1,
    },
    accounts: {
      beta: { eventCount: 2, units: 8, dayCount: 1 },
    },
    rows: [{ day: '2026-08-02', account: 'beta', eventCount: 2, units: 8 }],
  });
});

test('hidden 3: conflicting retry ids reject changes in normalized day or account', () => {
  expect(() =>
    normalizeUsageEvents([
      {
        account: 'acme',
        occurredAt: '2026-09-01T00:00:00Z',
        units: 3,
        eventId: 'same-id',
      },
      {
        account: 'acme',
        occurredAt: '2026-09-02T00:00:00Z',
        units: 3,
        eventId: 'same-id',
      },
    ]),
  ).toThrow(RangeError);

  expect(() =>
    createUsageReport([
      {
        account: ' acme ',
        occurredAt: '2026-09-01T00:00:00Z',
        units: 3,
        eventId: 'same-id',
      },
      {
        account: 'other',
        occurredAt: '2026-09-01T08:00:00Z',
        units: 3,
        eventId: 'same-id',
      },
    ]),
  ).toThrow(RangeError);
});

test('hidden 3: blank and mistyped event ids are rejected, but missing ids are never deduped', () => {
  expect(() =>
    normalizeUsageEvent({
      account: 'acme',
      occurredAt: '2026-09-01T00:00:00Z',
      units: 1,
      eventId: '' as string,
    }),
  ).toThrow(RangeError);

  expect(() =>
    normalizeUsageEvent({
      account: 'acme',
      occurredAt: '2026-09-01T00:00:00Z',
      units: 1,
      eventId: false as unknown as string,
    }),
  ).toThrow(TypeError);

  expect(
    createUsageReport([
      { account: 'acme', occurredAt: '2026-09-01T00:00:00Z', units: 1 },
      { account: 'acme', occurredAt: '2026-09-01T00:30:00Z', units: 1 },
    ]),
  ).toEqual({
    totals: {
      eventCount: 2,
      units: 2,
      dayCount: 1,
      accountCount: 1,
    },
    accounts: {
      acme: { eventCount: 2, units: 2, dayCount: 1 },
    },
    rows: [{ day: '2026-09-01', account: 'acme', eventCount: 2, units: 2 }],
  });
});
