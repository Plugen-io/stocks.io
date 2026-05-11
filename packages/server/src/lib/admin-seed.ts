import bcrypt from 'bcrypt';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';

/**
 * Cria o admin user inicial se não existir.
 * Roda automaticamente no boot do server.
 */
export async function seedAdminUser(): Promise<{ created: boolean; email: string }> {
  const existing = await prisma.adminUser.findUnique({
    where: { email: config.admin.email },
  });
  if (existing) {
    return { created: false, email: existing.email };
  }
  const passwordHash = await bcrypt.hash(config.admin.initialPassword, 10);
  const user = await prisma.adminUser.create({
    data: {
      email: config.admin.email,
      passwordHash,
    },
  });
  return { created: true, email: user.email };
}
