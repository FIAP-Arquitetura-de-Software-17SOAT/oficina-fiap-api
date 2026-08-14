import { hash as bcryptHash } from 'bcrypt';

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

function requiredEnv(env: SeedEnvironment, name: 'ADMIN_EMAIL' | 'ADMIN_PASSWORD'): string {
  const value = env[name];

  if (!value?.trim()) {
    throw new Error(`${name} must be set to seed the administrator`);
  }

  return value;
}

export async function seedAdmin(
  prisma: SeedPrisma,
  env: SeedEnvironment,
  hash: PasswordHasher,
): Promise<void> {
  const email = requiredEnv(env, 'ADMIN_EMAIL').trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    return;
  }

  const passwordHash = await hash(requiredEnv(env, 'ADMIN_PASSWORD'));

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
    },
  });
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
    await seedAdmin(prisma, process.env, (password) => bcryptHash(password, 12));
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
