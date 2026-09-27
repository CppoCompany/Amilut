import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MultiSelect, MultiSelectOption } from './multi-select';

@Component({
  imports: [MultiSelect],
  template: `
    <app-multi-select
      [options]="options"
      [selected]="selected()"
      placeholder="ללא"
      ariaLabel="אישורים"
      (selectedChange)="selected.set($event)"
    />
  `,
})
class HostComponent {
  readonly options: MultiSelectOption[] = [
    { value: 'a', label: 'אלף' },
    { value: 'b', label: 'בית' },
    { value: 'c', label: 'גימל' },
  ];
  readonly selected = signal<string[]>([]);
}

describe('MultiSelect', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  const toggle = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.multi-select__toggle');
  const menu = (): HTMLElement | null => fixture.nativeElement.querySelector('.multi-select__menu');
  const checkboxes = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.multi-select__menu input'));

  it('shows the placeholder and no menu until opened', () => {
    expect(toggle().textContent?.trim()).toBe('ללא');
    expect(toggle().getAttribute('aria-label')).toBe('אישורים');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(menu()).toBeNull();
  });

  it('opens a checkbox list with every option and emits the selection in option order', () => {
    toggle().click();
    fixture.detectChanges();

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(checkboxes().map((c) => c.value)).toEqual(['a', 'b', 'c']);

    const [a, , c] = checkboxes();
    c.click();
    fixture.detectChanges();
    a.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selected()).toEqual(['a', 'c']);
    expect(toggle().textContent?.trim()).toBe('2 נבחרו');

    a.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toEqual(['c']);
    expect(toggle().textContent?.trim()).toBe('גימל');
  });

  it('closes on an outside click and on Escape, but not on clicks inside', () => {
    toggle().click();
    fixture.detectChanges();
    expect(menu()).not.toBeNull();

    menu()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(menu()).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(menu()).toBeNull();

    toggle().click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(menu()).toBeNull();
  });
});
