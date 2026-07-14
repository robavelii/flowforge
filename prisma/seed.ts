import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  type SystemRoleSlug,
} from './permissions.catalog';

const prisma = new PrismaClient();

const SYSTEM_ROLE_META: Record<SystemRoleSlug, { name: string; description: string }> = {
  owner: { name: 'Owner', description: 'Full workspace control' },
  admin: { name: 'Admin', description: 'Manage members, settings, and resources' },
  editor: { name: 'Editor', description: 'Create and edit workflows' },
  operator: { name: 'Operator', description: 'Execute workflows and view results' },
  viewer: { name: 'Viewer', description: 'Read-only access' },
  billing: { name: 'Billing', description: 'Billing and usage access' },
};

async function seedPermissionsAndRoles(): Promise<Map<string, string>> {
  const permissionIds = new Map<string, string>();

  for (const perm of ALL_PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: { key: perm.key, description: perm.description },
    });
    permissionIds.set(perm.key, row.id);
  }

  for (const slug of Object.keys(SYSTEM_ROLE_PERMISSIONS) as SystemRoleSlug[]) {
    const meta = SYSTEM_ROLE_META[slug];
    const existing = await prisma.role.findFirst({
      where: { slug, isSystem: true, workspaceId: null },
    });

    const role =
      existing ??
      (await prisma.role.create({
        data: {
          slug,
          name: meta.name,
          description: meta.description,
          isSystem: true,
          workspaceId: null,
        },
      }));

    const keys = SYSTEM_ROLE_PERMISSIONS[slug];
    for (const key of keys) {
      const permissionId = permissionIds.get(key);
      if (!permissionId) {
        continue;
      }
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  return permissionIds;
}

async function main(): Promise<void> {
  await seedPermissionsAndRoles();

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

  const ownerRole = await prisma.role.findFirst({
    where: { slug: 'owner', isSystem: true, workspaceId: null },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {
      role: 'owner',
      roleId: ownerRole?.id,
    },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'owner',
      roleId: ownerRole?.id,
    },
  });

  await prisma.systemMetadata.upsert({
    where: { key: 'seed.version' },
    update: { value: 'm2' },
    create: { key: 'seed.version', value: 'm2' },
  });

  console.log('Seed complete:');
  console.log(`  user: ${user.email} / Password123!@#`);
  console.log(`  org: ${org.slug} (${org.id})`);
  console.log(`  workspace: ${workspace.slug} (${workspace.id})`);
  console.log(`  permissions: ${ALL_PERMISSIONS.length}`);
  console.log(`  system roles: ${Object.keys(SYSTEM_ROLE_PERMISSIONS).join(', ')}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
