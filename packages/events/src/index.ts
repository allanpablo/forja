import { randomUUID } from 'node:crypto';
import {
  CONTRACT_VERSION,
  type DomainEvent,
  type EntityId,
  type ISO8601,
} from '../../contracts/src/index.ts';

export interface EventInput {
  readonly type: string;
  readonly aggregateId: EntityId;
  readonly payload: unknown;
  readonly idempotencyKey: string;
  readonly correlationId?: string;
}

export interface EventStore {
  append(event: DomainEvent): void | Promise<void>;
  list(): readonly DomainEvent[] | Promise<readonly DomainEvent[]>;
}

export interface EventSubscription {
  readonly id: string;
  readonly eventTypes: readonly string[];
  readonly maxRetries: number;
}

export interface DeadLetterEvent {
  readonly event: DomainEvent;
  readonly consumerId: string;
  readonly attempts: number;
  readonly error: string;
  readonly failedAt: ISO8601;
}

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export class EventBusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventBusError';
  }
}

export class InMemoryEventStore implements EventStore {
  private readonly events: DomainEvent[] = [];

  append(event: DomainEvent): void {
    this.events.push(event);
  }

  list(): readonly DomainEvent[] {
    return [...this.events];
  }
}

export class EventBus {
  private readonly store: EventStore;
  private readonly subscriptions = new Map<string, { readonly subscription: EventSubscription; readonly handler: EventHandler }>();
  private readonly idempotency = new Map<string, DomainEvent>();
  private readonly consumerIdempotency = new Set<string>();
  private readonly sequences = new Map<EntityId, number>();
  private readonly deadLetters: DeadLetterEvent[] = [];

  constructor(store: EventStore = new InMemoryEventStore()) {
    this.store = store;
  }

  subscribe(subscription: EventSubscription, handler: EventHandler): () => void {
    if (subscription.id.trim().length === 0) throw new EventBusError('Subscription id is required');
    if (subscription.maxRetries < 0 || !Number.isInteger(subscription.maxRetries)) throw new EventBusError('Subscription maxRetries must be a non-negative integer');
    if (this.subscriptions.has(subscription.id)) throw new EventBusError(`Subscription already exists: ${subscription.id}`);
    this.subscriptions.set(subscription.id, { subscription, handler });
    return () => this.subscriptions.delete(subscription.id);
  }

  async append(input: EventInput): Promise<DomainEvent> {
    if (input.type.trim().length === 0) throw new EventBusError('Event type is required');
    if (input.idempotencyKey.trim().length === 0) throw new EventBusError('Event idempotencyKey is required');
    const existing = this.idempotency.get(input.idempotencyKey);
    if (existing !== undefined) return existing;
    const event: DomainEvent = {
      schemaVersion: CONTRACT_VERSION,
      id: randomUUID() as EntityId,
      type: input.type,
      aggregateId: input.aggregateId,
      sequence: (this.sequences.get(input.aggregateId) ?? 0) + 1,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId ?? input.idempotencyKey,
      createdAt: new Date().toISOString() as ISO8601,
      updatedAt: new Date().toISOString() as ISO8601,
    };
    this.sequences.set(input.aggregateId, event.sequence);
    this.idempotency.set(input.idempotencyKey, event);
    await this.store.append(event);
    await this.dispatch(event);
    return event;
  }

  async list(): Promise<readonly DomainEvent[]> {
    return this.store.list();
  }

  getDeadLetters(): readonly DeadLetterEvent[] {
    return [...this.deadLetters];
  }

  private async dispatch(event: DomainEvent): Promise<void> {
    for (const { subscription, handler } of this.subscriptions.values()) {
      if (!subscription.eventTypes.includes('*') && !subscription.eventTypes.includes(event.type)) continue;
      const consumerKey = `${subscription.id}:${event.idempotencyKey}`;
      if (this.consumerIdempotency.has(consumerKey)) continue;
      let attempts = 0;
      let succeeded = false;
      let lastError = 'Unknown consumer error';
      while (!succeeded && attempts <= subscription.maxRetries) {
        attempts += 1;
        try {
          await handler(event);
          this.consumerIdempotency.add(consumerKey);
          succeeded = true;
        } catch (error: unknown) {
          lastError = error instanceof Error ? error.message : 'Unknown consumer error';
        }
      }
      if (!succeeded) {
        this.deadLetters.push({ event, consumerId: subscription.id, attempts, error: lastError, failedAt: new Date().toISOString() as ISO8601 });
      }
    }
  }
}
