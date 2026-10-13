import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  Destination,
  Incoterm,
  INCOTERMS_BY_PAYMENT_TERMS,
  ImportDocumentType,
  OrderStatus,
  OrderStep,
  PaymentTerms,
  ShipmentType,
} from '../../../../api/enums';
import type { CustomerDto, OrderDto, UploadedImportFileDto } from '../../../../api/models';
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
  currentStep: () => OrderStep;
  furthestStep: () => OrderStep;
  stagedFiles: WritableSignal<Partial<Record<ImportDocumentType, File[]>>>;
  uploadedFiles: () => UploadedImportFileDto[];
  onSubmit: () => void;
  onNext: () => void;
  onPrevious: () => void;
  goToStep: (step: OrderStep) => void;
  onSave: () => void;
  onFinish: () => void;
  goToFiling: () => void;
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
  lastStep: OrderStep.CUSTOMER,
  isActive: true,
  mblId: null,
};

function uploadedFile(id: number, documentType: ImportDocumentType): UploadedImportFileDto {
  return {
    id,
    documentType,
    name: `${documentType}.pdf`,
    size: 1024,
    mimeType: 'application/pdf',
  } as UploadedImportFileDto;
}

function pdf(name: string): File {
  return new File(['%PDF'], name, { type: 'application/pdf' });
}

/** One file staged for each of the three mandatory order documents. */
const REQUIRED_STAGED = {
  [ImportDocumentType.BILL_OF_LADING]: [pdf('bl.pdf')],
  [ImportDocumentType.SUPPLIER_INVOICE]: [pdf('invoice.pdf')],
  [ImportDocumentType.PACKING_LIST]: [pdf('packing.pdf')],
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

  /** Answers the two requests an edit load makes: the order, then its filed documents. */
  function flushEditLoad(order: OrderDto = SAVED_ORDER, files: UploadedImportFileDto[] = []): void {
    httpMock.expectOne(`/api/orders/${order.id}`).flush(order);
    httpMock
      .expectOne((req) => req.method === 'GET' && req.url === '/api/import-files')
      .flush(files);
    fixture.detectChanges();
  }

  function uploadRequests() {
    return httpMock.match((req) => req.method === 'POST' && req.url === '/api/import-files');
  }

  function headerNumber(): string {
    return fixture.nativeElement.querySelector('.order-header__number')?.textContent?.trim() ?? '';
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

  function actionBarLabels(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.order-actions button') as NodeListOf<HTMLElement>,
    ).map((b) => b.textContent?.trim() ?? '');
  }

  function filingLink(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('.filing-link');
  }

  it('should create and show the handler name from the auth user', () => {
    createFixture();
    expect(fixture.componentInstance).toBeTruthy();
    expect(readonlyValue('פקיד מטפל')).toBe('דנה לוי');
    // No real id exists until the first save — the title carries no number yet.
    expect(headerNumber()).toBe('');
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
    expect(body['lastStep']).toBe(OrderStep.CUSTOMER);
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
    expect(headerNumber()).toBe('1001');
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

  describe('tabs', () => {
    it('"הבא" is blocked on the customer tab until a customer is picked', () => {
      createFixture();
      internals.onNext();
      fixture.detectChanges();

      expect(internals.currentStep()).toBe(OrderStep.CUSTOMER);
      expect(internals.customerError()).toBe('יש לבחור לקוח');
      expect(fixture.nativeElement.querySelector('.order-step--error')).toBeTruthy();
    });

    it('moves forward with "הבא", back with "הקודם", and remembers the furthest tab reached', () => {
      createFixture();
      internals.selectedCustomer.set(CUSTOMER);

      internals.onNext();
      internals.onNext();
      expect(internals.currentStep()).toBe(OrderStep.SCHEDULE);
      expect(internals.furthestStep()).toBe(OrderStep.SCHEDULE);

      internals.onPrevious();
      internals.onPrevious();
      expect(internals.currentStep()).toBe(OrderStep.CUSTOMER);
      expect(internals.furthestStep()).toBe(OrderStep.SCHEDULE);

      internals.goToStep(OrderStep.SCHEDULE); // visited — reachable by tab
      expect(internals.currentStep()).toBe(OrderStep.SCHEDULE);
    });

    it('a tab more than one past the furthest reached cannot be opened', () => {
      createFixture();
      internals.selectedCustomer.set(CUSTOMER);
      internals.goToStep(OrderStep.SCHEDULE);
      expect(internals.currentStep()).toBe(OrderStep.CUSTOMER);

      internals.goToStep(OrderStep.SHIPMENT); // the very next one is fine
      expect(internals.currentStep()).toBe(OrderStep.SHIPMENT);
    });

    it('Enter (form submit) advances a tab instead of saving', () => {
      createFixture();
      internals.selectedCustomer.set(CUSTOMER);
      internals.onSubmit();

      expect(internals.currentStep()).toBe(OrderStep.SHIPMENT);
      httpMock.expectNone('/api/orders');
    });

    it('saving progress mid-way sends the furthest tab reached as lastStep', () => {
      createFixture();
      internals.selectedCustomer.set(CUSTOMER);
      internals.onNext();
      internals.onSave();

      const req = httpMock.expectOne({ method: 'POST', url: '/api/orders' });
      expect((req.request.body as Record<string, unknown>)['lastStep']).toBe(OrderStep.SHIPMENT);
      req.flush({ ...SAVED_ORDER, lastStep: OrderStep.SHIPMENT });
      expect(internals.successMessage()).toBe('ההזמנה נשמרה — מספר הזמנה 1001');
    });

    it('saving without a customer jumps back to the customer tab', () => {
      createFixture();
      internals.goToStep(OrderStep.SHIPMENT); // allowed: the next tab
      internals.onSave();

      httpMock.expectNone('/api/orders');
      expect(internals.currentStep()).toBe(OrderStep.CUSTOMER);
    });

    it('reopening a saved order resumes on its last tab and lists its filed documents', () => {
      nav.editOrderId.set(1001);
      createFixture();
      flushEditLoad({ ...SAVED_ORDER, lastStep: OrderStep.SCHEDULE }, [
        uploadedFile(5, ImportDocumentType.BILL_OF_LADING),
      ]);

      expect(internals.currentStep()).toBe(OrderStep.SCHEDULE);
      expect(internals.furthestStep()).toBe(OrderStep.SCHEDULE);
      expect(internals.uploadedFiles().map((f) => f.id)).toEqual([5]);
    });
  });

  describe('onFinish ("סיום ומעבר לתיוק")', () => {
    it('is blocked until every mandatory document has a file, and shows which are missing', () => {
      createFixture();
      const openFilingFor = vi.spyOn(nav, 'openFilingFor').mockImplementation(() => {});
      internals.selectedCustomer.set(CUSTOMER);
      internals.stagedFiles.set({ [ImportDocumentType.BILL_OF_LADING]: [pdf('bl.pdf')] });

      internals.onFinish();
      fixture.detectChanges();

      httpMock.expectNone('/api/orders');
      expect(openFilingFor).not.toHaveBeenCalled();
      expect(internals.currentStep()).toBe(OrderStep.DOCUMENTS);
      expect(internals.errorMessage()).toBe('יש להעלות את המסמכים הנדרשים: חשבון ספק, מפרט אריזות');
      expect(fixture.nativeElement.querySelectorAll('.doc--error').length).toBe(2);
    });

    it('saves, uploads each staged document type, then navigates to filing for the order', () => {
      createFixture();
      const openFilingFor = vi.spyOn(nav, 'openFilingFor').mockImplementation(() => {});
      internals.selectedCustomer.set(CUSTOMER);
      internals.stagedFiles.set(REQUIRED_STAGED);

      internals.onFinish();
      httpMock.expectOne({ method: 'POST', url: '/api/orders' }).flush(SAVED_ORDER);
      expect(openFilingFor).not.toHaveBeenCalled(); // never before the uploads resolve

      const uploads = uploadRequests();
      expect(uploads.length).toBe(3);
      expect(uploads.every((r) => r.request.params.get('orderId') === '1001')).toBe(true);
      uploads.forEach((r, i) =>
        r.flush([uploadedFile(10 + i, (r.request.body as FormData).get('documentType') as ImportDocumentType)]),
      );

      expect(openFilingFor).toHaveBeenCalledWith({ kind: 'order', id: 1001 });
      expect(internals.stagedFiles()).toEqual({});
      expect(internals.uploadedFiles().length).toBe(3);
    });

    it('counts documents already filed on the server towards the requirement', () => {
      nav.editOrderId.set(1001);
      createFixture();
      flushEditLoad(SAVED_ORDER, [
        uploadedFile(1, ImportDocumentType.BILL_OF_LADING),
        uploadedFile(2, ImportDocumentType.SUPPLIER_INVOICE),
        uploadedFile(3, ImportDocumentType.PACKING_LIST),
      ]);
      const openFilingFor = vi.spyOn(nav, 'openFilingFor').mockImplementation(() => {});

      internals.onFinish();
      httpMock.expectOne({ method: 'PATCH', url: '/api/orders/1001' }).flush(SAVED_ORDER);

      expect(uploadRequests().length).toBe(0); // nothing staged
      expect(openFilingFor).toHaveBeenCalledWith({ kind: 'order', id: 1001 });
    });

    it('stays put and keeps the staged files when an upload fails', () => {
      createFixture();
      const openFilingFor = vi.spyOn(nav, 'openFilingFor').mockImplementation(() => {});
      internals.selectedCustomer.set(CUSTOMER);
      internals.stagedFiles.set(REQUIRED_STAGED);

      internals.onFinish();
      httpMock.expectOne({ method: 'POST', url: '/api/orders' }).flush(SAVED_ORDER);
      const [first, ...rest] = uploadRequests();
      first.flush({ message: 'too big' }, { status: 413, statusText: 'Payload Too Large' });
      rest.forEach((r) => expect(r.cancelled).toBe(true));

      expect(openFilingFor).not.toHaveBeenCalled();
      expect(internals.savedOrder()?.id).toBe(1001); // the order itself is saved
      expect(internals.errorMessage()).toBe('ההזמנה נשמרה, אך העלאת חלק מהמסמכים נכשלה');
      expect(internals.stagedFiles()).toEqual(REQUIRED_STAGED);
    });

    it('does not navigate and shows the error when the save fails', () => {
      createFixture();
      const openFilingFor = vi.spyOn(nav, 'openFilingFor').mockImplementation(() => {});
      internals.selectedCustomer.set(CUSTOMER);
      internals.stagedFiles.set(REQUIRED_STAGED);

      internals.onFinish();
      httpMock
        .expectOne('/api/orders')
        .flush({ message: 'incoterm mismatch' }, { status: 400, statusText: 'Bad Request' });

      expect(uploadRequests().length).toBe(0);
      expect(openFilingFor).not.toHaveBeenCalled();
      expect(internals.errorMessage()).toBe('שמירת ההזמנה נכשלה: incoterm mismatch');
    });
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
    expect(headerNumber()).toBe('');
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
      flushEditLoad();
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
      flushEditLoad();
      expect(internals.pageTitle()).toBe('עדכון הזמנה');

      vi.spyOn(window, 'confirm').mockReturnValue(true);
      internals.onCancel();
      fixture.detectChanges();

      expect(internals.pageTitle()).toBe('יצירת הזמנה חדשה');
    });

    it('resets to a blank "create" draft when "יצירת הזמנה חדשה" is re-selected while mid-edit, with no confirmation', () => {
      nav.editOrderId.set(1001);
      createFixture();
      flushEditLoad();
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

  describe('action bar', () => {
    it('shows cancel / save / next on the first tab, and no filing link for a new order', () => {
      createFixture();
      expect(actionBarLabels()).toEqual(['ביטול', 'שמירה', 'הבא']);
      expect(filingLink()).toBeNull(); // nothing saved yet to jump to
    });

    it('shows previous and finish on the last tab', () => {
      createFixture();
      internals.selectedCustomer.set(CUSTOMER);
      internals.onNext();
      internals.onNext();
      internals.onNext();
      fixture.detectChanges();

      expect(internals.currentStep()).toBe(OrderStep.DOCUMENTS);
      expect(actionBarLabels()).toEqual(['ביטול', 'שמירה', 'הקודם', 'סיום ומעבר לתיוק']);
    });

    it('editing an existing order shows the top-of-page filing link, and save just updates', () => {
      nav.editOrderId.set(1001);
      createFixture();
      flushEditLoad({ ...SAVED_ORDER, mblId: 7 });
      const openFilingFor = vi.spyOn(nav, 'openFilingFor').mockImplementation(() => {});

      const link = filingLink();
      expect(link).toBeTruthy();
      expect(link!.textContent?.trim()).toBe('מעבר לתיוק ניירת יבוא');

      internals.onSave();
      httpMock.expectOne({ method: 'PATCH', url: '/api/orders/1001' }).flush(SAVED_ORDER);
      expect(openFilingFor).not.toHaveBeenCalled();
      expect(internals.successMessage()).toBe('ההזמנה נשמרה — מספר הזמנה 1001');
    });

    it('the top-of-page filing link navigates straight to the order, with no save request at all', () => {
      nav.editOrderId.set(1001);
      createFixture();
      flushEditLoad({ ...SAVED_ORDER, mblId: 7 });
      const openFilingFor = vi.spyOn(nav, 'openFilingFor').mockImplementation(() => {});

      internals.goToFiling();

      expect(openFilingFor).toHaveBeenCalledWith({ kind: 'order', id: 1001 });
      httpMock.expectNone({ method: 'PATCH', url: '/api/orders/1001' });
      httpMock.expectNone({ method: 'POST', url: '/api/orders' });
    });
  });
});
