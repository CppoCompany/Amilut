import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import {
  DESTINATION_LABELS,
  DESTINATIONS,
  Destination,
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
import type { CustomerDto, OrderDto } from '../../../../api/models';
import { OrdersApi } from '../../../../api/orders-api';
import { AuthService } from '../../../../core/auth/auth.service';
import { CustomerAutocomplete } from '../../../customers/customer-autocomplete/customer-autocomplete';
import { NavigationService } from '../../navigation.service';
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
  imports: [ReactiveFormsModule, CustomerAutocomplete],
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

  // ── Customer ───────────────────────────────────────────────────────────────
  protected readonly selectedCustomer = signal<CustomerDto | null>(null);
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

  // ── Read-only header fields ────────────────────────────────────────────────
  protected readonly orderNumber = computed(() => {
    const order = this.savedOrder();
    return order ? String(order.id) : '—';
  });
  protected readonly creationDate = computed(() => {
    const order = this.savedOrder();
    return order ? formatOrderDate(order.createdAt) : '—';
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

  protected readonly destination = signal<Destination>(Destination.ASHDOD);
  protected readonly destinations = DESTINATIONS;
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

  protected pickShippingLine(value: string): void {
    this.form.controls.shippingLine.setValue(value);
    this.shippingLine.close();
  }

  protected pickAirline(value: string): void {
    this.form.controls.airline.setValue(value);
    this.airline.close();
  }

  constructor() {
    // A double-click on a row in "ההזמנות שלי" queues an order id here (see
    // NavigationService.openOrderForEdit) before switching to this screen.
    // Consume it once immediately so a later, ordinary navigation back to this
    // screen (e.g. via the sidebar) starts a fresh blank order as usual.
    const editOrderId = this.nav.editOrderId();
    if (editOrderId !== null) {
      this.nav.editOrderId.set(null);
      this.loadOrderForEditing(editOrderId);
    }
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
            isActive: true,
          });
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

  /** Creates the order on the first save; PATCHes the same order on later saves. */
  protected onSave(): void {
    if (this.saving()) {
      return;
    }
    this.submitAttempted.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    const customer = this.selectedCustomer();
    if (!customer) {
      return;
    }

    const dto = toCreateOrderDto(
      customer.id,
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
    request$
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (order) => {
          this.savedOrder.set(order);
          this.successMessage.set(`ההזמנה נשמרה — מספר הזמנה ${order.id}`);
        },
        error: (error: unknown) => this.errorMessage.set(saveErrorMessage(error)),
      });
  }

  /** Clears everything so a fresh order can be entered. */
  protected onCancel(): void {
    this.form.reset();
    this.shippingLine.close();
    this.airline.close();
    this.status.set(OrderStatus.PREPARING);
    this.shipmentType.set(ShipmentType.SEA);
    this.paymentTerms.set(PaymentTerms.PREPAID);
    this.incoterm.set(this.incotermOptions()[0]);
    this.destination.set(Destination.ASHDOD);
    this.selectedCustomer.set(null);
    this.savedOrder.set(null);
    this.submitAttempted.set(false);
    this.successMessage.set(null);
    this.errorMessage.set(null);
  }
}
