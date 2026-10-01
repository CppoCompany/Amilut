import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  Destination,
  Incoterm,
  INCOTERMS_BY_PAYMENT_TERMS,
  OrderStatus,
  PaymentTerms,
  ShipmentType,
} from '../../../../api/enums';
import type { CustomerDto, OrderDto } from '../../../../api/models';
import { AuthService } from '../../../../core/auth/auth.service';
import { NavigationService } from '../../navigation.service';
import { OrderScreen } from './order';

type OrderInternals = {
  selectedCustomer: WritableSignal<CustomerDto | null>;
  savedOrder: () => OrderDto | null;
  customerError: () => string | null;
  successMessage: () => string | null;
  errorMessage: () => string | null;
  saving: () => boolean;
  paymentTerms: WritableSignal<PaymentTerms>;
  incoterm: WritableSignal<Incoterm>;
  shipmentType: WritableSignal<ShipmentType>;
  pageTitle: () => string;
  form: {
    patchValue: (v: Partial<Record<string, string>>) => void;
    getRawValue: () => Record<string, string>;
  };
  onSave: () => void;
  onCancel: () => void;
};

const CUSTOMER: CustomerDto = {
  id: 3,
  name: 'ACME בע"מ',
  address: null,
  phone: null,
  email: null,
  companyRegNumber: null,
  contactName: null,
  contactPhone: null,
  isActive: true,
};

const SAVED_ORDER: OrderDto = {
  id: 1001,
  customerId: 3,
  customerName: CUSTOMER.name,
  handlerUserId: 7,
  handlerName: 'דנה לוי',
  createdAt: '2026-09-01T08:30:00.000Z',
  updatedAt: '2026-09-01T08:30:00.000Z',
  status: OrderStatus.PREPARING,
  shipmentType: ShipmentType.SEA,
  paymentTerms: PaymentTerms.PREPAID,
  incoterm: Incoterm.CFR,
  destination: Destination.ASHDOD,
  supplierId: null,
  supplierName: null,
  factoryReadyDate: null,
  factoryPickupDate: null,
  departureDate: null,
  etaDate: null,
  shippingLine: null,
  voyageNumber: null,
  airline: null,
  flightNumber: null,
  isActive: true,
};

describe('OrderScreen', () => {
  let fixture: ComponentFixture<OrderScreen>;
  let internals: OrderInternals;
  let httpMock: HttpTestingController;
  let nav: NavigationService;

  beforeEach(async () => {
    const authMock = {
      user: signal({ id: 7, email: 'dana@amilut.co.il', name: 'דנה לוי', role: 'user' }),
    };

    await TestBed.configureTestingModule({
      imports: [OrderScreen],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authMock },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    nav = TestBed.inject(NavigationService);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  /** Creates the component now — call after any `nav` setup a test needs in
   *  place before the constructor runs (e.g. `nav.editOrderId.set(...)`). */
  function createFixture(): void {
    fixture = TestBed.createComponent(OrderScreen);
    internals = fixture.componentInstance as unknown as OrderInternals;
    fixture.detectChanges();
  }

  function readonlyValue(label: string): string {
    const groups = Array.from(
      fixture.nativeElement.querySelectorAll('.form-group'),
    ) as HTMLElement[];
    const group = groups.find((g) => g.querySelector('label')?.textContent?.trim() === label);
    return (group?.querySelector('input') as HTMLInputElement).value;
  }

  function pageTitleText(): string {
    return fixture.nativeElement.querySelector('.page-title')?.textContent?.trim() ?? '';
  }

  it('should create and show the handler name from the auth user', () => {
    createFixture();
    expect(fixture.componentInstance).toBeTruthy();
    expect(readonlyValue('פקיד מטפל')).toBe('דנה לוי');
    // No real id/createdAt exist until the first save — see order.ts's orderNumber/creationDate.
    expect(readonlyValue('מספר הזמנה פנימי')).toBe('יוקצה אוטומטית לאחר השמירה');
    expect(readonlyValue('תאריך פתיחת הזמנה')).not.toBe('—'); // shows today's date pre-save
  });

  it('shows an error and makes no request when saving without a customer', () => {
    createFixture();
    internals.onSave();
    fixture.detectChanges();

    expect(internals.customerError()).toBe('יש לבחור לקוח');
    expect(fixture.nativeElement.querySelector('.field-error')?.textContent?.trim()).toBe(
      'יש לבחור לקוח',
    );
    httpMock.expectNone('/api/orders');
  });

  it('posts a CreateOrderDto without server-owned fields and renders the order number', () => {
    createFixture();
    internals.selectedCustomer.set(CUSTOMER);
    internals.form.patchValue({ factoryReadyDate: '2026-09-01', shippingLine: 'ZIM', etaDate: '' });
    internals.onSave();

    const req = httpMock.expectOne('/api/orders');
    expect(req.request.method).toBe('POST');
    const body = req.request.body as Record<string, unknown>;
    expect(body['customerId']).toBe(3);
    expect(body['status']).toBe(OrderStatus.PREPARING);
    expect(body['shipmentType']).toBe(ShipmentType.SEA);
    expect(body['paymentTerms']).toBe(PaymentTerms.PREPAID);
    expect(body['incoterm']).toBe(Incoterm.CFR);
    expect(body['destination']).toBe(Destination.ASHDOD);
    expect(body['factoryReadyDate']).toBe('2026-09-01');
    expect(body['shippingLine']).toBe('ZIM');
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('createdAt');
    expect(body).not.toHaveProperty('handlerUserId');
    expect(body).not.toHaveProperty('handlerName');
    expect(body).not.toHaveProperty('etaDate');
    expect(body).not.toHaveProperty('airline');
    expect(internals.saving()).toBe(true);

    req.flush(SAVED_ORDER);
    fixture.detectChanges();

    expect(internals.saving()).toBe(false);
    expect(internals.savedOrder()?.id).toBe(1001);
    expect(internals.successMessage()).toBe('ההזמנה נשמרה — מספר הזמנה 1001');
    expect(readonlyValue('מספר הזמנה פנימי')).toBe('1001');
    expect(readonlyValue('תאריך פתיחת הזמנה')).not.toBe('—');
  });

  it('patches the saved order on subsequent saves instead of creating a duplicate', () => {
    createFixture();
    internals.selectedCustomer.set(CUSTOMER);
    internals.onSave();
    httpMock.expectOne({ method: 'POST', url: '/api/orders' }).flush(SAVED_ORDER);

    internals.form.patchValue({ voyageNumber: 'ZIM123E' });
    internals.onSave();

    const patch = httpMock.expectOne({ method: 'PATCH', url: '/api/orders/1001' });
    expect((patch.request.body as Record<string, unknown>)['voyageNumber']).toBe('ZIM123E');
    patch.flush({ ...SAVED_ORDER, voyageNumber: 'ZIM123E' });

    expect(internals.savedOrder()?.voyageNumber).toBe('ZIM123E');
  });

  it('shows a Hebrew error with the server message when saving fails', () => {
    createFixture();
    internals.selectedCustomer.set(CUSTOMER);
    internals.onSave();

    httpMock
      .expectOne('/api/orders')
      .flush({ message: 'incoterm mismatch' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(internals.errorMessage()).toBe('שמירת ההזמנה נכשלה: incoterm mismatch');
    expect(internals.savedOrder()).toBeNull();
    expect(internals.saving()).toBe(false);
  });

  it('resets incoterm to the first allowed code when payment terms change', () => {
    createFixture();
    expect(internals.incoterm()).toBe(INCOTERMS_BY_PAYMENT_TERMS[PaymentTerms.PREPAID][0]);

    internals.incoterm.set(Incoterm.CIP);
    expect(internals.incoterm()).toBe(Incoterm.CIP);

    internals.paymentTerms.set(PaymentTerms.COLLECT);
    expect(internals.incoterm()).toBe(INCOTERMS_BY_PAYMENT_TERMS[PaymentTerms.COLLECT][0]);
    expect(INCOTERMS_BY_PAYMENT_TERMS[PaymentTerms.COLLECT]).toContain(internals.incoterm());

    internals.paymentTerms.set(PaymentTerms.PREPAID);
    expect(internals.incoterm()).toBe(Incoterm.CFR);
  });

  it('cancel clears the customer, the saved order and the form after confirmation', () => {
    createFixture();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    internals.selectedCustomer.set(CUSTOMER);
    internals.form.patchValue({ shippingLine: 'Maersk' });
    internals.onSave();
    httpMock.expectOne('/api/orders').flush(SAVED_ORDER);
    fixture.detectChanges();

    internals.onCancel();
    fixture.detectChanges();

    expect(window.confirm).toHaveBeenCalled();
    expect(internals.selectedCustomer()).toBeNull();
    expect(internals.savedOrder()).toBeNull();
    expect(internals.form.getRawValue()['shippingLine']).toBe('');
    expect(internals.customerError()).toBeNull();
    expect(readonlyValue('מספר הזמנה פנימי')).toBe('יוקצה אוטומטית לאחר השמירה');
  });

  it('cancel does nothing if the confirmation is declined', () => {
    createFixture();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    internals.selectedCustomer.set(CUSTOMER);

    internals.onCancel();
    fixture.detectChanges();

    expect(internals.selectedCustomer()).toEqual(CUSTOMER);
  });

  describe('page title / create vs. edit mode', () => {
    it('shows the "create" title when opened fresh (no queued editOrderId)', () => {
      createFixture();
      expect(internals.pageTitle()).toBe('יצירת הזמנה חדשה');
      expect(pageTitleText()).toBe('יצירת הזמנה חדשה');
    });

    it('shows the "update" title when opened via a queued editOrderId, even before the fetch resolves', () => {
      nav.editOrderId.set(1001);
      createFixture();

      expect(internals.pageTitle()).toBe('עדכון הזמנה');
      httpMock.expectOne('/api/orders/1001').flush(SAVED_ORDER);
      fixture.detectChanges();
      expect(internals.pageTitle()).toBe('עדכון הזמנה'); // unaffected by the load resolving
    });

    it('stays on the "create" title after a brand-new order is saved for the first time', () => {
      createFixture();
      internals.selectedCustomer.set(CUSTOMER);
      internals.onSave();
      httpMock.expectOne('/api/orders').flush(SAVED_ORDER);
      fixture.detectChanges();

      // Saved successfully, but this session's intent was always "create new".
      expect(internals.pageTitle()).toBe('יצירת הזמנה חדשה');
    });

    it('cancel reverts the title back to "create" after editing an existing order', () => {
      nav.editOrderId.set(1001);
      createFixture();
      httpMock.expectOne('/api/orders/1001').flush(SAVED_ORDER);
      fixture.detectChanges();
      expect(internals.pageTitle()).toBe('עדכון הזמנה');

      vi.spyOn(window, 'confirm').mockReturnValue(true);
      internals.onCancel();
      fixture.detectChanges();

      expect(internals.pageTitle()).toBe('יצירת הזמנה חדשה');
    });

    it('resets to a blank "create" draft when "יצירת הזמנה חדשה" is re-selected while mid-edit, with no confirmation', () => {
      nav.editOrderId.set(1001);
      createFixture();
      httpMock.expectOne('/api/orders/1001').flush(SAVED_ORDER);
      fixture.detectChanges();
      expect(internals.selectedCustomer()?.id).toBe(3);
      expect(internals.pageTitle()).toBe('עדכון הזמנה');

      const confirmSpy = vi.spyOn(window, 'confirm');
      nav.newOrderRequested.update((n) => n + 1); // same signal `selectChild` bumps on that sidebar click
      fixture.detectChanges(); // flushes the effect watching newOrderRequested

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(internals.selectedCustomer()).toBeNull();
      expect(internals.savedOrder()).toBeNull();
      expect(internals.pageTitle()).toBe('יצירת הזמנה חדשה');
    });
  });
});
