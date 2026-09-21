import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { combineLatest, debounceTime, finalize, forkJoin, skip } from 'rxjs';

import {
  INCOTERM_LABELS,
  PAYMENT_TERMS_LABELS,
  SHIPMENT_DOCUMENT_TYPE_LABELS,
  SHIPMENT_DOCUMENT_TYPES,
  ShipmentDocumentType,
} from '../../../../api/enums';
import type { CustomerDto, OrderDto, ShipmentDto, SupplierDto } from '../../../../api/models';
import { ListOrdersParams, OrdersApi } from '../../../../api/orders-api';
import { ShipmentsApi } from '../../../../api/shipments-api';
import {
  CustomerAutocomplete,
  SEARCH_DEBOUNCE_MS,
} from '../../../customers/customer-autocomplete/customer-autocomplete';
import { SupplierAutocomplete } from '../../../suppliers/supplier-autocomplete/supplier-autocomplete';
import { NavigationService } from '../../navigation.service';
import {
  EMPTY_SHIPMENT_FORM_VALUE,
  loadErrorMessage,
  saveErrorMessage,
  shipmentToFormValue,
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

/** Single batch fetched per filter change; rendering beyond this is virtualized, not paginated. */
const MAX_ROWS = 200;

/** "ניהול תיק" — shipment file, 1 case → many orders, wired to `/api/shipments`. */
@Component({
  selector: 'app-shipment-screen',
  imports: [ReactiveFormsModule, FormsModule, CustomerAutocomplete, SupplierAutocomplete],
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

  /** The tab right before the active one, or `null` on the first tab. */
  protected readonly previousTab = computed(() => {
    const index = this.tabs.findIndex((tab) => tab.id === this.activeTab());
    return index > 0 ? this.tabs[index - 1] : null;
  });
  /** The tab right after the active one, or `null` on the last tab. */
  protected readonly nextTab = computed(() => {
    const index = this.tabs.findIndex((tab) => tab.id === this.activeTab());
    return index < this.tabs.length - 1 ? this.tabs[index + 1] : null;
  });

  // ── Order selection step ────────────────────────────────────────────────────
  protected readonly filterCustomer = signal<CustomerDto | null>(null);
  protected readonly filterSupplier = signal<SupplierDto | null>(null);
  /** Orders with no case yet, as returned by the server (`hasCase: false`). */
  private readonly unassignedOrders = signal<OrderDto[]>([]);
  /** Unassigned orders, plus the case's own currently-associated orders so they stay visible/checked while editing an association. */
  protected readonly selectableOrders = computed(() => {
    const base = this.unassignedOrders();
    const extra = this.associatedOrders().filter(
      (order) => !base.some((candidate) => candidate.id === order.id),
    );
    return [...extra, ...base];
  });
  protected readonly selectedOrderIds = signal<ReadonlySet<number>>(new Set());
  protected readonly ordersLoading = signal(false);
  protected readonly ordersError = signal<string | null>(null);
  /** True while re-picking the orders of an already-created case. */
  protected readonly editingAssociation = signal(false);

  protected readonly existingShipment = signal<ShipmentDto | null>(null);
  /** Full order rows for `existingShipment().orders`, fetched for read-only display (Incoterm/Freight Terms). */
  protected readonly associatedOrders = signal<OrderDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  /** The order-selection grid is shown until a case exists, or while re-picking its orders. */
  protected readonly showOrderSelection = computed(
    () => this.existingShipment() === null || this.editingAssociation(),
  );
  protected readonly associateButtonLabel = computed(() =>
    this.existingShipment() ? 'עדכן שיוך' : 'שיוך לתיק שילוח',
  );

  // ── Save state ──────────────────────────────────────────────────────────────
  protected readonly saving = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  // ── Tab-driven selections ───────────────────────────────────────────────────
  protected readonly documentTypes = SHIPMENT_DOCUMENT_TYPES;
  protected readonly documentTypeLabels = SHIPMENT_DOCUMENT_TYPE_LABELS;
  protected readonly documentType = signal<ShipmentDocumentType | null>(null);
  protected readonly dangerousGoods = signal(false);

  /** Incoterm / freight terms are set on each associated order — shown read-only here. */
  protected readonly orderIncotermLabel = computed(() => this.joinDistinctLabels(
    this.associatedOrders().map((order) => INCOTERM_LABELS[order.incoterm]),
  ));
  protected readonly orderPaymentTermsLabel = computed(() => this.joinDistinctLabels(
    this.associatedOrders().map((order) => PAYMENT_TERMS_LABELS[order.paymentTerms]),
  ));

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
    this.fetchSelectableOrders();

    combineLatest([toObservable(this.filterCustomer), toObservable(this.filterSupplier)])
      .pipe(
        skip(1), // the initial load above already happened
        debounceTime(SEARCH_DEBOUNCE_MS),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.fetchSelectableOrders());

    // A double-click on a row in "התיקים שלי" queues a case id here (see
    // NavigationService.openCaseForEdit) before switching to this screen.
    // Consume it once immediately so a later, ordinary navigation back to this
    // screen (e.g. via the sidebar) starts with a blank selection as usual.
    const editCaseId = this.nav.editCaseId();
    if (editCaseId !== null) {
      this.nav.editCaseId.set(null);
      this.loadCase(editCaseId);
    }
  }

  protected clearFilters(): void {
    this.filterCustomer.set(null);
    this.filterSupplier.set(null);
  }

  protected isOrderSelected(orderId: number): boolean {
    return this.selectedOrderIds().has(orderId);
  }

  protected toggleOrderSelection(orderId: number): void {
    const next = new Set(this.selectedOrderIds());
    if (next.has(orderId)) {
      next.delete(orderId);
    } else {
      next.add(orderId);
    }
    this.selectedOrderIds.set(next);
  }

  /** Loads an existing case (e.g. for editing) by its own id. */
  protected loadCase(caseId: number): void {
    if (this.loading()) return;

    this.loadError.set(null);
    this.successMessage.set(null);
    this.errorMessage.set(null);
    this.loading.set(true);

    this.shipmentsApi
      .getById(caseId)
      .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (shipment) => this.applyShipment(shipment),
        error: (error: unknown) => {
          this.applyShipment(null);
          this.loadError.set(loadErrorMessage(error));
        },
      });
  }

  /** Switches back to the order-selection grid, pre-checking the case's current orders. */
  protected editAssociation(): void {
    const shipment = this.existingShipment();
    this.selectedOrderIds.set(new Set(shipment ? shipment.orders.map((order) => order.id) : []));
    this.editingAssociation.set(true);
  }

  protected cancelEditAssociation(): void {
    this.editingAssociation.set(false);
  }

  /** Associates the checked orders with a new case, or updates an existing case's orders. */
  protected onAssociate(): void {
    const orderIds = [...this.selectedOrderIds()];
    if (orderIds.length === 0 || this.saving()) return;

    this.successMessage.set(null);
    this.errorMessage.set(null);
    this.saving.set(true);

    const existing = this.existingShipment();
    const request$ = existing
      ? this.shipmentsApi.updateOrders(existing.id, orderIds)
      : this.shipmentsApi.create({ orderIds, dangerousGoods: false });

    request$
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (shipment) => {
          this.applyShipment(shipment);
          this.editingAssociation.set(false);
          this.activeTab.set('document');
        },
        error: (error: unknown) => this.errorMessage.set(saveErrorMessage(error)),
      });
  }

  protected goToPreviousTab(): void {
    const tab = this.previousTab();
    if (tab) this.activeTab.set(tab.id);
  }

  protected goToNextTab(): void {
    const tab = this.nextTab();
    if (tab) this.activeTab.set(tab.id);
  }

  /** Patches the document fields of the already-open case. */
  protected onSave(): void {
    const existing = this.existingShipment();
    if (!existing || this.saving()) return;

    this.successMessage.set(null);
    this.errorMessage.set(null);

    const selection = { documentType: this.documentType(), dangerousGoods: this.dangerousGoods() };
    const form = this.form.getRawValue();

    this.saving.set(true);
    this.shipmentsApi
      .update(existing.id, toUpdateShipmentDto(selection, form))
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (shipment) => {
          this.existingShipment.set(shipment);
          this.successMessage.set(`התיק נשמר — מספר תיק ${shipment.id}`);
        },
        error: (error: unknown) => this.errorMessage.set(saveErrorMessage(error)),
      });
  }

  private fetchSelectableOrders(): void {
    // Only orders with no shipping case yet — `unassignedOrders` is merged with
    // `associatedOrders()` below (in `selectableOrders`) so a case's own orders
    // stay visible/checked while re-picking its association.
    const params: ListOrdersParams = { limit: MAX_ROWS, hasCase: false };

    this.ordersLoading.set(true);
    this.ordersError.set(null);
    this.ordersApi
      .list(params)
      .pipe(finalize(() => this.ordersLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.unassignedOrders.set(rows),
        error: () => {
          this.unassignedOrders.set([]);
          this.ordersError.set('טעינת ההזמנות נכשלה');
        },
      });
  }

  private applyShipment(shipment: ShipmentDto | null): void {
    this.existingShipment.set(shipment);
    this.documentType.set(shipment?.documentType ?? null);
    this.dangerousGoods.set(shipment?.dangerousGoods ?? false);
    this.form.reset(shipment ? shipmentToFormValue(shipment) : EMPTY_SHIPMENT_FORM_VALUE);
    if (!shipment) {
      this.selectedOrderIds.set(new Set());
    }
    this.loadAssociatedOrders(shipment);
  }

  private loadAssociatedOrders(shipment: ShipmentDto | null): void {
    if (!shipment || shipment.orders.length === 0) {
      this.associatedOrders.set([]);
      return;
    }
    forkJoin(shipment.orders.map((order) => this.ordersApi.getById(order.id)))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => this.associatedOrders.set(orders),
        error: () => this.associatedOrders.set([]),
      });
  }

  private joinDistinctLabels(labels: string[]): string {
    return labels.length ? [...new Set(labels)].join(', ') : '—';
  }
}
