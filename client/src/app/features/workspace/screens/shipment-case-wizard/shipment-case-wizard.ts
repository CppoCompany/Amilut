import { DestroyRef, ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { combineLatest, debounceTime, finalize, forkJoin, skip, switchMap } from 'rxjs';

import {
  MBL_SHIPPING_TYPE_LABELS,
  MblShippingType,
  PAYMENT_TERMS,
  PAYMENT_TERMS_LABELS,
  PaymentTerms,
  SEA_METHOD_LABELS,
  SeaMethod,
} from '../../../../api/enums';
import type { CustomerDto, HblDto, MblDto, OrderDto, SupplierDto } from '../../../../api/models';
import { HblApi } from '../../../../api/hbl-api';
import { MblApi } from '../../../../api/mbl-api';
import { ListOrdersParams, OrdersApi } from '../../../../api/orders-api';
import {
  CustomerAutocomplete,
  SEARCH_DEBOUNCE_MS,
} from '../../../customers/customer-autocomplete/customer-autocomplete';
import { SupplierAutocomplete } from '../../../suppliers/supplier-autocomplete/supplier-autocomplete';
import { NavigationService } from '../../navigation.service';
import {
  EMPTY_HBL_FORM_VALUE,
  hblToFormValue,
  saveErrorMessage as saveHblErrorMessage,
  toCreateHblDto,
  toUpdateHblDto,
} from './hbl-form.mapper';
import {
  EMPTY_MBL_CONTAINER_FORM_VALUE,
  EMPTY_MBL_FORM_VALUE,
  containerToFormValue,
  mblToFormValue,
  saveErrorMessage as saveMblErrorMessage,
  toCreateMblDto,
} from './mbl-form.mapper';

const SEA_METHOD_DESCRIPTIONS: Record<SeaMethod, string> = {
  [SeaMethod.FCL_FCL]: 'מכולה מלאה ללקוח אחד — תיק HBL יחיד',
  [SeaMethod.FCL_LCL]: 'מכולה מלאה המחולקת למספר תיקי HBL עבור אותו לקוח',
  [SeaMethod.LCL_LCL]: 'מכולה משותפת, עם תיק HBL נפרד לכל לקוח',
  [SeaMethod.GROUPAGE_FCL]: 'מספר מכולות, כל אחת עם תיקי HBL משל עצמה',
};

/** Single batch fetched per filter change; rendering beyond this is not paginated. */
const MAX_ROWS = 200;

/** "יצירת תיק שילוח" — the new MBL/HBL shipping-case workflow. Separate from
 *  (and does not replace) the legacy `ShipmentScreen`, which still handles
 *  every `order_account` case created before this workflow existed, reached
 *  only via "התיקים שלי" → double-click (see `NavigationService.openCaseForEdit`).
 *  This screen is reached only via "יצירת תיק שילוח" in the sidebar. */
@Component({
  selector: 'app-shipment-case-wizard-screen',
  imports: [ReactiveFormsModule, CustomerAutocomplete, SupplierAutocomplete],
  templateUrl: './shipment-case-wizard.html',
  styleUrl: './shipment-case-wizard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShipmentCaseWizardScreen {
  private readonly nav = inject(NavigationService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly mblApi = inject(MblApi);
  private readonly hblApi = inject(HblApi);
  private readonly ordersApi = inject(OrdersApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly MblShippingType = MblShippingType;
  protected readonly SeaMethod = SeaMethod;
  protected readonly SHIPPING_TYPE_LABELS = MBL_SHIPPING_TYPE_LABELS;
  protected readonly SEA_METHOD_LABELS = SEA_METHOD_LABELS;
  protected readonly SEA_METHOD_DESCRIPTIONS = SEA_METHOD_DESCRIPTIONS;
  protected readonly seaMethods: readonly SeaMethod[] = [
    SeaMethod.FCL_FCL,
    SeaMethod.FCL_LCL,
    SeaMethod.LCL_LCL,
    SeaMethod.GROUPAGE_FCL,
  ];
  protected readonly paymentTermsOptions = PAYMENT_TERMS;
  protected readonly paymentTermsLabels = PAYMENT_TERMS_LABELS;

  protected readonly shippingType = signal<MblShippingType | null>(null);
  protected readonly seaMethod = signal<SeaMethod | null>(null);

  // ── MBL step ─────────────────────────────────────────────────────────────────
  /** Set only for `fcl_lcl` — one customer, shared by every HBL under this MBL. */
  protected readonly needsCustomer = computed(() => this.seaMethod() === SeaMethod.FCL_LCL);
  protected readonly isGroupage = computed(() => this.seaMethod() === SeaMethod.GROUPAGE_FCL);
  protected readonly mblCustomer = signal<CustomerDto | null>(null);
  protected readonly freightTerms = signal<PaymentTerms | null>(null);

  protected readonly mblForm = this.fb.group({
    mblNumber: [EMPTY_MBL_FORM_VALUE.mblNumber],
    bookingNumber: [EMPTY_MBL_FORM_VALUE.bookingNumber],
    vesselName: [EMPTY_MBL_FORM_VALUE.vesselName],
    voyageNumber: [EMPTY_MBL_FORM_VALUE.voyageNumber],
    portOfLoading: [EMPTY_MBL_FORM_VALUE.portOfLoading],
    portOfDischarge: [EMPTY_MBL_FORM_VALUE.portOfDischarge],
    finalDestination: [EMPTY_MBL_FORM_VALUE.finalDestination],
    carrierName: [EMPTY_MBL_FORM_VALUE.carrierName],
    shipperName: [EMPTY_MBL_FORM_VALUE.shipperName],
    shipperAddress: [EMPTY_MBL_FORM_VALUE.shipperAddress],
    consigneeName: [EMPTY_MBL_FORM_VALUE.consigneeName],
    consigneeAddress: [EMPTY_MBL_FORM_VALUE.consigneeAddress],
    notifyPartyName: [EMPTY_MBL_FORM_VALUE.notifyPartyName],
    notifyPartyAddress: [EMPTY_MBL_FORM_VALUE.notifyPartyAddress],
    containerNumber: [EMPTY_MBL_FORM_VALUE.containerNumber],
    containerSealNumber: [EMPTY_MBL_FORM_VALUE.containerSealNumber],
    cargoDescription: [EMPTY_MBL_FORM_VALUE.cargoDescription],
    grossWeightKg: [EMPTY_MBL_FORM_VALUE.grossWeightKg],
    volumeCbm: [EMPTY_MBL_FORM_VALUE.volumeCbm],
    receiptDeliveryType: [EMPTY_MBL_FORM_VALUE.receiptDeliveryType],
    placeOfIssue: [EMPTY_MBL_FORM_VALUE.placeOfIssue],
    dateOfIssue: [EMPTY_MBL_FORM_VALUE.dateOfIssue],
    containers: this.fb.array([this.buildContainerGroup()]),
  });

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly savedMbl = signal<MblDto | null>(null);
  /** True while re-showing the MBL form to edit an already-saved MBL (triggered
   *  from the sidebar tree's MBL node, or the "ערוך פרטי MBL" button). */
  protected readonly editingMbl = signal(false);

  // ── HBL step ─────────────────────────────────────────────────────────────────
  protected readonly hbls = signal<HblDto[]>([]);
  protected readonly hblsLoading = signal(false);

  /** `fcl_fcl` allows exactly one HBL; every other method allows adding more freely. */
  protected readonly canAddAnotherHbl = computed(
    () => this.seaMethod() !== SeaMethod.FCL_FCL || this.hbls().length === 0,
  );

  /** A customer must be picked per-HBL for every method except `fcl_lcl`, where
   *  it's inherited from the MBL's own `customerId` (chosen once, in the MBL step). */
  protected readonly needsHblCustomerPicker = computed(() => this.seaMethod() !== SeaMethod.FCL_LCL);
  protected readonly hblCustomer = signal<CustomerDto | null>(null);
  protected readonly hblContainerId = signal<number | null>(null);

  /** Non-null while editing an already-saved HBL (picked from the sidebar tree or
   *  the created-HBL list) instead of creating a new one — `customerId`/`containerId`
   *  are immutable once created, so the picker/choice-group are hidden in this mode. */
  protected readonly editingHblId = signal<number | null>(null);
  protected readonly editingHbl = computed(() => {
    const id = this.editingHblId();
    return id === null ? null : (this.hbls().find((h) => h.id === id) ?? null);
  });

  protected readonly hblForm = this.fb.group({
    hblNumber: [EMPTY_HBL_FORM_VALUE.hblNumber],
    shipperName: [EMPTY_HBL_FORM_VALUE.shipperName],
    shipperAddress: [EMPTY_HBL_FORM_VALUE.shipperAddress],
    consigneeName: [EMPTY_HBL_FORM_VALUE.consigneeName],
    consigneeAddress: [EMPTY_HBL_FORM_VALUE.consigneeAddress],
    notifyPartyName: [EMPTY_HBL_FORM_VALUE.notifyPartyName],
    notifyPartyAddress: [EMPTY_HBL_FORM_VALUE.notifyPartyAddress],
    cargoDescription: [EMPTY_HBL_FORM_VALUE.cargoDescription],
    quantity: [EMPTY_HBL_FORM_VALUE.quantity],
    grossWeightKg: [EMPTY_HBL_FORM_VALUE.grossWeightKg],
    volumeCbm: [EMPTY_HBL_FORM_VALUE.volumeCbm],
    remarks: [EMPTY_HBL_FORM_VALUE.remarks],
  });

  // Optional order association, scoped to orders with no HBL yet — same
  // filter+checkbox pattern as the legacy ShipmentScreen's order-selection step.
  protected readonly hblOrderFilterCustomer = signal<CustomerDto | null>(null);
  protected readonly hblOrderFilterSupplier = signal<SupplierDto | null>(null);
  private readonly hblOrderCandidates = signal<OrderDto[]>([]);
  /** The HBL-being-edited's own already-associated orders, merged into the
   *  candidate grid below so they stay visible/checked (same reasoning as
   *  `ShipmentScreen.selectableOrders`: they're excluded by `hasHbl: false`
   *  precisely because they're already on this HBL). */
  private readonly editingHblAssociatedOrders = signal<OrderDto[]>([]);
  protected readonly hblOrderCandidatesDisplay = computed(() => {
    const base = this.hblOrderCandidates();
    const extra = this.editingHblAssociatedOrders().filter(
      (order) => !base.some((candidate) => candidate.id === order.id),
    );
    return [...extra, ...base];
  });
  protected readonly hblSelectedOrderIds = signal<ReadonlySet<number>>(new Set());
  protected readonly hblOrdersLoading = signal(false);
  protected readonly hblOrdersError = signal<string | null>(null);

  protected readonly savingHbl = signal(false);
  protected readonly hblSaveError = signal<string | null>(null);

  constructor() {
    // Filter changes only ever fire after the HBL step's first fetch (triggered
    // by a successful MBL save, see `onSaveMbl`) — `skip(1)` just guards against
    // the subscription's own initial emission, same pattern as `ShipmentScreen`.
    combineLatest([toObservable(this.hblOrderFilterCustomer), toObservable(this.hblOrderFilterSupplier)])
      .pipe(skip(1), debounceTime(SEARCH_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.fetchHblOrderCandidates());

    // "יצירת תיק שילוח" in the sidebar bumps this even when this screen is
    // already mounted mid-wizard (selecting it again doesn't change
    // activePage, so the component isn't recreated) — jump back to step one,
    // same reset pattern used by the order screen's newOrderRequested.
    let skipFirst = true;
    effect(() => {
      this.nav.newCaseRequested();
      if (skipFirst) {
        skipFirst = false;
        return;
      }
      this.reset();
    });
  }

  protected selectShippingType(type: MblShippingType): void {
    this.shippingType.set(type);
    this.seaMethod.set(null);
  }

  protected selectSeaMethod(method: SeaMethod): void {
    this.seaMethod.set(method);
  }

  protected backToShippingType(): void {
    this.resetMblState();
    this.shippingType.set(null);
    this.seaMethod.set(null);
  }

  protected backToSeaMethod(): void {
    this.resetMblState();
    this.seaMethod.set(null);
  }

  protected containerControls() {
    return this.mblForm.controls.containers.controls;
  }

  protected addContainer(): void {
    this.mblForm.controls.containers.push(this.buildContainerGroup());
  }

  protected removeContainer(index: number): void {
    this.mblForm.controls.containers.removeAt(index);
  }

  /** Re-opens the already-saved MBL's fields for editing — the customer picker
   *  (fcl_lcl only) is intentionally NOT re-editable here: changing it after
   *  HBLs already exist under the old customer would break their shared-customer
   *  invariant (enforced server-side by `HblService.validateCustomer`). */
  protected startEditMbl(): void {
    const mbl = this.savedMbl();
    if (!mbl) return;

    this.mblForm.patchValue(mblToFormValue(mbl));
    const containers = this.mblForm.controls.containers;
    containers.clear();
    if (mbl.containers.length) {
      for (const container of mbl.containers) {
        const group = this.buildContainerGroup();
        group.patchValue(containerToFormValue(container));
        containers.push(group);
      }
    } else {
      containers.push(this.buildContainerGroup());
    }
    this.freightTerms.set(mbl.freightTerms ?? null);
    this.saveError.set(null);
    this.editingMbl.set(true);
  }

  protected cancelEditMbl(): void {
    this.editingMbl.set(false);
    this.saveError.set(null);
  }

  protected onSaveMbl(): void {
    const shippingType = this.shippingType();
    if (!shippingType || this.saving()) return;
    const seaMethod = this.seaMethod();
    const editing = this.editingMbl();
    const existingMbl = this.savedMbl();

    if (this.needsCustomer() && !editing && !this.mblCustomer()) {
      this.saveError.set('יש לבחור לקוח לפני השמירה');
      return;
    }
    if (this.isGroupage() && this.mblForm.controls.containers.length === 0) {
      this.saveError.set('יש להוסיף לפחות מכולה אחת');
      return;
    }

    this.saveError.set(null);
    this.saving.set(true);

    const { containers, ...formFields } = this.mblForm.getRawValue();
    const customerId = editing ? (existingMbl?.customerId ?? null) : (this.mblCustomer()?.id ?? null);
    const dto = toCreateMblDto(shippingType, seaMethod, customerId, this.freightTerms(), formFields, containers);

    const request$ =
      editing && existingMbl ? this.mblApi.update(existingMbl.id, dto) : this.mblApi.create(dto);

    request$
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mbl) => {
          this.savedMbl.set(mbl);
          this.editingMbl.set(false);
          if (!editing) {
            this.loadHbls(mbl.id);
            this.fetchHblOrderCandidates();
          }
        },
        error: (error: unknown) => this.saveError.set(saveMblErrorMessage(error)),
      });
  }

  /** The container a given HBL belongs to, for display in the HBL list (groupage only). */
  protected containerLabel(containerId: number | null): string {
    const container = this.savedMbl()?.containers.find((c) => c.id === containerId);
    if (!container) return '—';
    return container.containerNumber ?? `מכולה #${container.id}`;
  }

  /** The HBLs belonging to one container, in sequence order — the sidebar tree's
   *  grouping for `groupage_fcl` so the container↔HBL relationship reads clearly. */
  protected hblsForContainer(containerId: number): HblDto[] {
    return this.hbls().filter((hbl) => hbl.containerId === containerId);
  }

  /** Clicking a container node in the sidebar pre-selects it for the next new
   *  HBL — ignored while already editing an existing HBL (container is immutable). */
  protected selectContainerNode(containerId: number): void {
    if (this.editingHblId() !== null) return;
    this.hblContainerId.set(containerId);
  }

  protected isHblOrderSelected(orderId: number): boolean {
    return this.hblSelectedOrderIds().has(orderId);
  }

  protected toggleHblOrderSelection(orderId: number): void {
    const next = new Set(this.hblSelectedOrderIds());
    if (next.has(orderId)) {
      next.delete(orderId);
    } else {
      next.add(orderId);
    }
    this.hblSelectedOrderIds.set(next);
  }

  protected allHblOrdersSelected(): boolean {
    const visible = this.hblOrderCandidatesDisplay();
    return visible.length > 0 && visible.every((order) => this.isHblOrderSelected(order.id));
  }

  protected toggleSelectAllHblOrders(): void {
    const visible = this.hblOrderCandidatesDisplay();
    if (this.allHblOrdersSelected()) {
      this.hblSelectedOrderIds.set(new Set());
      return;
    }
    this.hblSelectedOrderIds.set(new Set(visible.map((order) => order.id)));
  }

  /** Loads an already-saved HBL (from the sidebar tree or the created-HBL list)
   *  into the form for editing — `customerId`/`containerId` stay as they were. */
  protected startEditHbl(hbl: HblDto): void {
    this.hblForm.patchValue(hblToFormValue(hbl));
    this.hblSelectedOrderIds.set(new Set(hbl.orders.map((order) => order.id)));
    this.hblSaveError.set(null);
    this.editingHblId.set(hbl.id);

    if (hbl.orders.length === 0) {
      this.editingHblAssociatedOrders.set([]);
      return;
    }
    forkJoin(hbl.orders.map((order) => this.ordersApi.getById(order.id)))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => this.editingHblAssociatedOrders.set(orders),
        error: () => this.editingHblAssociatedOrders.set([]),
      });
  }

  protected cancelEditHbl(): void {
    this.resetHblForm();
    this.fetchHblOrderCandidates();
  }

  protected onSaveHbl(): void {
    const mbl = this.savedMbl();
    if (!mbl || this.savingHbl()) return;
    const editingId = this.editingHblId();

    let customerId: number | null = null;
    let containerId: number | null = null;
    if (!editingId) {
      customerId = this.needsHblCustomerPicker() ? (this.hblCustomer()?.id ?? null) : mbl.customerId;
      if (customerId === null) {
        this.hblSaveError.set('יש לבחור לקוח עבור תיק ה-HBL');
        return;
      }
      if (this.isGroupage()) {
        containerId = this.hblContainerId();
        if (containerId === null) {
          this.hblSaveError.set('יש לבחור מכולה עבור תיק ה-HBL');
          return;
        }
      }
    }

    this.hblSaveError.set(null);
    this.savingHbl.set(true);

    const formValue = this.hblForm.getRawValue();
    const orderIds = [...this.hblSelectedOrderIds()];

    const request$ = editingId
      ? this.hblApi
          .update(editingId, toUpdateHblDto(formValue))
          .pipe(switchMap((hbl) => this.hblApi.updateOrders(hbl.id, orderIds)))
      : this.hblApi.create(toCreateHblDto(mbl.id, containerId, customerId!, formValue, orderIds));

    request$
      .pipe(finalize(() => this.savingHbl.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hbl) => {
          this.hbls.update((list) => {
            const index = list.findIndex((existing) => existing.id === hbl.id);
            if (index === -1) return [...list, hbl];
            const next = [...list];
            next[index] = hbl;
            return next;
          });
          this.resetHblForm();
          this.fetchHblOrderCandidates();
        },
        error: (error: unknown) => this.hblSaveError.set(saveHblErrorMessage(error)),
      });
  }

  private loadHbls(mblId: number): void {
    this.hblsLoading.set(true);
    this.hblApi
      .findByMblId(mblId)
      .pipe(finalize(() => this.hblsLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.hbls.set(rows),
        error: () => this.hbls.set([]),
      });
  }

  private fetchHblOrderCandidates(): void {
    const params: ListOrdersParams = { limit: MAX_ROWS, hasHbl: false };
    const customer = this.hblOrderFilterCustomer();
    const supplier = this.hblOrderFilterSupplier();
    if (customer) params.customerId = customer.id;
    if (supplier) params.supplierId = supplier.id;

    this.hblOrdersLoading.set(true);
    this.hblOrdersError.set(null);
    this.ordersApi
      .list(params)
      .pipe(finalize(() => this.hblOrdersLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.hblOrderCandidates.set(rows),
        error: () => {
          this.hblOrderCandidates.set([]);
          this.hblOrdersError.set('טעינת ההזמנות נכשלה');
        },
      });
  }

  private buildContainerGroup() {
    return this.fb.group({
      containerNumber: [EMPTY_MBL_CONTAINER_FORM_VALUE.containerNumber],
      containerSealNumber: [EMPTY_MBL_CONTAINER_FORM_VALUE.containerSealNumber],
      cargoDescription: [EMPTY_MBL_CONTAINER_FORM_VALUE.cargoDescription],
      grossWeightKg: [EMPTY_MBL_CONTAINER_FORM_VALUE.grossWeightKg],
      volumeCbm: [EMPTY_MBL_CONTAINER_FORM_VALUE.volumeCbm],
    });
  }

  private resetMblState(): void {
    this.mblForm.patchValue(EMPTY_MBL_FORM_VALUE);
    const containers = this.mblForm.controls.containers;
    containers.clear();
    containers.push(this.buildContainerGroup());
    this.mblCustomer.set(null);
    this.freightTerms.set(null);
    this.savedMbl.set(null);
    this.editingMbl.set(false);
    this.saveError.set(null);
    this.saving.set(false);
    this.hbls.set([]);
    this.resetHblForm();
  }

  private resetHblForm(): void {
    this.hblForm.reset(EMPTY_HBL_FORM_VALUE);
    this.hblCustomer.set(null);
    this.hblContainerId.set(null);
    this.hblSelectedOrderIds.set(new Set());
    this.hblSaveError.set(null);
    this.savingHbl.set(false);
    this.editingHblId.set(null);
    this.editingHblAssociatedOrders.set([]);
  }

  private reset(): void {
    this.shippingType.set(null);
    this.seaMethod.set(null);
    this.resetMblState();
  }
}
