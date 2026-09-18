import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { catchError, finalize, map, of, switchMap, throwError } from 'rxjs';

import {
  INCOTERM_LABELS,
  PAYMENT_TERMS_LABELS,
  SHIPMENT_DOCUMENT_TYPE_LABELS,
  SHIPMENT_DOCUMENT_TYPES,
  ShipmentDocumentType,
} from '../../../../api/enums';
import type { OrderDto, ShipmentDto } from '../../../../api/models';
import { OrdersApi } from '../../../../api/orders-api';
import { ShipmentsApi } from '../../../../api/shipments-api';
import { NavigationService } from '../../navigation.service';
import {
  EMPTY_SHIPMENT_FORM_VALUE,
  loadErrorMessage,
  saveErrorMessage,
  shipmentToFormValue,
  toCreateShipmentDto,
  toUpdateShipmentDto,
} from './shipment-form.mapper';

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

/** "ניהול תיק" — shipment file, 1:1 with an order, wired to `/api/shipments`. */
@Component({
  selector: 'app-shipment-screen',
  imports: [ReactiveFormsModule],
  templateUrl: './shipment.html',
  styleUrl: './shipment.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShipmentScreen {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ordersApi = inject(OrdersApi);
  private readonly shipmentsApi = inject(ShipmentsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);

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
  /** Save is only offered once the user has reached the last tab. */
  protected readonly isLastTab = computed(
    () => this.activeTab() === this.tabs[this.tabs.length - 1].id,
  );

  // ── Order picker ────────────────────────────────────────────────────────────
  protected readonly orderIdText = signal('');
  protected readonly currentOrder = signal<OrderDto | null>(null);
  protected readonly existingShipment = signal<ShipmentDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  // ── Save state ──────────────────────────────────────────────────────────────
  protected readonly saving = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  // ── Tab-driven selections ───────────────────────────────────────────────────
  protected readonly documentTypes = SHIPMENT_DOCUMENT_TYPES;
  protected readonly documentTypeLabels = SHIPMENT_DOCUMENT_TYPE_LABELS;
  protected readonly documentType = signal<ShipmentDocumentType | null>(null);
  protected readonly dangerousGoods = signal(false);

  /** Incoterm / freight terms are set on the order itself — shown read-only here. */
  protected readonly orderPaymentTermsLabel = computed(() => {
    const order = this.currentOrder();
    return order ? PAYMENT_TERMS_LABELS[order.paymentTerms] : '';
  });
  protected readonly orderIncotermLabel = computed(() => {
    const order = this.currentOrder();
    return order ? INCOTERM_LABELS[order.incoterm] : '';
  });

  // ── Free-text / date / numeric fields ───────────────────────────────────────
  protected readonly form = this.fb.group({
    billOfLadingNumber: [EMPTY_SHIPMENT_FORM_VALUE.billOfLadingNumber],
    blIssueDate: [EMPTY_SHIPMENT_FORM_VALUE.blIssueDate],
    forwarderName: [EMPTY_SHIPMENT_FORM_VALUE.forwarderName],
    voyageFlightNumber: [EMPTY_SHIPMENT_FORM_VALUE.voyageFlightNumber],
    vesselName: [EMPTY_SHIPMENT_FORM_VALUE.vesselName],
    portOfLoading: [EMPTY_SHIPMENT_FORM_VALUE.portOfLoading],
    portOfDischarge: [EMPTY_SHIPMENT_FORM_VALUE.portOfDischarge],
    manifestNumber: [EMPTY_SHIPMENT_FORM_VALUE.manifestNumber],
    transactionNumber: [EMPTY_SHIPMENT_FORM_VALUE.transactionNumber],
    shipperName: [EMPTY_SHIPMENT_FORM_VALUE.shipperName],
    shipperAddress: [EMPTY_SHIPMENT_FORM_VALUE.shipperAddress],
    consigneeName: [EMPTY_SHIPMENT_FORM_VALUE.consigneeName],
    consigneeAddress: [EMPTY_SHIPMENT_FORM_VALUE.consigneeAddress],
    notifyParty: [EMPTY_SHIPMENT_FORM_VALUE.notifyParty],
    cargoDescription: [EMPTY_SHIPMENT_FORM_VALUE.cargoDescription],
    packageCount: [EMPTY_SHIPMENT_FORM_VALUE.packageCount],
    packageUnit: [EMPTY_SHIPMENT_FORM_VALUE.packageUnit],
    grossWeightKg: [EMPTY_SHIPMENT_FORM_VALUE.grossWeightKg],
    netWeightKg: [EMPTY_SHIPMENT_FORM_VALUE.netWeightKg],
    volumeCbm: [EMPTY_SHIPMENT_FORM_VALUE.volumeCbm],
    hsCode: [EMPTY_SHIPMENT_FORM_VALUE.hsCode],
    dangerousGoodsImoClass: [EMPTY_SHIPMENT_FORM_VALUE.dangerousGoodsImoClass],
    containerNumber: [EMPTY_SHIPMENT_FORM_VALUE.containerNumber],
    containerType: [EMPTY_SHIPMENT_FORM_VALUE.containerType],
    containerSealNumber: [EMPTY_SHIPMENT_FORM_VALUE.containerSealNumber],
  });

  constructor() {
    // A double-click on a row in "התיקים שלי" queues an order id here (see
    // NavigationService.openShipmentForEdit) before switching to this screen.
    // Consume it once immediately so a later, ordinary navigation back to this
    // screen (e.g. via the sidebar) starts with a blank picker as usual.
    const editOrderId = this.nav.editShipmentOrderId();
    if (editOrderId !== null) {
      this.nav.editShipmentOrderId.set(null);
      this.orderIdText.set(String(editOrderId));
      this.loadOrder();
    }
  }

  /** Looks up the order, then its shipment file (if any already exists). */
  protected loadOrder(): void {
    if (this.loading()) return;

    const orderId = Number(this.orderIdText().trim());
    if (!Number.isInteger(orderId) || orderId <= 0) {
      this.loadError.set('יש להזין מספר הזמנה תקין');
      return;
    }

    this.loadError.set(null);
    this.successMessage.set(null);
    this.errorMessage.set(null);
    this.loading.set(true);

    this.ordersApi
      .getById(orderId)
      .pipe(
        switchMap((order) =>
          this.shipmentsApi.getByOrderId(orderId).pipe(
            map((shipment) => ({ order, shipment: shipment as ShipmentDto | null })),
            catchError((err: unknown) =>
              err instanceof HttpErrorResponse && err.status === 404
                ? of({ order, shipment: null })
                : throwError(() => err),
            ),
          ),
        ),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ order, shipment }) => {
          this.currentOrder.set(order);
          this.applyShipment(shipment);
        },
        error: (error: unknown) => {
          this.currentOrder.set(null);
          this.applyShipment(null);
          this.loadError.set(loadErrorMessage(error));
        },
      });
  }

  /** Drops the loaded order/file so a different order number can be entered. */
  protected changeOrder(): void {
    this.orderIdText.set('');
    this.currentOrder.set(null);
    this.applyShipment(null);
    this.loadError.set(null);
    this.successMessage.set(null);
    this.errorMessage.set(null);
    this.activeTab.set('document');
  }

  /** Creates the shipment file on the first save; PATCHes the same file on later saves. */
  protected onSave(): void {
    const order = this.currentOrder();
    if (!order || this.saving()) return;

    this.successMessage.set(null);
    this.errorMessage.set(null);

    const selection = { documentType: this.documentType(), dangerousGoods: this.dangerousGoods() };
    const form = this.form.getRawValue();
    const existing = this.existingShipment();

    const request$ = existing
      ? this.shipmentsApi.update(existing.id, toUpdateShipmentDto(selection, form))
      : this.shipmentsApi.create(toCreateShipmentDto(order.id, selection, form));

    this.saving.set(true);
    request$
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (shipment) => {
          this.existingShipment.set(shipment);
          this.successMessage.set(`התיק נשמר — מספר תיק ${shipment.id}`);
        },
        error: (error: unknown) => this.errorMessage.set(saveErrorMessage(error)),
      });
  }

  private applyShipment(shipment: ShipmentDto | null): void {
    this.existingShipment.set(shipment);
    this.documentType.set(shipment?.documentType ?? null);
    this.dangerousGoods.set(shipment?.dangerousGoods ?? false);
    this.form.reset(shipment ? shipmentToFormValue(shipment) : EMPTY_SHIPMENT_FORM_VALUE);
  }
}
