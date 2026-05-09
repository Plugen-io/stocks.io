export const CRYPTO = {
  KEY_BITS: 2048,
  HASH: 'SHA-256',
  CSR_SIGN_ALG: 'sha256',
} as const;

export const CERT_VALIDITY = {
  DEFAULT_DAYS: 90,
  TEST_MINUTES: 5,
  CA_YEARS: 10,
} as const;

export const HEADERS = {
  ENROLLMENT_TOKEN: 'x-enrollment-token',
  DEVICE_ID: 'x-device-id',
} as const;

export const HEARTBEAT_INTERVAL_MS = 30_000;

export const CERT_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  SUPERSEDED: 'superseded',
} as const;

export type CertStatus = typeof CERT_STATUS[keyof typeof CERT_STATUS];
