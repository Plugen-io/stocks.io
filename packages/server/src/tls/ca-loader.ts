import fs from 'node:fs';
import path from 'node:path';
import forge from 'node-forge';
import type { CASet } from '@stocks.io/shared/cert-utils';
import { config } from '../config.js';

/**
 * Carrega uma CA (cert + chave privada) do disco em formato CASet.
 * Retorna null se a CA dessa versão não existir.
 */
export function loadCAFromDisk(version: number): CASet | null {
  const certPath = path.join(config.certsDir, `ca-v${version}.crt`);
  const keyPath = path.join(config.certsDir, `ca-v${version}.key`);
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) return null;
  const certPem = fs.readFileSync(certPath, 'utf8');
  const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
  return {
    cert: forge.pki.certificateFromPem(certPem),
    certPem,
    privateKey: forge.pki.privateKeyFromPem(privateKeyPem) as forge.pki.rsa.PrivateKey,
    privateKeyPem,
  };
}

/**
 * Carrega TODAS as CAs ca-v*.{crt,key} do disco. Útil pra cross-sign rotation:
 * o servidor precisa aceitar certs de TODAS as CAs vigentes (não só a ativa).
 */
export function loadAllCAs(): Map<number, CASet> {
  const map = new Map<number, CASet>();
  if (!fs.existsSync(config.certsDir)) return map;
  for (const file of fs.readdirSync(config.certsDir)) {
    const m = file.match(/^ca-v(\d+)\.crt$/);
    if (!m) continue;
    const version = Number(m[1]);
    const ca = loadCAFromDisk(version);
    if (ca) map.set(version, ca);
  }
  return map;
}
