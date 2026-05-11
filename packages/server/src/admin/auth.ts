import type { FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import bcrypt from 'bcrypt';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminId?: string;
    adminEmail?: string;
  }
}

const COOKIE_NAME = 'stocksio_admin';

/**
 * Wrap com fastify-plugin pra que as decorações (cookie/jwt) vazem pro escopo pai
 * e fiquem disponíveis em todas as rotas registradas DEPOIS deste plugin
 * (incluindo adminRoutes que usa app.jwt.sign).
 */
export const adminAuthPlugins = fp(async (app) => {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.jwt.secret,
    cookie: { cookieName: COOKIE_NAME, signed: false },
  });
});

/**
 * preHandler para rotas /admin/* (exceto login/logout/static).
 * Valida JWT do cookie, anexa adminId/adminEmail à request, ou redireciona pro login.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<{ sub: string; email: string }>();
    request.adminId = decoded.sub;
    request.adminEmail = decoded.email;
  } catch {
    // Pra rotas HTML, redireciona. Pra /admin/api/*, devolve 401 JSON.
    if (request.url.startsWith('/admin/api/')) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    return reply.redirect('/admin/login');
  }
}

export async function verifyAdminPassword(email: string, password: string): Promise<{ id: string; email: string } | null> {
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? { id: user.id, email: user.email } : null;
}

export function setAdminCookie(reply: FastifyReply, token: string) {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: !config.isDev,
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60, // 8h
  });
}

export function clearAdminCookie(reply: FastifyReply) {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}
