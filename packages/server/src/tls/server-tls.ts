import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export interface ServerTLSMaterial {
  ca: Buffer;        // CA(s) que assinaram os clients (todos os ServerCA ativos)
  cert: Buffer;      // cert do servidor
  key: Buffer;       // chave privada do servidor
  caPems: string[];  // PEMs separadas das CAs ativas (pra responder GET /ca-update)
}

/**
 * Carrega cert do servidor + chain de CAs ativas do disco.
 *
 * Em produção real isso viria do DB (ServerCA table) — mas pra POC, lemos
 * do filesystem que foi populado por bootstrap-ca.ts.
 *
 * Pra rotação de CA: quando uma CA-v2 for criada, deve ser adicionada em certs/
 * como ca-v2.crt e o code carrega TODAS as ca-v*.crt (cross-trust). Isso permite
 * que devices antigos (cert assinado por v1) E novos (assinado por v2) sejam aceitos.
 */
export function loadServerTLS(): ServerTLSMaterial {
  const dir = config.certsDir;
  if (!fs.existsSync(dir)) {
    throw new Error(`certs dir not found: ${dir}. Run \`npm run ca:bootstrap\` first.`);
  }

  const serverCert = fs.readFileSync(path.join(dir, 'server.crt'));
  const serverKey = fs.readFileSync(path.join(dir, 'server.key'));

  // Lista TODAS as CAs ca-v*.crt no diretório
  const caFiles = fs.readdirSync(dir)
    .filter((f) => /^ca-v\d+\.crt$/.test(f))
    .sort();
  if (caFiles.length === 0) {
    throw new Error('No ca-v*.crt found in certs dir');
  }
  const caPems = caFiles.map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  const ca = Buffer.concat(caPems.map((pem) => Buffer.from(pem)));

  return { ca, cert: serverCert, key: serverKey, caPems };
}
