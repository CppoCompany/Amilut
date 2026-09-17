import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route (or a whole controller) out of the global JwtAuthGuard.
 * Everything else under /api requires a valid bearer token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
