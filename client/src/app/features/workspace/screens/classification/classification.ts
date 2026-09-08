import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

interface Product {
  sku: string;
  name: string;
  qty: number;
  unitPrice: string;
  totalPrice: string;
  tradeAgreement: string;
  classificationCode: string;
  approvals: string;
}

/** "סיווג" — goods classification view with an editable products table. */
@Component({
  selector: 'app-classification-screen',
  imports: [ReactiveFormsModule],
  templateUrl: './classification.html',
})
export class ClassificationScreen {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    goodsDescription: this.fb.control('ספקי כוח'),
    notes: this.fb.control(''),
  });

  protected readonly products = signal<Product[]>([
    { sku: '100001', name: 'ספק כוח דגם A', qty: 10, unitPrice: '120.00', totalPrice: '1,200.00', tradeAgreement: 'כן', classificationCode: '850440', approvals: 'CE, PDF' },
    { sku: '100002', name: 'ספק כוח דגם B', qty: 5, unitPrice: '250.00', totalPrice: '1,250.00', tradeAgreement: 'לא', classificationCode: '850450', approvals: 'PDF' },
    { sku: '100003', name: 'מתאם מתח אוניברסלי', qty: 20, unitPrice: '45.50', totalPrice: '910.00', tradeAgreement: 'כן', classificationCode: '850460', approvals: 'CE' },
    { sku: '100004', name: 'סוללה נטענת 12V', qty: 8, unitPrice: '78.00', totalPrice: '624.00', tradeAgreement: 'לא', classificationCode: '850470', approvals: 'UN' },
    { sku: '100005', name: 'כבל חשמל 2 מטר', qty: 50, unitPrice: '12.00', totalPrice: '600.00', tradeAgreement: 'לא', classificationCode: '850480', approvals: 'מילוי' },
    { sku: '100006', name: 'ממיר מתח לתעשייה', qty: 2, unitPrice: '1,450.00', totalPrice: '2,900.00', tradeAgreement: 'כן', classificationCode: '850490', approvals: 'CE, PDF' },
  ]);

  protected addRow(): void {
    this.products.update((rows) => [
      ...rows,
      { sku: '', name: '', qty: 0, unitPrice: '', totalPrice: '', tradeAgreement: '', classificationCode: '', approvals: '' },
    ]);
  }

  protected onSubmit(): void {
    // Mockup only — no backend. A real ClassificationService call would go here.
    console.log('Classification (mock) saved:', this.form.getRawValue());
  }
}
