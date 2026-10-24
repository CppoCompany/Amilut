import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Chip } from 'primeng/chip';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { forkJoin, of, switchMap } from 'rxjs';

import { AirApi } from '../../../../../../api/air-api';
import { CustomersApi } from '../../../../../../api/customers-api';
import type { CustomerDto, HblDto, OrderDto, WeightRuleDto } from '../../../../../../api/models';
import { OrdersApi } from '../../../../../../api/orders-api';
import { CustomerAutocomplete } from '../../../../../customers/customer-autocomplete/customer-autocomplete';
import { HblOrdersPickerDialog } from '../../hbl-orders-picker-dialog/hbl-orders-picker-dialog';
import {
  EMPTY_HAWB_FORM_VALUE,
  EMPTY_PIECE_DIMENSION,
  HawbFormValue,
  PieceDimensionFormValue,
  airlinePrefix,
  dimensionToFormValue,
  dimensionsFromForm,
  hawbLabel,
  hawbToFormValue,
  previewChargeableWeight,
} from '../air-form.mapper';

/** What the form hands its container on submit; the container calls the API. */
export interface HawbSubmit {
  value: HawbFormValue;
  dimensions: PieceDimensionFormValue[];
  /** Set on create (required there); `null` when editing — the customer is fixed then. */
  customerId: number | null;
  orderIds: number[];
}

/**
 * The HAWB (house air waybill) form. A HAWB can be saved before it has a
 * MAWB; the real HAWB number is optional until the agent's document arrives
 * (the row is identified by its temporary internal id meanwhile). Chargeable
 * weight is previewed with the rule of the MAWB's airline — the server
 * recalculates on save and keeps calculated and approved values apart.
 */
@Component({
  selector: 'app-air-hawb-form',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    Button,
    Chip,
    InputText,
    Message,
    CustomerAutocomplete,
    HblOrdersPickerDialog,
  ],
  templateUrl: './air-hawb-form.html',
  styleUrl: './air-hawb-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirHawbForm {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly airApi = inject(AirApi);
  private readonly ordersApi = inject(OrdersApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly destroyRef = inject(DestroyRef);

  /** The house being edited; `null` for a new HAWB. */
  readonly hbl = input<HblDto | null>(null);
  /** The MAWB number of the case, for the airline's weight rule. */
  readonly mblNumber = input<string | null>(null);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly save = output<HawbSubmit>();
  readonly cancelled = output<void>();

  protected readonly form = this.fb.group({
    hblNumber: [''],
    shipperName: [''],
    shipperAddress: [''],
    consigneeName: [''],
    consigneeAddress: [''],
    notifyPartyName: [''],
    notifyPartyAddress: [''],
    cargoDescription: [''],
    pieces: [''],
    grossWeightKg: [''],
    volumeCbm: [''],
    approvedChargeableWeightKg: [''],
    chargeableWeightOverrideReason: [''],
    specialHandlingCodes: [''],
    remarks: [''],
    dimensions: this.fb.array([this.dimensionGroup()]),
  });

  protected readonly customer = signal<CustomerDto | null>(null);
  protected readonly selectedOrders = signal<OrderDto[]>([]);
  protected readonly showOrdersPicker = signal(false);
  protected readonly localError = signal<string | null>(null);

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  private readonly rule = signal<WeightRuleDto | null>(null);

  protected readonly isEdit = computed(() => this.hbl() !== null);
  protected readonly title = computed(() => {
    const hbl = this.hbl();
    return hbl ? `עריכת HAWB ${hawbLabel(hbl)}` : 'HAWB חדש';
  });

  /** Live preview of the calculated chargeable weight (server recalculates on save). */
  protected readonly previewWeight = computed(() => {
    const rule = this.rule();
    const value = this.formValue();
    if (!rule) return null;
    const toNum = (v: string | undefined) => (v && v.trim() !== '' ? Number(v) : undefined);
    return previewChargeableWeight(
      {
        grossWeightKg: toNum(value.grossWeightKg),
        volumeCbm: toNum(value.volumeCbm),
        dimensions: dimensionsFromForm((value.dimensions ?? []) as PieceDimensionFormValue[]),
      },
      rule,
    );
  });

  protected readonly weightDiffers = computed(() => {
    const approved = this.formValue().approvedChargeableWeightKg?.trim();
    const preview = this.previewWeight();
    return !!approved && preview !== null && Number(approved) !== preview;
  });

  protected readonly orderChips = computed(() =>
    this.selectedOrders().map((o) => ({ id: o.id, text: `הזמנה ${o.id}` })),
  );

  constructor() {
    // Load the airline rule whenever the MAWB number (prefix) changes.
    effect(() => {
      const prefix = airlinePrefix(this.mblNumber() ?? '');
      untracked(() =>
        this.airApi
          .weightRule(prefix)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((rule) => this.rule.set(rule)),
      );
    });

    // (Re)fill the form whenever another house is opened for edit.
    effect(() => {
      const hbl = this.hbl();
      untracked(() => this.fill(hbl));
    });
  }

  protected dimensionControls() {
    return this.form.controls.dimensions.controls;
  }

  protected addDimension(): void {
    this.form.controls.dimensions.push(this.dimensionGroup());
  }

  protected removeDimension(index: number): void {
    const rows = this.form.controls.dimensions;
    rows.removeAt(index);
    if (rows.length === 0) rows.push(this.dimensionGroup());
  }

  protected onOrdersPicked(orders: OrderDto[]): void {
    this.selectedOrders.set(orders);
    this.showOrdersPicker.set(false);
    // Prefill the customer from the first order on a new HAWB.
    if (!this.isEdit() && this.customer() === null && orders.length > 0) {
      this.loadCustomer(orders[0].customerId);
    }
  }

  protected removeOrder(id: number): void {
    this.selectedOrders.update((list) => list.filter((o) => o.id !== id));
  }

  protected onSubmit(): void {
    const value = this.form.getRawValue();
    const customerId = this.isEdit() ? null : (this.customer()?.id ?? null);
    if (!this.isEdit() && customerId === null) {
      this.localError.set('יש לבחור לקוח (יבואן) עבור ה-HAWB');
      return;
    }
    if (this.weightDiffers() && value.chargeableWeightOverrideReason.trim() === '') {
      this.localError.set('המשקל לחיוב שאושר שונה מהמחושב — יש לציין סיבה לחריגה');
      return;
    }
    this.localError.set(null);
    const { dimensions, ...fields } = value;
    this.save.emit({
      value: fields,
      dimensions,
      customerId,
      orderIds: this.selectedOrders().map((o) => o.id),
    });
  }

  private fill(hbl: HblDto | null): void {
    this.localError.set(null);
    const dims = this.form.controls.dimensions;
    dims.clear();
    if (!hbl) {
      this.form.reset({ ...EMPTY_HAWB_FORM_VALUE, dimensions: [] });
      dims.push(this.dimensionGroup());
      this.customer.set(null);
      this.selectedOrders.set([]);
      return;
    }
    this.form.reset({ ...hawbToFormValue(hbl), dimensions: [] });
    for (const d of hbl.pieceDimensions) dims.push(this.dimensionGroup(dimensionToFormValue(d)));
    if (dims.length === 0) dims.push(this.dimensionGroup());
    this.loadCustomer(hbl.customerId);
    const orderIds = hbl.orders.map((o) => o.id);
    of(orderIds)
      .pipe(
        switchMap((ids) =>
          ids.length > 0 ? forkJoin(ids.map((id) => this.ordersApi.getById(id))) : of([]),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((orders) => this.selectedOrders.set(orders));
  }

  private loadCustomer(id: number): void {
    this.customersApi
      .getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((customer) => this.customer.set(customer));
  }

  private dimensionGroup(value: PieceDimensionFormValue = EMPTY_PIECE_DIMENSION) {
    return this.fb.group({
      pieceCount: [value.pieceCount],
      lengthCm: [value.lengthCm],
      widthCm: [value.widthCm],
      heightCm: [value.heightCm],
    });
  }
}
