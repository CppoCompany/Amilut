import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize, Observable, tap } from 'rxjs';

import {
  DESTINATION_LABELS,
  DESTINATIONS_BY_SHIPMENT_TYPE,
  INCOTERM_LABELS,
  INCOTERMS_BY_PAYMENT_TERMS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  OrderStatus,
  PAYMENT_TERMS,
  PAYMENT_TERMS_LABELS,
  PaymentTerms,
  SHIPMENT_TYPE_LABELS,
  SHIPMENT_TYPES,
  ShipmentType,
} from '../../../../api/enums';
import type { CustomerDto, OrderDto, SupplierDto } from '../../../../api/models';
import { OrdersApi } from '../../../../api/orders-api';
import { AuthService } from '../../../../core/auth/auth.service';
import { CustomerAutocomplete } from '../../../customers/customer-autocomplete/customer-autocomplete';
import { SupplierAutocomplete } from '../../../suppliers/supplier-autocomplete/supplier-autocomplete';
import { NavigationService } from '../../navigation.service';
import { SelectionStateService } from '../../selection-state.service';
import { Autocomplete } from './autocomplete';
import {
  EMPTY_ORDER_FORM_VALUE,
  formatOrderDate,
  loadErrorMessage,
  orderToFormValue,
  saveErrorMessage,
  toCreateOrderDto,
} from './order-form.mapper';

const SHIPPING_LINES = [
  'Conmart',
  'Green Shipping',
  'ZIM',
  'Maersk',
  'MSC',
  'CMA CGM',
  'Hapag-Lloyd',
  'Evergreen',
  'Yang Ming',
  'COSCO',
];

const AIRLINES = [
  'El Al',
  'British Airways',
  'Lufthansa',
  'Turkish Airlines',
  'Delta',
  'United',
  'Air France',
  'KLM',
  'Emirates',
  'Qatar Airways',
];

const CUSTOMER_REQUIRED = 'יש לבחור לקוח';

/** "פתיחת הזמנה" — new shipment order form, wired to `POST/PATCH /api/orders`. */
@Component({
  selector: 'app-order-screen',
  imports: [ReactiveFormsModule, CustomerAutocomplete, SupplierAutocomplete],
  templateUrl: './order.html',
  styleUrl: './order.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderScreen {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ordersApi = inject(OrdersApi);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);
  private readonly selection = inject(SelectionStateService);

  // ── Customer / Supplier ─────────────────────────────────────────────────────
  protected readonly selectedCustomer = signal<CustomerDto | null>(null);
  protected readonly selectedSupplier = signal<SupplierDto | null>(null);
  private readonly submitAttempted = signal(false);
  protected readonly customerError = computed(() =>
    this.submitAttempted() && !this.selectedCustomer() ? CUSTOMER_REQUIRED : null,
  );

  // ── Save state ─────────────────────────────────────────────────────────────
  /** The order as last returned by the server; `null` until the first successful save. */
  protected readonly savedOrder = signal<OrderDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  /** True while an existing order is being fetched for editing (see the constructor). */
  protected readonly loadingOrder = signal(false);

  /**
   * Set once, by how this screen was reached — a double-click in "ההזמנות
   * שלי" (edit) vs. the sidebar's "יצירת הזמנה חדשה" (create) — never by
   * `savedOrder()`'s null-ness. A brand-new order still reads "יצירת הזמנה
   * חדשה" after its first save, since the user's intent was to create one;
   * only entering via an existing order's edit flow reads "עדכון הזמנה".
   */
  protected readonly isEditingExisting = signal(false);
  protected readonly pageTitle = computed(() =>
    this.isEditingExisting() ? 'עדכון הזמנה' : 'יצירת הזמנה חדשה',
  );

  // ── Read-only header fields ────────────────────────────────────────────────
  /** A real order id only exists once the server has inserted the row. */
  protected readonly orderNumber = computed(() => {
    const order = this.savedOrder();
    return order ? String(order.id) : 'יוקצה אוטומטית לאחר השמירה';
  });
  /** Shows today until the first save, then the server's actual `createdAt`. */
  protected readonly creationDate = computed(() => {
    const order = this.savedOrder();
    return order ? formatOrderDate(order.createdAt) : formatOrderDate(new Date().toISOString());
  });
  protected readonly handlerName = computed(() => this.auth.user()?.name ?? '');

  // ── Enum tab groups (typed signals; labels come from the label maps) ──────
  protected readonly status = signal<OrderStatus>(OrderStatus.PREPARING);
  protected readonly statuses = ORDER_STATUSES;
  protected readonly statusLabels = ORDER_STATUS_LABELS;

  protected readonly shipmentType = signal<ShipmentType>(ShipmentType.SEA);
  protected readonly shipmentTypes = SHIPMENT_TYPES;
  protected readonly shipmentTypeLabels = SHIPMENT_TYPE_LABELS;

  protected readonly paymentTerms = signal<PaymentTerms>(PaymentTerms.PREPAID);
  protected readonly paymentTermsOptions = PAYMENT_TERMS;
  protected readonly paymentTermsLabels = PAYMENT_TERMS_LABELS;

  /** Incoterms offered for the current payment terms (the server rejects a mismatch). */
  protected readonly incotermOptions = computed(
    () => INCOTERMS_BY_PAYMENT_TERMS[this.paymentTerms()],
  );
  /** Resets to the first allowed code whenever the payment terms change. */
  protected readonly incoterm = linkedSignal(() => this.incotermOptions()[0]);
  protected readonly incotermLabels = INCOTERM_LABELS;

  /** Destinations offered for the current shipment type (sea ports vs. the airport). */
  protected readonly destinationOptions = computed(
    () => DESTINATIONS_BY_SHIPMENT_TYPE[this.shipmentType()],
  );
  /** Resets to the first allowed destination whenever the shipment type changes. */
  protected readonly destination = linkedSignal(() => this.destinationOptions()[0]);
  protected readonly destinationLabels = DESTINATION_LABELS;

  // ── Transport-field visibility ─────────────────────────────────────────────
  protected readonly seaVisible = computed(() => this.shipmentType() === ShipmentType.SEA);
  protected readonly airVisible = computed(() => this.shipmentType() === ShipmentType.AIR);

  // ── Dates & free-text fields ───────────────────────────────────────────────
  protected readonly form = this.fb.group({
    factoryReadyDate: [EMPTY_ORDER_FORM_VALUE.factoryReadyDate],
    factoryPickupDate: [EMPTY_ORDER_FORM_VALUE.factoryPickupDate],
    departureDate: [EMPTY_ORDER_FORM_VALUE.departureDate],
    etaDate: [EMPTY_ORDER_FORM_VALUE.etaDate],
    shippingLine: [EMPTY_ORDER_FORM_VALUE.shippingLine],
    voyageNumber: [EMPTY_ORDER_FORM_VALUE.voyageNumber],
    airline: [EMPTY_ORDER_FORM_VALUE.airline],
    flightNumber: [EMPTY_ORDER_FORM_VALUE.flightNumber],
  });

  // Client-side suggestion lists for the free-text carrier fields.
  protected readonly shippingLine = new Autocomplete(
    SHIPPING_LINES,
    toSignal(this.form.controls.shippingLine.valueChanges, { initialValue: '' }),
  );
  protected readonly airline = new Autocomplete(
    AIRLINES,
    toSignal(this.form.controls.airline.valueChanges, { initialValue: '' }),
  );

  constructor() {
    // A double-click on a row in "ההזמנות שלי" navigates to
    // `/workspace/order?orderId=N`, which NavigationService.applyUrl turns
    // into `editOrderId` before this screen shows. Consume it once as soon as
    // it appears, so a later, ordinary navigation back to this screen (e.g.
    // via the sidebar) starts a fresh blank order as usual. An effect rather
    // than a one-shot constructor read: Back/Forward can land on an edit URL
    // while this instance is already mounted (the page doesn't change, so it
    // isn't recreated), and that must load the order too.
    effect(() => {
      const editOrderId = this.nav.editOrderId();
      if (editOrderId === null) return;
      untracked(() => {
        this.nav.editOrderId.set(null);
        this.isEditingExisting.set(true);
        this.loadOrderForEditing(editOrderId);
      });
    });

    // "יצירת הזמנה חדשה" in the sidebar bumps this even when this screen is
    // already mounted (mid-edit of a different order — the page doesn't
    // change, so the component isn't recreated). Skip the first firing: that
    // one just reflects whatever the counter already was when this instance
    // was constructed, not a fresh click.
    let skipFirst = true;
    effect(() => {
      this.nav.newOrderRequested();
      if (skipFirst) {
        skipFirst = false;
        return;
      }
      this.resetForm();
    });

    // Keeps the app-wide "currently selected" state (see `SelectionStateService`,
    // drives the breadcrumb) in sync with whichever order this screen is
    // working on — freshly created, saved again, or loaded for edit. Does
    // nothing while `savedOrder` is `null` (a blank, unsaved draft).
    effect(() => {
      const order = this.savedOrder();
      if (order) {
        this.selection.selectOrder(order);
      }
    });
  }

  protected pickShippingLine(value: string): void {
    this.form.controls.shippingLine.setValue(value);
    this.shippingLine.close();
  }

  protected pickAirline(value: string): void {
    this.form.controls.airline.setValue(value);
    this.airline.close();
  }

  /** Fetches an existing order and populates the form so Save will PATCH it. */
  private loadOrderForEditing(orderId: number): void {
    this.loadingOrder.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.ordersApi
      .getById(orderId)
      .pipe(finalize(() => this.loadingOrder.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => {
          // Placeholder fields are never read by CustomerAutocomplete (it only
          // uses `.id`/`.name`), so this avoids an extra CustomersApi round-trip.
          this.selectedCustomer.set({
            id: order.customerId,
            name: order.customerName ?? '',
            address: null,
            phone: null,
            email: null,
            companyRegNumber: null,
            contactName: null,
            contactPhone: null,
            isActive: true,
          });
          // Same placeholder trick as the customer: SupplierAutocomplete only
          // ever reads `.id`/`.name`, so this avoids an extra SuppliersApi call.
          this.selectedSupplier.set(
            order.supplierId !== null
              ? {
                  id: order.supplierId,
                  name: order.supplierName ?? '',
                  address: null,
                  phone: null,
                  email: null,
                  isActive: true,
                }
              : null,
          );
          this.status.set(order.status);
          this.shipmentType.set(order.shipmentType);
          // paymentTerms first: `incoterm` is a linkedSignal derived from it and
          // would otherwise reset to the first allowed option for that group.
          this.paymentTerms.set(order.paymentTerms);
          this.incoterm.set(order.incoterm);
          this.destination.set(order.destination);
          this.form.reset(orderToFormValue(order));
          this.savedOrder.set(order);
        },
        error: (error: unknown) => this.errorMessage.set(loadErrorMessage(error)),
      });
  }

  /**
   * The form's single submit handler (button clicks and Enter-to-submit
   * alike): creating a brand-new order only ever offers the combined
   * "שמירה ומעבר לתיוק ניירת יבוא" action ({@link onSaveAndGoToFiling});
   * editing an already-saved one offers a plain "עדכן הזמנה" ({@link onSave})
   * — "go to filing" for an existing order lives separately, at the top of
   * the page (see {@link goToFiling}), since the order is already saved and
   * doesn't need saving again just to get there.
   */
  protected onSubmit(): void {
    if (this.isEditingExisting()) {
      this.onSave();
    } else {
      this.onSaveAndGoToFiling();
    }
  }

  /** Creates the order on the first save; PATCHes the same order on later saves. */
  protected onSave(): void {
    this.saveOrder()?.subscribe({
      next: (order) => this.successMessage.set(`ההזמנה נשמרה — מספר הזמנה ${order.id}`),
      error: (error: unknown) => this.errorMessage.set(saveErrorMessage(error)),
    });
  }

  /** "שמירה ומעבר לתיוק ניירת יבוא" — saves the order first (same as
   *  {@link onSave}, just a quiet success instead of a banner message) and
   *  only navigates to the filing screen once that save actually succeeds; a
   *  failed save leaves the user on this screen with the error shown, same as
   *  a plain save failing. */
  protected onSaveAndGoToFiling(): void {
    this.saveOrder()?.subscribe({
      next: (order) => this.nav.openFilingForCase(order.mblId),
      error: (error: unknown) => this.errorMessage.set(saveErrorMessage(error)),
    });
  }

  /** Top-of-page "מעבר לתיוק ניירת יבוא" link — only shown once editing an
   *  already-saved order (see order.html), so it jumps straight to filing
   *  using that order's own case, with no save step (nothing to save: the
   *  order already exists). Same destination, reached without saving, as the
   *  "ייבוא מסמכים" row action in "ההזמנות שלי". */
  protected goToFiling(): void {
    const order = this.savedOrder();
    if (!order) return;
    this.nav.openFilingForCase(order.mblId);
  }

  /**
   * Builds and sends the create/update request — shared by {@link onSave} and
   * {@link onSaveAndGoToFiling}, which only differ in what happens *after* a
   * successful save. Returns `null` (does nothing) while a save is already in
   * flight or no customer is picked yet, exactly like `onSave` always bailed.
   */
  private saveOrder(): Observable<OrderDto> | null {
    if (this.saving()) {
      return null;
    }
    this.submitAttempted.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    const customer = this.selectedCustomer();
    if (!customer) {
      return null;
    }

    const dto = toCreateOrderDto(
      customer.id,
      this.selectedSupplier()?.id,
      {
        status: this.status(),
        shipmentType: this.shipmentType(),
        paymentTerms: this.paymentTerms(),
        incoterm: this.incoterm(),
        destination: this.destination(),
      },
      this.form.getRawValue(),
    );

    const existing = this.savedOrder();
    const request$ = existing
      ? this.ordersApi.update(existing.id, dto)
      : this.ordersApi.create(dto);

    this.saving.set(true);
    return request$.pipe(
      tap((order) => this.savedOrder.set(order)),
      finalize(() => this.saving.set(false)),
      takeUntilDestroyed(this.destroyRef),
    );
  }

  /** Clears everything so a fresh order can be entered. */
  protected onCancel(): void {
    const hasUnsavedInput =
      this.selectedCustomer() !== null || this.selectedSupplier() !== null || this.form.dirty;
    if (hasUnsavedInput && !confirm('הפרטים שהוזנו יימחקו. לבטל בכל זאת?')) {
      return;
    }
    this.resetForm();
  }

  /** Blanks the form for a fresh order — shared by `onCancel` (after
   *  confirmation) and the "יצירת הזמנה חדשה" sidebar reset (no confirmation:
   *  it's an explicit navigation, not an accidental click). */
  private resetForm(): void {
    this.form.reset();
    this.shippingLine.close();
    this.airline.close();
    this.status.set(OrderStatus.PREPARING);
    this.shipmentType.set(ShipmentType.SEA);
    this.paymentTerms.set(PaymentTerms.PREPAID);
    this.incoterm.set(this.incotermOptions()[0]);
    this.destination.set(this.destinationOptions()[0]);
    this.selectedCustomer.set(null);
    this.selectedSupplier.set(null);
    this.savedOrder.set(null);
    this.submitAttempted.set(false);
    this.successMessage.set(null);
    this.errorMessage.set(null);
    this.isEditingExisting.set(false);
  }
}
