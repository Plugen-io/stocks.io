import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { badRequest, internal } from '../lib/errors.js';
import { requireMtls } from '../tls/cert-validation.js';
import type { InflowResponse } from '@stocks.io/shared';

const inflowSchema = z.object({
  amountBRL: z.number().positive().max(1_000_000),
  idempotencyKey: z.string().min(8).max(64),
});

export const inflowRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireMtls);

  app.post('/inflow', async (request, reply) => {
    const deviceCert = request.deviceCert!;

    const parsed = inflowSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, 'invalid inflow payload', parsed.error.flatten());
    const { amountBRL, idempotencyKey } = parsed.data;

    // Mock de "gateway de pagamento" — sempre sucesso na POC.
    try {
      const inflow = await prisma.inflow.create({
        data: {
          deviceId: deviceCert.deviceId,
          certificateId: deviceCert.certificateId,
          amountBRL: new Prisma.Decimal(amountBRL),
          idempotencyKey,
          success: true,
        },
      });

      // Soma total de inflows desse device pra simular "saldo"
      const sum = await prisma.inflow.aggregate({
        where: { deviceId: deviceCert.deviceId, success: true },
        _sum: { amountBRL: true },
      });
      const newBalance = Number(sum._sum.amountBRL ?? 0);

      const body: InflowResponse = {
        success: true,
        inflowId: inflow.id,
        newBalance,
      };
      return reply.code(201).send(body);
    } catch (err) {
      // Duplicate idempotencyKey
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await prisma.inflow.findUnique({ where: { idempotencyKey } });
        if (existing && existing.deviceId === deviceCert.deviceId) {
          const sum = await prisma.inflow.aggregate({
            where: { deviceId: deviceCert.deviceId, success: true },
            _sum: { amountBRL: true },
          });
          const body: InflowResponse = {
            success: existing.success,
            inflowId: existing.id,
            newBalance: Number(sum._sum.amountBRL ?? 0),
          };
          return reply.code(200).send(body);
        }
        return badRequest(reply, 'idempotencyKey already used by another device');
      }
      app.log.error({ err }, 'inflow failed');
      return internal(reply, 'inflow processing failed');
    }
  });
};
