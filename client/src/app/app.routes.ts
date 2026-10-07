import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';

/** Where the app lands when no screen is named (and where unknown URLs go). */
export const DEFAULT_WORKSPACE_URL = '/workspace/dashboard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  // Every workspace screen has its own URL: `/workspace/<slug>` (see
  // `NavigationService.slugOf`). The shell reads `:slug` (+ query params for
  // edit hand-offs) and derives the active screen from it, so Back/Forward,
  // refresh and deep links all work.
  { path: 'workspace', pathMatch: 'full', redirectTo: DEFAULT_WORKSPACE_URL },
  {
    path: 'workspace/:slug',
    canActivate: [authGuard],
    loadComponent: () => import('./features/workspace/workspace').then((m) => m.Workspace),
  },
  { path: '', pathMatch: 'full', redirectTo: DEFAULT_WORKSPACE_URL },
  { path: '**', redirectTo: DEFAULT_WORKSPACE_URL },
];
