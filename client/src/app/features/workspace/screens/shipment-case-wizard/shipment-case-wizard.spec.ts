import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { MblShippingType, MblStatus, SeaMethod } from '../../../../api/enums';
import type { MblContainerDto, MblDto } from '../../../../api/models';
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

type WizardInternals = {
  savedMbl: WritableSignal<MblDto | null>;
  hblContainerId: WritableSignal<number | null>;
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

  it('selecting a sea method advances to the Job (MBL) form, labeled with that method', () => {
    methodCards()[0].click(); // ימי
    fixture.detectChanges();
    methodCards()[2].click(); // LCL / LCL
    fixture.detectChanges();

    expect(sectionTitle()).toContain('LCL / LCL');
    expect(sectionTitle()).toContain('טופס Job');
    expect(fixture.nativeElement.querySelector('.method-card')).toBeNull();
  });

  it('has no in-form back buttons on the Job step — the sidebar links replace them', () => {
    methodCards()[0].click(); // ימי
    fixture.detectChanges();
    methodCards()[0].click(); // FCL / FCL
    fixture.detectChanges();

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
    methodCards()[0].click(); // ימי
    fixture.detectChanges();
    methodCards()[0].click(); // FCL / FCL
    fixture.detectChanges();
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
      const internals = fixture.componentInstance as unknown as WizardInternals;
      internals.savedMbl.set({ ...MINIMAL_MBL, ccfId: null });
      fixture.detectChanges();

      expect(filingLink()).toBeNull();
    });

    it('appears and navigates to the CCF when the saved case has one', () => {
      const openCcfForView = vi.spyOn(nav, 'openCcfForView').mockImplementation(() => {});
      const internals = fixture.componentInstance as unknown as WizardInternals;
      internals.savedMbl.set({ ...MINIMAL_MBL, ccfId: 42 });
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

    /** Clicks through to the Job form (ימי → FCL / FCL). */
    function openJobForm(): void {
      methodCards()[0].click();
      fixture.detectChanges();
      methodCards()[0].click();
      fixture.detectChanges();
    }

    it('lists the four sea stations with Job/File wording, the current one disabled', () => {
      openJobForm();

      expect(stepLabels()).toEqual(['סוג משלוח', 'שיטת שילוח ימי', 'Job', 'Files']);
      const [type, method, job, files] = stepLinks();
      expect(type.disabled).toBe(false);
      expect(method.disabled).toBe(false);
      expect(job.disabled).toBe(true); // current
      expect(files.disabled).toBe(true); // nothing saved yet
      expect(job.getAttribute('aria-current')).toBe('step');
    });

    it('"סוג משלוח" from the Job form goes back to step 1', () => {
      openJobForm();

      stepLinks()[0].click();
      fixture.detectChanges();

      expect(sectionTitle()).toContain('בחירת סוג משלוח');
      expect(methodCards().length).toBe(2);
    });

    it('"שיטת שילוח ימי" from the Job form goes back to step 2', () => {
      openJobForm();

      stepLinks()[1].click();
      fixture.detectChanges();

      expect(sectionTitle()).toContain('בחירת שיטת שילוח ימי');
    });

    it('once a Job is saved, steps 1/2 open read-only: the choice is highlighted, cards disabled, nothing reset', () => {
      openJobForm();
      const internals = fixture.componentInstance as unknown as WizardInternals;
      internals.savedMbl.set({ ...MINIMAL_MBL });
      fixture.detectChanges();

      stepLinks()[0].click(); // סוג משלוח
      fixture.detectChanges();

      expect(sectionTitle()).toContain('בחירת סוג משלוח');
      expect(fixture.nativeElement.querySelector('.method-locked-hint')).not.toBeNull();
      const typeCards = methodCards();
      expect(typeCards.every((card) => card.disabled)).toBe(true);
      expect(typeCards[0].classList).toContain('method-card--selected'); // ימי
      expect(typeCards[1].classList).not.toContain('method-card--selected');
      expect(internals.savedMbl()).not.toBeNull(); // the Job was not dropped
      expect(fixture.nativeElement.querySelector('.wizard-tree')).not.toBeNull();

      stepLinks()[1].click(); // שיטת שילוח ימי
      fixture.detectChanges();
      expect(sectionTitle()).toContain('בחירת שיטת שילוח ימי');
      const methodCardsNow = methodCards();
      expect(methodCardsNow.length).toBe(4);
      expect(methodCardsNow.every((card) => card.disabled)).toBe(true);
      expect(methodCardsNow[0].classList).toContain('method-card--selected'); // FCL / FCL

      stepLinks()[3].click(); // Files
      fixture.detectChanges();
      expect(sectionTitle()).toContain('יצירת Files');
      // No leftover chrome on the Files step: no success banner, no "ערוך פרטי Job".
      expect(fixture.nativeElement.querySelector('.form-message--success')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('ערוך פרטי Job');

      // From a read-only step view, the tree's Job node opens the Job form directly.
      stepLinks()[0].click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.wizard-tree-node--mbl') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(sectionTitle()).toContain('טופס Job');
    });

    it('before a Job is saved, steps 1/2 stay live: "סוג משלוח" goes back and lets the type be re-chosen', () => {
      openJobForm();

      stepLinks()[0].click();
      fixture.detectChanges();

      const cards = methodCards();
      expect(cards.every((card) => card.disabled)).toBe(false);
      expect(fixture.nativeElement.querySelector('.method-locked-hint')).toBeNull();
      cards[1].click(); // אווירי — the choice can change
      fixture.detectChanges();
      expect(hintText()).toContain('אווירי');
    });

    it('once a Job is saved, "Job" reopens its form and "Files" returns to the Files step', () => {
      openJobForm();
      const internals = fixture.componentInstance as unknown as WizardInternals;
      internals.savedMbl.set({ ...MINIMAL_MBL });
      fixture.detectChanges();
      expect(sectionTitle()).toContain('יצירת Files');

      stepLinks()[2].click(); // Job
      fixture.detectChanges();
      expect(sectionTitle()).toContain('טופס Job');
      expect(stepLinks()[2].disabled).toBe(true);
      expect(stepLinks()[3].disabled).toBe(false);

      stepLinks()[3].click(); // Files
      fixture.detectChanges();
      expect(sectionTitle()).toContain('יצירת Files');
    });
  });

  describe('File (HBL) form', () => {
    let httpMock: HttpTestingController;

    /** Lands on the Files step of a saved Job (two containers when groupage),
     *  with the "+ יצירת File" form open. */
    function openNewFileForm(seaMethod = SeaMethod.GROUPAGE_FCL): void {
      methodCards()[0].click(); // ימי
      fixture.detectChanges();
      methodCards()[seaMethod === SeaMethod.GROUPAGE_FCL ? 3 : 0].click();
      fixture.detectChanges();
      const internals = fixture.componentInstance as unknown as WizardInternals;
      internals.savedMbl.set({ ...MINIMAL_MBL, seaMethod, containers: [container(1), container(2)] });
      fixture.detectChanges();

      const addButton: HTMLButtonElement = fixture.nativeElement.querySelector('.form-actions .btn-primary');
      expect(addButton.textContent).toContain('יצירת File');
      addButton.click();
      fixture.detectChanges();
    }

    function hblNumberInput(): HTMLInputElement {
      return fixture.nativeElement.querySelector('#hblNumber');
    }

    function containerButtons(): HTMLButtonElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll('.hbl-form .choice-btn'));
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
      openNewFileForm();
      const [first, second] = containerButtons();

      first.click();
      fixture.detectChanges();
      typeHblNumber('HBL-1');
      expect(first.classList).toContain('active');

      second.click();
      fixture.detectChanges();

      expect(second.classList).toContain('active');
      expect(hblNumberInput().value).toBe('');
      const internals = fixture.componentInstance as unknown as WizardInternals;
      expect(internals.hblContainerId()).toBe(2);
    });

    it('re-clicking the already-selected container keeps the form as is', () => {
      openNewFileForm();
      const [first] = containerButtons();

      first.click();
      fixture.detectChanges();
      typeHblNumber('HBL-1');
      first.click();
      fixture.detectChanges();

      expect(hblNumberInput().value).toBe('HBL-1');
    });

    it('shows the orders grid only in the "לשיוך להזמנה" popup, not inline', () => {
      openNewFileForm(SeaMethod.FCL_FCL);

      expect(fixture.nativeElement.querySelector('app-hbl-orders-picker-dialog')).toBeNull();
      expect(fixture.nativeElement.querySelector('.hbl-form .data-table')).toBeNull();
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
      const cancel: HTMLButtonElement = dialog.querySelector('.dialog-card__footer .btn-secondary');
      cancel.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-hbl-orders-picker-dialog')).toBeNull();
    });
  });
});
