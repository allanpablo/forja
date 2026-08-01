import type { DomainEvent } from '../../contracts/src/index.ts';

export type ScheduleTrigger =
  | { readonly kind: 'one-shot'; readonly at: string }
  | { readonly kind: 'cron'; readonly expression: string }
  | { readonly kind: 'condition'; readonly evaluate: (now: Date) => boolean | Promise<boolean> }
  | { readonly kind: 'event'; readonly eventType: string; readonly aggregateId?: string };

export interface ScheduleContext {
  readonly scheduleId: string;
  readonly trigger: ScheduleTrigger['kind'];
  readonly key: string;
  readonly now: Date;
  readonly event?: DomainEvent;
}

export interface Schedule {
  readonly id: string;
  readonly trigger: ScheduleTrigger;
  readonly maxRetries: number;
  readonly action: (context: ScheduleContext) => void | Promise<void>;
}

export interface ScheduleDeadLetter {
  readonly scheduleId: string;
  readonly key: string;
  readonly attempts: number;
  readonly error: string;
  readonly failedAt: string;
}

export class SchedulerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulerError';
  }
}

export function matchesCron(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new SchedulerError('Cron expression must have 5 fields');
  const values = [date.getUTCMinutes(), date.getUTCHours(), date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCDay()];
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  return fields.every((field, index) => matchesCronField(field, values[index], ranges[index][0], ranges[index][1]));
}

function matchesCronField(field: string, value: number, min: number, max: number): boolean {
  return field.split(',').some((part) => {
    const [base, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new SchedulerError(`Invalid cron step: ${part}`);
    if (base === '*') return (value - min) % step === 0;
    if (base.includes('-')) {
      const [start, end] = base.split('-').map(Number);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) throw new SchedulerError(`Invalid cron range: ${part}`);
      return value >= start && value <= end && (value - start) % step === 0;
    }
    const exact = Number(base);
    if (!Number.isInteger(exact) || exact < min || exact > max) throw new SchedulerError(`Invalid cron value: ${part}`);
    return value === exact;
  });
}

export class Scheduler {
  private readonly schedules = new Map<string, Schedule>();
  private readonly completed = new Set<string>();
  private readonly running = new Set<string>();
  private readonly retries = new Map<string, number>();
  private readonly deadLetters: ScheduleDeadLetter[] = [];
  private readonly maxParallel: number;

  constructor(maxParallel = 1) {
    if (!Number.isInteger(maxParallel) || maxParallel < 1) throw new SchedulerError('maxParallel must be a positive integer');
    this.maxParallel = maxParallel;
  }

  register(schedule: Schedule): void {
    if (schedule.id.trim().length === 0) throw new SchedulerError('Schedule id is required');
    if (this.schedules.has(schedule.id)) throw new SchedulerError(`Schedule already exists: ${schedule.id}`);
    if (!Number.isInteger(schedule.maxRetries) || schedule.maxRetries < 0) throw new SchedulerError('Schedule maxRetries must be a non-negative integer');
    this.schedules.set(schedule.id, schedule);
  }

  cancel(scheduleId: string): boolean {
    return this.schedules.delete(scheduleId);
  }

  async tick(now = new Date()): Promise<readonly string[]> {
    const due: Array<{ schedule: Schedule; key: string; event?: DomainEvent }> = [];
    for (const schedule of this.schedules.values()) {
      const candidate = await this.candidate(schedule, now);
      if (candidate !== undefined && !this.completed.has(candidate.key) && !this.running.has(candidate.key)) due.push({ schedule, ...candidate });
    }
    const selected = due.slice(0, Math.max(0, this.maxParallel - this.running.size));
    await Promise.all(selected.map(({ schedule, key, event }) => this.run(schedule, key, now, event)));
    return selected.map(({ schedule }) => schedule.id);
  }

  async onEvent(event: DomainEvent): Promise<readonly string[]> {
    const due = [...this.schedules.values()].filter((schedule) => schedule.trigger.kind === 'event' && schedule.trigger.eventType === event.type && (schedule.trigger.aggregateId === undefined || schedule.trigger.aggregateId === event.aggregateId));
    const eligible = due.filter((schedule) => !this.completed.has(`${schedule.id}:event:${event.id}`) && !this.running.has(`${schedule.id}:event:${event.id}`));
    const selected = eligible.slice(0, Math.max(0, this.maxParallel - this.running.size));
    await Promise.all(selected.map((schedule) => this.run(schedule, `${schedule.id}:event:${event.id}`, new Date(event.createdAt), event)));
    return selected.map((schedule) => schedule.id);
  }

  list(): readonly Schedule[] {
    return [...this.schedules.values()];
  }

  getDeadLetters(): readonly ScheduleDeadLetter[] {
    return [...this.deadLetters];
  }

  private async candidate(schedule: Schedule, now: Date): Promise<{ key: string; event?: undefined } | undefined> {
    const trigger = schedule.trigger;
    if (trigger.kind === 'one-shot') {
      const at = new Date(trigger.at);
      if (Number.isNaN(at.getTime())) throw new SchedulerError(`Invalid one-shot date: ${trigger.at}`);
      return now >= at ? { key: `${schedule.id}:one-shot:${trigger.at}` } : undefined;
    }
    if (trigger.kind === 'cron') return matchesCron(trigger.expression, now) ? { key: `${schedule.id}:cron:${now.toISOString().slice(0, 16)}` } : undefined;
    if (trigger.kind === 'condition') return await trigger.evaluate(now) ? { key: `${schedule.id}:condition:${now.toISOString()}` } : undefined;
    return undefined;
  }

  private async run(schedule: Schedule, key: string, now: Date, event?: DomainEvent): Promise<void> {
    this.running.add(key);
    const attempts = this.retries.get(key) ?? 0;
    let currentAttempt = attempts;
    try {
      while (currentAttempt <= schedule.maxRetries) {
        currentAttempt += 1;
        try {
          await schedule.action({ scheduleId: schedule.id, trigger: schedule.trigger.kind, key, now, event });
          this.completed.add(key);
          this.retries.delete(key);
          return;
        } catch (error: unknown) {
          this.retries.set(key, currentAttempt);
          if (currentAttempt > schedule.maxRetries) {
            this.deadLetters.push({ scheduleId: schedule.id, key, attempts: currentAttempt, error: error instanceof Error ? error.message : 'Unknown scheduler error', failedAt: new Date().toISOString() });
            return;
          }
        }
      }
    } finally {
      this.running.delete(key);
    }
  }
}
