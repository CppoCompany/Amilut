import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { CustomerDto } from '../../../api/models';
import { CustomerAutocomplete, SEARCH_DEBOUNCE_MS } from './customer-autocomplete';

const ACME: CustomerDto = {
  id: 1,
  name: 'Acme Imports Ltd.',
  address: '1 Herzl St, Tel Aviv',
  phone: '+972-3-1234567',
  email: 'office@acme.co.il',
  isActive: true,
};

const BETA: CustomerDto = {
  id: 2,
  name: 'Beta Trading',
  address: null,
  phone: null,
  email: null,
  isActive: true,
};

describe('CustomerAutocomplete', () => {
  let fixture: ComponentFixture<CustomerAutocomplete>;
  let component: CustomerAutocomplete;
  let http: HttpTestingController;
  let input: HTMLInputElement;

  const type = (value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };

  const keydown = (key: string): void => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };

  const settle = (): void => {
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    fixture.detectChanges();
  };

  const searchRequest = (q: string) =>
    http.expectOne((r) => r.url === '/api/customers' && r.params.get('q') === q);

  const items = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.autocomplete-item'));

  const list = (): HTMLElement => fixture.nativeElement.querySelector('.autocomplete-list');

  beforeEach(async () => {
    vi.useFakeTimers();

    await TestBed.configureTestingModule({
      imports: [CustomerAutocomplete],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CustomerAutocomplete);
    component = fixture.componentInstance;
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('input');
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('should create with the default placeholder', () => {
    expect(component).toBeTruthy();
    expect(input.placeholder).toBe('הקלד שם לקוח לחיפוש...');
    expect(input.getAttribute('autocomplete')).toBe('off');
  });

  it('does not call the API below 3 characters', () => {
    type('a');
    type('ab');
    settle();
    http.expectNone((r) => r.url === '/api/customers');
    expect(list().classList.contains('active')).toBe(false);
  });

  it('sends one debounced request for "abc"', () => {
    type('a');
    type('ab');
    type('abc');
    http.expectNone((r) => r.url === '/api/customers');

    settle();
    const req = searchRequest('abc');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush([ACME, BETA]);
    fixture.detectChanges();

    expect(list().classList.contains('active')).toBe(true);
    const names = items().map((el) => el.querySelector('.autocomplete-item__name')?.textContent);
    expect(names).toEqual([ACME.name, BETA.name]);
    expect(items()[0].textContent).toContain(ACME.phone);
    expect(items()[0].textContent).toContain(ACME.email);
  });

  it('trims the query and ignores whitespace-only padding', () => {
    type('  acme  ');
    settle();
    searchRequest('acme').flush([]);
  });

  it('selecting an item sets the model, fills the input and closes the list', () => {
    type('acme');
    settle();
    searchRequest('acme').flush([ACME]);
    fixture.detectChanges();

    items()[0].click();
    fixture.detectChanges();

    expect(component.customer()).toEqual(ACME);
    expect(input.value).toBe(ACME.name);
    expect(list().classList.contains('active')).toBe(false);
  });

  it('shows the "add new customer" row when the search has zero results', () => {
    type('nobody');
    settle();
    searchRequest('nobody').flush([]);
    fixture.detectChanges();

    const addRow = fixture.nativeElement.querySelector('.autocomplete-item--add') as HTMLElement;
    expect(addRow).toBeTruthy();
    expect(addRow.textContent).toContain('לא נמצא לקוח בשם „nobody” — הוסף לקוח חדש');
    expect(addRow.querySelector('i.fa-plus')).toBeTruthy();
    expect(list().classList.contains('active')).toBe(true);
  });

  it('clicking the add row opens the dialog prefilled with the query', () => {
    type('nobody');
    settle();
    searchRequest('nobody').flush([]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.autocomplete-item--add') as HTMLElement).click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('app-add-customer-dialog');
    expect(dialog).toBeTruthy();
    expect((dialog.querySelector('#add-customer-name') as HTMLInputElement).value).toBe('nobody');
    expect(list().classList.contains('active')).toBe(false);
  });

  it('keyboard: ArrowDown moves the active row and Enter selects it', () => {
    type('acme');
    settle();
    searchRequest('acme').flush([ACME, BETA]);
    fixture.detectChanges();

    keydown('ArrowDown');
    expect(items()[1].classList.contains('autocomplete-item--active')).toBe(true);

    keydown('Enter');
    expect(component.customer()).toEqual(BETA);
  });

  it('keyboard: Escape closes the list', () => {
    type('acme');
    settle();
    searchRequest('acme').flush([ACME]);
    fixture.detectChanges();
    expect(list().classList.contains('active')).toBe(true);

    keydown('Escape');
    expect(list().classList.contains('active')).toBe(false);
  });

  it('editing the text after a selection resets the model to null', () => {
    fixture.componentRef.setInput('customer', ACME);
    fixture.detectChanges();
    expect(input.value).toBe(ACME.name);

    type(ACME.name + 'x');
    expect(component.customer()).toBeNull();
    expect(input.value).toBe(ACME.name + 'x');

    settle();
    searchRequest(ACME.name + 'x').flush([]);
  });

  it('follows a programmatic model reset with an empty input', () => {
    fixture.componentRef.setInput('customer', ACME);
    fixture.detectChanges();
    expect(input.value).toBe(ACME.name);

    fixture.componentRef.setInput('customer', null);
    fixture.detectChanges();
    expect(input.value).toBe('');
  });

  it('shows an error row and no results when the request fails', () => {
    type('acme');
    settle();
    searchRequest('acme').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.autocomplete-item--error')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.autocomplete-item--add')).toBeNull();
    expect(component.customer()).toBeNull();
  });

  it('cancels an in-flight request when the text drops below 3 characters', () => {
    type('acme');
    settle();
    const req = searchRequest('acme');
    expect(req.cancelled).toBe(false);

    type('ac');
    expect(req.cancelled).toBe(true);
    expect(list().classList.contains('active')).toBe(false);
  });
});
