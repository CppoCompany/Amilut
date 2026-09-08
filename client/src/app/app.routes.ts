import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: 'workspace',
    loadComponent: () => import('./features/workspace/workspace').then((m) => m.Workspace),
  },
  { path: '', pathMatch: 'full', redirectTo: 'workspace' },
];
