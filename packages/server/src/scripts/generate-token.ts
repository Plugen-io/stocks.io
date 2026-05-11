/**
 * Gera um enrollment token e imprime no stdout.
 *
 * Uso:
 *   npx tsx src/scripts/generate-token.ts [validityDays=7]
 *
 * Útil pra dev/POC enquanto o painel admin não existe. Em produção, esse fluxo
 * deve estar atrás de auth de admin (não via CLI).
 */
import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';

const validityDays = Number(process.argv[2] ?? 7);

async function main() {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + validityDays * 86_400_000);
  await prisma.enrollmentToken.create({
    data: { token, expiresAt },
  });
  console.log('Enrollment token gerado:');
  console.log('');
  console.log(`  ${token}`);
  console.log('');
  console.log(`Validade: ${validityDays} dias (expira em ${expiresAt.toISOString()})`);
  console.log('Uso (cliente):');
  console.log(`  POST https://${process.env.SERVER_HOSTNAME ?? 'localhost'}/enroll`);
  console.log(`  body: { enrollmentToken: "${token}", identity: {...}, csrPem: "..." }`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
