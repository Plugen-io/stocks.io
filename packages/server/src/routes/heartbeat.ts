import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { badRequest, internal } from '../lib/errors.js';
import { requireMtls } from '../tls/cert-validation.js';
import type { HeartbeatResponse } from '@stocks.io/shared';

const heartbeatSchema = z.object({
  certSerialNumber: z.string().min(4),
  uptimeSec: z.number().int().nonnegative(),
  agentVersion: z.string().max(40),
});

export const heartbeatRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireMtls);

  app.post('/heartbeat', async (request, reply) => {
    const deviceCert = request.deviceCert!;
    const start = Date.now();

    const parsed = heartbeatSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, 'invalid heartbeat payload', parsed.error.flatten());
    const { certSerialNumber, uptimeSec, agentVersion } = parsed.data;

    if (certSerialNumber !== deviceCert.serialNumber) {
      return badRequest(reply, 'certSerialNumber does not match mTLS cert');
    }

    const ip = (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? request.ip;

    try {
      await prisma.$transaction([
        prisma.heartbeat.create({
          data: {
            deviceId: deviceCert.deviceId,
            certificateId: deviceCert.certificateId,
            uptimeSec,
            agentVersion,
            ip,
            latencyMs: Date.now() - start,
          },
        }),
        prisma.device.update({
          where: { id: deviceCert.deviceId },
          data: { lastSeenAt: new Date() },
        }),
      ]);
    } catch (err) {
      app.log.error({ err }, 'heartbeat persist failed');
      return internal(reply, 'heartbeat persistence failed');
    }

    const body: HeartbeatResponse = {
      ok: true,
      serverTime: new Date().toISOString(),
    };
    return reply.code(200).send(body);
  });
};
