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

export function normalizeUsageEvent(input: UsageEventInput): NormalizedUsageEvent {
  const day = new Date(input.occurredAt as string | Date).toISOString().slice(0, 10);

  return {
    account: String(input.account),
    day,
    units: Number(input.units),
    eventId: input.eventId,
  };
}

export function normalizeUsageEvents(events: readonly UsageEventInput[]): NormalizedUsageEvent[] {
  return events.map((event) => normalizeUsageEvent(event));
}
