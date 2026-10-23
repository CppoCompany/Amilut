import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Badge } from 'primeng/badge';
import { Button } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { ProgressBar } from 'primeng/progressbar';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Textarea } from 'primeng/textarea';
import { Tooltip } from 'primeng/tooltip';
import { catchError, EMPTY, finalize, map, of, switchMap } from 'rxjs';

import { CountriesApi } from '../../../../api/countries-api';
import { DashboardApi } from '../../../../api/dashboard-api';
import type { FilingContext } from '../../../../api/filing-context.model';
import {
  CLASSIFICATION_APPROVAL_LABELS,
  CLASSIFICATION_APPROVALS,
  CLASSIFICATION_LICENSE_LABELS,
  CLASSIFICATION_LICENSES,
  ClassificationApproval,
  ClassificationLicense,
  TRADE_AGREEMENT_LABELS,
  TRADE_AGREEMENTS,
  TradeAgreement,
} from '../../../../api/enums';
import { ImportFilesApi } from '../../../../api/import-files-api';
import type {
  CountryDto,
  DashboardCcfRowDto,
  InvoiceLineItemDto,
  LineItemClassificationUpdateDto,
  LineItemNoteDto,
} from '../../../../api/models';
import { MultiSelect, MultiSelectOption } from '../../../../shared/multi-select/multi-select';
import { TypedRow } from '../../../../shared/typed-row/typed-row';
import { FilingContextService } from '../../filing-context.service';
import { NavigationService } from '../../navigation.service';
import { LineItemNotesDialog } from './line-item-notes-dialog/line-item-notes-dialog';

interface Product {
  /** Where the line is stored (`import_account_files` row + position); `null` for rows added by hand. */
  fileId: number | null;
  lineIndex: number | null;
  sku: string;
  /** Product name from the invoice — shown in the "תיאור טובין" field above the table, not as a column. */
  name: string;
  qty: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  tradeAgreement: TradeAgreement | null;
  classificationCode: string;
  approvals: ClassificationApproval[];
  licenses: ClassificationLicense[];
  /** `countries.id` of the selected country, or `null` when none is selected. */
  countryId: number | null;
}

/** A row of the pending-files table: the CCF plus its classified share, so the table can sort by it. */
type PendingCcfRow = DashboardCcfRowDto & { classifiedPercent: number };

/** A products-table row that is backed by a stored invoice line, so notes can be attached to it. */
type StoredProduct = Product & { fileId: number; lineIndex: number };

/**
 * "סיווג" — goods classification view: a list of the CCFs not fully
 * classified yet on one side, and for the picked one an editable products
 * table saved back to its invoice lines on the other. Each stored row has a
 * notes popup whose notes are saved immediately.
 */
@Component({
  selector: 'app-classification-screen',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    DecimalPipe,
    Badge,
    Button,
    IconField,
    InputIcon,
    InputText,
    Message,
    ProgressBar,
    Select,
    TableModule,
    Textarea,
    Tooltip,
    MultiSelect,
    TypedRow,
    LineItemNotesDialog,
  ],
  templateUrl: './classification.html',
  styleUrls: ['./classification.scss', './classification-pending.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassificationScreen {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly countriesApi = inject(CountriesApi);
  private readonly dashboardApi = inject(DashboardApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);
  private readonly filingContext = inject(FilingContextService);

  /** The Order/CCF being classified — picked from the pending list (or handed off by another screen); `null` until one is, and nothing is loaded or saved while it is. */
  protected readonly context = this.filingContext.context;

  protected readonly approvalOptions: readonly MultiSelectOption[] = CLASSIFICATION_APPROVALS.map(
    (value) => ({ value, label: CLASSIFICATION_APPROVAL_LABELS[value] }),
  );
  protected readonly licenseOptions: readonly MultiSelectOption[] = CLASSIFICATION_LICENSES.map(
    (value) => ({ value, label: CLASSIFICATION_LICENSE_LABELS[value] }),
  );
  /** The "הסכם סחר" select's choices, Hebrew-labelled. */
  protected readonly tradeAgreementSelectOptions = TRADE_AGREEMENTS.map((value) => ({
    value,
    label: TRADE_AGREEMENT_LABELS[value],
  }));

  protected readonly form = this.fb.group({
    goodsDescription: this.fb.control(''),
  });

  /** Rows of the products table — the case's extracted supplier-invoice line items, plus any rows added by hand. */
  protected readonly products = signal<Product[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** Country lookup for the "מדינות" dropdown — served by the `countries` table, already ordered by name. */
  protected readonly countries = signal<CountryDto[]>([]);
  protected readonly countriesError = signal<string | null>(null);

  /** "תיקי עמילות שלא עברו סיווג" — the file list to pick from. */
  protected readonly pendingCcfs = signal<DashboardCcfRowDto[]>([]);
  protected readonly pendingLoading = signal(false);
  protected readonly pendingError = signal<string | null>(null);
  protected readonly pendingRows = computed<PendingCcfRow[]>(() =>
    this.pendingCcfs().map((ccf) => ({ ...ccf, classifiedPercent: classifiedPercent(ccf) })),
  );

  /** Every note of the picked context's lines, keyed by {@link noteKey}, oldest first. */
  protected readonly notesByLine = signal<ReadonlyMap<string, readonly LineItemNoteDto[]>>(
    new Map(),
  );
  protected readonly notesError = signal<string | null>(null);
  /** The row whose notes popup is open, or `null`. */
  protected readonly notesRow = signal<StoredProduct | null>(null);
  private readonly noNotes: readonly LineItemNoteDto[] = [];

  protected readonly saving = signal(false);
  protected readonly saveMessage = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  constructor() {
    this.loadLineItemsOnContextChange();
    this.loadNotesOnContextChange();
    this.loadCountries();
    this.loadPendingCcfs();

    // The CCF screen navigates here after saving a Customs Clearance File
    // linked to a shipping case: `/workspace/classification?ccfId=N`, which
    // NavigationService.applyUrl turns into `openClassificationContext`
    // before this screen shows. Consume it once as soon as it appears and
    // preselect it (shared with the filing screen) — same effect+untracked
    // shape as the filing screen's hand-off, for the same reason:
    // Back/Forward can land on this URL while the screen is already mounted.
    effect(() => {
      const incoming = this.nav.openClassificationContext();
      if (incoming === null) return;
      untracked(() => {
        this.nav.openClassificationContext.set(null);
        this.filingContext.context.set(incoming);
      });
    });
  }

  protected selectCcf(ccfId: number): void {
    this.context.set({ kind: 'ccf', id: ccfId });
  }

  protected isSelectedCcf(ccfId: number): boolean {
    const context = this.context();
    return context?.kind === 'ccf' && context.id === ccfId;
  }

  /** "1/4" — classified lines out of the CCF's supplier-invoice lines; "—" before any were filed. */
  protected classificationProgress(ccf: DashboardCcfRowDto): string {
    return ccf.lineCount === 0 ? '—' : `${ccf.classifiedLineCount}/${ccf.lineCount}`;
  }

  /** The notes stored against a row's line; always empty for rows added by hand. */
  protected notesOf(product: Product): readonly LineItemNoteDto[] {
    if (product.fileId === null || product.lineIndex === null) return this.noNotes;
    return this.notesByLine().get(noteKey(product.fileId, product.lineIndex)) ?? this.noNotes;
  }

  protected openNotes(product: Product): void {
    if (product.fileId === null || product.lineIndex === null) return;
    this.notesRow.set({ ...product, fileId: product.fileId, lineIndex: product.lineIndex });
  }

  protected closeNotes(): void {
    this.notesRow.set(null);
  }

  /** Appends a note the popup just saved to its line's list. */
  protected onNoteAdded(note: LineItemNoteDto): void {
    const key = noteKey(note.fileId, note.lineIndex);
    this.notesByLine.update((current) => {
      const next = new Map(current);
      next.set(key, [...(current.get(key) ?? []), note]);
      return next;
    });
  }

  protected addRow(): void {
    this.products.update((rows) => [...rows, emptyProduct()]);
  }

  protected onTradeAgreementChange(index: number, value: string | null | undefined): void {
    const tradeAgreement = value && isTradeAgreement(value) ? value : null;
    this.patchRow(index, { tradeAgreement });
  }

  protected onClassificationCodeChange(index: number, event: Event): void {
    this.patchRow(index, { classificationCode: (event.target as HTMLInputElement).value });
  }

  /** Stores the approvals ticked in a row's multi-select (values outside the enum are dropped). */
  protected onApprovalsChange(index: number, values: readonly string[]): void {
    this.patchRow(index, { approvals: values.filter(isClassificationApproval) });
  }

  /** Stores the licenses ticked in a row's multi-select (values outside the enum are dropped). */
  protected onLicensesChange(index: number, values: readonly string[]): void {
    this.patchRow(index, { licenses: values.filter(isClassificationLicense) });
  }

  /** Stores the country picked in a row's dropdown (empty option → `null`). */
  protected onCountryChange(index: number, countryId: number | null | undefined): void {
    this.patchRow(index, { countryId: countryId ?? null });
  }

  /**
   * Saves the classification columns of every invoice-backed row to the
   * server. Rows added by hand have no stored line to write to, so they are
   * kept on screen but not sent.
   */
  protected onSubmit(): void {
    const context = this.context();
    if (context === null || this.saving()) return;
    const rows = this.products();
    const items = rows.flatMap((row): LineItemClassificationUpdateDto[] =>
      row.fileId === null || row.lineIndex === null
        ? []
        : [
            {
              fileId: row.fileId,
              lineIndex: row.lineIndex,
              tradeAgreement: row.tradeAgreement,
              classificationCode: row.classificationCode.trim(),
              approvals: row.approvals,
              licenses: row.licenses,
              countryId: row.countryId,
            },
          ],
    );
    const manualRows = rows.filter((row) => row.fileId === null);

    this.saving.set(true);
    this.saveMessage.set(null);
    this.saveError.set(null);
    this.importFilesApi
      .saveLineItemClassifications(context, items)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (saved) => {
          // Saved, but another context was picked meanwhile — its table is not these rows'.
          if (!sameContext(this.context(), context)) return;
          this.products.set([...saved.map(toProduct), ...manualRows]);
          this.saveMessage.set(
            items.length === 1 ? 'הסיווג נשמר (שורה אחת)' : `הסיווג נשמר (${items.length} שורות)`,
          );
          // Progress changed — and a now fully classified CCF leaves the list.
          this.loadPendingCcfs();
        },
        error: () => {
          if (!sameContext(this.context(), context)) return;
          this.saveError.set('שמירת הסיווג נכשלה');
        },
      });
  }

  private patchRow(index: number, patch: Partial<Product>): void {
    this.products.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  /**
   * (Re)loads the pending-classification file list. The picked context stays
   * as it is even when it drops off the list (e.g. just fully classified).
   */
  private loadPendingCcfs(): void {
    this.pendingLoading.set(true);
    this.pendingError.set(null);
    this.dashboardApi
      .ccfsPendingClassification()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.pendingLoading.set(false)),
      )
      .subscribe({
        next: (ccfs) => this.pendingCcfs.set(ccfs),
        error: () => this.pendingError.set('טעינת רשימת התיקים נכשלה'),
      });
  }

  /**
   * Loads every note of the picked Order/CCF's lines — again whenever
   * another one is picked. A failure only leaves the rows without notes.
   */
  private loadNotesOnContextChange(): void {
    toObservable(this.context)
      .pipe(
        switchMap((context) => {
          this.notesByLine.set(new Map());
          this.notesRow.set(null);
          this.notesError.set(null);
          if (context === null) return EMPTY;
          return this.importFilesApi.listLineItemNotes(context).pipe(
            catchError(() => {
              this.notesError.set('טעינת הערות השורות נכשלה');
              return of<LineItemNoteDto[]>([]);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((notes) => this.notesByLine.set(groupNotesByLine(notes)));
  }

  /** Loads the country lookup once; a failure only leaves the dropdown without options. */
  private loadCountries(): void {
    this.countriesError.set(null);
    this.countriesApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (countries) => this.countries.set(countries),
        error: () => {
          this.countries.set([]);
          this.countriesError.set('טעינת רשימת המדינות נכשלה');
        },
      });
  }

  /**
   * Fills the products table from the supplier invoices filed under the
   * picked Order/CCF, and the "תיאור טובין" field from their product names —
   * again whenever another one is picked. With nothing picked the table is
   * simply empty — nothing is requested, so nothing can fail.
   */
  private loadLineItemsOnContextChange(): void {
    toObservable(this.context)
      .pipe(
        switchMap((context) => {
          this.products.set([]);
          this.form.controls.goodsDescription.setValue('');
          this.errorMessage.set(null);
          this.saveMessage.set(null);
          this.saveError.set(null);
          if (context === null) return EMPTY;

          this.loading.set(true);
          return this.importFilesApi.getSupplierInvoiceLineItems(context).pipe(
            map((items) => items.map(toProduct)),
            catchError(() => {
              this.errorMessage.set('טעינת פריטי חשבון הספק נכשלה');
              return of<Product[]>([]);
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((products) => {
        this.products.set(products);
        this.form.controls.goodsDescription.setValue(goodsDescriptionOf(products));
      });
  }
}

/** Share of the CCF's lines already classified, 0–100; 0 before any were filed. */
function classifiedPercent(ccf: DashboardCcfRowDto): number {
  return ccf.lineCount === 0 ? 0 : Math.round((ccf.classifiedLineCount / ccf.lineCount) * 100);
}

function noteKey(fileId: number, lineIndex: number): string {
  return `${fileId}:${lineIndex}`;
}

/** Groups notes per line, keeping the server's order (oldest first) inside each group. */
export function groupNotesByLine(
  notes: readonly LineItemNoteDto[],
): Map<string, LineItemNoteDto[]> {
  const byLine = new Map<string, LineItemNoteDto[]>();
  for (const note of notes) {
    const key = noteKey(note.fileId, note.lineIndex);
    byLine.set(key, [...(byLine.get(key) ?? []), note]);
  }
  return byLine;
}

function sameContext(a: FilingContext | null, b: FilingContext | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

/** Maps an extracted invoice line (with whatever classification was saved for it) to a products-table row. */
export function toProduct(item: InvoiceLineItemDto): Product {
  const classification = item.classification ?? {};
  return {
    fileId: item.fileId ?? null,
    lineIndex: item.lineIndex ?? null,
    sku: item.item ?? '',
    name: item.description ?? '',
    qty: item.quantity ?? null,
    unitPrice: item.price ?? null,
    totalPrice: item.total ?? null,
    tradeAgreement: isTradeAgreement(classification.tradeAgreement)
      ? classification.tradeAgreement
      : null,
    classificationCode: classification.classificationCode ?? '',
    approvals: (classification.approvals ?? []).filter(isClassificationApproval),
    licenses: (classification.licenses ?? []).filter(isClassificationLicense),
    countryId: classification.countryId ?? null,
  };
}

/** The distinct product names of the rows, in order, joined for the "תיאור טובין" field. */
export function goodsDescriptionOf(products: readonly Pick<Product, 'name'>[]): string {
  const names = products.map((p) => p.name.trim()).filter((name) => name !== '');
  return Array.from(new Set(names)).join(', ');
}

function emptyProduct(): Product {
  return {
    fileId: null,
    lineIndex: null,
    sku: '',
    name: '',
    qty: null,
    unitPrice: null,
    totalPrice: null,
    tradeAgreement: null,
    classificationCode: '',
    approvals: [],
    licenses: [],
    countryId: null,
  };
}

function isClassificationApproval(value: unknown): value is ClassificationApproval {
  return (
    typeof value === 'string' && (CLASSIFICATION_APPROVALS as readonly string[]).includes(value)
  );
}

function isClassificationLicense(value: unknown): value is ClassificationLicense {
  return (
    typeof value === 'string' && (CLASSIFICATION_LICENSES as readonly string[]).includes(value)
  );
}

function isTradeAgreement(value: unknown): value is TradeAgreement {
  return typeof value === 'string' && (TRADE_AGREEMENTS as readonly string[]).includes(value);
}
