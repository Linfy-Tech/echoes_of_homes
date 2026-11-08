import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeAsrProvider } from '../../../packages/ai-providers/src/asr.ts';
import { AsrCircuitBreaker, createAsrStore, enqueueAsrJob, runAsrJob } from '../src/asr-pipeline.ts';

const audio = new Uint8Array(1_000);

test('fake adapter pipeline chunks, stitches, and stores segments', async () => {
  const store = createAsrStore(); const job = await enqueueAsrJob({ store, storyId: 'story-1', idempotencyKey: 'one', audio, durationMs: 1_200_000, consentGate: async () => true });
  assert.equal(await runAsrJob({ store, jobId: job.id, provider: new FakeAsrProvider(), breaker: new AsrCircuitBreaker({ dailyBudgetMicros: 100, callCostMicros: 1, failureRate: 0.5 }), consentGate: async () => true }), 'succeeded');
  assert.equal(store.segments.get(job.transcriptId)?.length, 2);
});

test('withdrawal between enqueue and start cancels without provider calls', async () => {
  const store = createAsrStore(); let consent = true; const job = await enqueueAsrJob({ store, storyId: 'story-1', idempotencyKey: 'two', audio, durationMs: 1_000, consentGate: async () => consent }); consent = false;
  const provider = new FakeAsrProvider(); assert.equal(await runAsrJob({ store, jobId: job.id, provider, breaker: new AsrCircuitBreaker({ dailyBudgetMicros: 100, callCostMicros: 1, failureRate: 0.5 }), consentGate: async () => consent }), 'cancelled'); assert.equal(provider.calls, 0);
});

test('withdrawal at the mid-loop checkpoint stops before the next chunk', async () => {
  const store = createAsrStore(); let consent = true; const job = await enqueueAsrJob({ store, storyId: 'story-1', idempotencyKey: 'mid-loop-withdrawal', audio, durationMs: 1_200_000, consentGate: async () => consent });
  const fake = new FakeAsrProvider(); const provider = { provider: fake.provider, modelId: fake.modelId, async transcribe(chunk) { const response = await fake.transcribe(chunk); consent = false; return response; } };
  assert.equal(await runAsrJob({ store, jobId: job.id, provider, breaker: new AsrCircuitBreaker({ dailyBudgetMicros: 100, callCostMicros: 1, failureRate: 0.5 }), consentGate: async () => consent }), 'cancelled');
  assert.equal(fake.calls, 1, 'the second chunk must not reach the provider after withdrawal');
  assert.equal(store.modelRuns.length, 1);
  assert.equal(store.segments.size, 0);
});

test('idempotent rerun does not create duplicate segments or model runs', async () => {
  const store = createAsrStore(); const provider = new FakeAsrProvider(); const breaker = new AsrCircuitBreaker({ dailyBudgetMicros: 100, callCostMicros: 1, failureRate: 0.5 }); const job = await enqueueAsrJob({ store, storyId: 'story-1', idempotencyKey: 'three', audio, durationMs: 1_000, consentGate: async () => true });
  await runAsrJob({ store, jobId: job.id, provider, breaker, consentGate: async () => true }); const runs = store.modelRuns.length; await runAsrJob({ store, jobId: job.id, provider, breaker, consentGate: async () => true }); assert.equal(store.modelRuns.length, runs); assert.equal(provider.calls, 1);
});

test('budget exhaustion halts provider calls and failures become permanent after retries', async () => {
  const budgetStore = createAsrStore(); const budgetJob = await enqueueAsrJob({ store: budgetStore, storyId: 'story-1', idempotencyKey: 'four', audio, durationMs: 1_000, consentGate: async () => true }); const budgetProvider = new FakeAsrProvider();
  assert.equal(await runAsrJob({ store: budgetStore, jobId: budgetJob.id, provider: budgetProvider, breaker: new AsrCircuitBreaker({ dailyBudgetMicros: 0, callCostMicros: 1, failureRate: 0.5 }), consentGate: async () => true }), 'waiting_budget'); assert.equal(budgetProvider.calls, 0);
  const failedStore = createAsrStore(); const failedJob = await enqueueAsrJob({ store: failedStore, storyId: 'story-1', idempotencyKey: 'five', audio, durationMs: 1_000, maxAttempts: 2, consentGate: async () => true }); const failing = new FakeAsrProvider({ mode: 'failure' }); const breaker = new AsrCircuitBreaker({ dailyBudgetMicros: 100, callCostMicros: 1, failureRate: 0.5 });
  assert.equal(await runAsrJob({ store: failedStore, jobId: failedJob.id, provider: failing, breaker, consentGate: async () => true }), 'failed_retryable'); failedJob.status = 'queued'; assert.equal(await runAsrJob({ store: failedStore, jobId: failedJob.id, provider: failing, breaker, consentGate: async () => true }), 'failed_permanent');
});

test('high provider failure rate opens the circuit before another provider call', async () => {
  const store = createAsrStore(); const job = await enqueueAsrJob({ store, storyId: 'story-1', idempotencyKey: 'failure-circuit', audio, durationMs: 1_000, consentGate: async () => true }); const provider = new FakeAsrProvider({ mode: 'failure' }); const breaker = new AsrCircuitBreaker({ dailyBudgetMicros: 100, callCostMicros: 1, failureRate: 0.5, minimumCalls: 1 });
  assert.equal(await runAsrJob({ store, jobId: job.id, provider, breaker, consentGate: async () => true }), 'failed_retryable'); job.status = 'queued'; assert.equal(await runAsrJob({ store, jobId: job.id, provider, breaker, consentGate: async () => true }), 'waiting_budget'); assert.equal(provider.calls, 1);
});

test('pipeline logger receives identifiers and outcomes, never transcript text', async () => {
  const store = createAsrStore(); const events = []; const job = await enqueueAsrJob({ store, storyId: 'story-1', idempotencyKey: 'six', audio, durationMs: 1_000, consentGate: async () => true }); await runAsrJob({ store, jobId: job.id, provider: new FakeAsrProvider({ text: 'SECRET TRANSCRIPT' }), breaker: new AsrCircuitBreaker({ dailyBudgetMicros: 100, callCostMicros: 1, failureRate: 0.5 }), consentGate: async () => true, logger: (_event, fields) => events.push(fields) }); assert.equal(JSON.stringify(events).includes('SECRET TRANSCRIPT'), false);
});

test('uncertainty flags use supplied placeholder configuration, not hidden calibration', async () => {
  const store = createAsrStore(); const job = await enqueueAsrJob({ store, storyId: 'story-1', idempotencyKey: 'seven', audio, durationMs: 1_000, consentGate: async () => true });
  await runAsrJob({ store, jobId: job.id, provider: new FakeAsrProvider({ mode: 'low_confidence' }), breaker: new AsrCircuitBreaker({ dailyBudgetMicros: 100, callCostMicros: 1, failureRate: 0.5 }), consentGate: async () => true, uncertaintyThresholds: { lowConfidence: 0.4 } });
  assert.equal(store.uncertaintyFlags.length, 1); assert.equal(store.uncertaintyFlags[0].source, 'asr_signal');
});
