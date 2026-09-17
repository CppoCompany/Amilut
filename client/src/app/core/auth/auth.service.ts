import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthUser, LoginResponse, MeResponse } from './auth.models';

/** Single localStorage key holding the persisted session. */
export const AUTH_STORAGE_KEY = 'amilut.auth';

interface StoredSession {
  accessToken: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _user = signal<AuthUser | null>(null);
  private readonly _token = signal<string | null>(null);
  private readonly _loading = signal(false);

  readonly user = this._user.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());

  constructor() {
    this.hydrate();
  }

  /** The current access token, or `null` when signed out. */
  token(): string | null {
    return this._token();
  }

  /** Signs in with user name (email) and password. The password is optional for now. */
  async login(email: string, password?: string): Promise<AuthUser> {
    this._loading.set(true);
    try {
      const body = password ? { email, password } : { email };
      const response = await firstValueFrom(
        this.http.post<LoginResponse>('/api/auth/login', body),
      );
      this.setSession(response.accessToken, response.user);
      return response.user;
    } finally {
      this._loading.set(false);
    }
  }

  /** Clears the session (state + storage) and returns to the login page. */
  logout(): void {
    this.clearSession();
    void this.router.navigateByUrl('/login');
  }

  /**
   * Validates the cached token against `GET /api/auth/me`.
   * - 401 → the session is stale: cleared, resolves `false`.
   * - Network / other errors → the cached session is kept, resolves `true`.
   * Never throws, so it is safe to use as an app initializer.
   */
  async refreshSession(): Promise<boolean> {
    if (!this._token()) {
      return false;
    }

    try {
      const response = await firstValueFrom(this.http.get<MeResponse>('/api/auth/me'));
      this._user.set(response.user);
      this.persist();
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.clearSession();
        return false;
      }
      // Offline / server down: keep the cached session rather than kicking the user out.
      return true;
    }
  }

  private setSession(accessToken: string, user: AuthUser): void {
    this._token.set(accessToken);
    this._user.set(user);
    this.persist();
  }

  private clearSession(): void {
    this._token.set(null);
    this._user.set(null);
    this.storage?.removeItem(AUTH_STORAGE_KEY);
  }

  private persist(): void {
    const token = this._token();
    const user = this._user();
    if (!token || !user) {
      return;
    }
    const session: StoredSession = { accessToken: token, user };
    try {
      this.storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage may be full or disabled (private mode); the in-memory session still works.
    }
  }

  private hydrate(): void {
    const raw = this.storage?.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredSession> | null;
      // Sessions persisted before the user id existed in the token are dropped so the
      // user signs in again and gets a token the server can attribute writes to.
      if (
        parsed &&
        typeof parsed.accessToken === 'string' &&
        typeof parsed.user?.id === 'number' &&
        parsed.user.email
      ) {
        this._token.set(parsed.accessToken);
        this._user.set(parsed.user as AuthUser);
      } else {
        this.storage?.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {
      this.storage?.removeItem(AUTH_STORAGE_KEY);
    }
  }

  private get storage(): Storage | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  }
}
