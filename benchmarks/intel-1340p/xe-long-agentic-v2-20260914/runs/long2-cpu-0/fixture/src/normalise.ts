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

function getDayString(dateInput: string | Date): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    throw new RangeError('occurredAt cannot be parsed into a valid date');
  }
  // UTC calendar day in YYYY-MM-DD format
  return date.toISOString().slice(0, 10);
}

export function normalizeUsageEvent(input: UsageEventInput): NormalizedUsageEvent {
  // 1. Validate account type
  if (typeof input.account !== 'string') {
    throw new TypeError('account is not a string');
  }

  // 2. Trim and validate account
  const trimmedAccount = input.account.trim();
  if (trimmedAccount.length === 0) {
    throw new RangeError('trimmed account is empty');
  }

  // 3. Validate units type
  if (typeof input.units !== 'number') {
    throw new TypeError('units is not a number');
  }

  // 4. Validate units range
  if (!Number.isFinite(input.units) || input.units < 0 || !Number.isInteger(input.units)) {
    throw new RangeError('units is negative, fractional, NaN, or infinite');
  }

  // 5. Validate occurredAt type
  if (!(typeof input.occurredAt === 'string' || input.occurredAt instanceof Date)) {
    throw new TypeError('occurredAt is neither a string nor a Date');
  }

  // 6. Derive day string
  const day = getDayString(input.occurredAt);

  // 7. Return fresh object
  return {
    account: trimmedAccount,
    day,
    units: input.units,
    eventId: input.eventId,
  };
}

export function normalizeUsageEvents(events: readonly UsageEventInput[]): NormalizedUsageEvent[] {
  // Preserves order and does not mutate input
  return events.map((event) => normalizeUsageEvent(event));
}