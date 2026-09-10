import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

const LOGIN_ENDPOINT = '/api/auth/login';

/**
 * Attaches the bearer token to `/api/` requests and signs the user out when
 * the server answers 401 (except for the login call itself, whose 401 simply
 * means "bad credentials").
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isApiRequest = req.url.includes('/api/');
  const isLoginRequest = req.url.includes(LOGIN_ENDPOINT);
  const token = auth.token();

  if (isApiRequest && token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        isApiRequest &&
        !isLoginRequest &&
        error instanceof HttpErrorResponse &&
        error.status === 401
      ) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};
