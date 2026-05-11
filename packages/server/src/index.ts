import Fastify from 'fastify';
import { config } from './config.js';
import { disconnectPrisma } from './db/prisma.js';
import { loadServerTLS } from './tls/server-tls.js';
import { seedAdminUser } from './lib/admin-seed.js';
import { healthRoutes } from './routes/health.js';
import { enrollRoutes } from './routes/enroll.js';
import { renewRoutes } from './routes/renew.js';
import { inflowRoutes } from './routes/inflow.js';
import { heartbeatRoutes } from './routes/heartbeat.js';
import { adminAuthPlugins } from './admin/auth.js';
import { adminRoutes } from './admin/routes.js';

async function main() {
  // 1. Carrega CA + cert do servidor
  const tls = loadServerTLS();

  // 2. Bootstrap admin user (idempotente)
  const adminSeed = await seedAdminUser();
  if (adminSeed.created) {
    console.log(`Admin user criado: ${adminSeed.email}`);
  }

  // 3. Fastify com HTTPS + mTLS
  //    requestCert: true        → solicita cert do client no handshake
  //    rejectUnauthorized: false → NÃO rejeita conexão se cert inválido/ausente
  //    Por que false? Algumas rotas (/health, /enroll) são públicas. O middleware
  //    requireMtls decide por rota se exige cert válido ou não.
  const app = Fastify({
    https: {
      ca: tls.ca,
      cert: tls.cert,
      key: tls.key,
      requestCert: true,
      rejectUnauthorized: false,
    },
    logger: {
      level: config.isDev ? 'debug' : 'info',
      transport: config.isDev
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
    },
    bodyLimit: 1024 * 1024,
  });

  // 4. Hook debug: status do peer cert por request
  app.addHook('onRequest', async (request) => {
    const socket = request.raw.socket as import('node:tls').TLSSocket;
    request.log.debug({
      url: request.url,
      method: request.method,
      tls: {
        authorized: socket.authorized,
        peerCertCN: socket.getPeerCertificate(false)?.subject?.CN,
      },
    }, 'incoming');
  });

  // 5. Rotas mTLS / API
  await app.register(healthRoutes);
  await app.register(enrollRoutes);
  await app.register(renewRoutes);
  await app.register(inflowRoutes);
  await app.register(heartbeatRoutes);

  // 6. Admin panel (JWT + cookies + EJS) — rotas /admin/*
  await app.register(adminAuthPlugins);
  await app.register(adminRoutes);

  // 6. Listen
  try {
    await app.listen({ host: config.host, port: config.port });
    console.log(`stocks.io server listening on https://${config.hostname}:${config.port}`);
  } catch (err) {
    app.log.error({ err }, 'failed to start');
    await disconnectPrisma();
    process.exit(1);
  }

  // 7. Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`${signal} received — draining...`);
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (err) => {
  console.error('fatal:', err);
  await disconnectPrisma();
  process.exit(1);
});
