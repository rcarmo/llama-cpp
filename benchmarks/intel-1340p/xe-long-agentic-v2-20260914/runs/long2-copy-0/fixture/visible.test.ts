// READ-ONLY BENCHMARK TEST
import { expect, test } from 'bun:test';
import {
  normalizeUsageEvent,
  normalizeUsageEvents,
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
