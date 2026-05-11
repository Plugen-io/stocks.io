/**
 * Loop de heartbeat — envia ping ao server a cada N segundos.
 *
 * - Só roda quando o device está enrolled
 * - Retry exponencial em falhas (até 5 min)
 * - Mantém o `lastHeartbeat` em memória pra UI consumir
 */
import { isInitialized, loadCert } from './keystore.js';
import { requestMtls } from './tls-client.js';
import { certUtils, HEARTBEAT_INTERVAL_MS, type HeartbeatResponse } from '@stocks.io/shared';

const AGENT_VERSION = '0.1.0';
const START_TIME = Date.now();

interface HeartbeatStatus {
  lastSuccess: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

const status: HeartbeatStatus = {
  lastSuccess: null,
  lastError: null,
  consecutiveFailures: 0,
};

let timer: NodeJS.Timeout | null = null;

export function getHeartbeatStatus(): HeartbeatStatus {
  return { ...status };
}

async function tick() {
  if (!isInitialized()) return;
  try {
    const { certPem } = loadCert();
    const cert = certUtils.summarizeCert(certPem);
    const res = await requestMtls<HeartbeatResponse>('/heartbeat', {
      method: 'POST',
      body: {
        certSerialNumber: cert.serialNumber,
        uptimeSec: Math.floor((Date.now() - START_TIME) / 1000),
        agentVersion: AGENT_VERSION,
      },
    });
    if (res.ok) {
      status.lastSuccess = new Date().toISOString();
      status.consecutiveFailures = 0;
      status.lastError = null;
    } else {
      status.consecutiveFailures += 1;
      status.lastError = `HTTP ${res.status}: ${JSON.stringify(res.data)}`;
    }
  } catch (err) {
    status.consecutiveFailures += 1;
    status.lastError = (err as Error).message;
  }
}

export function startHeartbeat() {
  if (timer) return;
  // Primeira batida em 5s (deixa o agent acabar de subir), depois interval normal
  setTimeout(() => {
    void tick();
    timer = setInterval(() => void tick(), HEARTBEAT_INTERVAL_MS);
  }, 5_000);
}

export function stopHeartbeat() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
