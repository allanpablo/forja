import { EvaluationEngine } from '../../../packages/evals/src/index.ts';
import { EventBus } from '../../../packages/events/src/index.ts';
import { Scheduler } from '../../../packages/scheduler/src/index.ts';
import { InMemoryObservationStore, ObservabilityRecorder } from '../../../packages/observability/src/index.ts';

export interface WorkerRuntime {
  readonly events: EventBus;
  readonly scheduler: Scheduler;
  readonly observations: InMemoryObservationStore;
  readonly evaluations: EvaluationEngine;
  readonly recorder: ObservabilityRecorder;
}

export function createWorkerRuntime(): WorkerRuntime {
  const observations = new InMemoryObservationStore();
  const events = new EventBus();
  const scheduler = new Scheduler(1);
  const evaluations = new EvaluationEngine(observations);
  const recorder = new ObservabilityRecorder(observations);
  return { events, scheduler, observations, evaluations, recorder };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = createWorkerRuntime();
  worker.events.subscribe({ id: 'evaluation-worker', eventTypes: ['observation.recorded'], maxRetries: 2 }, async () => {
    await worker.evaluations.evaluate({ scope: 'workspace' });
  });
}
