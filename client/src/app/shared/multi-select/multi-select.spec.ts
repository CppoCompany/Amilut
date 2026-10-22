import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { MultiSelect, MultiSelectOption } from './multi-select';

@Component({
  imports: [MultiSelect],
  template: `
    <app-multi-select
      ariaLabel="סוגים"
      [options]="options"
      [selected]="selected()"
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

  const widget = (): MultiSelect =>
    fixture.debugElement.query(By.directive(MultiSelect)).componentInstance;

  it('renders a PrimeNG multiselect showing the placeholder', () => {
    const el: HTMLElement = fixture.nativeElement.querySelector('p-multiselect');
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('בחר');
  });

  it('emits the selection in option order regardless of click order', () => {
    widget().onChange(['c', 'a']);
    expect(fixture.componentInstance.selected()).toEqual(['a', 'c']);
  });

  it('emits an empty array when cleared', () => {
    fixture.componentInstance.selected.set(['b']);
    widget().onChange(null);
    expect(fixture.componentInstance.selected()).toEqual([]);
  });
});
