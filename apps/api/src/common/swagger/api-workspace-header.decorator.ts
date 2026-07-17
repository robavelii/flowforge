import { SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

/** OpenAPI: document and require the workspace tenant header. */
export const ApiWorkspaceHeader = (): MethodDecorator & ClassDecorator =>
  ApiHeader({
    name: 'X-Workspace-Id',
    required: true,
    description: 'Workspace tenant UUID',
    schema: { type: 'string', format: 'uuid' },
  });

export const OPENAPI_BODY_REQUIRED = 'openapiBodyRequired';

/** Marker for future lint/tests ensuring request DTOs are Swagger-documented. */
export const RequiresOpenApiBody = (): MethodDecorator => SetMetadata(OPENAPI_BODY_REQUIRED, true);
