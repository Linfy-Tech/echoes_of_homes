import { run, runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { createStructuredLogger, startObservability } from '@echoes-of-home/observability';
import { DrizzleWorkflowRepository } from '@echoes-of-home/database/workflow-repositories';
import { FakeMediaStorageProvider } from '@echoes-of-home/media-storage';
import { createCloudinaryMediaStorageFromEnv } from '@echoes-of-home/media-storage/cloudinary';
import { runDurableAsrJob, runDurableTranslationJob, defaultDurableAsrProvider } from './durable-jobs.ts';

const logger = createStructuredLogger('story-processing');
const telemetry = await startObservability({ serviceName: 'story-processing' });
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  logger.warn('worker.not_started', { reason: 'DATABASE_URL_missing' });
  await new Promise<void>(() => {});
} else {
  const pool = new Pool({ connectionString: databaseUrl });
  const repo = new DrizzleWorkflowRepository(pool);
  await runMigrations({ connectionString: databaseUrl });
  const recovered = await repo.recoverInFlightJobs();
  logger.info('worker.started', { service: 'story-processing', recoveredJobs: recovered });
  const mediaProvider = process.env.MEDIA_STORAGE_PROVIDER === 'cloudinary' ? createCloudinaryMediaStorageFromEnv() : new FakeMediaStorageProvider();
  const taskList = {
    'asr.transcribe': async (rawPayload: unknown) => {
      const payload = rawPayload as { processingJobId: string };
      await runDurableAsrJob({ repo, processingJobId: payload.processingJobId, provider: defaultDurableAsrProvider(), mediaProvider, consentGate: (storyId) => repo.consentActive(storyId, ['record_and_store', 'cross_border_processing', 'ai_transcription']), logger: (event, fields) => logger.info(event, fields) });
    },
    'translation.generate': async (rawPayload: unknown) => {
      const payload = rawPayload as { processingJobId: string };
      await runDurableTranslationJob({ repo, processingJobId: payload.processingJobId, logger: (event, fields) => logger.info(event, fields) });
    },
  };
  const runner = await run({ connectionString: databaseUrl, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 1), taskList });
  const shutdown = async (signal: string): Promise<void> => {
    logger.info('worker.stopping', { service: 'story-processing', operation: signal });
    await runner.promise;
    await pool.end();
    await telemetry.shutdown();
    process.exit(0);
  };
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  await runner.promise;
}
