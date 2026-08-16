import { hash as bcryptHash } from 'bcrypt';
import {
  isValidLoginEmail,
  isValidLoginPassword,
  normalizeLoginEmail,
} from '../src/shared/identity/login-credentials';

type SeedEnvironment = Record<string, string | undefined>;

type SeedPrisma = {
  user: {
    findUnique: (args: { where: { email: string } }) => Promise<unknown>;
    create: (args: {
      data: { email: string; passwordHash: string; role: 'ADMIN' };
    }) => Promise<unknown>;
  };
};

type PasswordHasher = (password: string) => Promise<string>;

function requiredEnv(
  env: SeedEnvironment,
  name: 'ADMIN_EMAIL' | 'ADMIN_PASSWORD',
): string {
  const value = env[name];

  if (!value?.trim()) {
    throw new Error(`${name} must be set to seed the administrator`);
  }

  return value;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export async function seedAdmin(
  prisma: SeedPrisma,
  env: SeedEnvironment,
  hash: PasswordHasher,
): Promise<void> {
  const email = normalizeLoginEmail(requiredEnv(env, 'ADMIN_EMAIL'));
  const password = requiredEnv(env, 'ADMIN_PASSWORD');

  if (!isValidLoginEmail(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address');
  }

  if (!isValidLoginPassword(password)) {
    throw new Error(
      'ADMIN_PASSWORD must be 8 to 72 characters and at most 72 UTF-8 bytes',
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    return;
  }

  const passwordHash = await hash(password);

  try {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'ADMIN',
      },
    });
  } catch (error: unknown) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }
  }
}

async function runSeed(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to seed the administrator');
  }

  const [{ PrismaPg }, { PrismaClient }] = await Promise.all([
    import('@prisma/adapter-pg'),
    import('../generated/prisma/client.js'),
  ]);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    await seedAdmin(prisma, process.env, (password) =>
      bcryptHash(password, 12),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runSeed().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
