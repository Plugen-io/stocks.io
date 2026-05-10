/**
 * Bootstrap inicial da CA + cert do servidor.
 *
 * Uso:
 *   SERVER_HOSTNAME=mtls-poc.example.com npm run ca:bootstrap
 *
 * Gera em ./certs/:
 *   - ca-v1.crt / ca-v1.key   → Root CA self-signed
 *   - server.crt / server.key → cert do servidor mTLS, assinado pela CA
 *
 * Idempotência: se ./certs/ca-v1.crt já existir, aborta (não sobrescreve).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  generateRootCA,
  issueServerCert,
  type CASet,
} from '@stocks.io/shared/cert-utils';
import forge from 'node-forge';

const CERTS_DIR = process.env.CERTS_DIR ?? path.resolve(process.cwd(), 'certs');
const SERVER_HOSTNAME = process.env.SERVER_HOSTNAME ?? 'localhost';
const SERVER_ALT_NAMES = (process.env.SERVER_ALT_NAMES ?? `${SERVER_HOSTNAME},localhost`).split(',');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeFileMode(filePath: string, content: string, mode: number) {
  fs.writeFileSync(filePath, content, { mode });
}

function loadCAFromDisk(version: number): CASet | null {
  const certPath = path.join(CERTS_DIR, `ca-v${version}.crt`);
  const keyPath = path.join(CERTS_DIR, `ca-v${version}.key`);
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) return null;
  const certPem = fs.readFileSync(certPath, 'utf8');
  const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
  return {
    cert: forge.pki.certificateFromPem(certPem),
    certPem,
    privateKey: forge.pki.privateKeyFromPem(privateKeyPem),
    privateKeyPem,
  };
}

function main() {
  ensureDir(CERTS_DIR);

  const existing = loadCAFromDisk(1);
  if (existing) {
    console.log('CA v1 já existe em', CERTS_DIR, '— abortando bootstrap.');
    console.log('   Pra recomeçar do zero: apague a pasta certs/ manualmente.');
    process.exit(0);
  }

  console.log('Gerando Root CA v1...');
  const ca = generateRootCA('Stock.io Root CA v1');
  writeFileMode(path.join(CERTS_DIR, 'ca-v1.crt'), ca.certPem, 0o644);
  writeFileMode(path.join(CERTS_DIR, 'ca-v1.key'), ca.privateKeyPem, 0o600);
  console.log('   ca-v1.crt + ca-v1.key escritos.');

  console.log(`Emitindo cert do servidor para ${SERVER_HOSTNAME}...`);
  console.log(`   SANs: ${SERVER_ALT_NAMES.join(', ')}`);
  const { cert, privateKeyPem } = issueServerCert({
    ca,
    commonName: SERVER_HOSTNAME,
    altNames: SERVER_ALT_NAMES,
    validityDays: 365,
  });
  writeFileMode(path.join(CERTS_DIR, 'server.crt'), cert.certPem, 0o644);
  writeFileMode(path.join(CERTS_DIR, 'server.key'), privateKeyPem, 0o600);
  console.log(`   server.crt + server.key (validade até ${cert.notAfter.toISOString()})`);

  console.log('\nBootstrap concluído.');
  console.log('Próximo passo: configure DATABASE_URL e rode `npm run prisma:migrate`.');
}

main();
