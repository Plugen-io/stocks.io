import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { badRequest, unauthorized, conflict, internal } from '../lib/errors.js';
import { loadCAFromDisk } from '../tls/ca-loader.js';
import { signClientCSR, parseCSR } from '@stocks.io/shared/cert-utils';
import { CERT_STATUS, type EnrollResponse } from '@stocks.io/shared';

const enrollSchema = z.object({
  enrollmentToken: z.string().min(8),
  identity: z.object({
    uuid: z.string().uuid(),
    cpuFingerprint: z.string().min(8),
    enrolledAt: z.string(),
  }),
  csrPem: z.string().includes('BEGIN CERTIFICATE REQUEST'),
  deviceLabel: z.string().max(80).optional(),
});

export const enrollRoutes: FastifyPluginAsync = async (app) => {
  app.post('/enroll', async (request, reply) => {
    const parsed = enrollSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'invalid enroll payload', parsed.error.flatten());
    }
    const { enrollmentToken, identity, csrPem, deviceLabel } = parsed.data;

    // 1. Token check (use + consume atomically)
    const token = await prisma.enrollmentToken.findUnique({
      where: { token: enrollmentToken },
    });
    if (!token) return unauthorized(reply, 'enrollment token not found');
    if (token.used) return unauthorized(reply, 'enrollment token already used');
    if (token.expiresAt.getTime() < Date.now()) return unauthorized(reply, 'enrollment token expired');

    // 2. CSR validity
    let csr;
    try {
      csr = parseCSR(csrPem);
    } catch (err) {
      return badRequest(reply, 'invalid CSR', String(err));
    }

    // 3. CN do CSR deve bater com UUID
    const csrCN = csr.subject.getField('CN')?.value;
    if (csrCN !== identity.uuid) {
      return badRequest(reply, `CSR CN must equal device UUID. got: ${csrCN}, expected: ${identity.uuid}`);
    }

    // 4. Ainda não pode ter device com esse UUID
    const existingDevice = await prisma.device.findUnique({ where: { id: identity.uuid } });
    if (existingDevice) return conflict(reply, 'device already enrolled');

    // 5. Assina CSR com a CA ativa
    const ca = loadCAFromDisk(config.activeCaVersion);
    if (!ca) return internal(reply, `active CA v${config.activeCaVersion} not loaded`);

    const issued = signClientCSR({
      ca,
      csrPem,
      validityMinutes: config.certValidity.testMinutes, // POC: validade curta pra testar expiração rápido
    });

    // 6. Persiste device + cert + marca token usado (transação)
    try {
      await prisma.$transaction(async (tx) => {
        await tx.device.create({
          data: {
            id: identity.uuid,
            cpuFingerprint: identity.cpuFingerprint,
            label: deviceLabel,
            enrolledAt: new Date(identity.enrolledAt),
          },
        });
        await tx.certificate.create({
          data: {
            deviceId: identity.uuid,
            serialNumber: issued.serialNumber,
            version: 1,
            pemCert: issued.certPem,
            csrPem,
            caVersion: config.activeCaVersion,
            issuedAt: issued.notBefore,
            expiresAt: issued.notAfter,
            status: CERT_STATUS.ACTIVE,
          },
        });
        await tx.enrollmentToken.update({
          where: { token: enrollmentToken },
          data: { used: true, usedAt: new Date(), usedByDeviceId: identity.uuid },
        });
      });
    } catch (err) {
      app.log.error({ err }, 'enroll persistence failed');
      return internal(reply, 'failed to persist enrollment');
    }

    // 7. Resposta
    const caChainPem = ca.certPem;
    const body: EnrollResponse = {
      deviceId: identity.uuid,
      certPem: issued.certPem,
      caChainPem,
      serialNumber: issued.serialNumber,
      expiresAt: issued.notAfter.toISOString(),
    };
    return reply.code(201).send(body);
  });
};
