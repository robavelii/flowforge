# Permission Matrix — RBAC & ABAC

> **Status:** Active · **Version:** 1.0 · **Last updated:** 2026-07-14

This document defines all permissions, system roles, and attribute-based policies in FlowForge. Permissions use the format `{resource}:{action}`.

---

## Table of Contents

1. [Permission Format](#permission-format)
2. [System Roles](#system-roles)
3. [Permission Catalog](#permission-catalog)
4. [Role-Permission Matrix](#role-permission-matrix)
5. [API Key Scopes](#api-key-scopes)
6. [ABAC Policies](#abac-policies)
7. [Custom Roles](#custom-roles)
8. [System Permissions](#system-permissions)

---

## Permission Format

```
{resource}:{action}

Resources: organization, workspace, member, role, workflow, execution,
           webhook, secret, integration, file, audit, api_key, billing

Actions: read, write, create, delete, execute, manage, publish, admin
```

Wildcards supported in role definitions:

- `workflow:*` — all workflow actions
- `*:*` — full workspace admin (Owner role only)

---

## System Roles

System roles are predefined and cannot be deleted. Workspace admins can create **custom roles** as subsets.

| Role | Scope | Description |
|------|-------|-------------|
| **Owner** | Workspace | Full control including billing and deletion |
| **Admin** | Workspace | Manage members, settings, all resources |
| **Editor** | Workspace | Create/edit/publish workflows, manage secrets |
| **Operator** | Workspace | Execute workflows, view executions, no structural changes |
| **Viewer** | Workspace | Read-only access to workflows and executions |
| **Billing** | Workspace | View usage, manage billing (M8) |
| **System Admin** | Platform | Internal ops; not assignable by customers |

### Role Hierarchy

```
Owner > Admin > Editor > Operator > Viewer
```

Higher roles inherit all permissions of lower roles **except** billing-specific permissions.

---

## Permission Catalog

### Organization

| Permission | Description |
|------------|-------------|
| `organization:read` | View organization details |
| `organization:write` | Update organization settings |
| `organization:delete` | Delete organization |
| `organization:manage` | Manage org-level billing and ownership transfer |

### Workspace

| Permission | Description |
|------------|-------------|
| `workspace:read` | View workspace settings |
| `workspace:write` | Update workspace settings |
| `workspace:delete` | Delete workspace |
| `workspace:manage` | Manage quotas, feature flags |

### Members & Invitations

| Permission | Description |
|------------|-------------|
| `member:read` | List workspace members |
| `member:invite` | Send invitations |
| `member:write` | Change member roles |
| `member:delete` | Remove members |

### Roles

| Permission | Description |
|------------|-------------|
| `role:read` | List roles and permissions |
| `role:create` | Create custom roles |
| `role:write` | Modify custom role permissions |
| `role:delete` | Delete custom roles |

### Workflows

| Permission | Description |
|------------|-------------|
| `workflow:read` | View workflows and versions |
| `workflow:create` | Create new workflows |
| `workflow:write` | Edit draft workflows |
| `workflow:delete` | Delete workflows |
| `workflow:publish` | Publish/unpublish workflows |
| `workflow:execute` | Trigger manual/test executions |

### Executions

| Permission | Description |
|------------|-------------|
| `execution:read` | View execution history and logs |
| `execution:cancel` | Cancel running executions |
| `execution:replay` | Replay failed executions |

### Webhooks

| Permission | Description |
|------------|-------------|
| `webhook:read` | View webhook endpoints and deliveries |
| `webhook:write` | Create/update webhook endpoints |
| `webhook:delete` | Delete webhook endpoints |
| `webhook:manage` | Manage outbound subscriptions |

### Secrets

| Permission | Description |
|------------|-------------|
| `secret:read` | List secret names (not values) |
| `secret:write` | Create/update secrets |
| `secret:delete` | Delete secrets |

### Integrations

| Permission | Description |
|------------|-------------|
| `integration:read` | View connected integrations |
| `integration:write` | Connect/disconnect integrations |

### API Keys

| Permission | Description |
|------------|-------------|
| `api_key:read` | List API keys |
| `api_key:create` | Create API keys |
| `api_key:delete` | Revoke API keys |

### Files

| Permission | Description |
|------------|-------------|
| `file:read` | List and download files |
| `file:write` | Upload files |
| `file:delete` | Delete files |

### Audit & Activity

| Permission | Description |
|------------|-------------|
| `audit:read` | Query audit logs |
| `timeline:read` | View activity timeline |

### Billing (M8)

| Permission | Description |
|------------|-------------|
| `billing:read` | View usage and invoices |
| `billing:manage` | Change plan, payment methods |

---

## Role-Permission Matrix

✓ = granted · — = denied · ◐ = conditional (ABAC)

| Permission | Owner | Admin | Editor | Operator | Viewer | Billing |
|------------|:-----:|:-----:|:------:|:--------:|:------:|:-------:|
| `organization:read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `organization:write` | ✓ | — | — | — | — | — |
| `organization:delete` | ✓ | — | — | — | — | — |
| `organization:manage` | ✓ | — | — | — | — | — |
| `workspace:read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `workspace:write` | ✓ | ✓ | — | — | — | — |
| `workspace:delete` | ✓ | — | — | — | — | — |
| `workspace:manage` | ✓ | ✓ | — | — | — | — |
| `member:read` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `member:invite` | ✓ | ✓ | — | — | — | — |
| `member:write` | ✓ | ✓ | — | — | — | — |
| `member:delete` | ✓ | ✓ | — | — | — | — |
| `role:read` | ✓ | ✓ | ✓ | — | — | — |
| `role:create` | ✓ | ✓ | — | — | — | — |
| `role:write` | ✓ | ✓ | — | — | — | — |
| `role:delete` | ✓ | ✓ | — | — | — | — |
| `workflow:read` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `workflow:create` | ✓ | ✓ | ✓ | — | — | — |
| `workflow:write` | ✓ | ✓ | ✓ | — | — | — |
| `workflow:delete` | ✓ | ✓ | ◐ | — | — | — |
| `workflow:publish` | ✓ | ✓ | ✓ | — | — | — |
| `workflow:execute` | ✓ | ✓ | ✓ | ✓ | — | — |
| `execution:read` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `execution:cancel` | ✓ | ✓ | ✓ | ✓ | — | — |
| `execution:replay` | ✓ | ✓ | ✓ | ✓ | — | — |
| `webhook:read` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `webhook:write` | ✓ | ✓ | ✓ | — | — | — |
| `webhook:delete` | ✓ | ✓ | ✓ | — | — | — |
| `webhook:manage` | ✓ | ✓ | — | — | — | — |
| `secret:read` | ✓ | ✓ | ✓ | — | — | — |
| `secret:write` | ✓ | ✓ | ✓ | — | — | — |
| `secret:delete` | ✓ | ✓ | — | — | — | — |
| `integration:read` | ✓ | ✓ | ✓ | ✓ | — | — |
| `integration:write` | ✓ | ✓ | ✓ | — | — | — |
| `file:read` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `file:write` | ✓ | ✓ | ✓ | — | — | — |
| `file:delete` | ✓ | ✓ | — | — | — | — |
| `api_key:read` | ✓ | ✓ | — | — | — | — |
| `api_key:create` | ✓ | ✓ | — | — | — | — |
| `api_key:delete` | ✓ | ✓ | — | — | — | — |
| `audit:read` | ✓ | ✓ | — | — | — | — |
| `timeline:read` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `billing:read` | ✓ | ✓ | — | — | — | ✓ |
| `billing:manage` | ✓ | — | — | — | — | ✓ |

### Conditional Rules (◐)

| Permission | Condition |
|------------|-----------|
| `workflow:delete` | Editor can delete only workflows they created (`resource.createdBy = actorId`) |

---

## API Key Scopes

API keys are granted explicit scopes (subset of permissions). Predefined scope bundles:

| Scope Bundle | Permissions Included | Use Case |
|--------------|---------------------|----------|
| `read_only` | All `*:read` permissions | Monitoring, dashboards |
| `workflow_runner` | `workflow:read`, `workflow:execute`, `execution:read` | CI/CD triggers |
| `workflow_builder` | `workflow:*`, `secret:read`, `secret:write` | Integration development |
| `webhook_manager` | `webhook:*`, `workflow:read` | Webhook configuration |
| `full_access` | All permissions except `workspace:delete`, `organization:*` | Server-side automation |

Custom scopes: individual permissions can be selected when creating a key.

### Scope Enforcement

```typescript
@RequirePermission('workflow:execute')
@RequireScope('workflow:execute')  // Additional check for API key auth
async triggerExecution() { ... }
```

JWT user sessions use role-based permissions; API keys use scopes only (no role inheritance).

---

## ABAC Policies

Attribute-based policies augment RBAC for fine-grained control.

### Policy Structure

```typescript
interface AbacPolicy {
  id: string;
  workspaceId: string;
  name: string;
  effect: 'allow' | 'deny';
  permissions: string[];       // which permissions this policy applies to
  conditions: AbacCondition[];
}

interface AbacCondition {
  attribute: 'resource.ownerId' | 'resource.teamId' | 'actor.teamId' | 'resource.tags' | 'environment';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in';
  value: string | string[];
}
```

### Built-in ABAC Rules

| Policy | Effect | Condition | Applies To |
|--------|--------|-----------|------------|
| Owner-only delete | deny | `actor.role != Owner AND action = delete` | `workspace:delete`, `organization:delete` |
| Creator delete | allow | `resource.createdBy = actorId` | `workflow:delete` |
| Production guard | deny | `environment = production AND actor.role = Editor` | `workflow:publish` (requires Admin+) |
| Secret isolation | deny | `actor.role = Operator` | `secret:*` |
| Team scoping (future) | allow | `resource.teamId IN actor.teamIds` | `workflow:read`, `workflow:write` |

### Evaluation

ABAC policies are evaluated **after** RBAC grant. A deny policy overrides RBAC allow.

---

## Custom Roles

Workspace admins can create custom roles:

```json
POST /workspaces/:id/roles
{
  "name": "Integration Developer",
  "permissions": [
    "workflow:read",
    "workflow:write",
    "secret:read",
    "secret:write",
    "integration:read",
    "integration:write"
  ]
}
```

Constraints:
- Cannot grant permissions the creator doesn't hold
- Cannot create roles with `workspace:delete` or `organization:*`
- Maximum 20 custom roles per workspace
- Custom role names unique within workspace

---

## System Permissions

Platform-level permissions for internal `System Admin` role (not exposed to customers):

| Permission | Description |
|------------|-------------|
| `system:admin` | Access admin API endpoints |
| `system:impersonate` | Impersonate user (support, audited) |
| `system:dlq` | Manage dead letter queues |
| `system:metrics` | Access internal metrics |
| `system:outbox` | Replay outbox events |

---

## Caching

Resolved permissions are cached per `(workspaceId, userId)` for 5 minutes. See [CACHING-STRATEGY.md](../architecture/CACHING-STRATEGY.md).

Invalidation triggers: `MemberAdded`, `MemberRemoved`, `MemberRoleChanged`, custom role mutations.

---

## Related Documents

- [SECURITY-MODEL.md](./SECURITY-MODEL.md) — Auth flows and threat model
- [API-CATALOG.md](../architecture/API-CATALOG.md) — Endpoint authorization mapping
- [ADR 0004: Workspace Tenancy](../adr/0004-workspace-tenancy.md)
