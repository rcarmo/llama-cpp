// READ-ONLY HIDDEN BENCHMARK TEST
import { expect, test } from 'bun:test';
import {
  normalizeUsageEvent,
  normalizeUsageEvents,
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
