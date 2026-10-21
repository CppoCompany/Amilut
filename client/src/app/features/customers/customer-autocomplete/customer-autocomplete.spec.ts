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
  companyRegNumber: null,
  contactName: null,
  contactPhone: null,
  isActive: true,
};

const BETA: CustomerDto = {
  id: 2,
  name: 'Beta Trading',
  address: null,
  phone: null,
  email: null,
  companyRegNumber: null,
  contactName: null,
  contactPhone: null,
  isActive: true,
};

describe('CustomerAutocomplete', () => {
  let fixture: ComponentFixture<CustomerAutocomplete>;
  let component: CustomerAutocomplete;
  let http: HttpTestingController;
  let input: HTMLInputElement;

  /** Types into PrimeNG's input, which debounces and enforces the minimum length. */
  const type = (value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };

  const settle = (): void => {
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    fixture.detectChanges();
  };

  const searchRequest = (q: string) =>
    http.expectOne((r) => r.url === '/api/customers' && r.params.get('q') === q);

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
  });

  it('does not call the API below 3 characters', () => {
    type('ab');
    settle();
    http.expectNone((r) => r.url === '/api/customers');
  });

  it('sends one debounced request for "abc"', () => {
    type('a');
    type('ab');
    type('abc');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    http.expectNone((r) => r.url === '/api/customers');

    vi.advanceTimersByTime(1);
    searchRequest('abc').flush([ACME, BETA]);
    fixture.detectChanges();
    expect(component.results()).toEqual([ACME, BETA]);
  });

  it('trims the query and ignores whitespace-only padding', () => {
    type('  abc  ');
    settle();
    searchRequest('abc').flush([]);
  });

  it('selecting an item sets the model and the text, and clears the results', () => {
    type('acm');
    settle();
    searchRequest('acm').flush([ACME]);

    component.select(ACME);
    fixture.detectChanges();

    expect(component.customer()).toEqual(ACME);
    expect(component.text()).toBe(ACME.name);
    expect(component.results()).toEqual([]);
  });

  it('offers the "add new customer" row when the search has zero results', () => {
    type('zzz');
    settle();
    expect(component.showAddRow()).toBe(false); // still loading

    searchRequest('zzz').flush([]);
    expect(component.showAddRow()).toBe(true);
    expect(component.lastQuery()).toBe('zzz');
  });

  it('the add row opens the dialog prefilled with the typed text', () => {
    type('New Co');
    settle();
    searchRequest('New Co').flush([]);

    component.openDialog();
    fixture.detectChanges();

    const name = fixture.nativeElement.querySelector('#add-customer-name') as HTMLInputElement;
    expect(name).toBeTruthy();
    expect(name.value).toBe('New Co');
  });

  it('editing the text after a selection resets the model to null', () => {
    component.select(ACME);
    fixture.detectChanges();

    component.onValueChange('Acme Imp');
    expect(component.customer()).toBeNull();
    expect(component.text()).toBe('Acme Imp');
  });

  it('follows a programmatic model reset with an empty text', () => {
    component.customer.set(ACME);
    fixture.detectChanges();
    expect(component.text()).toBe(ACME.name);

    component.customer.set(null);
    fixture.detectChanges();
    expect(component.text()).toBe('');
  });

  it('flags an error and no results when the request fails', () => {
    type('abc');
    settle();
    searchRequest('abc').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(component.error()).toBe(true);
    expect(component.results()).toEqual([]);
    expect(component.showAddRow()).toBe(false);
  });

  it('cancels an in-flight request when the text drops below 3 characters', () => {
    type('abc');
    settle();
    const req = searchRequest('abc');

    type('ab');
    expect(req.cancelled).toBe(true);
    expect(component.loading()).toBe(false);
  });
});
