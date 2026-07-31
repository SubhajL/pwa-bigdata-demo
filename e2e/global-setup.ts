/**
 * Runs once before the suite: fail fast with a clear message if the stack is not up, and start
 * from a clean `normal` scenario so an earlier aborted run cannot leave a fault mode active.
 */
import { apiOk, pipelineStatus, pollUntil, setFault, webOk, API_BASE, WEB_BASE } from "./lib/api";

export default async function globalSetup(): Promise<void> {
  await pollUntil(() => apiOk("/healthz"), {
    timeoutMs: 30_000,
    label: `API at ${API_BASE} (run scripts/demo-preflight.sh first)`,
  });
  await pollUntil(() => webOk("/"), { timeoutMs: 30_000, label: `web at ${WEB_BASE}` });

  // Clean slate: normal telemetry, and wait until the subscriber is ingesting again.
  setFault("normal");
  const before = (await pipelineStatus()).received;
  await pollUntil(async () => (await pipelineStatus()).received > before, {
    timeoutMs: 30_000,
    label: "ingest alive after reset to normal",
  });
}
