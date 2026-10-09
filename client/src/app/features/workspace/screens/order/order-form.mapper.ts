import { HttpErrorResponse } from '@angular/common/http';
import type { AbstractControl, ValidationErrors } from '@angular/forms';

import {
  Destination,
  Incoterm,
  OrderStatus,
  PaymentTerms,
  ShipmentType,
} from '../../../../api/enums';
import type { CreateOrderDto, OrderDto } from '../../../../api/models';

/** Free-text / date fields of the order form (always strings; `''` = not filled). */
export interface OrderFormValue {
  factoryReadyDate: string;
  factoryPickupDate: string;
  departureDate: string;
  etaDate: string;
  shippingLine: string;
  voyageNumber: string;
  airline: string;
  flightNumber: string;
}

/** Tab-driven enum selections of the order form. */
export interface OrderSelection {
  status: OrderStatus;
  shipmentType: ShipmentType;
  paymentTerms: PaymentTerms;
  incoterm: Incoterm;
  destination: Destination;
}

export const EMPTY_ORDER_FORM_VALUE: OrderFormValue = {
  factoryReadyDate: '',
  factoryPickupDate: '',
  departureDate: '',
  etaDate: '',
  shippingLine: '',
  voyageNumber: '',
  airline: '',
  flightNumber: '',
};

/** Trims a text value; blank becomes `undefined` so the key is omitted from the JSON body. */
export function blankToUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Assembles the `CreateOrderDto` sent to the server. Empty strings are omitted,
 * and transport fields that do not apply to the chosen shipment type are dropped
 * (sea fields only for SEA, air fields only for AIR). Server-owned fields
 * (`id`, `createdAt`, handler) are never part of the payload.
 */
export function toCreateOrderDto(
  customerId: number,
  supplierId: number | undefined,
  selection: OrderSelection,
  form: OrderFormValue,
): CreateOrderDto {
  const isSea = selection.shipmentType === ShipmentType.SEA;
  const isAir = selection.shipmentType === ShipmentType.AIR;

  const dto: CreateOrderDto = {
    customerId,
    status: selection.status,
    shipmentType: selection.shipmentType,
    paymentTerms: selection.paymentTerms,
    incoterm: selection.incoterm,
    destination: selection.destination,
    supplierId,
    factoryReadyDate: blankToUndefined(form.factoryReadyDate),
    factoryPickupDate: blankToUndefined(form.factoryPickupDate),
    departureDate: blankToUndefined(form.departureDate),
    etaDate: blankToUndefined(form.etaDate),
    shippingLine: isSea ? blankToUndefined(form.shippingLine) : undefined,
    voyageNumber: isSea ? blankToUndefined(form.voyageNumber) : undefined,
    airline: isAir ? blankToUndefined(form.airline) : undefined,
    flightNumber: isAir ? blankToUndefined(form.flightNumber) : undefined,
  };

  // Strip `undefined` keys so the JSON body only carries filled-in fields.
  return Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  ) as CreateOrderDto;
}

/** The day after a `YYYY-MM-DD` date, in the same format — `''` passes through
 *  unchanged. Used as a date input's `[min]`, so its picker greys out the
 *  source date and everything before it (the next stage must be strictly
 *  later, never the same day). Computed from local date parts (not
 *  `Date#toISOString`, which is UTC and would shift across the day boundary
 *  for most of Israel's timezone offset). */
export function minDateAfter(value: string): string {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return '';
  const next = new Date(year, month - 1, day + 1);
  const yyyy = String(next.getFullYear()).padStart(4, '0');
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  const dd = String(next.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Enforces Ready Date < Pickup Date < Shipment (departure) Date on the order
 *  form's `FormGroup`. Plain string comparison is safe and timezone-proof
 *  here since `YYYY-MM-DD` sorts lexicographically exactly like it sorts
 *  chronologically. The `[min]` bindings on the pickup/departure date inputs
 *  (see `minDateAfter`) stop most violations at the picker UI; this is the
 *  save-time backstop for a manually-typed date that bypasses the picker. */
export function chronologicalScheduleValidator(group: AbstractControl): ValidationErrors | null {
  const ready = group.get('factoryReadyDate')?.value as string;
  const pickup = group.get('factoryPickupDate')?.value as string;
  const departure = group.get('departureDate')?.value as string;

  const errors: ValidationErrors = {};
  if (ready && pickup && pickup <= ready) {
    errors['pickupNotAfterReady'] = true;
  }
  if (pickup && departure && departure <= pickup) {
    errors['departureNotAfterPickup'] = true;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/** Maps an `OrderDto` from the server back into the form's flat string shape. */
export function orderToFormValue(order: OrderDto): OrderFormValue {
  return {
    factoryReadyDate: order.factoryReadyDate ?? '',
    factoryPickupDate: order.factoryPickupDate ?? '',
    departureDate: order.departureDate ?? '',
    etaDate: order.etaDate ?? '',
    shippingLine: order.shippingLine ?? '',
    voyageNumber: order.voyageNumber ?? '',
    airline: order.airline ?? '',
    flightNumber: order.flightNumber ?? '',
  };
}

/** Formats an ISO timestamp as a `he-IL` date (dd.mm.yyyy). */
export function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const SAVE_FAILED = 'שמירת ההזמנה נכשלה';
const LOAD_FAILED = 'טעינת ההזמנה נכשלה';

function errorSuffix(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: string | string[] } | string | null | undefined;
    const message =
      typeof body === 'string'
        ? body
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : body?.message;
    if (message) {
      return `: ${message}`;
    }
  }
  return '';
}

/** Hebrew error line for a failed save, with the server's message appended when present. */
export function saveErrorMessage(error: unknown): string {
  return `${SAVE_FAILED}${errorSuffix(error)}`;
}

/** Hebrew error line for a failed order lookup, with the server's message appended when present. */
export function loadErrorMessage(error: unknown): string {
  return `${LOAD_FAILED}${errorSuffix(error)}`;
}
