import 'dotenv/config';
import path from 'node:path';

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Env var ${key} is required`);
  return v;
}

function optInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? Number(v) : fallback;
}

function optBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes'].includes(v.toLowerCase());
}

export const config = {
  host: process.env.SERVER_HOST ?? '0.0.0.0',
  port: optInt('SERVER_PORT', 4443),
  hostname: required('SERVER_HOSTNAME'),

  databaseUrl: required('DATABASE_URL'),

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },

  certsDir: process.env.CERTS_DIR
    ? path.resolve(process.env.CERTS_DIR)
    : path.resolve(process.cwd(), 'certs'),
  activeCaVersion: optInt('ACTIVE_CA_VERSION', 1),

  certValidity: {
    defaultDays: optInt('DEFAULT_CERT_VALIDITY_DAYS', 90),
    testMinutes: optInt('TEST_CERT_VALIDITY_MINUTES', 5),
  },

  admin: {
    email: required('ADMIN_EMAIL'),
    initialPassword: required('ADMIN_INITIAL_PASSWORD'),
  },

  isDev: optBool('DEV', process.env.NODE_ENV !== 'production'),
} as const;
