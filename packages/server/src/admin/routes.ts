import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyView from '@fastify/view';
import fastifyStatic from '@fastify/static';
import fastifyFormbody from '@fastify/formbody';
import ejs from 'ejs';
import { prisma } from '../db/prisma.js';
import {
  requireAdmin,
  verifyAdminPassword,
  setAdminCookie,
  clearAdminCookie,
} from './auth.js';
import { CERT_STATUS } from '@stocks.io/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // Body parser pra formulários HTML (application/x-www-form-urlencoded)
  await app.register(fastifyFormbody);

  // View engine (EJS)
  await app.register(fastifyView, {
    engine: { ejs },
    root: path.join(__dirname, 'views'),
    viewExt: 'ejs',
  });

  // Static assets pro admin (Chart.js, CSS)
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/admin/static/',
    decorateReply: false,
  });

  // ============================================================
  // Login (público)
  // ============================================================
  app.get('/admin/login', async (_req, reply) => {
    return reply.view('login', { error: null });
  });

  app.post<{ Body: { email?: string; password?: string } }>('/admin/login', async (request, reply) => {
    const { email, password } = request.body ?? {};
    if (!email || !password) {
      return reply.view('login', { error: 'email e senha obrigatórios' });
    }
    const admin = await verifyAdminPassword(email, password);
    if (!admin) {
      return reply.view('login', { error: 'credenciais inválidas' });
    }
    const token = app.jwt.sign({ sub: admin.id, email: admin.email }, { expiresIn: '8h' });
    setAdminCookie(reply, token);
    return reply.redirect('/admin');
  });

  app.post('/admin/logout', async (_req, reply) => {
    clearAdminCookie(reply);
    return reply.redirect('/admin/login');
  });

  // ============================================================
  // Dashboard (auth required)
  // ============================================================
  app.get('/admin', { preHandler: requireAdmin }, async (request, reply) => {
    const [deviceCount, certActive, certRevoked, certExpired, inflowSum] = await Promise.all([
      prisma.device.count(),
      prisma.certificate.count({ where: { status: CERT_STATUS.ACTIVE } }),
      prisma.certificate.count({ where: { status: CERT_STATUS.REVOKED } }),
      prisma.certificate.count({ where: { status: CERT_STATUS.EXPIRED } }),
      prisma.inflow.aggregate({ where: { success: true }, _sum: { amountBRL: true } }),
    ]);

    const devices = await prisma.device.findMany({
      orderBy: { enrolledAt: 'desc' },
      include: {
        certificates: {
          orderBy: { version: 'desc' },
          take: 1,
        },
        _count: { select: { heartbeats: true, inflows: true } },
      },
    });

    const recentInflows = await prisma.inflow.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { device: { select: { label: true } } },
    });

    return reply.view('dashboard', {
      adminEmail: request.adminEmail,
      stats: {
        devices: deviceCount,
        certActive,
        certRevoked,
        certExpired,
        inflowTotal: Number(inflowSum._sum.amountBRL ?? 0),
      },
      devices,
      recentInflows,
    });
  });

  // ============================================================
  // API JSON (auth required) — pra a UI fazer ações + buscar dados de chart
  // ============================================================

  // Heartbeat chart data (últimas 24h, agrupado por minuto)
  app.get('/admin/api/heartbeats', { preHandler: requireAdmin }, async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const heartbeats = await prisma.heartbeat.findMany({
      where: { ts: { gte: since } },
      select: { ts: true, deviceId: true, latencyMs: true },
      orderBy: { ts: 'asc' },
    });
    return { heartbeats };
  });

  // Listagem de certs por device
  app.get<{ Params: { deviceId: string } }>(
    '/admin/api/devices/:deviceId/certs',
    { preHandler: requireAdmin },
    async (request) => {
      const certs = await prisma.certificate.findMany({
        where: { deviceId: request.params.deviceId },
        orderBy: { version: 'desc' },
      });
      return { certs };
    },
  );

  // Gerar enrollment token
  app.post<{ Body: { validityDays?: number } }>(
    '/admin/api/tokens',
    { preHandler: requireAdmin },
    async (request) => {
      const validityDays = request.body?.validityDays ?? 7;
      const token = crypto.randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + validityDays * 86_400_000);
      const created = await prisma.enrollmentToken.create({
        data: { token, expiresAt, createdByAdminId: request.adminId },
      });
      return { token: created.token, expiresAt: created.expiresAt };
    },
  );

  // Revogar cert
  app.post<{ Params: { certId: string }; Body: { reason?: string } }>(
    '/admin/api/certs/:certId/revoke',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const cert = await prisma.certificate.findUnique({ where: { id: request.params.certId } });
      if (!cert) return reply.code(404).send({ error: 'cert not found' });
      if (cert.status === CERT_STATUS.REVOKED) return reply.code(409).send({ error: 'already revoked' });

      const updated = await prisma.certificate.update({
        where: { id: cert.id },
        data: {
          status: CERT_STATUS.REVOKED,
          revokedAt: new Date(),
          revokedReason: request.body?.reason ?? 'revoked via admin panel',
        },
      });
      return { ok: true, cert: updated };
    },
  );

  // Desrevogar cert (se ainda dentro da validade)
  app.post<{ Params: { certId: string } }>(
    '/admin/api/certs/:certId/unrevoke',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const cert = await prisma.certificate.findUnique({ where: { id: request.params.certId } });
      if (!cert) return reply.code(404).send({ error: 'cert not found' });
      if (cert.status !== CERT_STATUS.REVOKED) return reply.code(409).send({ error: 'not revoked' });
      if (cert.expiresAt.getTime() < Date.now()) {
        return reply.code(409).send({ error: 'cert expired — cannot unrevoke' });
      }
      const updated = await prisma.certificate.update({
        where: { id: cert.id },
        data: { status: CERT_STATUS.ACTIVE, revokedAt: null, revokedReason: null },
      });
      return { ok: true, cert: updated };
    },
  );

  // Force-renew: marca cert atual como superseded; device terá que renovar pra continuar
  app.post<{ Params: { deviceId: string } }>(
    '/admin/api/devices/:deviceId/force-renew',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const active = await prisma.certificate.findFirst({
        where: { deviceId: request.params.deviceId, status: CERT_STATUS.ACTIVE },
      });
      if (!active) return reply.code(404).send({ error: 'no active cert for device' });
      await prisma.certificate.update({
        where: { id: active.id },
        data: { status: CERT_STATUS.SUPERSEDED, supersededAt: new Date() },
      });
      return { ok: true, supersededCertId: active.id };
    },
  );
};
