/**
 * Cliente HTTPS pro server stocks.io.
 *
 * - `requestPublic`: HTTPS comum, valida server cert via caChain do keystore (rota /enroll, /health)
 * - `requestMtls`: HTTPS + cert/key do device (rotas autenticadas)
 *
 * Usa node:https direto pra ter controle total sobre cert/key/ca por request.
 */
import https from 'node:https';
import { URL } from 'node:url';
import { loadKeyPair, loadCert } from './keystore.js';

const SERVER_URL = process.env.SERVER_URL ?? 'https://stocks-poc.plugen.io:443';

export interface HttpResult<T = unknown> {
  status: number;
  data: T;
  ok: boolean;
}

export async function requestPublic<T = unknown>(
  pathname: string,
  init: { method?: string; body?: unknown } = {},
): Promise<HttpResult<T>> {
  // Pra /enroll precisamos confiar no server cert. Se o keystore ainda não tem caChain
  // (primeiro contato), usamos NODE_TLS_REJECT_UNAUTHORIZED apenas pro enrollment.
  // Em produção real isso seria pinning de fingerprint ou TOFU.
  let ca: string | undefined;
  try {
    const { caChainPem } = loadCert();
    ca = caChainPem;
  } catch {
    // Sem keystore ainda — primeiro enrollment.
  }
  return doRequest<T>(pathname, init, { ca });
}

export async function requestMtls<T = unknown>(
  pathname: string,
  init: { method?: string; body?: unknown } = {},
): Promise<HttpResult<T>> {
  const { privateKeyPem } = loadKeyPair();
  const { certPem, caChainPem } = loadCert();
  return doRequest<T>(pathname, init, {
    cert: certPem,
    key: privateKeyPem,
    ca: caChainPem,
  });
}

function doRequest<T>(
  pathname: string,
  init: { method?: string; body?: unknown },
  tls: { cert?: string; key?: string; ca?: string },
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
        ...(tls.cert ? { cert: tls.cert } : {}),
        ...(tls.key ? { key: tls.key } : {}),
        ...(tls.ca ? { ca: tls.ca } : { rejectUnauthorized: false }),
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
