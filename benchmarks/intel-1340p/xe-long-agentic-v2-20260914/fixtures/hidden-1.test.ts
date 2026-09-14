// READ-ONLY HIDDEN BENCHMARK TEST
import { expect, test } from 'bun:test';
import {
  aggregateUsage,
  normalizeUsageEvent,
  normalizeUsageEvents,
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
