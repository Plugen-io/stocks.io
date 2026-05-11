import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['info', 'warn', 'error'],
});

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
