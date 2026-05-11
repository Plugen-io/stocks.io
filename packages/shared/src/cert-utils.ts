import forge from 'node-forge';
import { CRYPTO, CERT_VALIDITY } from './constants.js';

// ============================================================================
// Tipos auxiliares
// ============================================================================

export interface KeyPairPem {
  publicKeyPem: string;
  privateKeyPem: string;
}

export interface CASet {
  cert: forge.pki.Certificate;
  certPem: string;
  privateKey: forge.pki.rsa.PrivateKey;
  privateKeyPem: string;
}

export interface IssuedCert {
  certPem: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
}

// ============================================================================
// Geração de keypair
// ============================================================================

export function generateKeyPairPem(bits: number = CRYPTO.KEY_BITS): KeyPairPem {
  const keyPair = forge.pki.rsa.generateKeyPair({ bits });
  return {
    publicKeyPem: forge.pki.publicKeyToPem(keyPair.publicKey),
    privateKeyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
  };
}

// ============================================================================
// CSR (Certificate Signing Request)
// ============================================================================

export interface CSRSubject {
  commonName: string;       // deviceId (UUID) ou hostname do servidor
  organization?: string;
  country?: string;
}

export function generateCSR(privateKeyPem: string, publicKeyPem: string, subject: CSRSubject): string {
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem) as forge.pki.rsa.PrivateKey;
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = publicKey;
  csr.setSubject([
    { name: 'commonName', value: subject.commonName },
    { name: 'organizationName', value: subject.organization ?? 'Stock.io' },
    { name: 'countryName', value: subject.country ?? 'BR' },
  ]);

  csr.sign(privateKey, forge.md.sha256.create());

  if (!csr.verify()) {
    throw new Error('CSR self-verification failed');
  }
  return forge.pki.certificationRequestToPem(csr);
}

export function parseCSR(csrPem: string) {
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  if (!csr.verify()) {
    throw new Error('Invalid CSR signature');
  }
  return csr;
}

// ============================================================================
// CA — Root self-signed
// ============================================================================

export function generateRootCA(commonName: string, years = CERT_VALIDITY.CA_YEARS): CASet {
  const { publicKeyPem, privateKeyPem } = generateKeyPairPem();
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem) as forge.pki.rsa.PrivateKey;

  const cert = forge.pki.createCertificate();
  cert.publicKey = publicKey;
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + years);

  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: 'Stock.io' },
    { name: 'countryName', value: 'BR' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(privateKey, forge.md.sha256.create());

  return {
    cert,
    certPem: forge.pki.certificateToPem(cert),
    privateKey,
    privateKeyPem,
  };
}

// ============================================================================
// Server cert (assinado pela CA)
// ============================================================================

export function issueServerCert(opts: {
  ca: CASet;
  commonName: string;     // hostname do server
  altNames?: string[];    // SANs (DNS)
  validityDays?: number;
}): { cert: IssuedCert; privateKeyPem: string } {
  const validityDays = opts.validityDays ?? CERT_VALIDITY.DEFAULT_DAYS;
  const { publicKeyPem, privateKeyPem } = generateKeyPairPem();
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

  const cert = forge.pki.createCertificate();
  cert.publicKey = publicKey;
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validityDays);

  cert.setSubject([
    { name: 'commonName', value: opts.commonName },
    { name: 'organizationName', value: 'Stock.io' },
    { name: 'countryName', value: 'BR' },
  ]);
  cert.setIssuer(opts.ca.cert.subject.attributes);

  const altNames = (opts.altNames ?? [opts.commonName]).map(name => ({ type: 2, value: name })); // type 2 = DNS
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames },
    { name: 'subjectKeyIdentifier' },
  ]);

  cert.sign(opts.ca.privateKey, forge.md.sha256.create());

  return {
    cert: {
      certPem: forge.pki.certificateToPem(cert),
      serialNumber: normalizeSerial(cert.serialNumber),
      notBefore: cert.validity.notBefore,
      notAfter: cert.validity.notAfter,
    },
    privateKeyPem,
  };
}

// ============================================================================
// Client cert (assinado pela CA, a partir de CSR)
// ============================================================================

export function signClientCSR(opts: {
  ca: CASet;
  csrPem: string;
  validityMinutes?: number;
  validityDays?: number;
}): IssuedCert {
  const csr = parseCSR(opts.csrPem);

  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey as forge.pki.PublicKey;
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  if (opts.validityMinutes !== undefined) {
    cert.validity.notAfter = new Date(cert.validity.notBefore.getTime() + opts.validityMinutes * 60_000);
  } else {
    const days = opts.validityDays ?? CERT_VALIDITY.DEFAULT_DAYS;
    cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + days);
  }

  cert.setSubject(csr.subject.attributes);
  cert.setIssuer(opts.ca.cert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', clientAuth: true },
    { name: 'subjectKeyIdentifier' },
  ]);

  cert.sign(opts.ca.privateKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    serialNumber: normalizeSerial(cert.serialNumber),
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
  };
}

// ============================================================================
// Cross-signing — assina CA-v2 com CA-v1
// ============================================================================

export function crossSignCA(opts: { signerCA: CASet; targetCA: CASet }): string {
  const cert = forge.pki.createCertificate();
  cert.publicKey = opts.targetCA.cert.publicKey;
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(opts.targetCA.cert.validity.notAfter);

  cert.setSubject(opts.targetCA.cert.subject.attributes);
  cert.setIssuer(opts.signerCA.cert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(opts.signerCA.privateKey, forge.md.sha256.create());

  return forge.pki.certificateToPem(cert);
}

// ============================================================================
// Parse / inspect
// ============================================================================

export interface CertSummary {
  serialNumber: string;
  commonName: string;
  notBefore: Date;
  notAfter: Date;
  isExpired: boolean;
  fingerprintSha256: string;
}

/**
 * Normaliza serial number pra forma canônica: lowercase, sem leading zeros.
 *
 * Por que: node-forge, ASN.1, e node:tls retornam o serial em formatos
 * diferentes (com/sem padding de signedness). Padronizamos aqui pra que
 * o lookup em DB sempre encontre.
 */
export function normalizeSerial(serial: string): string {
  return serial.toLowerCase().replace(/^0+/, '') || '0';
}

export function summarizeCert(certPem: string): CertSummary {
  const cert = forge.pki.certificateFromPem(certPem);
  const cn = cert.subject.getField('CN')?.value ?? '';
  const md = forge.md.sha256.create();
  md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
  return {
    serialNumber: normalizeSerial(cert.serialNumber),
    commonName: cn,
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    isExpired: cert.validity.notAfter.getTime() < Date.now(),
    fingerprintSha256: md.digest().toHex(),
  };
}

// ============================================================================
// Utils
// ============================================================================

function randomSerial(): string {
  // 16 bytes hex, prefixado com 0 se primeiro byte tiver bit alto setado (RFC 5280)
  const bytes = forge.random.getBytesSync(16);
  let hex = forge.util.bytesToHex(bytes);
  if (parseInt(hex[0]!, 16) >= 8) hex = '0' + hex;
  return hex;
}
