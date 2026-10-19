import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SearchSelect, SearchSelectOption } from './search-select';

@Component({
  imports: [SearchSelect],
  template: `
    <app-search-select
      inputId="pick"
      clearLabel="ללא"
      [options]="options"
      [selected]="selected()"
      (selectedChange)="selected.set($event)"
    />
  `,
})
class HostComponent {
  readonly options: SearchSelectOption<number>[] = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: i === 2 ? 'תיק 3 · MBL-ABC' : `תיק ${i + 1}`,
  }));
  readonly selected = signal<number | null>(null);
}

describe('SearchSelect', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  const input = (): HTMLInputElement => fixture.nativeElement.querySelector('#pick');
  const list = (): HTMLElement => fixture.nativeElement.querySelector('[role="listbox"]');
  const rowLabels = (): string[] =>
    Array.from(list().querySelectorAll('[role="option"]')).map((el) => el.textContent!.trim());

  function type(text: string): void {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function key(name: string): void {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: name }));
    fixture.detectChanges();
  }

  it('opens on focus with the clear row first and caps the list at 8 visible rows', () => {
    input().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(rowLabels()).toHaveLength(13);
    expect(rowLabels()[0]).toBe('ללא');
    expect(list().style.getPropertyValue('--search-select-visible')).toBe('8');
  });

  it('filters by label case-insensitively and picks with the keyboard', () => {
    input().dispatchEvent(new FocusEvent('focus'));
    type('mbl-abc');

    expect(rowLabels()).toEqual(['תיק 3 · MBL-ABC']);

    key('Enter');

    expect(fixture.componentInstance.selected()).toBe(3);
    expect(input().value).toBe('תיק 3 · MBL-ABC');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('shows an empty-state row when nothing matches', () => {
    input().dispatchEvent(new FocusEvent('focus'));
    type('zzz');

    expect(rowLabels()).toEqual([]);
    expect(list().textContent).toContain('לא נמצאו תוצאות');
  });

  it('drops an unfinished query on Escape and keeps the selection', () => {
    fixture.componentInstance.selected.set(5);
    fixture.detectChanges();
    expect(input().value).toBe('תיק 5');

    input().dispatchEvent(new FocusEvent('focus'));
    type('תיק 1');
    key('Escape');

    expect(fixture.componentInstance.selected()).toBe(5);
    expect(input().value).toBe('תיק 5');
  });

  it('picks null through the clear row', () => {
    fixture.componentInstance.selected.set(5);
    fixture.detectChanges();

    input().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    (list().querySelector('[role="option"]') as HTMLElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selected()).toBeNull();
    expect(input().value).toBe('');
  });
});
