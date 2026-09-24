import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { CustomerDto } from '../../../api/models';
import { AddCustomerDialog } from './add-customer-dialog';

type DialogInternals = {
  form: {
    setValue: (v: {
      name: string;
      address: string;
      phone: string;
      email: string;
      companyRegNumber: string;
      contactName: string;
      contactPhone: string;
    }) => void;
  };
  onSubmit: () => void;
  error: () => string | null;
  saving: () => boolean;
};

const CREATED: CustomerDto = {
  id: 42,
  name: 'New Co',
  address: null,
  phone: null,
  email: null,
  companyRegNumber: null,
  contactName: null,
  contactPhone: null,
  isActive: true,
};

describe('AddCustomerDialog', () => {
  let fixture: ComponentFixture<AddCustomerDialog>;
  let component: AddCustomerDialog;
  let internals: DialogInternals;
  let http: HttpTestingController;
  let saved: CustomerDto[];
  let cancelled: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddCustomerDialog],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AddCustomerDialog);
    component = fixture.componentInstance;
    internals = component as unknown as DialogInternals;
    saved = [];
    cancelled = 0;
    component.saved.subscribe((c) => saved.push(c));
    component.cancelled.subscribe(() => cancelled++);
    fixture.componentRef.setInput('initialName', '  New Co ');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('renders as a modal dialog prefilled with the initial name', () => {
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const name = fixture.nativeElement.querySelector('#add-customer-name') as HTMLInputElement;
    expect(name.value).toBe('New Co');
  });

  it('does not post when the form is invalid and shows Hebrew errors', () => {
    internals.form.setValue({
      name: '   ',
      address: '',
      phone: '',
      email: 'not-an-email',
      companyRegNumber: '',
      contactName: '',
      contactPhone: '',
    });
    internals.onSubmit();
    fixture.detectChanges();

    http.expectNone('/api/customers');
    const errors = Array.from(
      fixture.nativeElement.querySelectorAll('.field-error') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent?.trim());
    expect(errors).toContain('יש להזין שם לקוח');
    expect(errors).toContain('יש להזין כתובת אימייל תקינה');
    expect(saved).toEqual([]);
  });

  it('posts a valid form and emits saved with the created customer', () => {
    internals.form.setValue({
      name: ' New Co ',
      address: '',
      phone: ' 050-1234567 ',
      email: 'a@b.com',
      companyRegNumber: '12345', // Validators.pattern(/^\d*$/) rejects surrounding whitespace
      contactName: ' Dana ',
      contactPhone: ' 050-7654321 ',
    });
    internals.onSubmit();
    fixture.detectChanges();

    expect(internals.saving()).toBe(true);
    const submit = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const req = http.expectOne('/api/customers');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'New Co',
      address: null,
      phone: '050-1234567',
      email: 'a@b.com',
      companyRegNumber: '12345',
      contactName: 'Dana',
      contactPhone: '050-7654321',
    });
    req.flush(CREATED);
    fixture.detectChanges();

    expect(saved).toEqual([CREATED]);
    expect(internals.saving()).toBe(false);
    expect(internals.error()).toBeNull();
  });

  it('shows a server error line when the save fails', () => {
    internals.form.setValue({
      name: 'New Co',
      address: '',
      phone: '',
      email: '',
      companyRegNumber: '',
      contactName: '',
      contactPhone: '',
    });
    internals.onSubmit();
    http.expectOne('/api/customers').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(saved).toEqual([]);
    expect(internals.error()).toBe('שמירת הלקוח נכשלה, נסה שוב');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'שמירת הלקוח נכשלה, נסה שוב',
    );
  });

  it('emits cancelled on the cancel button, Escape and backdrop click', () => {
    (fixture.nativeElement.querySelector('.btn-secondary') as HTMLButtonElement).click();
    expect(cancelled).toBe(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelled).toBe(2);

    (fixture.nativeElement.querySelector('.dialog-backdrop') as HTMLElement).click();
    expect(cancelled).toBe(3);

    // Clicks inside the card must not cancel.
    (fixture.nativeElement.querySelector('.dialog-card') as HTMLElement).click();
    expect(cancelled).toBe(3);
  });
});
