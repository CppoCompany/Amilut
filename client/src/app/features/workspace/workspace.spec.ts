import { Location } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';

import { NavigationService } from './navigation.service';
import { provideWorkspaceTestRouting, settleNavigation } from './navigation.testing';
import { Workspace } from './workspace';

describe('Workspace shell', () => {
  let harness: RouterTestingHarness;
  let fixture: ComponentFixture<unknown>;
  let nav: NavigationService;
  let location: Location;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Workspace],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // The real shell on the real `:slug` route (guards/lazy loading aside).
        provideWorkspaceTestRouting([
          { path: 'workspace', pathMatch: 'full', redirectTo: 'workspace/dashboard' },
          { path: 'workspace/:slug', component: Workspace },
        ]),
      ],
    }).compileComponents();

    nav = TestBed.inject(NavigationService);
    location = TestBed.inject(Location);
    harness = await RouterTestingHarness.create('/workspace/dashboard');
    fixture = harness.fixture;
  });

  /** Lets a click-triggered navigation finish and re-renders. */
  async function settle(): Promise<void> {
    await settleNavigation();
    fixture.detectChanges();
  }

  function sidebar(): HTMLElement {
    return fixture.nativeElement.querySelector('.sidebar');
  }

  function toggleButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.sidebar-toggle');
  }

  function iconItems(): HTMLAnchorElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.icon-nav-item'));
  }

  /** A standalone (non-group) leaf's own icon — identified by its `title`. */
  function leafIconByLabel(label: string): HTMLAnchorElement | null {
    return iconItems().find((a) => a.getAttribute('title') === label) ?? null;
  }

  /** A group's own icon — identified by `aria-label` (groups have no `title`/tooltip, only a flyout). */
  function groupIconByLabel(label: string): HTMLAnchorElement | null {
    return iconItems().find((a) => a.getAttribute('aria-label') === label && !a.hasAttribute('title')) ?? null;
  }

  /** One child row inside a group's hover flyout, identified by the group's and the child's labels. */
  function flyoutItemByLabel(groupLabel: string, childLabel: string): HTMLAnchorElement | null {
    const groupIcon = groupIconByLabel(groupLabel);
    const groupLi = groupIcon?.closest('.icon-nav-group');
    const items: HTMLAnchorElement[] = Array.from(groupLi?.querySelectorAll('.icon-nav-flyout__item') ?? []);
    return items.find((a) => a.textContent?.trim() === childLabel) ?? null;
  }

  function breadcrumbText(): string {
    return fixture.nativeElement.querySelector('.breadcrumb-trail').textContent.replace(/\s+/g, ' ').trim();
  }

  function renderedScreen(): string | null {
    const panel: HTMLElement = fixture.nativeElement.querySelector('.page-tab-panel');
    return panel.firstElementChild?.tagName.toLowerCase() ?? null;
  }

  describe('sidebar (icon-only collapse/expand)', () => {
    it('starts collapsed: icon-only rail, no group/labels, bars icon shown', () => {
      expect(sidebar().classList.contains('sidebar--collapsed')).toBe(true);
      expect(fixture.nativeElement.querySelector('.tree-node')).toBeNull();
      expect(fixture.nativeElement.querySelector('.tree-child-item')).toBeNull();
      expect(iconItems().length).toBeGreaterThan(0);
      expect(toggleButton().querySelector('i')?.classList.contains('fa-bars')).toBe(true);
      expect(fixture.nativeElement.querySelector('.sidebar-header__title')).toBeNull();
    });

    it('a standalone leaf icon has a tooltip matching its menu label', () => {
      const icon = leafIconByLabel('סיווג');
      expect(icon).toBeTruthy();
      expect(icon!.querySelector('.icon-nav-tooltip')?.textContent?.trim()).toBe('סיווג');
    });

    it('"תיוק ניירת יבוא" is reachable (see NavigationService.openFilingForCase) but hidden from both sidebar modes', () => {
      expect(leafIconByLabel('תיוק ניירת יבוא')).toBeNull();

      toggleButton().click();
      fixture.detectChanges();
      const expandedItems: HTMLAnchorElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.tree-child-item'),
      );
      const expandedLabels = expandedItems.map((a) => a.textContent?.trim());
      expect(expandedLabels).not.toContain('תיוק ניירת יבוא');
    });

    it('a group keeps a single icon, revealing its children as a hover flyout', () => {
      expect(groupIconByLabel('תיקי שילוח')).toBeTruthy();
      expect(flyoutItemByLabel('תיקי שילוח', 'התיקים שלי')).toBeTruthy();
      expect(flyoutItemByLabel('תיקי שילוח', 'יצירת תיק שילוח')).toBeTruthy();
    });

    it('clicking the toggle expands the sidebar: full labeled tree, X icon, title text', () => {
      toggleButton().click();
      fixture.detectChanges();

      expect(sidebar().classList.contains('sidebar--collapsed')).toBe(false);
      expect(toggleButton().querySelector('i')?.classList.contains('fa-xmark')).toBe(true);
      expect(fixture.nativeElement.querySelector('.sidebar-header__title')?.textContent?.trim()).toBe(
        'תפריט ראשי',
      );
      expect(fixture.nativeElement.querySelector('.tree-node')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.icon-nav-item')).toBeNull();
    });

    it('clicking the toggle again collapses back to the icon-only rail', () => {
      toggleButton().click();
      fixture.detectChanges();
      toggleButton().click();
      fixture.detectChanges();

      expect(sidebar().classList.contains('sidebar--collapsed')).toBe(true);
      expect(fixture.nativeElement.querySelector('.tree-node')).toBeNull();
      expect(iconItems().length).toBeGreaterThan(0);
    });

    it('clicking a flyout child navigates exactly like its expanded counterpart (same NavigationService call)', async () => {
      flyoutItemByLabel('תיקי שילוח', 'התיקים שלי')!.click();
      await settle();

      expect(location.path()).toBe('/workspace/my-files');
      expect(nav.activeScreen()).toBe('myFiles');
      expect(nav.isChildActive('ws-my-files')).toBe(true);
    });

    it('clicking a standalone leaf icon navigates exactly like its expanded counterpart', async () => {
      leafIconByLabel('סיווג')!.click();
      await settle();

      expect(location.path()).toBe('/workspace/classification');
      expect(nav.activeScreen()).toBe('classification');
      expect(nav.isChildActive('ws-classification')).toBe(true);
    });

    it('the active page highlights both the flyout item and its parent group icon', async () => {
      flyoutItemByLabel('תיקי שילוח', 'התיקים שלי')!.click();
      await settle();

      expect(flyoutItemByLabel('תיקי שילוח', 'התיקים שלי')!.classList.contains('active')).toBe(true);
      expect(groupIconByLabel('תיקי שילוח')!.classList.contains('active')).toBe(true);
    });

    it('a standalone leaf icon highlights when its page becomes active', async () => {
      leafIconByLabel('סיווג')!.click();
      await settle();

      expect(leafIconByLabel('סיווג')!.classList.contains('active')).toBe(true);
    });
  });

  describe('URL-driven screens', () => {
    it('renders the screen named by the URL on first paint, with the breadcrumb showing group + leaf', async () => {
      await harness.navigateByUrl('/workspace/list-my-cases');
      fixture.detectChanges();

      expect(renderedScreen()).toBe('app-my-cases-list-screen');
      expect(breadcrumbText()).toContain('רשימות');
      expect(breadcrumbText()).toContain('התיקים שלי');
    });

    it('Back/Forward swap the rendered screen without remounting the shell', async () => {
      const shellBefore = fixture.nativeElement.querySelector('app-workspace');
      leafIconByLabel('סיווג')!.click();
      await settle();
      expect(renderedScreen()).toBe('app-classification-screen');

      location.back();
      await settle();
      expect(location.path()).toBe('/workspace/dashboard');
      expect(renderedScreen()).toBe('app-dashboard-screen');
      expect(breadcrumbText()).toContain('לוח בקרה');

      location.forward();
      await settle();
      expect(renderedScreen()).toBe('app-classification-screen');
      expect(fixture.nativeElement.querySelector('app-workspace')).toBe(shellBefore);
    });

    it('an unknown slug lands on the dashboard', async () => {
      await harness.navigateByUrl('/workspace/does-not-exist');
      await settle();

      expect(location.path()).toBe('/workspace/dashboard');
      expect(renderedScreen()).toBe('app-dashboard-screen');
    });
  });
});
