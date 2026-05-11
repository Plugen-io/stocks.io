import type { FastifyReply } from 'fastify';
import type { CertErrorReason } from '@stocks.io/shared';

export function certError(reply: FastifyReply, reason: CertErrorReason, message: string, statusCode = 401) {
  return reply.code(statusCode).send({ reason, message });
}

export function badRequest(reply: FastifyReply, message: string, details?: unknown) {
  return reply.code(400).send({ error: 'bad_request', message, details });
}

export function notFound(reply: FastifyReply, message: string) {
  return reply.code(404).send({ error: 'not_found', message });
}

export function unauthorized(reply: FastifyReply, message: string) {
  return reply.code(401).send({ error: 'unauthorized', message });
}

export function conflict(reply: FastifyReply, message: string) {
  return reply.code(409).send({ error: 'conflict', message });
}

export function internal(reply: FastifyReply, message: string) {
  return reply.code(500).send({ error: 'internal', message });
}
