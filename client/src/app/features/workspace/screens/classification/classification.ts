import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { ImportFilesApi } from '../../../../api/import-files-api';
import type { InvoiceLineItemDto } from '../../../../api/models';
import { CURRENT_CASE_NUMBER } from '../../current-case';

interface Product {
  sku: string;
  name: string;
  qty: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  tradeAgreement: string;
  classificationCode: string;
  approvals: string;
}

/** "סיווג" — goods classification view with an editable products table. */
@Component({
  selector: 'app-classification-screen',
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './classification.html',
  styleUrl: './classification.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassificationScreen {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = this.fb.group({
    goodsDescription: this.fb.control('ספקי כוח'),
    notes: this.fb.control(''),
  });

  /** Rows of the products table — the case's extracted supplier-invoice line items, plus any rows added by hand. */
  protected readonly products = signal<Product[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.loadLineItems();
  }

  protected addRow(): void {
    this.products.update((rows) => [
      ...rows,
      { sku: '', name: '', qty: null, unitPrice: null, totalPrice: null, tradeAgreement: '', classificationCode: '', approvals: '' },
    ]);
  }

  protected onSubmit(): void {
    // Mockup only — no backend. A real ClassificationService call would go here.
    console.log('Classification (mock) saved:', this.form.getRawValue());
  }

  /** Fills the products table from the supplier invoices filed under the current case. */
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
        next: (items) => this.products.set(items.map(toProduct)),
        error: () => {
          this.products.set([]);
          this.errorMessage.set('טעינת פריטי חשבון הספק נכשלה');
        },
      });
  }
}

/**
 * Maps an extracted invoice line to a products-table row. The invoice carries
 * no trade agreement, classification code or approvals, so those stay blank
 * for the user to fill in; missing numbers stay `null` and render as blanks.
 */
export function toProduct(item: InvoiceLineItemDto): Product {
  return {
    sku: item.item ?? '',
    name: item.description ?? '',
    qty: item.quantity ?? null,
    unitPrice: item.price ?? null,
    totalPrice: item.total ?? null,
    tradeAgreement: '',
    classificationCode: '',
    approvals: '',
  };
}
