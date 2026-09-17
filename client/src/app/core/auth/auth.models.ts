/** The signed-in user as returned by the auth API. */
export interface AuthUser {
  /** `users.id` — the server stamps it on records the user creates (e.g. order handler). */
  id: number;
  email: string;
  name: string;
  role: string;
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
