/**
 * Setup wizard — primeira execução do device.
 *
 * Fluxo:
 *  1. Gera UUID + cpuFingerprint (identity.ts)
 *  2. Gera keypair RSA 2048 (uma única vez — chave NUNCA muda, estratégia A1)
 *  3. Gera CSR com CN=UUID
 *  4. POST /enroll com {enrollmentToken, identity, csrPem, deviceLabel}
 *  5. Salva cert + caChain em keystore
 *  6. Pronto: device pode falar mTLS
 */
import { generateIdentity } from './identity.js';
import {
  isInitialized,
  generateAndStoreKeyPair,
  loadKeyPair,
  saveDeviceState,
  saveCert,
  loadDeviceState,
} from './keystore.js';
import { requestPublic } from './tls-client.js';
import { certUtils, type EnrollResponse } from '@stocks.io/shared';

export interface SetupOptions {
  enrollmentToken: string;
  deviceLabel?: string;
}

export interface SetupResult {
  deviceId: string;
  serialNumber: string;
  expiresAt: string;
}

export async function runSetup(opts: SetupOptions): Promise<SetupResult> {
  if (isInitialized()) {
    throw new Error('device already initialized — reset via DELETE /api/reset to redo setup');
  }

  // 1. Identity
  const identity = generateIdentity();

  // 2. Keypair (uma vez só)
  const kp = generateAndStoreKeyPair();

  // 3. CSR (CN = UUID do device)
  const csrPem = certUtils.generateCSR(kp.privateKeyPem, kp.publicKeyPem, {
    commonName: identity.uuid,
    organization: 'Stocks.io Device',
    country: 'BR',
  });

  // 4. POST /enroll
  const res = await requestPublic<EnrollResponse>('/enroll', {
    method: 'POST',
    body: {
      enrollmentToken: opts.enrollmentToken,
      identity,
      csrPem,
      deviceLabel: opts.deviceLabel,
    },
  });

  if (!res.ok) {
    throw new Error(`enrollment failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  // 5. Persiste cert + state
  saveDeviceState({
    identity,
    label: opts.deviceLabel,
    serverDeviceId: res.data.deviceId,
  });
  saveCert(res.data.certPem, res.data.caChainPem);

  return {
    deviceId: res.data.deviceId,
    serialNumber: res.data.serialNumber,
    expiresAt: res.data.expiresAt,
  };
}

export function getSetupStatus() {
  if (!isInitialized()) {
    return { initialized: false };
  }
  const state = loadDeviceState();
  return {
    initialized: true,
    deviceId: state.serverDeviceId,
    label: state.label,
    enrolledAt: state.identity.enrolledAt,
  };
}
