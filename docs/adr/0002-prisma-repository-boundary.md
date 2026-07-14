# ADR 0002: Prisma Repository Boundary

> **Status:** Accepted · **Date:** 2026-07-14 · **Deciders:** Architecture Team

## Context

FlowForge follows Clean Architecture with strict layer separation:

- **Domain/Application layers** must not depend on infrastructure
- **Controllers** must not contain Prisma queries
- **Business logic** belongs in domain/application services

We need an ORM and a pattern for data access that:

- Provides type-safe database access
- Supports migrations and schema evolution (~45 entities)
- Allows unit testing application services without a database
- Prevents Prisma types from leaking into domain layer

Options considered:

1. **Prisma directly in services** (anemic repositories)
2. **TypeORM with repository pattern**
3. **Prisma behind repository interfaces** (Clean Architecture)
4. **Drizzle ORM with repository pattern**

## Decision

Use **Prisma** as the ORM with a strict **Repository Pattern** boundary:

```
Controller → Application Service → Repository Interface → Prisma Repository → PostgreSQL
                                        ↑ domain layer          ↑ infrastructure layer
```

### Layer Rules

1. **Repository interfaces** defined in `packages/domain` or app-level `domain/` module
2. **Prisma implementations** in `packages/database` or app-level `infrastructure/persistence/`
3. **Prisma-generated types** never imported in domain or application layers
4. **Domain entities** are separate from Prisma models; mappers convert between them
5. **Unit of Work** wraps transactions; repositories receive transaction client

### Example Structure

```typescript
// domain/workflow/repository.interface.ts
interface WorkflowRepository {
  findById(workspaceId: string, id: string): Promise<Workflow | null>;
  save(workflow: Workflow): Promise<void>;
}

// infrastructure/persistence/prisma-workflow.repository.ts
@Injectable()
class PrismaWorkflowRepository implements WorkflowRepository {
  constructor(private prisma: PrismaService) {}

  async findById(workspaceId: string, id: string): Promise<Workflow | null> {
    const row = await this.prisma.workflow.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row ? WorkflowMapper.toDomain(row) : null;
  }
}
```

### Prisma Configuration

- Schema location: `prisma/schema.prisma`
- Client generation: `packages/database` exports `PrismaService`
- Migrations: `prisma/migrations/` (committed to git)
- Middleware: tenant filter middleware on `PrismaService` (enforce `workspaceId`)

### Specification Pattern

Complex queries use Specification objects translated to Prisma `where` clauses in the infrastructure layer:

```typescript
// domain/specifications/active-workflows.spec.ts
class ActiveWorkflowsSpec implements Specification<Workflow> {
  toQuery(): WorkflowQuery { return { status: 'published', deletedAt: null }; }
}

// infrastructure: spec → Prisma where clause
```

## Consequences

### Positive

- Domain layer is fully testable with in-memory repository fakes
- Prisma can be replaced without touching business logic
- Clear separation enforced by ESLint import rules (`no-restricted-imports`)
- Prisma Migrate provides excellent migration workflow
- Type-safe queries reduce runtime errors

### Negative

- Mapping overhead between Prisma models and domain entities
- Two type systems to maintain (domain entity + Prisma model)
- Repository boilerplate for ~45 entities
- Prisma client bundle size in worker processes

### Mitigations

- Code generation for mappers (future)
- Shared `@flowforge/database` package avoids duplication between API and worker
- Tree-shaking and selective imports minimize bundle size

## Alternatives Rejected

| Alternative | Reason Rejected |
|-------------|-----------------|
| Prisma in services directly | Violates Clean Architecture; untestable; Prisma leaks everywhere |
| TypeORM | Less type-safe; migration tooling inferior; declining ecosystem momentum |
| Drizzle | Less mature migration story; smaller NestJS integration ecosystem |
| Raw SQL (pg) | Too much boilerplate for 45 entities; loses type safety |

## Enforcement

ESLint rule in `eslint.config.mjs`:

```javascript
// apps/api/src/domain/** cannot import @prisma/client
'no-restricted-imports': ['error', {
  paths: [{ name: '@prisma/client', message: 'Use repository interfaces in domain layer' }],
}]
```

## References

- [DOMAIN-MODEL.md](../architecture/DOMAIN-MODEL.md)
- [ADR 0001: Monorepo Structure](./0001-monorepo-structure.md)
- [ADR 0004: Workspace Tenancy](./0004-workspace-tenancy.md)
