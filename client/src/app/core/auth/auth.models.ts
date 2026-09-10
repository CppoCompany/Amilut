/** The signed-in user as returned by the auth API. */
export interface AuthUser {
  email: string;
  name: string;
}

/** Response of `POST /api/auth/login`. */
export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

/** Response of `GET /api/auth/me`. */
export interface MeResponse {
  user: AuthUser;
}
