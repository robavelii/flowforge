import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { loadWorkerConfig } from '@flowforge/config';

function tracesEndpoint(endpoint?: string): string | undefined {
  if (!endpoint) {
    return undefined;
  }
  return endpoint.endsWith('/v1/traces') ? endpoint : `${endpoint.replace(/\/$/, '')}/v1/traces`;
}

const config = loadWorkerConfig();
const endpoint = tracesEndpoint(config.OTEL_EXPORTER_OTLP_ENDPOINT);

if (endpoint) {
  const sdk = new NodeSDK({
    serviceName: config.OTEL_SERVICE_NAME,
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    void sdk.shutdown();
  });
}
