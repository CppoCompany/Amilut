/** Claims we embed in our own JWT. */
export interface AuthUser {
  /** Subject: the `users.id` primary key of the signed-in user. */
  sub: number;
  email: string;
  name: string;
  role: string;
}

/** Public user shape returned to the client. */
export interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: string;
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
  return { id: user.sub, email: user.email, name: user.name, role: user.role };
}
