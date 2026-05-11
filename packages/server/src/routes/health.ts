import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({
    ok: true,
    hostname: config.hostname,
    activeCaVersion: config.activeCaVersion,
    serverTime: new Date().toISOString(),
  }));
};
