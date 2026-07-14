import { SetMetadata } from '@nestjs/common';
import type { AbacResourceContext } from '../../modules/authorization/domain/abac.types';

export const ABAC_RESOURCE_KEY = 'abac_resource';

export type AbacResourceResolver = (
  // Express request-like object
  request: Record<string, unknown>,
) => AbacResourceContext | Promise<AbacResourceContext | undefined> | undefined;

export const AbacResource = (
  resolver: AbacResourceResolver,
): ReturnType<typeof SetMetadata> => SetMetadata(ABAC_RESOURCE_KEY, resolver);
