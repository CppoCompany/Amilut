import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { CountriesApi } from '../../../../api/countries-api';
import {
  CLASSIFICATION_APPROVAL_LABELS,
  CLASSIFICATION_APPROVALS,
  ClassificationApproval,
  TRADE_AGREEMENT_LABELS,
  TRADE_AGREEMENTS,
  TradeAgreement,
} from '../../../../api/enums';
import { ImportFilesApi } from '../../../../api/import-files-api';
import type {
  CountryDto,
  InvoiceLineItemDto,
  LineItemClassificationUpdateDto,
} from '../../../../api/models';
import { MultiSelect, MultiSelectOption } from '../../../../shared/multi-select/multi-select';
import { CURRENT_CASE_NUMBER } from '../../current-case';

interface Product {
  /** Where the line is stored (`import_account_files` row + position); `null` for rows added by hand. */
  fileId: number | null;
  lineIndex: number | null;
  sku: string;
  /** Product name from the invoice — shown in the "תיאור טובין" field, not as a column. */
  name: string;
  qty: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  tradeAgreement: TradeAgreement | null;
  classificationCode: string;
  approvals: ClassificationApproval[];
  /** `countries.id` of the selected country, or `null` when none is selected. */
  countryId: number | null;
}

/** "סיווג" — goods classification view with an editable products table saved back to the case's invoice lines. */
@Component({
  selector: 'app-classification-screen',
  imports: [ReactiveFormsModule, DecimalPipe, MultiSelect],
  templateUrl: './classification.html',
  styleUrl: './classification.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassificationScreen {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly countriesApi = inject(CountriesApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly approvalOptions: readonly MultiSelectOption[] = CLASSIFICATION_APPROVALS.map(
    (value) => ({ value, label: CLASSIFICATION_APPROVAL_LABELS[value] }),
  );
  protected readonly tradeAgreementOptions = TRADE_AGREEMENTS;
  protected readonly tradeAgreementLabels = TRADE_AGREEMENT_LABELS;

  protected readonly form = this.fb.group({
    goodsDescription: this.fb.control(''),
    notes: this.fb.control(''),
  });

  /** Rows of the products table — the case's extracted supplier-invoice line items, plus any rows added by hand. */
  protected readonly products = signal<Product[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** Country lookup for the "מדינות" dropdown — served by the `countries` table, already ordered by name. */
  protected readonly countries = signal<CountryDto[]>([]);
  protected readonly countriesError = signal<string | null>(null);

  protected readonly saving = signal(false);
  protected readonly saveMessage = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  constructor() {
    this.loadLineItems();
    this.loadCountries();
  }

  protected addRow(): void {
    this.products.update((rows) => [...rows, emptyProduct()]);
  }

  protected onTradeAgreementChange(index: number, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const tradeAgreement = isTradeAgreement(value) ? value : null;
    this.patchRow(index, { tradeAgreement });
  }

  protected onClassificationCodeChange(index: number, event: Event): void {
    this.patchRow(index, { classificationCode: (event.target as HTMLInputElement).value });
  }

  /** Stores the approvals ticked in a row's multi-select (values outside the enum are dropped). */
  protected onApprovalsChange(index: number, values: readonly string[]): void {
    this.patchRow(index, { approvals: values.filter(isClassificationApproval) });
  }

  /** Stores the country picked in a row's dropdown (empty option → `null`). */
  protected onCountryChange(index: number, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.patchRow(index, { countryId: value === '' ? null : Number(value) });
  }

  /**
   * Saves the classification columns of every invoice-backed row to the
   * server. Rows added by hand have no stored line to write to, so they are
   * kept on screen but not sent.
   */
  protected onSubmit(): void {
    if (this.saving()) return;
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
              countryId: row.countryId,
            },
          ],
    );
    const manualRows = rows.filter((row) => row.fileId === null);

    this.saving.set(true);
    this.saveMessage.set(null);
    this.saveError.set(null);
    this.importFilesApi
      .saveLineItemClassifications(CURRENT_CASE_NUMBER, items)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (saved) => {
          this.products.set([...saved.map(toProduct), ...manualRows]);
          this.saveMessage.set(
            items.length === 1 ? 'הסיווג נשמר (שורה אחת)' : `הסיווג נשמר (${items.length} שורות)`,
          );
        },
        error: () => this.saveError.set('שמירת הסיווג נכשלה'),
      });
  }

  private patchRow(index: number, patch: Partial<Product>): void {
    this.products.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
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
   * current case, and the "תיאור טובין" field from their product names.
   */
  private loadLineItems(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.importFilesApi
      .getSupplierInvoiceLineItems(CURRENT_CASE_NUMBER)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (items) => {
          const products = items.map(toProduct);
          this.products.set(products);
          if (products.length > 0) {
            this.form.controls.goodsDescription.setValue(goodsDescriptionOf(products));
          }
        },
        error: () => {
          this.products.set([]);
          this.errorMessage.set('טעינת פריטי חשבון הספק נכשלה');
        },
      });
  }
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
    countryId: null,
  };
}

function isClassificationApproval(value: unknown): value is ClassificationApproval {
  return (
    typeof value === 'string' && (CLASSIFICATION_APPROVALS as readonly string[]).includes(value)
  );
}

function isTradeAgreement(value: unknown): value is TradeAgreement {
  return typeof value === 'string' && (TRADE_AGREEMENTS as readonly string[]).includes(value);
}
