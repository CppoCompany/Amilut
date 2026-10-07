/**
 * Test-only routing scaffold for specs that drive {@link NavigationService}.
 *
 * Every navigation in the workspace is a real router navigation to
 * `/workspace/<slug>`, and the active screen is only ever derived from that
 * URL (see `NavigationService.applyUrl`). A spec that calls `selectChild`,
 * `openOrderForEdit`, etc. therefore needs (1) a route for `workspace/:slug`
 * whose component feeds the URL back into the service — exactly what the
 * `Workspace` shell does in the app — and (2) a way to wait for the
 * navigation to settle. This module provides both without rendering the
 * whole shell (and the HTTP-hungry screens inside it).
 *
 * Usage:
 * ```ts
 * TestBed.configureTestingModule({ providers: [provideWorkspaceTestRouting()] });
 * await RouterTestingHarness.create('/workspace/dashboard');
 * nav.selectChild(row);
 * await settleNavigation();
 * ```
 */
import { ApplicationRef, Component, inject, provideEnvironmentInitializer } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { ActivatedRoute, provideRouter, Router, Routes } from '@angular/router';
import { combineLatest } from 'rxjs';

import { NavigationService } from './navigation.service';

/** Stand-in for the `Workspace` shell's URL → `applyUrl` binding (renders nothing). */
@Component({ selector: 'app-workspace-slug-stub', template: '' })
export class WorkspaceSlugStub {
  constructor() {
    const nav = inject(NavigationService);
    const route = inject(ActivatedRoute);
    combineLatest([route.paramMap, route.queryParamMap])
      .pipe(takeUntilDestroyed())
      .subscribe(([params, query]) => nav.applyUrl(params.get('slug') ?? '', query));
  }
}

/** The app's workspace routes, minus guards and lazy loading, with the stub as the shell. */
export const WORKSPACE_TEST_ROUTES: Routes = [
  { path: 'workspace', pathMatch: 'full', redirectTo: 'workspace/dashboard' },
  { path: 'workspace/:slug', component: WorkspaceSlugStub },
  { path: '', pathMatch: 'full', redirectTo: 'workspace/dashboard' },
];

/**
 * Router + in-memory `Location` for `routes` (the stub routes by default).
 * Also installs the router's popstate listener, which only app bootstrap does
 * otherwise — without it `location.back()` / `forward()` would move the mocked
 * history but never trigger a router navigation.
 */
export function provideWorkspaceTestRouting(routes: Routes = WORKSPACE_TEST_ROUTES) {
  return [
    provideRouter(routes),
    provideLocationMocks(),
    provideEnvironmentInitializer(() => inject(Router).setUpLocationChangeListener()),
  ];
}

/** Resolves once every in-flight router navigation has finished (zoneless: pending tasks). */
export async function settleNavigation(): Promise<void> {
  // The router starts a popstate-triggered navigation (location.back()/forward())
  // from a setTimeout(0), so let that macrotask run before waiting for stability.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await TestBed.inject(ApplicationRef).whenStable();
}
