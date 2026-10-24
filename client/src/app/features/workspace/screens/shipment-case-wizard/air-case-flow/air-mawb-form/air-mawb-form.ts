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
import { DatePicker } from 'primeng/datepicker';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { forkJoin, map, of, switchMap } from 'rxjs';

import { AirApi } from '../../../../../../api/air-api';
import { CustomersApi } from '../../../../../../api/customers-api';
import {
  AirMethod,
  MBL_STATUSES,
  MBL_STATUS_LABELS,
  MblStatus,
  PAYMENT_TERMS,
  PAYMENT_TERMS_LABELS,
  PaymentTerms,
} from '../../../../../../api/enums';
import type { CustomerDto, MblDto, OrderDto, WeightRuleDto } from '../../../../../../api/models';
import { OrdersApi } from '../../../../../../api/orders-api';
import { CustomerAutocomplete } from '../../../../../customers/customer-autocomplete/customer-autocomplete';
import { HblOrdersPickerDialog } from '../../hbl-orders-picker-dialog/hbl-orders-picker-dialog';
import {
  EMPTY_FLIGHT_LEG,
  EMPTY_MAWB_FORM_VALUE,
  FlightLegFormValue,
  MawbExtras,
  MawbFormValue,
  OTHER_TERMINAL,
  airlinePrefix,
  awbNumberError,
  legToFormValue,
  mawbToFormValue,
  previewChargeableWeight,
} from '../air-form.mapper';

export interface MawbSubmit {
  value: MawbFormValue;
  extras: MawbExtras;
  /** Direct only — the orders carried by the MAWB's hidden house; `null` otherwise. */
  orderIds: number[] | null;
}

/**
 * The MAWB (master air waybill) form: airline document number, routing as
 * flight legs (an ATD on the first leg / ATA on the last moves the shipment
 * status automatically on save), arrival airport and cargo terminal, and the
 * master's chargeable weight. For a Direct shipment it also carries the
 * importer and the orders (the server keeps them on a hidden mirror house).
 */
@Component({
  selector: 'app-air-mawb-form',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    Button,
    Chip,
    DatePicker,
    InputText,
    Message,
    Select,
    SelectButton,
    CustomerAutocomplete,
    HblOrdersPickerDialog,
  ],
  templateUrl: './air-mawb-form.html',
  styleUrl: './air-mawb-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirMawbForm {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly airApi = inject(AirApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly ordersApi = inject(OrdersApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly airMethod = input.required<AirMethod>();
  /** The MAWB being edited; `null` for a new one. */
  readonly mbl = input<MblDto | null>(null);
  /** Direct: orders already on the mirror house (edit). */
  readonly mirrorOrderIds = input<readonly number[]>([]);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly save = output<MawbSubmit>();
  readonly cancelled = output<void>();

  protected readonly OTHER_TERMINAL = OTHER_TERMINAL;
  protected readonly isDirect = computed(() => this.airMethod() === AirMethod.DIRECT);
  protected readonly isEdit = computed(() => this.mbl() !== null);

  protected readonly form = this.fb.group({
    mblNumber: [''],
    bookingNumber: [''],
    carrierName: [''],
    departureAirportCode: [''],
    destinationAirportCode: [''],
    placeOfIssue: [''],
    dateOfIssue: [''],
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
    legs: this.fb.array([this.legGroup()]),
  });

  protected readonly status = signal<MblStatus>(MblStatus.OPEN);
  protected readonly freightTerms = signal<PaymentTerms | null>(null);
  protected readonly terminalId = signal<number | null>(null);
  protected readonly terminalOther = signal('');
  protected readonly customer = signal<CustomerDto | null>(null);
  protected readonly selectedOrders = signal<OrderDto[]>([]);
  protected readonly showOrdersPicker = signal(false);
  protected readonly localError = signal<string | null>(null);

  protected readonly statusOptions = MBL_STATUSES.map((value) => ({
    value,
    label: MBL_STATUS_LABELS[value],
  }));
  protected readonly freightOptions = PAYMENT_TERMS.map((value) => ({
    value,
    label: PAYMENT_TERMS_LABELS[value],
  }));
  protected readonly airportOptions = toSignal(
    this.airApi
      .importAirports()
      .pipe(map((list) => list.map((a) => ({ value: a.code, label: `${a.code} — ${a.nameHe}` })))),
    { initialValue: [] },
  );
  protected readonly terminalOptions = toSignal(
    this.airApi.cargoTerminals().pipe(
      map((list) => [
        ...list.map((t) => ({
          value: t.id,
          label: t.code ? `${t.nameHe} (${t.code})` : t.nameHe,
        })),
        { value: OTHER_TERMINAL, label: 'אחר (הזנה חופשית)' },
      ]),
    ),
    { initialValue: [] },
  );

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  private readonly rule = signal<WeightRuleDto | null>(null);
  private readonly prefix = computed(() => airlinePrefix(this.formValue().mblNumber ?? ''));

  protected readonly awbError = computed(() => awbNumberError(this.formValue().mblNumber ?? ''));

  protected readonly previewWeight = computed(() => {
    const rule = this.rule();
    const value = this.formValue();
    if (!rule) return null;
    const toNum = (v: string | undefined) => (v && v.trim() !== '' ? Number(v) : undefined);
    return previewChargeableWeight(
      { grossWeightKg: toNum(value.grossWeightKg), volumeCbm: toNum(value.volumeCbm) },
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
    effect(() => {
      const prefix = this.prefix();
      untracked(() =>
        this.airApi
          .weightRule(prefix)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((rule) => this.rule.set(rule)),
      );
    });

    effect(() => {
      const mbl = this.mbl();
      const orderIds = this.mirrorOrderIds();
      untracked(() => this.fill(mbl, orderIds));
    });

    // A single import airport (today TLV) is preselected on a new MAWB.
    effect(() => {
      const options = this.airportOptions();
      untracked(() => {
        const control = this.form.controls.destinationAirportCode;
        if (!this.isEdit() && control.value === '' && options.length === 1) {
          control.setValue(options[0].value);
        }
      });
    });
  }

  protected legControls() {
    return this.form.controls.legs.controls;
  }

  protected addLeg(): void {
    this.form.controls.legs.push(this.legGroup());
  }

  protected removeLeg(index: number): void {
    const legs = this.form.controls.legs;
    legs.removeAt(index);
    if (legs.length === 0) legs.push(this.legGroup());
  }

  protected onOrdersPicked(orders: OrderDto[]): void {
    this.selectedOrders.set(orders);
    this.showOrdersPicker.set(false);
    if (this.customer() === null && orders.length > 0) {
      this.loadCustomer(orders[0].customerId);
    }
  }

  protected removeOrder(id: number): void {
    this.selectedOrders.update((list) => list.filter((o) => o.id !== id));
  }

  protected onSubmit(): void {
    const { legs, ...value } = this.form.getRawValue();
    if (this.awbError()) {
      this.localError.set(this.awbError());
      return;
    }
    if (this.isDirect() && this.customer() === null) {
      this.localError.set('במשלוח ישיר יש לבחור את הלקוח (היבואן)');
      return;
    }
    if (this.weightDiffers() && value.chargeableWeightOverrideReason.trim() === '') {
      this.localError.set('המשקל לחיוב שאושר שונה מהמחושב — יש לציין סיבה לחריגה');
      return;
    }
    this.localError.set(null);
    this.save.emit({
      value,
      extras: {
        customerId: this.isDirect() ? (this.customer()?.id ?? null) : null,
        status: this.status(),
        freightTerms: this.freightTerms(),
        cargoTerminalId: this.terminalId(),
        cargoTerminalOther: this.terminalOther(),
        legs: legs.filter((leg) => Object.values(leg).some((v) => v.trim() !== '')),
      },
      orderIds: this.isDirect() ? this.selectedOrders().map((o) => o.id) : null,
    });
  }

  private fill(mbl: MblDto | null, mirrorOrderIds: readonly number[]): void {
    this.localError.set(null);
    const legs = this.form.controls.legs;
    legs.clear();
    if (!mbl) {
      this.form.reset({ ...EMPTY_MAWB_FORM_VALUE, legs: [] });
      legs.push(this.legGroup());
      this.status.set(MblStatus.OPEN);
      this.freightTerms.set(null);
      this.terminalId.set(null);
      this.terminalOther.set('');
      this.customer.set(null);
      this.selectedOrders.set([]);
      return;
    }
    this.form.reset({ ...mawbToFormValue(mbl), legs: [] });
    for (const leg of mbl.flightLegs) legs.push(this.legGroup(legToFormValue(leg)));
    if (legs.length === 0) legs.push(this.legGroup());
    this.status.set(mbl.status);
    this.freightTerms.set(mbl.freightTerms);
    this.terminalId.set(mbl.cargoTerminalOther ? OTHER_TERMINAL : mbl.cargoTerminalId);
    this.terminalOther.set(mbl.cargoTerminalOther ?? '');
    if (mbl.customerId !== null) this.loadCustomer(mbl.customerId);
    of([...mirrorOrderIds])
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

  private legGroup(value: FlightLegFormValue = EMPTY_FLIGHT_LEG) {
    return this.fb.group({
      flightNumber: [value.flightNumber],
      fromAirport: [value.fromAirport],
      toAirport: [value.toAirport],
      etd: [value.etd],
      eta: [value.eta],
      atd: [value.atd],
      ata: [value.ata],
    });
  }
}
