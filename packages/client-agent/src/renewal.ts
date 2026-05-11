/**
 * Renovação de certificado — estratégia A1.
 *
 * 1. Carrega keypair existente (NÃO gera nova chave)
 * 2. Gera CSR com a mesma public key, mesmo CN (UUID do device)
 * 3. POST /renew via mTLS (cert atual ainda válido autentica a request)
 * 4. Servidor responde com cert novo
 * 5. Salva cert novo (arquiva o antigo em cert-history.json)
 */
import { loadKeyPair, saveCert, loadDeviceState, loadCert, isInitialized } from './keystore.js';
import { requestMtls } from './tls-client.js';
import { certUtils, type RenewResponse } from '@stocks.io/shared';

export interface RenewResult {
  serialNumber: string;
  expiresAt: string;
}

export async function renewCert(): Promise<RenewResult> {
  const kp = loadKeyPair();
  const state = loadDeviceState();

  const csrPem = certUtils.generateCSR(kp.privateKeyPem, kp.publicKeyPem, {
    commonName: state.identity.uuid,
    organization: 'Stocks.io Device',
    country: 'BR',
  });

  const res = await requestMtls<RenewResponse>('/renew', {
    method: 'POST',
    body: { csrPem },
  });

  if (!res.ok) {
    throw new Error(`renew failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  saveCert(res.data.certPem, res.data.caChainPem);

  return {
    serialNumber: res.data.serialNumber,
    expiresAt: res.data.expiresAt,
  };
}

/**
 * Inspeciona o cert atual e retorna metadata (expira em, serial, etc).
 */
export function getCertInfo() {
  if (!isInitialized()) return null;
  try {
    const { certPem } = loadCert();
    return certUtils.summarizeCert(certPem);
  } catch {
    return null;
  }
}
