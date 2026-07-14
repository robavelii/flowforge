/**
 * Permission catalog and system role grants for Milestone 2.
 * Source of truth: docs/security/PERMISSION-MATRIX.md
 */

export type PermissionDef = {
  key: string;
  description: string;
};

export type SystemRoleSlug =
  | 'owner'
  | 'admin'
  | 'editor'
  | 'operator'
  | 'viewer'
  | 'billing';

export const ALL_PERMISSIONS: PermissionDef[] = [
  // Organization
  { key: 'organization:read', description: 'View organization details' },
  { key: 'organization:write', description: 'Update organization settings' },
  { key: 'organization:delete', description: 'Delete organization' },
  {
    key: 'organization:manage',
    description: 'Manage org-level billing and ownership transfer',
  },

  // Workspace
  { key: 'workspace:read', description: 'View workspace settings' },
  { key: 'workspace:write', description: 'Update workspace settings' },
  { key: 'workspace:delete', description: 'Delete workspace' },
  { key: 'workspace:manage', description: 'Manage quotas, feature flags' },

  // Members & Invitations
  { key: 'member:read', description: 'List workspace members' },
  { key: 'member:invite', description: 'Send invitations' },
  { key: 'member:write', description: 'Change member roles' },
  { key: 'member:delete', description: 'Remove members' },

  // Roles
  { key: 'role:read', description: 'List roles and permissions' },
  { key: 'role:create', description: 'Create custom roles' },
  { key: 'role:write', description: 'Modify custom role permissions' },
  { key: 'role:delete', description: 'Delete custom roles' },

  // Workflows
  { key: 'workflow:read', description: 'View workflows and versions' },
  { key: 'workflow:create', description: 'Create new workflows' },
  { key: 'workflow:write', description: 'Edit draft workflows' },
  { key: 'workflow:delete', description: 'Delete workflows' },
  { key: 'workflow:publish', description: 'Publish/unpublish workflows' },
  { key: 'workflow:execute', description: 'Trigger manual/test executions' },

  // Executions
  { key: 'execution:read', description: 'View execution history and logs' },
  { key: 'execution:cancel', description: 'Cancel running executions' },
  { key: 'execution:replay', description: 'Replay failed executions' },

  // Webhooks
  {
    key: 'webhook:read',
    description: 'View webhook endpoints and deliveries',
  },
  { key: 'webhook:write', description: 'Create/update webhook endpoints' },
  { key: 'webhook:delete', description: 'Delete webhook endpoints' },
  { key: 'webhook:manage', description: 'Manage outbound subscriptions' },

  // Secrets
  { key: 'secret:read', description: 'List secret names (not values)' },
  { key: 'secret:write', description: 'Create/update secrets' },
  { key: 'secret:delete', description: 'Delete secrets' },

  // Integrations
  { key: 'integration:read', description: 'View connected integrations' },
  {
    key: 'integration:write',
    description: 'Connect/disconnect integrations',
  },

  // API Keys
  { key: 'api_key:read', description: 'List API keys' },
  { key: 'api_key:create', description: 'Create API keys' },
  { key: 'api_key:delete', description: 'Revoke API keys' },

  // Files
  { key: 'file:read', description: 'List and download files' },
  { key: 'file:write', description: 'Upload files' },
  { key: 'file:delete', description: 'Delete files' },

  // Audit & Activity
  { key: 'audit:read', description: 'Query audit logs' },
  { key: 'timeline:read', description: 'View activity timeline' },

  // Billing (M8)
  { key: 'billing:read', description: 'View usage and invoices' },
  { key: 'billing:manage', description: 'Change plan, payment methods' },

  // System (platform; not assignable to customers)
  { key: 'system:admin', description: 'Access admin API endpoints' },
  {
    key: 'system:impersonate',
    description: 'Impersonate user (support, audited)',
  },
  { key: 'system:dlq', description: 'Manage dead letter queues' },
  { key: 'system:metrics', description: 'Access internal metrics' },
  { key: 'system:outbox', description: 'Replay outbox events' },
];

const ownerPermissions = ALL_PERMISSIONS.filter(
  (p) => !p.key.startsWith('system:'),
).map((p) => p.key);

export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleSlug, string[]> = {
  owner: ownerPermissions,

  admin: [
    'organization:read',
    'workspace:read',
    'workspace:write',
    'workspace:manage',
    'member:read',
    'member:invite',
    'member:write',
    'member:delete',
    'role:read',
    'role:create',
    'role:write',
    'role:delete',
    'workflow:read',
    'workflow:create',
    'workflow:write',
    'workflow:delete',
    'workflow:publish',
    'workflow:execute',
    'execution:read',
    'execution:cancel',
    'execution:replay',
    'webhook:read',
    'webhook:write',
    'webhook:delete',
    'webhook:manage',
    'secret:read',
    'secret:write',
    'secret:delete',
    'integration:read',
    'integration:write',
    'file:read',
    'file:write',
    'file:delete',
    'api_key:read',
    'api_key:create',
    'api_key:delete',
    'audit:read',
    'timeline:read',
    'billing:read',
  ],

  editor: [
    'organization:read',
    'workspace:read',
    'member:read',
    'role:read',
    'workflow:read',
    'workflow:create',
    'workflow:write',
    // workflow:delete is ◐ creator-only via ABAC (not granted in RBAC for editor)
    'workflow:publish',
    'workflow:execute',
    'execution:read',
    'execution:cancel',
    'execution:replay',
    'webhook:read',
    'webhook:write',
    'webhook:delete',
    'secret:read',
    'secret:write',
    'integration:read',
    'integration:write',
    'file:read',
    'file:write',
    'timeline:read',
  ],

  operator: [
    'organization:read',
    'workspace:read',
    'member:read',
    'workflow:read',
    'workflow:execute',
    'execution:read',
    'execution:cancel',
    'execution:replay',
    'webhook:read',
    'integration:read',
    'file:read',
    'timeline:read',
  ],

  viewer: [
    'organization:read',
    'workspace:read',
    'member:read',
    'workflow:read',
    'execution:read',
    'webhook:read',
    'file:read',
    'timeline:read',
  ],

  billing: [
    'organization:read',
    'workspace:read',
    'billing:read',
    'billing:manage',
  ],
};
