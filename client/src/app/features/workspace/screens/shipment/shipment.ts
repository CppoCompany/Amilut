import { Component, signal } from '@angular/core';

type ShipmentTab =
  | 'document'
  | 'forwarder'
  | 'shipper'
  | 'consignee'
  | 'notify'
  | 'cargo'
  | 'tariff'
  | 'terms'
  | 'documents';

/** Read-only "ניהול תיק" (file management) view, split into per-section tabs. */
@Component({
  selector: 'app-shipment-screen',
  templateUrl: './shipment.html',
})
export class ShipmentScreen {
  protected readonly tabs: { id: ShipmentTab; label: string }[] = [
    { id: 'document', label: 'זיהוי מסמך' },
    { id: 'forwarder', label: 'מוביל' },
    { id: 'shipper', label: 'שוגר' },
    { id: 'consignee', label: 'נמען' },
    { id: 'notify', label: 'Notify Party' },
    { id: 'cargo', label: 'מטען' },
    { id: 'tariff', label: 'מכס' },
    { id: 'terms', label: 'תנאים' },
    { id: 'documents', label: 'מסמכים' },
  ];

  protected readonly activeTab = signal<ShipmentTab>('document');
}
