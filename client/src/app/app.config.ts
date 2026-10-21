import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { AmilutPreset } from './theme/amilut-preset';
import { HEBREW_TRANSLATION } from './theme/hebrew-translation';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    providePrimeNG({
      theme: { preset: AmilutPreset, options: { darkModeSelector: false } },
      translation: HEBREW_TRANSLATION,
    }),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Validate a cached session on startup so a stale token is cleared before routing.
    // refreshSession() never rejects, so bootstrap is never blocked by a network failure.
    provideAppInitializer(() => inject(AuthService).refreshSession()),
  ],
};
