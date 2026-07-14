import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANT_KEY = 'skipTenant';
export const SkipTenant = (): ReturnType<typeof SetMetadata> => SetMetadata(SKIP_TENANT_KEY, true);
