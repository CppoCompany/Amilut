import { Component, computed, signal } from '@angular/core';

import {
  DESTINATION_LABELS,
  DESTINATIONS,
  Destination,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  OrderStatus,
  PAYMENT_TERMS_LABELS,
  PaymentTerms,
  SHIPMENT_TYPE_LABELS,
  SHIPMENT_TYPES,
  ShipmentType,
} from '../../../../api/enums';
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

  // Tab selections hold the API enum values; the template renders Hebrew via the label maps.
  protected readonly status = signal<OrderStatus>(OrderStatus.PREPARING);
  protected readonly statuses = ORDER_STATUSES;
  protected readonly statusLabels = ORDER_STATUS_LABELS;

  protected readonly type = signal<ShipmentType>(ShipmentType.SEA);
  protected readonly types = SHIPMENT_TYPES;
  protected readonly typeLabels = SHIPMENT_TYPE_LABELS;

  protected readonly PaymentTerms = PaymentTerms;
  protected readonly terms = signal<PaymentTerms>(PaymentTerms.PREPAID);
  protected readonly termsLabels = PAYMENT_TERMS_LABELS;
  protected readonly prepaidTerm = signal('CFR');
  protected readonly prepaidTerms = ['CFR', 'CAF', 'CPT', 'CIP'];
  protected readonly collectTerm = signal('EXW');
  protected readonly collectTermsRows = [
    ['EXW', 'FCA', 'FOB', 'FAC'],
    ['DAF', 'DES', 'DEQ', 'DDU', 'DDP'],
  ];

  protected readonly dest = signal<Destination>(Destination.ASHDOD);
  protected readonly destinations = DESTINATIONS;
  protected readonly destinationLabels = DESTINATION_LABELS;

  // Transport-field visibility, derived from the shipment type — mirrors the
  // mock's toggleTransportFields(): sea fields hide for air/land, air fields for sea/land.
  protected readonly seaVisible = computed(() => {
    const t = this.type();
    return t !== ShipmentType.AIR && t !== ShipmentType.LAND;
  });
  protected readonly airVisible = computed(() => {
    const t = this.type();
    return t !== ShipmentType.SEA && t !== ShipmentType.LAND;
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
