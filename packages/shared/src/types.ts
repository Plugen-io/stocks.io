// ===== Identidade do device =====
export interface DeviceIdentity {
  uuid: string;            // gerado uma vez no setup
  cpuFingerprint: string;  // hash de cpu-id + plataforma
  enrolledAt: string;      // ISO timestamp
}

// ===== Enrollment (primeiro cert) =====
export interface EnrollRequest {
  enrollmentToken: string;
  identity: DeviceIdentity;
  csrPem: string;
  deviceLabel?: string;
}

export interface EnrollResponse {
  deviceId: string;
  certPem: string;
  caChainPem: string;     // CA(s) confiáveis pra validar o servidor
  serialNumber: string;
  expiresAt: string;
}

// ===== Renovação (cert subsequente) =====
export interface RenewRequest {
  csrPem: string;
}

export interface RenewResponse {
  certPem: string;
  serialNumber: string;
  expiresAt: string;
  caChainPem: string;
}

// ===== Inflow (mock pagamento) =====
export interface InflowRequest {
  amountBRL: number;
  idempotencyKey: string;
}

export interface InflowResponse {
  success: boolean;
  inflowId?: string;
  newBalance?: number;
  error?: 'CERT_EXPIRED' | 'CERT_REVOKED' | 'AUTH_FAILED' | 'PAYMENT_FAILED';
  message?: string;
}

// ===== Heartbeat =====
export interface HeartbeatRequest {
  certSerialNumber: string;
  uptimeSec: number;
  agentVersion: string;
}

export interface HeartbeatResponse {
  ok: true;
  serverTime: string;
  caRotationAvailable?: boolean;
}

// ===== CA update =====
export interface CAUpdateResponse {
  caChainPem: string;
  version: number;
}

// ===== Erros mTLS =====
export type CertErrorReason =
  | 'CERT_EXPIRED'
  | 'CERT_REVOKED'
  | 'CERT_NOT_FOUND'
  | 'CERT_INVALID_SIGNATURE'
  | 'CERT_DEVICE_MISMATCH';

export interface CertErrorPayload {
  reason: CertErrorReason;
  message: string;
}
