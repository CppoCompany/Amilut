import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { Toaster } from '../../shared/toast/toaster';
import { Breadcrumb } from './breadcrumb/breadcrumb';
import { CommandPalette } from './command-palette/command-palette';
import { isTreeChildGroup, TreeChild } from './navigation.model';
import { NavigationService } from './navigation.service';
import { NotificationBell } from './notification-bell/notification-bell';
import { NotificationsStateService } from './notifications-state.service';
import { CcfScreen } from './screens/ccf/ccf';
import { ClassificationScreen } from './screens/classification/classification';
import { DashboardScreen } from './screens/dashboard/dashboard';
import { FilingScreen } from './screens/filing/filing';
import { ImportDeclarationScreen } from './screens/import-declaration/import-declaration';
import { CasesInReleaseListScreen } from './screens/lists/cases-in-release-list/cases-in-release-list';
import { ImportProcessesListScreen } from './screens/lists/import-processes-list/import-processes-list';
import { MyCasesListScreen } from './screens/lists/my-cases-list/my-cases-list';
import { MyClassificationsListScreen } from './screens/lists/my-classifications-list/my-classifications-list';
import { MyOrdersListScreen } from './screens/lists/my-orders-list/my-orders-list';
import { MyFilesScreen } from './screens/my-files/my-files';
import { MyOrdersScreen } from './screens/my-orders/my-orders';
import { OrderScreen } from './screens/order/order';
import { PlaceholderScreen } from './screens/placeholder/placeholder';
import { ShipmentCaseWizardScreen } from './screens/shipment-case-wizard/shipment-case-wizard';

/** Sidebar row id of "איזור האישי" — the brand mark and the breadcrumb root both lead here. */
const DASHBOARD_ROW_ID = 'ws-dashboard';

/** "דנה לוי" → "דל"; a single word gives its first letter; nothing gives "?". */
function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

/**
 * Workspace shell: top header, sidebar tree, and the content area whose screen
 * is chosen by {@link NavigationService}. The sidebar is driven by the service's
 * tree model, and `nav.activeScreen()` decides which panel is rendered.
 *
 * Routed at `/workspace/:slug`. The shell is the bridge from the URL to the
 * service: it feeds every `:slug` / query-param change into
 * `nav.applyUrl(...)`, so the active screen is always derived from the URL
 * (Back/Forward, refresh and deep links included). The router reuses this one
 * instance across slug changes, so the sidebar and header never remount.
 *
 * Also hosts the app-wide overlays: the Ctrl+K command palette and the toast
 * stack.
 */
@Component({
  selector: 'app-workspace',
  imports: [
    Breadcrumb,
    NotificationBell,
    CommandPalette,
    Toaster,
    DashboardScreen,
    OrderScreen,
    FilingScreen,
    ShipmentCaseWizardScreen,
    ClassificationScreen,
    CcfScreen,
    ImportDeclarationScreen,
    MyOrdersScreen,
    MyFilesScreen,
    MyOrdersListScreen,
    CasesInReleaseListScreen,
    MyClassificationsListScreen,
    MyCasesListScreen,
    ImportProcessesListScreen,
    PlaceholderScreen,
  ],
  templateUrl: './workspace.html',
  styleUrls: ['./workspace.scss', './workspace-sidebar.scss'],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeUserMenu()',
    // Ctrl+K hands the screen to the command palette; nothing else stays open.
    '(document:keydown.control.k)': 'closeUserMenu()',
    '(document:keydown.meta.k)': 'closeUserMenu()',
  },
})
export class Workspace {
  protected readonly nav = inject(NavigationService);
  protected readonly auth = inject(AuthService);
  protected readonly notifications = inject(NotificationsStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly palette = viewChild.required(CommandPalette);
  private readonly userMenu = viewChild<ElementRef<HTMLElement>>('userMenu');
  /** Lets the template tell a plain leaf row from an expandable sub-group. */
  protected readonly isGroup = isTreeChildGroup;

  /** Collapsed (icon-only) by default; toggled by the sidebar's own expand/close button. */
  protected readonly sidebarExpanded = signal(false);
  protected readonly userMenuOpen = signal(false);
  protected readonly initials = computed(() => initialsOf(this.auth.user()?.name));

  constructor() {
    // Both streams replay synchronously on subscribe, so the first URL is
    // applied before this shell's first render — no flash of the wrong screen.
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed())
      .subscribe(([params, query]) => this.nav.applyUrl(params.get('slug') ?? '', query));

    // One poll for the whole app: the bell, the sidebar badge and the
    // dashboard's "הודעות" widget all read the same count.
    this.notifications.startPolling(inject(DestroyRef));
  }

  /** Unread-notification count for the sidebar badge — only on "איזור האישי", where the "הודעות" widget lives. */
  protected badgeCount(entry: TreeChild): number {
    return entry.page === 'dashboard' ? this.notifications.unreadCount() : 0;
  }

  /** Accessible name of a top-level row, including the badge when one shows. */
  protected navLabel(entry: TreeChild): string {
    const count = this.badgeCount(entry);
    return count > 0 ? `${entry.label} (${count} הודעות שלא נקראו)` : entry.label;
  }

  protected toggleSidebar(): void {
    this.sidebarExpanded.update((expanded) => !expanded);
  }

  protected goHome(): void {
    this.nav.selectChildById(DASHBOARD_ROW_ID);
  }

  protected openPalette(): void {
    this.palette().open();
  }

  protected toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
  }

  protected closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.userMenuOpen()) return;
    const menu = this.userMenu()?.nativeElement;
    if (menu && !menu.contains(event.target as Node)) this.closeUserMenu();
  }
}
