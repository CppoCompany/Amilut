import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from './auth.types';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/** Injects the JWT payload attached to the request by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
