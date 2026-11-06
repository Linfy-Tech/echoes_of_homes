import {
  defineRailway,
  github,
  postgres,
  project,
  service,
} from 'railway/iac';

export const partial = 'echoes-staging';

const region = 'europe-west4-drams3a';
const source = github('Linfy-Tech/echoes_of_homes', { branch: 'main' });

export default defineRailway((context) => {
  if (!context.isEnvironment('staging')) {
    throw new Error('This IaC definition may only be applied to the staging environment');
  }

  const database = postgres('Postgres', { region });

  const api = service('api', {
    source,
    build: 'pnpm --filter @echoes-of-home/api typecheck',
    start: 'node --experimental-strip-types apps/api/src/server.ts',
    healthcheck: '/healthz',
    healthcheckTimeout: 120,
    replicas: { [region]: 1 },
    networking: { privateNetworkEndpoint: 'api' },
    env: {
      APP_ENV: 'staging',
      DATABASE_POOL_MAX: '10',
      DATABASE_SSL_MODE: 'disable',
      DATABASE_URL: database.env.DATABASE_URL,
      EMAIL_PROVIDER: 'fake',
      NODE_ENV: 'production',
      SERVICE_NAME: 'api',
    },
    deploy: {
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
    },
  });

  const web = service('web', {
    source,
    build: 'pnpm --filter @echoes-of-home/web build',
    start: 'pnpm --filter @echoes-of-home/web start --hostname 0.0.0.0 --port $PORT',
    healthcheck: '/',
    healthcheckTimeout: 120,
    replicas: { [region]: 1 },
    networking: { privateNetworkEndpoint: 'web' },
    env: {
      APP_ENV: 'staging',
      NEXT_PUBLIC_API_BASE_URL: api.env.RAILWAY_PUBLIC_DOMAIN,
      NODE_ENV: 'production',
      SERVICE_NAME: 'web',
    },
    deploy: {
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
    },
  });

  const worker = service('worker', {
    source,
    build: 'pnpm --filter @echoes-of-home/story-processing typecheck',
    start: 'node -e "setInterval(() => {}, 2147483647)"',
    replicas: { [region]: 1 },
    networking: { privateNetworkEndpoint: 'worker' },
    env: {
      AI_PROVIDER_MODE: 'fake',
      APP_ENV: 'staging',
      DATABASE_URL: database.env.DATABASE_URL,
      MEDIA_STORAGE_PROVIDER: 'fake',
      NODE_ENV: 'production',
      SERVICE_NAME: 'worker',
      WORKER_CONCURRENCY: '1',
    },
    deploy: {
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
    },
  });

  return project('echoes-of-home', {
    resources: [database, api, web, worker],
  });
});
