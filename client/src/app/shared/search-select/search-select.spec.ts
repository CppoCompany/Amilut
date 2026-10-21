import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { SearchSelect, SearchSelectOption } from './search-select';

@Component({
  imports: [SearchSelect],
  template: `
    <app-search-select
      inputId="pick"
      [clearLabel]="clearLabel()"
      [options]="options"
      [selected]="selected()"
      (selectedChange)="selected.set($event)"
    />
  `,
})
class HostComponent {
  readonly options: SearchSelectOption<number>[] = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: `תיק ${i + 1}`,
  }));
  readonly clearLabel = signal<string | null>('ללא');
  readonly selected = signal<number | null>(3);
}

describe('SearchSelect', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    // ngModel writes the value to the PrimeNG select asynchronously.
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const widget = (): SearchSelect<number> =>
    fixture.debugElement.query(By.directive(SearchSelect)).componentInstance;

  it('shows the selected option label', () => {
    expect(fixture.nativeElement.querySelector('p-select').textContent).toContain('תיק 3');
  });

  it('puts the clear row first, and omits it when clearLabel is unset', () => {
    expect(widget().rows()[0]).toEqual({ value: null, label: 'ללא' });
    expect(widget().rows()).toHaveLength(13);

    fixture.componentInstance.clearLabel.set(null);
    fixture.detectChanges();
    expect(widget().rows()).toHaveLength(12);
  });

  it('emits the picked value, and null through the clear row', () => {
    widget().onChange(7);
    expect(fixture.componentInstance.selected()).toBe(7);
    widget().onChange(null);
    expect(fixture.componentInstance.selected()).toBeNull();
  });
});
