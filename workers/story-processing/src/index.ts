import { createStructuredLogger, startObservability } from '@echoes-of-home/observability';

const logger = createStructuredLogger('story-processing');
const telemetry = await startObservability({ serviceName: 'story-processing' });
logger.info('worker.started', { service: 'story-processing', success: true });

const shutdown = async (signal: string): Promise<void> => {
  logger.info('worker.stopping', { service: 'story-processing', operation: signal });
  await telemetry.shutdown();
  process.exit(0);
};

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
await new Promise<void>(() => {});
