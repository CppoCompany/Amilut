import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import {
  Destination,
  Incoterm,
  MblShippingType,
  MblStatus,
  OrderStatus,
  OrderStep,
  PaymentTerms,
  SeaMethod,
  ShipmentType,
} from '../../../../api/enums';
import type {
  BillOfLadingExtractDto,
  CustomerDto,
  HblDto,
  MblContainerDto,
  MblDocumentExtractDto,
  MblDto,
  OrderDto,
} from '../../../../api/models';
import { NavigationService } from '../../navigation.service';
import { ShipmentCaseWizardScreen } from './shipment-case-wizard';

/** Only the "מעבר לתיק הסליקה" link cares about `ccfId`; every other field is
 *  an arbitrary valid placeholder. */
const MINIMAL_MBL: MblDto = {
  id: 7,
  shippingType: MblShippingType.SEA,
  seaMethod: SeaMethod.FCL_FCL,
  customerId: null,
  customerName: null,
  mblNumber: 'MBL-007',
  bookingNumber: null,
  vesselName: null,
  voyageNumber: null,
  portOfLoading: null,
  portOfDischarge: null,
  finalDestination: null,
  shipperName: null,
  shipperAddress: null,
  consigneeName: null,
  consigneeAddress: null,
  notifyPartyName: null,
  notifyPartyAddress: null,
  containerNumber: null,
  containerSealNumber: null,
  cargoDescription: null,
  grossWeightKg: null,
  volumeCbm: null,
  freightTerms: null,
  receiptDeliveryType: null,
  placeOfIssue: null,
  dateOfIssue: null,
  carrierName: null,
  status: MblStatus.OPEN,
  handlerUserId: null,
  handlerName: null,
  ccfId: null,
  containers: [],
  createdAt: '2026-09-01T08:30:00.000Z',
  updatedAt: '2026-09-01T08:30:00.000Z',
};

const CUSTOMER: CustomerDto = {
  id: 5,
  name: 'אלפא בע"מ',
  address: null,
  phone: null,
  email: null,
  companyRegNumber: null,
  contactName: null,
  contactPhone: null,
  isActive: true,
};

const EMPTY_MBL_EXTRACT: MblDocumentExtractDto = {
  mblNumber: null,
  bookingNumber: null,
  vesselName: null,
  voyageNumber: null,
  portOfLoading: null,
  portOfDischarge: null,
  finalDestination: null,
  carrierName: null,
  shipperName: null,
  shipperAddress: null,
  consigneeName: null,
  consigneeAddress: null,
  notifyPartyName: null,
  notifyPartyAddress: null,
  freightTerms: null,
  receiptDeliveryType: null,
  placeOfIssue: null,
  dateOfIssue: null,
  totalPackages: null,
  grossWeightKg: null,
  volumeCbm: null,
  containers: [],
};

/** What the server reads out of an order holding both sample documents. */
const SAMPLE_EXTRACT: BillOfLadingExtractDto = {
  mblFileName: 'MBL.html',
  mbl: {
    ...EMPTY_MBL_EXTRACT,
    mblNumber: 'NGB-LCL-2026-7731',
    bookingNumber: 'BKG-CFS-8820',
    vesselName: 'OOCL HONG KONG',
    voyageNumber: '088E',
    portOfLoading: 'Shanghai, China',
    freightTerms: PaymentTerms.PREPAID,
    containers: [
      {
        containerNumber: 'BMOU4512398',
        containerSealNumber: 'SL-332211',
        cargoDescription: 'LCL CONSOL',
        grossWeightKg: 8950,
        volumeCbm: 32.4,
      },
    ],
  },
  mblError: null,
  hblFileName: 'שטר מטען.pdf',
  hbls: [
    {
      hblNumber: 'HBL-NGB-LCL-2026-7731-01',
      shipperName: null,
      shipperAddress: null,
      consigneeName: null,
      consigneeAddress: null,
      notifyPartyName: null,
      notifyPartyAddress: null,
      cargoDescription: 'Said to contain: machinery packed in 8 wooden crates.',
      quantity: '8 wooden crates',
      grossWeightKg: null,
      volumeCbm: null,
      remarks: 'LCL CONSOL / CFS TO CFS',
      master: EMPTY_MBL_EXTRACT,
    },
  ],
  hblError: null,
};

type WizardInternals = {
  savedMbl: WritableSignal<MblDto | null>;
  hbls: WritableSignal<HblDto[]>;
  hblContainerId: WritableSignal<number | null>;
  hblCustomer: WritableSignal<CustomerDto | null>;
  editingHblId: WritableSignal<number | null>;
  showHblForm: WritableSignal<boolean>;
};

function container(id: number): MblContainerDto {
  return {
    id,
    containerNumber: `CONT-${id}`,
    containerSealNumber: null,
    cargoDescription: null,
    grossWeightKg: null,
    volumeCbm: null,
  };
}

/** A saved File with no associated orders (so opening it for edit makes no HTTP call). */
function hbl(id: number, overrides: Partial<HblDto> = {}): HblDto {
  return {
    id,
    mblId: MINIMAL_MBL.id,
    containerId: null,
    customerId: 100 + id,
    customerName: `לקוח ${id}`,
    sequenceNumber: id,
    iblNumber: null,
    hblNumber: `HBL-00${id}`,
    shipperName: null,
    shipperAddress: null,
    consigneeName: null,
    consigneeAddress: null,
    notifyPartyName: null,
    notifyPartyAddress: null,
    cargoDescription: null,
    quantity: null,
    grossWeightKg: null,
    volumeCbm: null,
    remarks: null,
    orders: [],
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    ...overrides,
  };
}

function order(id: number): OrderDto {
  return {
    id,
    customerId: CUSTOMER.id,
    customerName: CUSTOMER.name,
    handlerUserId: null,
    handlerName: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    status: OrderStatus.PREPARING,
    shipmentType: ShipmentType.SEA,
    paymentTerms: PaymentTerms.PREPAID,
    incoterm: Incoterm.CFR,
    destination: Destination.HAIFA,
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
}

describe('ShipmentCaseWizardScreen', () => {
  let fixture: ComponentFixture<ShipmentCaseWizardScreen>;
  let nav: NavigationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ShipmentCaseWizardScreen],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    nav = TestBed.inject(NavigationService);
    fixture = TestBed.createComponent(ShipmentCaseWizardScreen);
    fixture.detectChanges();
  });

  function internals(): WizardInternals {
    return fixture.componentInstance as unknown as WizardInternals;
  }

  function methodCards(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.method-card'));
  }

  function sectionTitle(): string {
    return fixture.nativeElement.querySelector('.section-title')?.textContent?.trim() ?? '';
  }

  function hintText(): string {
    return fixture.nativeElement.querySelector('.hint-text')?.textContent?.trim() ?? '';
  }

  /** The "התקדמות התיק" sidebar links — the wizard's only backward navigation. */
  function stepLinks(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.wizard-step__link'));
  }

  function backButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('.back-btn');
  }

  function hblForm(): HTMLFormElement | null {
    return fixture.nativeElement.querySelector('.hbl-form');
  }

  /** Clicks through to the first File's form (ימי → the given method). */
  function openFileForm(seaMethod = SeaMethod.FCL_FCL): void {
    methodCards()[0].click(); // ימי
    fixture.detectChanges();
    const index = [
      SeaMethod.FCL_FCL,
      SeaMethod.FCL_LCL,
      SeaMethod.LCL_LCL,
      SeaMethod.GROUPAGE_FCL,
    ].indexOf(seaMethod);
    methodCards()[index].click();
    fixture.detectChanges();
  }

  it('starts on step 1 with the two Hebrew shipping-type options', () => {
    expect(sectionTitle()).toContain('בחירת סוג משלוח');
    const cards = methodCards();
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('ימי');
    expect(cards[1].textContent).toContain('אווירי');
    expect(stepLinks()[0].disabled).toBe(true); // already on step 1
  });

  it('selecting אווירי shows a blank/placeholder page, not the sea method step', () => {
    methodCards()[1].click(); // אווירי
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.method-card')).toBeNull();
    expect(hintText()).toContain('אווירי');
    expect(backButton()).toBeNull(); // no in-form back button anywhere in the flow
    expect(stepLinks()[0].disabled).toBe(false); // "סוג משלוח" link is the way back
  });

  it('selecting ימי shows the four sea freight methods', () => {
    methodCards()[0].click(); // ימי
    fixture.detectChanges();

    const cards = methodCards();
    expect(cards.length).toBe(4);
    expect(cards.map((c) => c.querySelector('.method-card__label')?.textContent?.trim())).toEqual([
      'FCL / FCL',
      'FCL / LCL',
      'LCL / LCL',
      'Groupage FCL',
    ]);
  });

  it('selecting a sea method opens the first File form at once, "לשיוך להזמנה" first', () => {
    openFileForm(SeaMethod.LCL_LCL);

    expect(sectionTitle()).toContain('LCL / LCL');
    expect(sectionTitle()).toContain('יצירת Files');
    expect(fixture.nativeElement.querySelector('.method-card')).toBeNull();
    const form = hblForm();
    expect(form).not.toBeNull();
    // The order association section precedes every other field of the form.
    const firstTitle = form!.querySelector('.subsection-title');
    expect(firstTitle?.textContent).toContain('שיוך הזמנות');
    expect(form!.querySelector('.orders-assoc')).not.toBeNull();
    const submit: HTMLButtonElement = form!.querySelector('button[type="submit"]')!;
    expect(submit.textContent).toContain('שמור File והמשך ל-Job');
  });

  it('has no in-form back buttons on the File step — the sidebar links replace them', () => {
    openFileForm();

    expect(backButton()).toBeNull();
  });

  it('"סוג משלוח" from the sea method list returns to step 1 (shipping type)', () => {
    methodCards()[0].click(); // ימי
    fixture.detectChanges();
    expect(backButton()).toBeNull();

    stepLinks()[0].click();
    fixture.detectChanges();

    expect(sectionTitle()).toContain('בחירת סוג משלוח');
    expect(methodCards().length).toBe(2);
  });

  it('"סוג משלוח" from אווירי returns to step 1', () => {
    methodCards()[1].click(); // אווירי
    fixture.detectChanges();

    stepLinks()[0].click();
    fixture.detectChanges();

    expect(sectionTitle()).toContain('בחירת סוג משלוח');
  });

  it('re-selecting "יצירת תיק שילוח" from the sidebar resets a mid-wizard screen back to step 1', () => {
    openFileForm();
    expect(sectionTitle()).toContain('FCL / FCL');

    nav.newCaseRequested.update((n) => n + 1); // same signal selectChild bumps on that sidebar click
    fixture.detectChanges(); // flushes the effect watching newCaseRequested

    expect(sectionTitle()).toContain('בחירת סוג משלוח');
    expect(methodCards().length).toBe(2);
  });

  describe('"מעבר לתיק הסליקה" link', () => {
    function filingLink(): HTMLButtonElement | null {
      return fixture.nativeElement.querySelector('.filing-link');
    }

    it('is absent before any case is saved', () => {
      expect(filingLink()).toBeNull();
    });

    it('is absent when the saved case has no linked CCF', () => {
      internals().savedMbl.set({ ...MINIMAL_MBL, ccfId: null });
      fixture.detectChanges();

      expect(filingLink()).toBeNull();
    });

    it('appears and navigates to the CCF when the saved case has one', () => {
      const openCcfForView = vi.spyOn(nav, 'openCcfForView').mockImplementation(() => {});
      internals().savedMbl.set({ ...MINIMAL_MBL, ccfId: 42 });
      fixture.detectChanges();

      const link = filingLink();
      expect(link).not.toBeNull();
      link!.click();

      expect(openCcfForView).toHaveBeenCalledWith(42);
    });
  });

  describe('"התקדמות התיק" step links', () => {
    function stepLabels(): string[] {
      return stepLinks().map((link) => link.textContent?.trim() ?? '');
    }

    it('lists the four sea stations as File before Job, the current one disabled', () => {
      openFileForm();

      expect(stepLabels()).toEqual(['סוג משלוח', 'שיטת שילוח ימי', 'File', 'Job']);
      const [type, method, files, job] = stepLinks();
      expect(type.disabled).toBe(false);
      expect(method.disabled).toBe(false);
      expect(files.disabled).toBe(true); // current
      expect(job.disabled).toBe(true); // no Job exists until the first File is saved
      expect(files.getAttribute('aria-current')).toBe('step');
    });

    it('"סוג משלוח" from the File form goes back to step 1', () => {
      openFileForm();

      stepLinks()[0].click();
      fixture.detectChanges();

      expect(sectionTitle()).toContain('בחירת סוג משלוח');
      expect(methodCards().length).toBe(2);
    });

    it('"שיטת שילוח ימי" from the File form goes back to step 2', () => {
      openFileForm();

      stepLinks()[1].click();
      fixture.detectChanges();

      expect(sectionTitle()).toContain('בחירת שיטת שילוח ימי');
    });

    it('once a Job exists, steps 1/2 open read-only: the choice is highlighted, cards disabled, nothing reset', () => {
      openFileForm();
      internals().savedMbl.set({ ...MINIMAL_MBL });
      fixture.detectChanges();

      stepLinks()[0].click(); // סוג משלוח
      fixture.detectChanges();

      expect(sectionTitle()).toContain('בחירת סוג משלוח');
      expect(fixture.nativeElement.querySelector('.method-locked-hint')).not.toBeNull();
      const typeCards = methodCards();
      expect(typeCards.every((card) => card.disabled)).toBe(true);
      expect(typeCards[0].classList).toContain('method-card--selected'); // ימי
      expect(typeCards[1].classList).not.toContain('method-card--selected');
      expect(internals().savedMbl()).not.toBeNull(); // the Job was not dropped

      stepLinks()[1].click(); // שיטת שילוח ימי
      fixture.detectChanges();
      expect(sectionTitle()).toContain('בחירת שיטת שילוח ימי');
      const methodCardsNow = methodCards();
      expect(methodCardsNow.length).toBe(4);
      expect(methodCardsNow.every((card) => card.disabled)).toBe(true);
      expect(methodCardsNow[0].classList).toContain('method-card--selected'); // FCL / FCL

      stepLinks()[2].click(); // File
      fixture.detectChanges();
      expect(sectionTitle()).toContain('יצירת Files');
      expect(fixture.nativeElement.querySelector('.form-message--success')).toBeNull();
    });

    it('before a Job exists, steps 1/2 stay live: "סוג משלוח" goes back and lets the type be re-chosen', () => {
      openFileForm();

      stepLinks()[0].click();
      fixture.detectChanges();

      const cards = methodCards();
      expect(cards.every((card) => card.disabled)).toBe(false);
      expect(fixture.nativeElement.querySelector('.method-locked-hint')).toBeNull();
      cards[1].click(); // אווירי — the choice can change
      fixture.detectChanges();
      expect(hintText()).toContain('אווירי');
    });

    it('once a Job exists, "Job" opens its form and "File" returns to the Files step', () => {
      openFileForm();
      internals().savedMbl.set({ ...MINIMAL_MBL });
      fixture.detectChanges();
      expect(sectionTitle()).toContain('יצירת Files');
      expect(stepLinks()[3].disabled).toBe(false);

      stepLinks()[3].click(); // Job
      fixture.detectChanges();
      expect(sectionTitle()).toContain('טופס Job');
      expect(stepLinks()[3].disabled).toBe(true);
      expect(stepLinks()[2].disabled).toBe(false);

      stepLinks()[2].click(); // File
      fixture.detectChanges();
      expect(sectionTitle()).toContain('יצירת Files');
    });
  });

  describe('File (HBL) form', () => {
    let httpMock: HttpTestingController;

    /** The first File's form (open by itself) under a Job that already exists
     *  (two containers when groupage), as when a case is being extended. */
    function openNewFileFormUnderSavedJob(seaMethod = SeaMethod.GROUPAGE_FCL): void {
      openFileForm(seaMethod);
      internals().savedMbl.set({
        ...MINIMAL_MBL,
        seaMethod,
        containers: [container(1), container(2)],
      });
      fixture.detectChanges();
      expect(hblForm()).not.toBeNull();
    }

    function hblNumberInput(): HTMLInputElement {
      return fixture.nativeElement.querySelector('#hblNumber');
    }

    function containerButtons(): HTMLButtonElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll('.hbl-form p-togglebutton'));
    }

    function typeHblNumber(value: string): void {
      const input = hblNumberInput();
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('switching to a different container clears what was typed so far', () => {
      openNewFileFormUnderSavedJob();
      const [first, second] = containerButtons();

      first.click();
      fixture.detectChanges();
      typeHblNumber('HBL-1');
      expect(first.getAttribute('aria-pressed')).toBe('true');

      second.click();
      fixture.detectChanges();

      expect(second.getAttribute('aria-pressed')).toBe('true');
      expect(hblNumberInput().value).toBe('');
      expect(internals().hblContainerId()).toBe(2);
    });

    it('re-clicking the already-selected container keeps the form as is', () => {
      openNewFileFormUnderSavedJob();
      const [first] = containerButtons();

      first.click();
      fixture.detectChanges();
      typeHblNumber('HBL-1');
      first.click();
      fixture.detectChanges();

      expect(hblNumberInput().value).toBe('HBL-1');
    });

    it('groupage before the Job exists asks for the container number instead of a choice', () => {
      openFileForm(SeaMethod.GROUPAGE_FCL);

      expect(containerButtons().length).toBe(0);
      expect(fixture.nativeElement.querySelector('#hblNewContainerNumber')).not.toBeNull();
    });

    it('shows the orders grid only in the "לשיוך להזמנה" popup, not inline', () => {
      openNewFileFormUnderSavedJob(SeaMethod.FCL_FCL);

      expect(fixture.nativeElement.querySelector('app-hbl-orders-picker-dialog')).toBeNull();
      expect(fixture.nativeElement.querySelector('.hbl-form p-table')).toBeNull();
      const link: HTMLButtonElement = fixture.nativeElement.querySelector('.orders-assoc__link');
      expect(link.textContent).toContain('לשיוך להזמנה');

      link.click();
      fixture.detectChanges();

      const dialog = fixture.nativeElement.querySelector('app-hbl-orders-picker-dialog');
      expect(dialog).not.toBeNull();
      const request = httpMock.expectOne((req) => req.url.endsWith('/api/orders'));
      expect(request.request.params.get('hasHbl')).toBe('false');
      request.flush([]);
      fixture.detectChanges();
      expect(dialog.textContent).toContain('לא נמצאו הזמנות ללא שיוך');

      // "ביטול" closes it without touching the selection.
      const cancel: HTMLButtonElement = dialog.querySelector('.dialog-cancel');
      cancel.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-hbl-orders-picker-dialog')).toBeNull();
    });

    it('picking an order reads its HBL/MBL paperwork into the File and takes its customer', () => {
      openFileForm(SeaMethod.FCL_FCL);
      (fixture.nativeElement.querySelector('.orders-assoc__link') as HTMLButtonElement).click();
      fixture.detectChanges();
      httpMock.expectOne((req) => req.url.endsWith('/api/orders')).flush([order(1001)]);
      fixture.detectChanges();

      const dialog: HTMLElement = fixture.nativeElement.querySelector(
        'app-hbl-orders-picker-dialog',
      );
      const rowCheckbox: HTMLInputElement = dialog.querySelector('tbody input[type="checkbox"]')!;
      rowCheckbox.click();
      fixture.detectChanges();
      const confirm: HTMLButtonElement = dialog.querySelector('.dialog-form__footer button')!;
      expect(confirm.textContent).toContain('אישור');
      confirm.click();
      fixture.detectChanges();

      // The File's customer follows the order; its paperwork is read.
      httpMock
        .expectOne((req) => req.url.endsWith(`/api/customers/${CUSTOMER.id}`))
        .flush(CUSTOMER);
      const extract = httpMock.expectOne((req) =>
        req.url.endsWith('/api/import-files/bill-of-lading'),
      );
      expect(extract.request.params.get('orderId')).toBe('1001');
      extract.flush(SAMPLE_EXTRACT);
      fixture.detectChanges();

      expect(hblNumberInput().value).toBe('HBL-NGB-LCL-2026-7731-01');
      expect(
        (fixture.nativeElement.querySelector('#hblCargoDescription') as HTMLInputElement).value,
      ).toBe('Said to contain: machinery packed in 8 wooden crates.');
      expect((fixture.nativeElement.querySelector('#hblQuantity') as HTMLInputElement).value).toBe(
        '8 wooden crates',
      );
      expect(internals().hblCustomer()?.id).toBe(CUSTOMER.id);
      const notice = fixture.nativeElement.querySelector('.prefill-notice')?.textContent ?? '';
      expect(notice).toContain('שטר מטען.pdf');
      expect(notice).toContain('MBL.html');
      expect(fixture.nativeElement.querySelector('.chip-list')?.textContent).toContain('#1001');
    });

    it('saving the first File creates the Job first (from the prefill), then opens the Job form', () => {
      openFileForm(SeaMethod.FCL_FCL);
      internals().hblCustomer.set(CUSTOMER);
      fixture.detectChanges();
      typeHblNumber('HBL-1');

      hblForm()!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      const createMbl = httpMock.expectOne(
        (req) => req.method === 'POST' && req.url.endsWith('/api/mbl'),
      );
      expect(createMbl.request.body).toMatchObject({
        shippingType: MblShippingType.SEA,
        seaMethod: SeaMethod.FCL_FCL,
        status: MblStatus.OPEN,
      });
      expect(createMbl.request.body.customerId).toBeUndefined(); // only fcl_lcl shares a customer
      createMbl.flush({ ...MINIMAL_MBL });

      const createHbl = httpMock.expectOne(
        (req) => req.method === 'POST' && req.url.endsWith('/api/hbl'),
      );
      expect(createHbl.request.body).toMatchObject({
        mblId: MINIMAL_MBL.id,
        customerId: CUSTOMER.id,
        hblNumber: 'HBL-1',
      });
      createHbl.flush(hbl(1, { hblNumber: 'HBL-1' }));
      fixture.detectChanges();

      expect(sectionTitle()).toContain('טופס Job');
      expect(internals().hbls().length).toBe(1);
      const [, , files, job] = stepLinks();
      expect(files.classList.contains('wizard-step__link')).toBe(true);
      expect(job.disabled).toBe(true); // current
      expect(files.disabled).toBe(false);
      const submit: HTMLButtonElement = fixture.nativeElement.querySelector(
        '.mbl-form button[type="submit"]',
      );
      expect(submit.textContent).toContain('שמור Job');
    });
  });

  describe('File edit page', () => {
    /** Files step of a saved LCL/LCL Job with two Files already created and
     *  the new-File form closed. */
    function openFilesStepWithFiles(): WizardInternals {
      openFileForm(SeaMethod.LCL_LCL);
      internals().savedMbl.set({ ...MINIMAL_MBL, seaMethod: SeaMethod.LCL_LCL });
      internals().hbls.set([hbl(1), hbl(2)]);
      internals().showHblForm.set(false);
      fixture.detectChanges();
      return internals();
    }

    function mainTable(): HTMLTableElement | null {
      return fixture.nativeElement.querySelector('.wizard-main .hbl-table');
    }

    function editButtons(): HTMLButtonElement[] {
      return Array.from(
        fixture.nativeElement.querySelectorAll('.wizard-main .hbl-table .hbl-edit-btn'),
      );
    }

    it('"ערוך" replaces the File list + add button with the edit page alone', () => {
      openFilesStepWithFiles();
      expect(sectionTitle()).toContain('יצירת Files');
      expect(mainTable()!.querySelectorAll('tbody tr').length).toBe(2);

      editButtons()[0].click();
      fixture.detectChanges();

      expect(sectionTitle()).toContain('עריכת File');
      expect(mainTable()).toBeNull();
      expect(fixture.nativeElement.querySelector('.hbl-edit-subtitle')?.textContent).toContain(
        'File #1 · HBL-001 · לקוח 1',
      );
      expect(hblForm()).not.toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('הוספת File נוסף');
      const submit: HTMLButtonElement = fixture.nativeElement.querySelector(
        '.hbl-form button[type="submit"]',
      );
      expect(submit.textContent).toContain('עדכן File');
    });

    it('"ביטול" on the edit page returns to the File list with "+ הוספת File נוסף" and the Job button', () => {
      openFilesStepWithFiles();
      editButtons()[1].click();
      fixture.detectChanges();
      expect(mainTable()).toBeNull();

      const cancel: HTMLButtonElement =
        fixture.nativeElement.querySelector('.hbl-form .hbl-cancel');
      cancel.click();
      fixture.detectChanges();

      expect(sectionTitle()).toContain('יצירת Files');
      expect(mainTable()!.querySelectorAll('tbody tr').length).toBe(2);
      expect(hblForm()).toBeNull();
      const addButton: HTMLButtonElement = fixture.nativeElement.querySelector('.add-hbl-btn');
      expect(addButton.textContent).toContain('הוספת File נוסף');
      const jobButton: HTMLButtonElement = fixture.nativeElement.querySelector('.go-to-job-btn');
      expect(jobButton.textContent).toContain('המשך ל-Job');
    });
  });
});
