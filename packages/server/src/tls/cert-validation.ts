import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../db/prisma.js';
import { certError } from '../lib/errors.js';
import { CERT_STATUS } from '@stocks.io/shared';

declare module 'fastify' {
  interface FastifyRequest {
    /** Cert ativo do device autenticado via mTLS (preenchido pelo plugin) */
    deviceCert?: {
      deviceId: string;
      certificateId: string;
      serialNumber: string;
      expiresAt: Date;
    };
  }
}

/**
 * Plugin que VALIDA o client cert apresentado no handshake mTLS.
 *
 * Como funciona:
 *  - `https.createServer({requestCert: true, rejectUnauthorized: false})` pede o cert
 *    no handshake mas NÃO falha conexão se inválido (deixa pra gente decidir por rota).
 *  - Aqui checamos `socket.authorized` — se false, o cert não foi assinado pela nossa CA.
 *  - Depois lookup no DB pelo serial pra checar status (revoked, expired, superseded).
 *  - Se tudo ok, anexa `request.deviceCert` com os IDs.
 *
 * Use:
 *  - Globalmente via `app.register(certValidation)` e depois `app.addHook('preHandler', requireMtls)`
 *  - Ou só nas rotas que precisam (recomendado): registrar plugin no escopo do route group.
 */
export async function requireMtls(request: FastifyRequest, reply: FastifyReply) {
  const socket = request.raw.socket as import('node:tls').TLSSocket;

  // 1. TLS aceitou? Se rejectUnauthorized=false, pode ter passado cert inválido
  if (!socket.authorized) {
    const reason = socket.authorizationError?.toString() ?? 'unknown';
    return certError(reply, 'CERT_INVALID_SIGNATURE', `mTLS handshake rejected: ${reason}`);
  }

  // 2. Pega cert do peer
  const peerCert = socket.getPeerCertificate(false);
  if (!peerCert || Object.keys(peerCert).length === 0) {
    return certError(reply, 'CERT_NOT_FOUND', 'No client certificate presented');
  }

  // Serial vem como hex uppercase. Nosso DB guarda lowercase (do node-forge).
  const serialNumber = peerCert.serialNumber.toLowerCase();

  // 3. Lookup no DB
  const certRow = await prisma.certificate.findUnique({
    where: { serialNumber },
    select: {
      id: true,
      deviceId: true,
      serialNumber: true,
      expiresAt: true,
      revokedAt: true,
      supersededAt: true,
      status: true,
    },
  });

  if (!certRow) {
    return certError(reply, 'CERT_NOT_FOUND', `Certificate with serial ${serialNumber} not registered`);
  }

  // 4. Status checks (ordem importa: revoked > expired > superseded)
  if (certRow.revokedAt) {
    return certError(reply, 'CERT_REVOKED', `Certificate revoked at ${certRow.revokedAt.toISOString()}`);
  }
  if (certRow.expiresAt.getTime() < Date.now()) {
    return certError(reply, 'CERT_EXPIRED', `Certificate expired at ${certRow.expiresAt.toISOString()}`);
  }
  if (certRow.supersededAt) {
    return certError(reply, 'CERT_REVOKED', `Certificate superseded by renewal at ${certRow.supersededAt.toISOString()}`);
  }
  if (certRow.status !== CERT_STATUS.ACTIVE) {
    return certError(reply, 'CERT_REVOKED', `Certificate status: ${certRow.status}`);
  }

  // 5. Anexa contexto pra rotas downstream usarem
  request.deviceCert = {
    deviceId: certRow.deviceId,
    certificateId: certRow.id,
    serialNumber: certRow.serialNumber,
    expiresAt: certRow.expiresAt,
  };
}

/**
 * Plugin de auto-registro do hook (uso opcional).
 * Quando registrado dentro de um escopo Fastify, aplica requireMtls a todas as rotas
 * registradas DEPOIS dele nesse escopo.
 */
export const mtlsScope: FastifyPluginAsync = fp(async (app) => {
  app.addHook('preHandler', requireMtls);
});
