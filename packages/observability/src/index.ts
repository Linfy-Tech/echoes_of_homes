import { context, trace, type Span } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const traceId = /^[0-9a-f]{32}$/i;
const identifier = /^[A-Za-z0-9._:/-]{1,128}$/;
const route = /^\/[A-Za-z0-9._~:/{}-]{0,256}$/;
const safeKeys = new Set([
  'correlationId',
  'userId',
  'storyId',
  'route',
  'status',
  'durationMs',
  'errorCode',
  'service',
  'operation',
  'jobType',
  'attempt',
  'success',
  'metricName',
  'outcome',
  'count',
  'httpMethod',
  'traceId',
]);

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type SafeLogValue = string | number | boolean;
export type SafeLogFields = Record<string, SafeLogValue>;

export type RedactedLogFields = {
  fields: SafeLogFields;
  redactedFieldCount: number;
};

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && identifier.test(value);
}

function safeValue(key: string, value: unknown): SafeLogValue | undefined {
  if (key === 'userId' || key === 'storyId') return typeof value === 'string' && uuid.test(value) ? value.toLowerCase() : undefined;
  if (key === 'traceId') return typeof value === 'string' && traceId.test(value) ? value.toLowerCase() : undefined;
  if (key === 'correlationId') return validIdentifier(value) ? value : undefined;
  if (key === 'route') return typeof value === 'string' && route.test(value) ? value : undefined;
  if (key === 'httpMethod') return typeof value === 'string' && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(value) ? value : undefined;
  if (['status', 'attempt', 'count'].includes(key)) return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  if (key === 'durationMs') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 86_400_000 ? value : undefined;
  if (key === 'success') return typeof value === 'boolean' ? value : undefined;
  return validIdentifier(value) ? value : undefined;
}

/**
 * A deny-by-default field boundary for logs, span attributes, and metric labels.
 * Unknown keys and values that cannot be represented as bounded identifiers are dropped.
 */
export function redactLogFields(input: unknown): RedactedLogFields {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { fields: {}, redactedFieldCount: 1 };
  const fields: SafeLogFields = {};
  let redactedFieldCount = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!safeKeys.has(key)) {
      redactedFieldCount += 1;
      continue;
    }
    const sanitized = safeValue(key, value);
    if (sanitized === undefined) {
      redactedFieldCount += 1;
      continue;
    }
    fields[key] = sanitized;
  }
  return { fields, redactedFieldCount };
}

export function setSafeSpanAttributes(span: Span, fields: unknown): number {
  const redacted = redactLogFields(fields);
  span.setAttributes(redacted.fields);
  return redacted.redactedFieldCount;
}

export type StructuredLogger = {
  log(level: LogLevel, event: string, fields?: unknown): void;
  debug(event: string, fields?: unknown): void;
  info(event: string, fields?: unknown): void;
  warn(event: string, fields?: unknown): void;
  error(event: string, fields?: unknown): void;
};

type LogSink = (line: string) => void;

export function createStructuredLogger(serviceName: string, sink: LogSink = (line) => process.stdout.write(`${line}\n`)): StructuredLogger {
  const service = validIdentifier(serviceName) ? serviceName : 'unknown';
  const otelLogger = logs.getLogger(service);
  return {
    log(level, event, fields) {
      const safeEvent = validIdentifier(event) ? event : 'event.redacted';
      const redacted = redactLogFields(fields);
      const line: Record<string, SafeLogValue> = {
        timestamp: new Date().toISOString(),
        level,
        event: safeEvent,
        ...redacted.fields,
        service,
      };
      if (redacted.redactedFieldCount > 0) line.redactedFieldCount = redacted.redactedFieldCount;
      sink(JSON.stringify(line));
      otelLogger.emit({ severityText: level.toUpperCase(), body: safeEvent, attributes: redacted.fields });
    },
    debug(event, fields) { this.log('debug', event, fields); },
    info(event, fields) { this.log('info', event, fields); },
    warn(event, fields) { this.log('warn', event, fields); },
    error(event, fields) { this.log('error', event, fields); },
  };
}

type ObservabilityOptions = {
  serviceName: string;
  environment?: string;
  endpoint?: string;
  apiKey?: string;
  instanceId?: string;
};

export type ObservabilityRuntime = {
  enabled: boolean;
  shutdown(): Promise<void>;
};

function signalEndpoint(endpoint: string, signal: 'traces' | 'metrics' | 'logs'): string {
  const normalized = endpoint.replace(/\/$/, '');
  return normalized.endsWith(`/v1/${signal}`) ? normalized : `${normalized}/v1/${signal}`;
}

export async function startObservability(options: ObservabilityOptions): Promise<ObservabilityRuntime> {
  const endpoint = options.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const apiKey = options.apiKey ?? process.env.GRAFANA_CLOUD_OTLP_API_KEY;
  const instanceId = options.instanceId ?? process.env.GRAFANA_CLOUD_OTLP_INSTANCE_ID;
  if (!endpoint || !apiKey || !instanceId) {
    return { enabled: false, async shutdown() {} };
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT must be an absolute URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT must use HTTPS');
  const headers = { Authorization: `Basic ${Buffer.from(`${instanceId}:${apiKey}`, 'utf8').toString('base64')}` };
  const resource = resourceFromAttributes({
    'service.name': options.serviceName,
    'deployment.environment': options.environment ?? process.env.APP_ENV ?? 'local',
  });
  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: signalEndpoint(endpoint, 'traces'), headers }),
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: signalEndpoint(endpoint, 'metrics'), headers }), exportIntervalMillis: 60_000 })],
  });
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: signalEndpoint(endpoint, 'logs'), headers }) })],
  });
  logs.setGlobalLoggerProvider(loggerProvider);
  await Promise.resolve(sdk.start());
  return {
    enabled: true,
    async shutdown() {
      await Promise.all([sdk.shutdown(), loggerProvider.shutdown()]);
    },
  };
}

export function activeTraceId(): string | undefined {
  const span = trace.getSpan(context.active());
  const activeId = span?.spanContext().traceId;
  return activeId && traceId.test(activeId) ? activeId : undefined;
}
