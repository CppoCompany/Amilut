import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { NavigationService } from './navigation.service';
import { Workspace } from './workspace';

describe('Workspace sidebar (icon-only collapse/expand)', () => {
  let fixture: ComponentFixture<Workspace>;
  let nav: NavigationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Workspace],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    nav = TestBed.inject(NavigationService);
    fixture = TestBed.createComponent(Workspace);
    fixture.detectChanges();
  });

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

  it('starts collapsed: icon-only rail, no group/labels, bars icon shown', () => {
    expect(sidebar().classList.contains('sidebar--collapsed')).toBe(true);
    expect(fixture.nativeElement.querySelector('.tree-node')).toBeNull();
    expect(fixture.nativeElement.querySelector('.tree-child-item')).toBeNull();
    expect(iconItems().length).toBeGreaterThan(0);
    expect(toggleButton().querySelector('i')?.classList.contains('fa-bars')).toBe(true);
    expect(fixture.nativeElement.querySelector('.sidebar-header__title')).toBeNull();
  });

  it('a standalone leaf icon has a tooltip matching its menu label', () => {
    const icon = leafIconByLabel('תיוק ניירת יבוא');
    expect(icon).toBeTruthy();
    expect(icon!.querySelector('.icon-nav-tooltip')?.textContent?.trim()).toBe('תיוק ניירת יבוא');
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

  it('clicking a flyout child navigates exactly like its expanded counterpart (same NavigationService call)', () => {
    flyoutItemByLabel('תיקי שילוח', 'התיקים שלי')!.click();
    fixture.detectChanges();

    expect(nav.activeScreen()).toBe('myFiles');
    expect(nav.isChildActive('ws-my-files')).toBe(true);
  });

  it('clicking a standalone leaf icon navigates exactly like its expanded counterpart', () => {
    leafIconByLabel('תיוק ניירת יבוא')!.click();
    fixture.detectChanges();

    expect(nav.activeScreen()).toBe('filing');
    expect(nav.isChildActive('ws-filing')).toBe(true);
  });

  it('the active page highlights both the flyout item and its parent group icon', () => {
    flyoutItemByLabel('תיקי שילוח', 'התיקים שלי')!.click();
    fixture.detectChanges();

    expect(flyoutItemByLabel('תיקי שילוח', 'התיקים שלי')!.classList.contains('active')).toBe(true);
    expect(groupIconByLabel('תיקי שילוח')!.classList.contains('active')).toBe(true);
  });

  it('a standalone leaf icon highlights when its page becomes active', () => {
    leafIconByLabel('תיוק ניירת יבוא')!.click();
    fixture.detectChanges();

    expect(leafIconByLabel('תיוק ניירת יבוא')!.classList.contains('active')).toBe(true);
  });
});
