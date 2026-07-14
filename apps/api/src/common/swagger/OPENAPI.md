# OpenAPI / Swagger conventions

All HTTP endpoints **must** document request and response schemas so Swagger UI shows input fields (not an empty Execute panel).

## Required for every endpoint

1. **Request body (POST/PATCH/PUT):** a class with `@ApiProperty` / `@ApiPropertyOptional`, plus `@ApiBody({ type: DtoClass })`.
2. **Runtime validation:** keep Zod schemas and `ZodValidationPipe` — Zod alone does **not** appear in OpenAPI.
3. **Responses:** `@ApiOkResponse` / `@ApiCreatedResponse` / `@ApiNoContentResponse` with `type: ResponseDto`.
4. **Auth:** `@ApiBearerAuth('bearer')` on protected routes; `@Public()` on open ones.
5. **Tenant routes:** `@ApiHeader({ name: 'X-Workspace-Id', required: true })` (or `ApiWorkspaceHeader()`).
6. **Params/query:** `@ApiParam` / `@ApiQuery` with examples/formats.

## Pattern

```typescript
export const createFooSchema = z.object({ name: z.string().min(1) });

export class CreateFooDto {
  @ApiProperty({ example: 'Acme' })
  name!: string;
}

@Post()
@ApiBody({ type: CreateFooDto })
@ApiCreatedResponse({ type: FooResponseDto })
create(@Body(new ZodValidationPipe(createFooSchema)) body: CreateFooDto) { ... }
```

Do **not** type `@Body()` with `z.infer<typeof schema>` only — Swagger cannot reflect that.
