/** Claims we embed in our own JWT. */
export interface AuthUser {
  /** Subject: the normalized account email. */
  sub: string;
  email: string;
  name: string;
}

/** Public user shape returned to the client. */
export interface PublicUser {
  email: string;
  name: string;
}

export interface LoginResponse {
  accessToken: string;
  user: PublicUser;
}

/** JWT payload as read back by JwtService.verifyAsync (adds iat/exp). */
export interface JwtPayload extends AuthUser {
  iat?: number;
  exp?: number;
}

export function toPublicUser(user: AuthUser): PublicUser {
  return { email: user.email, name: user.name };
}
