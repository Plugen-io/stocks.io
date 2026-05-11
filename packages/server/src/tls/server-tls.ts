import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export interface ServerTLSMaterial {
  ca: Buffer;        // CA(s) que assinam os CLIENTS — usado pra validar mTLS
  cert: Buffer;      // cert do servidor (browser vê este)
  key: Buffer;       // chave privada do cert do servidor
  caPems: string[];  // PEMs separadas das CAs ativas (pra /ca-update)
  source: 'letsencrypt' | 'self-signed';
}

/**
 * Carrega o material TLS do servidor:
 *
 *  - **Server identity** (o cert que o servidor apresenta no handshake):
 *    Preferência: `server-le.crt` + `server-le.key` (Let's Encrypt, browsers confiam).
 *    Fallback: `server.crt` + `server.key` (self-signed, gerado pelo bootstrap-ca).
 *
 *  - **Client CA** (quem assinou os certs dos devices que queremos aceitar):
 *    Sempre `ca-v*.crt` self-signed — esses CAs assinam APENAS clients, não
 *    são confiáveis publicamente. Cross-signing futuro carregará multiplas versões aqui.
 *
 * As duas coisas são INDEPENDENTES no TLS:
 *   - cert/key = o que o servidor envia (validado pelo browser/agent)
 *   - ca       = o que o servidor aceita pra autenticar o client
 */
export function loadServerTLS(): ServerTLSMaterial {
  const dir = config.certsDir;
  if (!fs.existsSync(dir)) {
    throw new Error(`certs dir not found: ${dir}. Run \`npm run ca:bootstrap\` first.`);
  }

  // Server identity: LE se existir, senão self-signed
  let cert: Buffer;
  let key: Buffer;
  let source: 'letsencrypt' | 'self-signed';

  const lePath = path.join(dir, 'server-le.crt');
  const leKeyPath = path.join(dir, 'server-le.key');
  if (fs.existsSync(lePath) && fs.existsSync(leKeyPath)) {
    cert = fs.readFileSync(lePath);
    key = fs.readFileSync(leKeyPath);
    source = 'letsencrypt';
  } else {
    cert = fs.readFileSync(path.join(dir, 'server.crt'));
    key = fs.readFileSync(path.join(dir, 'server.key'));
    source = 'self-signed';
  }

  // Client CAs: TODAS as ca-v*.crt (suporte a multi-CA pra cross-sign)
  const caFiles = fs.readdirSync(dir)
    .filter((f) => /^ca-v\d+\.crt$/.test(f))
    .sort();
  if (caFiles.length === 0) {
    throw new Error('No ca-v*.crt found in certs dir — clients cannot be validated');
  }
  const caPems = caFiles.map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  const ca = Buffer.concat(caPems.map((pem) => Buffer.from(pem)));

  return { ca, cert, key, caPems, source };
}
