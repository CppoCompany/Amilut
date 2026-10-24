import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CcfStatus } from '../../../../api/enums';
import type { CcfDto } from '../../../../api/models';
import { SEA_CCF_HOUSE_FIELDS } from '../../../../api/testing/sea-defaults';
import { stubLayoutForVirtualScroll } from '../../../../shared/testing/virtual-scroll';
import { NavigationService } from '../../navigation.service';
import { CcfScreen } from './ccf';

type CcfInternals = {
  ccfs: () => CcfDto[];
  selectedId: () => number | null;
  selectedCcf: () => CcfDto | null;
  creating: () => boolean;
  errorMessage: () => string | null;
  ccfContext: () => { kind: 'ccf'; id: number } | null;
  select: (id: number) => void;
  onCreate: () => void;
};

function ccf(id: number, fileNumber: string, overrides: Partial<CcfDto> = {}): CcfDto {
  return {
    ...SEA_CCF_HOUSE_FIELDS,
    id,
    fileNumber,
    shipmentFileId: null,
    shipmentFileMblNumber: null,
    status: CcfStatus.OPEN,
    createdBy: 7,
    createdByName: 'דנה לוי',
    createdAt: '2026-09-01T08:30:00.000Z',
    updatedAt: '2026-09-01T08:30:00.000Z',
    ...overrides,
  };
}

const CCF_A = ccf(100, 'CCF1000', { shipmentFileId: 42, shipmentFileMblNumber: 'MBL-987654321' });
const CCF_B = ccf(101, 'CCF1001');

describe('CcfScreen', () => {
  let fixture: ComponentFixture<CcfScreen>;
  let internals: CcfInternals;
  let httpMock: HttpTestingController;
  let nav: NavigationService;

  beforeEach(async () => {
    stubLayoutForVirtualScroll();
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

  /** Creates the component and answers its list request — call after any
   *  `nav` setup a test needs in place before the constructor runs. */
  function createFixture(list: CcfDto[] = [CCF_A, CCF_B]): void {
    fixture = TestBed.createComponent(CcfScreen);
    internals = fixture.componentInstance as unknown as CcfInternals;
    fixture.detectChanges();
    httpMock.expectOne((req) => req.method === 'GET' && req.url === '/api/ccf').flush(list);
    fixture.detectChanges();
  }

  /** Lets PrimeNG's virtual scroller lay out its rows — it does so on a timer. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 5));
    fixture.detectChanges();
  }

  function rows(): HTMLElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.ccf-records tbody tr.data-table__row--clickable'),
    );
  }

  function expectDocumentsFor(id: number): void {
    httpMock
      .expectOne((req) => req.url === '/api/import-files' && req.params.get('ccfId') === String(id))
      .flush([]);
    fixture.detectChanges();
  }

  function text(selector: string): string {
    return fixture.nativeElement.querySelector(selector)?.textContent?.trim() ?? '';
  }

  it('lists the CCFs on the left and asks to pick one before showing documents', async () => {
    createFixture();
    await settle();

    expect(rows().length).toBe(2);
    expect(text('.ccf-records__count')).toBe('(2)');
    expect(text('.documents-hint')).toBe('בחר תיק עמילות מהרשימה כדי להציג את המסמכים שלו');
    expect(internals.ccfContext()).toBeNull();
  });

  it('no longer offers a linked shipment file picker', () => {
    createFixture();

    expect(fixture.nativeElement.querySelector('app-search-select')).toBeNull();
    expect(fixture.nativeElement.querySelector('#shipmentFile')).toBeNull();
  });

  it('clicking a CCF selects it, highlights its row and loads its documents', async () => {
    createFixture();
    await settle();

    rows()[0].click();
    fixture.detectChanges();
    expectDocumentsFor(100);
    const row = rows()[0];

    expect(internals.ccfContext()).toEqual({ kind: 'ccf', id: 100 });
    expect(row.classList).toContain('data-table__row--selected');
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(text('.ccf-header__number')).toBe('CCF1000');
    expect(text('.panel-documents__context-label')).toBe('CCF1000');

    internals.select(101);
    fixture.detectChanges();
    expectDocumentsFor(101);
    expect(text('.panel-documents__context-label')).toBe('CCF1001');
  });

  describe('onCreate', () => {
    it('creates a standalone CCF, lists it first and selects it', () => {
      createFixture();

      internals.onCreate();
      internals.onCreate(); // the guard — no second request
      const req = httpMock.expectOne({ method: 'POST', url: '/api/ccf' });
      expect(req.request.body).toEqual({});
      req.flush(ccf(102, 'CCF1002'));
      fixture.detectChanges();
      expectDocumentsFor(102);

      expect(internals.ccfs().map((row) => row.id)).toEqual([102, 100, 101]);
      expect(internals.selectedId()).toBe(102);
      expect(internals.creating()).toBe(false);
    });

    it('shows the server error and keeps the selection when creation fails', () => {
      createFixture();
      internals.select(100);
      fixture.detectChanges();
      expectDocumentsFor(100);

      internals.onCreate();
      httpMock
        .expectOne({ method: 'POST', url: '/api/ccf' })
        .flush({ message: 'boom' }, { status: 400, statusText: 'Bad Request' });

      expect(internals.errorMessage()).toBe('יצירת תיק העמילות נכשלה: boom');
      expect(internals.selectedId()).toBe(100);
    });
  });

  describe('viewCcfId hand-off', () => {
    it('selects the CCF once the list arrives', () => {
      nav.viewCcfId.set(101);
      createFixture();
      expectDocumentsFor(101);

      expect(nav.viewCcfId()).toBeNull(); // consumed once
      expect(internals.selectedCcf()?.fileNumber).toBe('CCF1001');
    });

    it('fetches a CCF that is not in the listed batch', () => {
      nav.viewCcfId.set(7);
      createFixture();

      httpMock.expectOne({ method: 'GET', url: '/api/ccf/7' }).flush(ccf(7, 'CCF0007'));
      fixture.detectChanges();
      expectDocumentsFor(7);

      expect(internals.ccfs()[0].id).toBe(7);
      expect(internals.selectedCcf()?.fileNumber).toBe('CCF0007');
    });
  });
});
