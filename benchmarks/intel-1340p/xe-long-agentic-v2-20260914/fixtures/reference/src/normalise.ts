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

function normalizeAccount(account: string): string {
  if (typeof account !== 'string') {
    throw new TypeError('account must be a string');
  }

  const value = account.trim();
  if (value.length === 0) {
    throw new RangeError('account must not be blank');
  }

  return value;
}

function normalizeOccurredAt(occurredAt: string | Date): string {
  if (!(typeof occurredAt === 'string' || occurredAt instanceof Date)) {
    throw new TypeError('occurredAt must be a string or Date');
  }

  const date = occurredAt instanceof Date ? new Date(occurredAt.getTime()) : new Date(occurredAt);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('occurredAt must be a valid date');
  }

  return date.toISOString().slice(0, 10);
}

function normalizeUnits(units: number): number {
  if (typeof units !== 'number') {
    throw new TypeError('units must be a number');
  }

  if (!Number.isFinite(units) || !Number.isInteger(units) || units < 0) {
    throw new RangeError('units must be a finite non-negative integer');
  }

  return units;
}

function normalizeEventId(eventId: string | undefined): string | undefined {
  if (eventId === undefined) {
    return undefined;
  }

  if (typeof eventId !== 'string') {
    throw new TypeError('eventId must be a string');
  }

  const value = eventId.trim();
  if (value.length === 0) {
    throw new RangeError('eventId must not be blank');
  }

  return value;
}

function sameIdentity(left: NormalizedUsageEvent, right: NormalizedUsageEvent): boolean {
  return left.account === right.account && left.day === right.day && left.units === right.units;
}

export function normalizeUsageEvent(input: UsageEventInput): NormalizedUsageEvent {
  const account = normalizeAccount(input.account);
  const day = normalizeOccurredAt(input.occurredAt);
  const units = normalizeUnits(input.units);
  const eventId = normalizeEventId(input.eventId);

  if (eventId === undefined) {
    return { account, day, units };
  }

  return { account, day, units, eventId };
}

export function normalizeUsageEvents(events: readonly UsageEventInput[]): NormalizedUsageEvent[] {
  const normalized: NormalizedUsageEvent[] = [];
  const seenByEventId = new Map<string, NormalizedUsageEvent>();

  for (const event of events) {
    const next = normalizeUsageEvent(event);

    if (next.eventId === undefined) {
      normalized.push(next);
      continue;
    }

    const previous = seenByEventId.get(next.eventId);
    if (!previous) {
      seenByEventId.set(next.eventId, next);
      normalized.push(next);
      continue;
    }

    if (!sameIdentity(previous, next)) {
      throw new RangeError('conflicting duplicate eventId');
    }
  }

  return normalized;
}
