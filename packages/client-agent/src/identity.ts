import os from 'node:os';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { DeviceIdentity } from '@stocks.io/shared';

/**
 * Gera identidade do device combinando UUID v4 + fingerprint do hardware.
 *
 * O cpuFingerprint mistura:
 *   - modelo da CPU
 *   - quantidade de cores
 *   - hostname
 *   - plataforma (win32, linux, darwin)
 *   - arch (x64, arm64)
 *
 * Não é 100% imutável (hostname muda), mas é estável o bastante pra POC.
 */
export function generateIdentity(): DeviceIdentity {
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model ?? 'unknown';
  const cpuCount = cpus.length;
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();

  const fingerprintRaw = `${cpuModel}|${cpuCount}|${hostname}|${platform}|${arch}`;
  const cpuFingerprint = crypto.createHash('sha256').update(fingerprintRaw).digest('hex').slice(0, 32);

  return {
    uuid: uuidv4(),
    cpuFingerprint,
    enrolledAt: new Date().toISOString(),
  };
}
