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

function getDayString(occurredAt: string | Date): string {
  const date = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  if (isNaN(date.getTime())) {
    throw new RangeError('occurredAt cannot be parsed into a valid date');
  }
  // UTC calendar day in YYYY-MM-DD format
  return date.toISOString().slice(0, 10);
}

function normalizeUsageEvent(input: UsageEventInput): NormalizedUsageEvent {
  // 1. Validate account type
  if (typeof input.account !== 'string') {
    throw new TypeError('account is not a string');
  }
  
  // 2. Trim account
  const trimmedAccount = input.account.trim();
  
  // 3. Validate trimmed account
  if (trimmedAccount.length === 0) {
    throw new RangeError('trimmed account is empty');
  }

  // 4. Validate occurredAt type
  if (!(typeof input.occurredAt === 'string' || input.occurredAt instanceof Date)) {
    throw new TypeError('occurredAt is neither a string nor a Date');
  }

  // 5. Convert to UTC day string
  const day = getDayString(input.occurredAt);

  // 6. Validate units
  if (typeof input.units !== 'number') {
    throw new TypeError('units is not a number');
  }
  if (!Number.isInteger(input.units) || input.units < 0 || !Number.isFinite(input.units)) {
    throw new RangeError('units is negative, fractional, NaN, or infinite');
  }

  // 7. Return fresh object
  return {
    account: trimmedAccount,
    day,
    units: input.units,
    eventId: input.eventId,
  };
}

function normalizeUsageEvents(events: readonly UsageEventInput[]): NormalizedUsageEvent[] {
  // Ensure immutability of input array and its items
  return events.map((event) => {
    // Create a shallow copy of the event to ensure we don't mutate the input object
    const safeEvent: UsageEventInput = { ...event };
    return normalizeUsageEvent(safeEvent);
  });
}