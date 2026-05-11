/**
 * Cliente HTTPS pro server stocks.io.
 *
 * - `requestPublic`: HTTPS comum, valida server cert via root CAs do sistema (LE)
 *                    + opcionalmente nossa CA se ainda for self-signed
 * - `requestMtls`: igual + cert/key do device (rotas autenticadas via mTLS)
 *
 * Usa node:https direto pra ter controle total sobre cert/key/ca por request.
 *
 * Estratégia de trust do server cert:
 *  - Se STOCKSIO_TRUST_CA_FILE estiver setado, usa esse PEM (self-signed dev/test)
 *  - Senão, deixa Node usar root certs do sistema (Mozilla bundle, incluindo LE)
 *  Assim funciona out-of-the-box tanto em prod (cert LE) quanto em dev (self-signed
 *  com env var apontando pra ca-v1.crt).
 */
import https from 'node:https';
import fs from 'node:fs';
import { URL } from 'node:url';
import { loadKeyPair, loadCert } from './keystore.js';

const SERVER_URL = process.env.SERVER_URL ?? 'https://stocks-poc.plugen.io:443';

const TRUST_CA_FILE = process.env.STOCKSIO_TRUST_CA_FILE;
const extraTrustedCA: string | null = TRUST_CA_FILE && fs.existsSync(TRUST_CA_FILE)
  ? fs.readFileSync(TRUST_CA_FILE, 'utf8')
  : null;

export interface HttpResult<T = unknown> {
  status: number;
  data: T;
  ok: boolean;
}

export async function requestPublic<T = unknown>(
  pathname: string,
  init: { method?: string; body?: unknown } = {},
): Promise<HttpResult<T>> {
  return doRequest<T>(pathname, init, {});
}

export async function requestMtls<T = unknown>(
  pathname: string,
  init: { method?: string; body?: unknown } = {},
): Promise<HttpResult<T>> {
  const { privateKeyPem } = loadKeyPair();
  const { certPem } = loadCert();
  return doRequest<T>(pathname, init, {
    cert: certPem,
    key: privateKeyPem,
  });
}

function doRequest<T>(
  pathname: string,
  init: { method?: string; body?: unknown },
  tlsOpts: { cert?: string; key?: string },
): Promise<HttpResult<T>> {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, SERVER_URL);
    const method = init.method ?? (init.body ? 'POST' : 'GET');
    const bodyStr = init.body ? JSON.stringify(init.body) : undefined;

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
        ...(tlsOpts.cert ? { cert: tlsOpts.cert } : {}),
        ...(tlsOpts.key ? { key: tlsOpts.key } : {}),
        // Sem `ca` explícito → Node usa root certs do sistema (Mozilla bundle, valida LE).
        // Com STOCKSIO_TRUST_CA_FILE → adiciona PEM custom (pra dev com self-signed).
        ...(extraTrustedCA ? { ca: extraTrustedCA } : {}),
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          let data: unknown = body;
          try {
            data = JSON.parse(body);
          } catch {
            // não-JSON, deixa como string
          }
          resolve({ status, data: data as T, ok: status >= 200 && status < 300 });
        });
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

export function getServerUrl(): string {
  return SERVER_URL;
}
