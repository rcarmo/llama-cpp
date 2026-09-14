// READ-ONLY BENCHMARK TEST
import { expect, test } from 'bun:test';
import {
  aggregateUsage,
  normalizeUsageEvent,
  normalizeUsageEvents,
  type NormalizedUsageEvent,
  type UsageEventInput,
} from './src/main';

test('phase 0: normalize a single event into a UTC day', () => {
  expect(
    normalizeUsageEvent({
      account: '  acme  ',
      occurredAt: '2026-03-01T23:30:00-02:00',
      units: 3,
    }),
  ).toEqual({
    account: 'acme',
    day: '2026-03-02',
    units: 3,
  });

  expect(
    normalizeUsageEvent({
      account: 'beta',
      occurredAt: new Date('2026-07-04T00:30:00+02:00'),
      units: 0,
    }),
  ).toEqual({
    account: 'beta',
    day: '2026-07-03',
    units: 0,
  });
});

test('phase 0: normalizeUsageEvents preserves order and leaves inputs unchanged', () => {
  const events: UsageEventInput[] = [
    { account: ' team-a ', occurredAt: '2026-01-02T00:00:00Z', units: 1 },
    { account: 'team-b', occurredAt: '2026-01-01T23:00:00-02:00', units: 2 },
  ];
  const snapshot = events.map((event) => ({ ...event }));

  expect(normalizeUsageEvents(events)).toEqual([
    { account: 'team-a', day: '2026-01-02', units: 1 },
    { account: 'team-b', day: '2026-01-02', units: 2 },
  ]);

  expect(events).toEqual(snapshot);
});

test('phase 0: validate types and value ranges', () => {
  expect(() =>
    normalizeUsageEvent({
      account: 7 as unknown as string,
      occurredAt: '2026-01-01T00:00:00Z',
      units: 1,
    }),
  ).toThrow(TypeError);

  expect(() =>
    normalizeUsageEvent({
      account: '   ',
      occurredAt: '2026-01-01T00:00:00Z',
      units: 1,
    }),
  ).toThrow(RangeError);

  expect(() =>
    normalizeUsageEvent({
      account: 'acme',
      occurredAt: 42 as unknown as string,
      units: 1,
    }),
  ).toThrow(TypeError);

  expect(() =>
    normalizeUsageEvent({
      account: 'acme',
      occurredAt: 'not-a-date',
      units: 1,
    }),
  ).toThrow(RangeError);

  expect(() =>
    normalizeUsageEvent({
      account: 'acme',
      occurredAt: '2026-01-01T00:00:00Z',
      units: '2' as unknown as number,
    }),
  ).toThrow(TypeError);

  for (const units of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() =>
      normalizeUsageEvent({
        account: 'acme',
        occurredAt: '2026-01-01T00:00:00Z',
        units,
      }),
    ).toThrow(RangeError);
  }
});

test('phase 1: aggregate by day and account with deterministic ordering', () => {
  const events = Object.freeze([
    Object.freeze({ account: 'beta', day: '2026-03-02', units: 1 }),
    Object.freeze({ account: 'acme', day: '2026-03-01', units: 2 }),
    Object.freeze({ account: 'acme', day: '2026-03-01', units: 4 }),
    Object.freeze({ account: 'beta', day: '2026-03-01', units: 3 }),
  ]) as readonly NormalizedUsageEvent[];

  expect(aggregateUsage(events)).toEqual([
    { day: '2026-03-01', account: 'acme', eventCount: 2, units: 6 },
    { day: '2026-03-01', account: 'beta', eventCount: 1, units: 3 },
    { day: '2026-03-02', account: 'beta', eventCount: 1, units: 1 },
  ]);
});

test('phase 1: aggregateUsage returns a new array and keeps zero-unit events', () => {
  const events: NormalizedUsageEvent[] = [
    { account: 'team-a', day: '2026-04-01', units: 0 },
    { account: 'team-a', day: '2026-04-01', units: 5 },
    { account: 'team-a', day: '2026-04-02', units: 1 },
  ];
  const snapshot = events.map((event) => ({ ...event }));

  expect(aggregateUsage(events)).toEqual([
    { day: '2026-04-01', account: 'team-a', eventCount: 2, units: 5 },
    { day: '2026-04-02', account: 'team-a', eventCount: 1, units: 1 },
  ]);

  expect(events).toEqual(snapshot);
});
