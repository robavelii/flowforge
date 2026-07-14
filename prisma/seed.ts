import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await argon2.hash('Password123!@#', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const user = await prisma.user.upsert({
    where: { email: 'admin@flowforge.dev' },
    update: {},
    create: {
      email: 'admin@flowforge.dev',
      name: 'FlowForge Admin',
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme',
      ownerUserId: user.id,
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: 'default',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Default Workspace',
      slug: 'default',
      description: 'Seed workspace for local development',
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'owner',
    },
  });

  await prisma.systemMetadata.upsert({
    where: { key: 'seed.version' },
    update: { value: 'm1' },
    create: { key: 'seed.version', value: 'm1' },
  });

  console.log('Seed complete:');
  console.log(`  user: ${user.email} / Password123!@#`);
  console.log(`  org: ${org.slug} (${org.id})`);
  console.log(`  workspace: ${workspace.slug} (${workspace.id})`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
