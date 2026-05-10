/**
 * Keystore local — guarda chave privada, cert atual e CA chain do device.
 *
 * Estratégia A1: a chave privada é gerada UMA VEZ no setup e nunca mais sai.
 * Renovações geram CSR a partir da MESMA chave.
 *
 * Localização: ~/.stocksio-client/
 *   - private.key       (chave privada do device — NUNCA sai daqui)
 *   - public.key
 *   - device.json       ({uuid, cpuFingerprint, enrolledAt, label})
 *   - cert.pem          (cert atual)
 *   - ca-chain.pem      (CA(s) que confiamos no servidor)
 *   - cert-history.json (rastreio de certs anteriores)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateKeyPairPem, type KeyPairPem } from '@stocks.io/shared/cert-utils';
import type { DeviceIdentity } from '@stocks.io/shared';

export interface DeviceState {
  identity: DeviceIdentity;
  label?: string;
  serverDeviceId?: string;
}

const HOME = os.homedir();
const KEYSTORE_DIR = process.env.STOCKSIO_HOME ?? path.join(HOME, '.stocksio-client');

const PATHS = {
  privateKey: path.join(KEYSTORE_DIR, 'private.key'),
  publicKey: path.join(KEYSTORE_DIR, 'public.key'),
  device: path.join(KEYSTORE_DIR, 'device.json'),
  cert: path.join(KEYSTORE_DIR, 'cert.pem'),
  caChain: path.join(KEYSTORE_DIR, 'ca-chain.pem'),
  history: path.join(KEYSTORE_DIR, 'cert-history.json'),
};

function ensureDir() {
  if (!fs.existsSync(KEYSTORE_DIR)) {
    fs.mkdirSync(KEYSTORE_DIR, { recursive: true, mode: 0o700 });
  }
}

export function isInitialized(): boolean {
  return fs.existsSync(PATHS.privateKey) && fs.existsSync(PATHS.device);
}

export function generateAndStoreKeyPair(): KeyPairPem {
  ensureDir();
  if (fs.existsSync(PATHS.privateKey)) {
    throw new Error('Keypair já existe. Reset manual: apague ~/.stocksio-client/');
  }
  const kp = generateKeyPairPem();
  fs.writeFileSync(PATHS.privateKey, kp.privateKeyPem, { mode: 0o600 });
  fs.writeFileSync(PATHS.publicKey, kp.publicKeyPem, { mode: 0o644 });
  return kp;
}

export function loadKeyPair(): KeyPairPem {
  return {
    privateKeyPem: fs.readFileSync(PATHS.privateKey, 'utf8'),
    publicKeyPem: fs.readFileSync(PATHS.publicKey, 'utf8'),
  };
}

export function saveDeviceState(state: DeviceState) {
  ensureDir();
  fs.writeFileSync(PATHS.device, JSON.stringify(state, null, 2), { mode: 0o600 });
}

export function loadDeviceState(): DeviceState {
  return JSON.parse(fs.readFileSync(PATHS.device, 'utf8')) as DeviceState;
}

export function saveCert(certPem: string, caChainPem: string) {
  ensureDir();
  // Antes de sobrescrever, arquiva no histórico
  if (fs.existsSync(PATHS.cert)) {
    appendToHistory(fs.readFileSync(PATHS.cert, 'utf8'));
  }
  fs.writeFileSync(PATHS.cert, certPem, { mode: 0o644 });
  fs.writeFileSync(PATHS.caChain, caChainPem, { mode: 0o644 });
}

export function loadCert(): { certPem: string; caChainPem: string } {
  return {
    certPem: fs.readFileSync(PATHS.cert, 'utf8'),
    caChainPem: fs.readFileSync(PATHS.caChain, 'utf8'),
  };
}

function appendToHistory(certPem: string) {
  const history: string[] = fs.existsSync(PATHS.history)
    ? JSON.parse(fs.readFileSync(PATHS.history, 'utf8'))
    : [];
  history.push(certPem);
  fs.writeFileSync(PATHS.history, JSON.stringify(history, null, 2));
}

export function reset() {
  if (fs.existsSync(KEYSTORE_DIR)) {
    fs.rmSync(KEYSTORE_DIR, { recursive: true, force: true });
  }
}
