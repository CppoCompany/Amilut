import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CcfStatus, MblShippingType, MblStatus, SeaMethod } from '../../../../api/enums';
import type { CcfDto, MblSummaryDto } from '../../../../api/models';
import { NavigationService } from '../../navigation.service';
import { CcfScreen } from './ccf';

type CcfInternals = {
  selectedShipmentFileId: WritableSignal<number | null>;
  savedCcf: () => CcfDto | null;
  saving: () => boolean;
  loadingExisting: () => boolean;
  errorMessage: () => string | null;
  fileNumber: () => string;
  isReadOnly: () => boolean;
  ccfContext: () => { kind: 'ccf'; id: number } | null;
  onSave: () => void;
};

const SHIPMENT_FILE: MblSummaryDto = {
  id: 42,
  shippingType: MblShippingType.SEA,
  seaMethod: SeaMethod.FCL_FCL,
  status: MblStatus.OPEN,
  mblNumber: 'MBL-987654321',
  carrierName: 'MAERSK LINE',
  handlerUserId: 9,
  handlerName: 'Dana Levi',
  hblCount: 1,
  orderCount: 2,
  orderIds: [1000, 1001],
  customerNames: ['ACME Ltd.'],
  createdAt: '2026-09-01T08:30:00.000Z',
};

const SAVED_CCF: CcfDto = {
  id: 100,
  fileNumber: 'CCF1000',
  shipmentFileId: null,
  shipmentFileMblNumber: null,
  status: CcfStatus.OPEN,
  createdBy: 7,
  createdByName: 'דנה לוי',
  createdAt: '2026-09-01T08:30:00.000Z',
  updatedAt: '2026-09-01T08:30:00.000Z',
};

describe('CcfScreen', () => {
  let fixture: ComponentFixture<CcfScreen>;
  let internals: CcfInternals;
  let httpMock: HttpTestingController;
  let nav: NavigationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CcfScreen],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    nav = TestBed.inject(NavigationService);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  /** Creates the component now — call after any `nav` setup a test needs in
   *  place before the constructor runs (e.g. `nav.viewCcfId.set(...)`). */
  function createFixture(nextFileNumber = 'CCF1000'): void {
    fixture = TestBed.createComponent(CcfScreen);
    internals = fixture.componentInstance as unknown as CcfInternals;
    fixture.detectChanges();
    httpMock
      .expectOne({ method: 'GET', url: '/api/ccf/next-file-number' })
      .flush({ fileNumber: nextFileNumber });
    fixture.detectChanges();
  }

  function flushShipmentFiles(files: MblSummaryDto[] = [SHIPMENT_FILE]): void {
    httpMock.expectOne((req) => req.url === '/api/mbl').flush(files);
  }

  function pageTitleText(): string {
    return fixture.nativeElement.querySelector('.page-title')?.textContent?.trim() ?? '';
  }

  function headerFileNumber(): string {
    return fixture.nativeElement.querySelector('.ccf-header__number')?.textContent?.trim() ?? '';
  }

  it('shows the server-previewed next file number before the first save', () => {
    createFixture('CCF1042');
    flushShipmentFiles();

    expect(pageTitleText()).toContain('תיק עמילות');
    expect(headerFileNumber()).toBe('CCF1042');
  });

  describe('onSave', () => {
    it('does nothing while a save is already in flight', () => {
      createFixture();
      flushShipmentFiles();

      internals.onSave();
      const req = httpMock.expectOne({ method: 'POST', url: '/api/ccf' });

      internals.onSave(); // the guard — no second request
      httpMock.expectNone({ method: 'POST', url: '/api/ccf' });

      req.flush(SAVED_CCF); // avoid leaving a request unflushed for httpMock.verify()
    });

    it('creates a standalone CCF, stays on the page (no navigation) and the inline panel takes over', () => {
      createFixture();
      flushShipmentFiles();
      const openFilingFor = vi.spyOn(nav, 'openFilingFor').mockImplementation(() => {});
      const openClassificationFor = vi
        .spyOn(nav, 'openClassificationFor')
        .mockImplementation(() => {});

      internals.onSave();
      const req = httpMock.expectOne({ method: 'POST', url: '/api/ccf' });
      expect(req.request.body).toEqual({});

      req.flush(SAVED_CCF);

      expect(openFilingFor).not.toHaveBeenCalled();
      expect(openClassificationFor).not.toHaveBeenCalled();
      expect(internals.savedCcf()?.fileNumber).toBe('CCF1000');
      expect(internals.isReadOnly()).toBe(true);
      expect(internals.ccfContext()).toEqual({ kind: 'ccf', id: 100 });
    });

    it('creates a linked CCF and navigates to classification scoped to the CCF itself', () => {
      createFixture();
      flushShipmentFiles();
      const openClassificationFor = vi
        .spyOn(nav, 'openClassificationFor')
        .mockImplementation(() => {});

      internals.selectedShipmentFileId.set(42);
      internals.onSave();

      const req = httpMock.expectOne({ method: 'POST', url: '/api/ccf' });
      expect(req.request.body).toEqual({ shipmentFileId: 42 });
      req.flush({ ...SAVED_CCF, shipmentFileId: 42, shipmentFileMblNumber: 'MBL-987654321' });

      expect(openClassificationFor).toHaveBeenCalledWith({ kind: 'ccf', id: 100 });
    });

    it('preserves the selection and shows the error when the save fails', () => {
      createFixture();
      flushShipmentFiles();
      internals.selectedShipmentFileId.set(42);
      internals.onSave();

      httpMock
        .expectOne({ method: 'POST', url: '/api/ccf' })
        .flush(
          { message: 'לתיק השילוח הזה כבר יש תיק סליקת מכס' },
          { status: 400, statusText: 'Bad Request' },
        );
      fixture.detectChanges();

      expect(internals.errorMessage()).toBe(
        'שמירת תיק הסליקה נכשלה: לתיק השילוח הזה כבר יש תיק סליקת מכס',
      );
      expect(internals.selectedShipmentFileId()).toBe(42); // not cleared on failure
      expect(internals.savedCcf()).toBeNull();
      expect(internals.isReadOnly()).toBe(false); // still editable — nothing was created
    });
  });

  describe('viewCcfId hand-off', () => {
    it('loads the existing CCF and locks the form', () => {
      nav.viewCcfId.set(100);
      createFixture();
      flushShipmentFiles();

      httpMock
        .expectOne({ method: 'GET', url: '/api/ccf/100' })
        .flush({ ...SAVED_CCF, shipmentFileId: 42, shipmentFileMblNumber: 'MBL-987654321' });
      fixture.detectChanges();
      // Read-only mode mounts the inline ImportFilesPanel, which loads its own list.
      httpMock.expectOne((req) => req.url === '/api/import-files').flush([]);

      expect(nav.viewCcfId()).toBeNull(); // consumed once
      expect(internals.isReadOnly()).toBe(true);
      expect(internals.selectedShipmentFileId()).toBe(42);
      expect(headerFileNumber()).toBe('CCF1000');
      expect(fixture.nativeElement.querySelector('.form-actions button')).toBeNull();
    });
  });
});
