import { Component, computed, signal } from '@angular/core';

import { Autocomplete } from './autocomplete';

const CUSTOMERS = [
  'דורון ממן', 'ארז נקר', 'יבוא סחר בע״מ', 'טכנולוגיות מתקדמות',
  'אלקטרוניקה ישראל', 'שיווק ישיר', 'גלובל לוגיסטיקה',
  'חומרי בניין כהן', 'טקסטיל השרון', 'אגרו תעשיות',
];

const SHIPPING_LINES = [
  'Conmart', 'Green Shipping', 'ZIM', 'Maersk',
  'MSC', 'CMA CGM', 'Hapag-Lloyd', 'Evergreen',
  'Yang Ming', 'COSCO',
];

const AIRLINES = [
  'El Al', 'British Airways', 'Lufthansa', 'Turkish Airlines',
  'Delta', 'United', 'Air France', 'KLM',
  'Emirates', 'Qatar Airways',
];

/** "פתיחת הזמנה" — new shipment order form. */
@Component({
  selector: 'app-order-screen',
  templateUrl: './order.html',
})
export class OrderScreen {
  // Autocomplete inputs.
  protected readonly customer = new Autocomplete(CUSTOMERS);
  protected readonly shippingLine = new Autocomplete(SHIPPING_LINES);
  protected readonly airline = new Autocomplete(AIRLINES);

  // Read-only header fields.
  protected readonly internalOrderNum = signal(1000);
  protected readonly creationDate = new Date().toLocaleDateString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Tab selections (data-value from the mock).
  protected readonly status = signal('בהכנה');
  protected readonly statuses = ['בהכנה', 'מוכנה לאיסוף', 'נאספה', 'ממתינה בנמל', 'יצאה לדרך'];

  protected readonly type = signal('ימי');
  protected readonly types = ['ימי', 'אווירי', 'יבשתי'];

  protected readonly terms = signal<'Prepaid' | 'Collect'>('Prepaid');
  protected readonly prepaidTerm = signal('CFR');
  protected readonly prepaidTerms = ['CFR', 'CAF', 'CPT', 'CIP'];
  protected readonly collectTerm = signal('EXW');
  protected readonly collectTermsRows = [
    ['EXW', 'FCA', 'FOB', 'FAC'],
    ['DAF', 'DES', 'DEQ', 'DDU', 'DDP'],
  ];

  protected readonly dest = signal('נמל אשדוד');
  protected readonly destinations = ['נמל אשדוד', 'נמל הדרום', 'נמל חיפה', 'נתב"ג'];

  // Transport-field visibility, derived from the shipment type — mirrors the
  // mock's toggleTransportFields(): sea fields hide for air/land, air fields for sea/land.
  protected readonly seaVisible = computed(() => {
    const t = this.type();
    return t !== 'אווירי' && t !== 'יבשתי';
  });
  protected readonly airVisible = computed(() => {
    const t = this.type();
    return t !== 'ימי' && t !== 'יבשתי';
  });

  protected onSave(): void {
    if (!this.customer.query()) {
      // A real form would flag the required control; keep the mock's console warning.
      console.warn('Customer is required');
      return;
    }
    // Mockup only — no backend.
    console.log('Order (mock) saved for:', this.customer.query());
    this.internalOrderNum.update((n) => n + 1);
  }
}
