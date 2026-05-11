import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import forge from 'node-forge';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { badRequest, internal, unauthorized } from '../lib/errors.js';
import { loadCAFromDisk } from '../tls/ca-loader.js';
import { requireMtls } from '../tls/cert-validation.js';
import { signClientCSR, parseCSR } from '@stocks.io/shared/cert-utils';
import { CERT_STATUS, type RenewResponse } from '@stocks.io/shared';

const renewSchema = z.object({
  csrPem: z.string().includes('BEGIN CERTIFICATE REQUEST'),
});

export const renewRoutes: FastifyPluginAsync = async (app) => {
  // Toda rota desse plugin requer mTLS válido
  app.addHook('preHandler', requireMtls);

  app.post('/renew', async (request, reply) => {
    const deviceCert = request.deviceCert!; // garantido pelo requireMtls

    const parsed = renewSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, 'invalid renew payload', parsed.error.flatten());
    const { csrPem } = parsed.data;

    // 1. Validar CSR
    let csr;
    try {
      csr = parseCSR(csrPem);
    } catch (err) {
      return badRequest(reply, 'invalid CSR', String(err));
    }

    // 2. CSR CN deve ser o deviceId (mesmo do cert atual)
    const csrCN = csr.subject.getField('CN')?.value;
    if (csrCN !== deviceCert.deviceId) {
      return badRequest(reply, `CSR CN must equal device UUID ${deviceCert.deviceId}, got ${csrCN}`);
    }

    // 3. ESTRATEGIA A1: chave privada NÃO muda na renovação.
    // Verifica que a public key do CSR é a MESMA do cert atual.
    // Isso é o que diferencia A1 de A2 (full rotation).
    const currentCert = await prisma.certificate.findUnique({
      where: { id: deviceCert.certificateId },
      select: { pemCert: true, version: true },
    });
    if (!currentCert) return internal(reply, 'current cert vanished from DB');

    const currentForgeCert = forge.pki.certificateFromPem(currentCert.pemCert);
    const currentPubKeyPem = forge.pki.publicKeyToPem(currentForgeCert.publicKey);
    const csrPubKeyPem = forge.pki.publicKeyToPem(csr.publicKey as forge.pki.PublicKey);
    if (currentPubKeyPem.trim() !== csrPubKeyPem.trim()) {
      return unauthorized(reply, 'CSR public key differs from current cert (A1 strategy: same key required for renewal)');
    }

    // 4. Assina CSR com a CA ativa
    const ca = loadCAFromDisk(config.activeCaVersion);
    if (!ca) return internal(reply, `active CA v${config.activeCaVersion} not loaded`);

    const issued = signClientCSR({
      ca,
      csrPem,
      validityMinutes: config.certValidity.testMinutes, // POC
    });

    // 5. Marca cert atual como superseded + cria novo
    try {
      await prisma.$transaction(async (tx) => {
        await tx.certificate.update({
          where: { id: deviceCert.certificateId },
          data: {
            status: CERT_STATUS.SUPERSEDED,
            supersededAt: new Date(),
          },
        });
        await tx.certificate.create({
          data: {
            deviceId: deviceCert.deviceId,
            serialNumber: issued.serialNumber,
            version: currentCert.version + 1,
            pemCert: issued.certPem,
            csrPem,
            caVersion: config.activeCaVersion,
            issuedAt: issued.notBefore,
            expiresAt: issued.notAfter,
            status: CERT_STATUS.ACTIVE,
          },
        });
      });
    } catch (err) {
      app.log.error({ err }, 'renew persistence failed');
      return internal(reply, 'failed to persist renewal');
    }

    const body: RenewResponse = {
      certPem: issued.certPem,
      serialNumber: issued.serialNumber,
      expiresAt: issued.notAfter.toISOString(),
      caChainPem: ca.certPem,
    };
    return reply.code(200).send(body);
  });
};
