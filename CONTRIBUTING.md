# Contributing to FlowForge

Thank you for your interest in contributing to FlowForge. This project aims to be a production-grade reference implementation — every contribution should meet that bar.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<you>/flowforge.git`
3. Install dependencies: `pnpm install`
4. Copy environment: `cp .env.example .env`
5. Start infrastructure: `docker compose up -d`
6. Run migrations: `pnpm db:migrate`
7. Start development: `pnpm dev`

## Development Workflow

### Branch Naming

```
feature/<milestone>-<short-description>
fix/<issue-number>-<short-description>
docs/<short-description>
chore/<short-description>
```

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(auth): add refresh token rotation
fix(worker): handle BullMQ connection timeout
docs(api): update webhook endpoint spec
test(health): add readiness probe integration test
chore(deps): bump nestjs to 11.x
```

### Pull Request Requirements

Every PR must:

- [ ] Compile without errors (`pnpm build`)
- [ ] Pass all tests (`pnpm test`)
- [ ] Pass linting (`pnpm lint`)
- [ ] Pass type checking (`pnpm typecheck`)
- [ ] Include updated documentation (if applicable)
- [ ] Include tests for new functionality
- [ ] Include migration files (if schema changes)
- [ ] Update CHANGELOG (for feature/fix PRs)
- [ ] Reference the milestone task ID from [MILESTONES.md](docs/planning/MILESTONES.md)

### Code Standards

- **Strict TypeScript** — no `any`, no implicit returns
- **Clean Architecture** — no business logic in controllers, no Prisma in controllers
- **SOLID principles** — single responsibility, dependency inversion via interfaces
- **Repository pattern** — all data access through repository abstractions
- **Zod validation** — all input validated at boundaries
- **RFC 7807 errors** — consistent problem details responses

### Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @flowforge/api test

# Run with coverage
pnpm --filter @flowforge/api test -- --coverage
```

Test categories:

- **Unit tests** — domain logic, services, utilities
- **Integration tests** — repository tests with test database
- **E2E tests** — full HTTP request/response cycles

### Architecture Decision Records

Significant design decisions require an ADR in `docs/adr/`. Use the template:

```markdown
# ADR-NNNN: Title

## Status

Proposed | Accepted | Deprecated | Superseded

## Context

What is the issue?

## Decision

What is the change?

## Consequences

What are the trade-offs?
```

## Milestone-Based Development

Implementation follows the milestone plan in [MILESTONES.md](docs/planning/MILESTONES.md). Each milestone:

1. Must compile and pass all tests
2. Must preserve backward compatibility
3. Must include documentation updates
4. Must meet all acceptance criteria before merge

## Questions?

Open a GitHub issue or discussion. For architecture questions, reference the relevant ADR or architecture document.
