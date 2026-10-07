import { HttpErrorResponse } from '@angular/common/http';

import { MblShippingType, MblStatus, PaymentTerms, SeaMethod } from '../../../../api/enums';
import type { CreateMblContainerDto, CreateMblDto, MblContainerDto, MblDto } from '../../../../api/models';

/** Free-text / date / numeric fields of the MBL form (always strings; `''` = not filled).
 *  `containerNumber`...`volumeCbm` are the single-container fields, sent only for the
 *  three non-groupage methods — the groupage table uses `MblContainerFormValue` instead. */
export interface MblFormValue {
  mblNumber: string;
  bookingNumber: string;
  vesselName: string;
  voyageNumber: string;
  portOfLoading: string;
  portOfDischarge: string;
  finalDestination: string;
  carrierName: string;
  shipperName: string;
  shipperAddress: string;
  consigneeName: string;
  consigneeAddress: string;
  notifyPartyName: string;
  notifyPartyAddress: string;
  containerNumber: string;
  containerSealNumber: string;
  cargoDescription: string;
  grossWeightKg: string;
  volumeCbm: string;
  receiptDeliveryType: string;
  placeOfIssue: string;
  dateOfIssue: string;
}

/** One row of the groupage-only container table. */
export interface MblContainerFormValue {
  containerNumber: string;
  containerSealNumber: string;
  cargoDescription: string;
  grossWeightKg: string;
  volumeCbm: string;
}

export const EMPTY_MBL_FORM_VALUE: MblFormValue = {
  mblNumber: '',
  bookingNumber: '',
  vesselName: '',
  voyageNumber: '',
  portOfLoading: '',
  portOfDischarge: '',
  finalDestination: '',
  carrierName: '',
  shipperName: '',
  shipperAddress: '',
  consigneeName: '',
  consigneeAddress: '',
  notifyPartyName: '',
  notifyPartyAddress: '',
  containerNumber: '',
  containerSealNumber: '',
  cargoDescription: '',
  grossWeightKg: '',
  volumeCbm: '',
  receiptDeliveryType: '',
  placeOfIssue: '',
  dateOfIssue: '',
};

export const EMPTY_MBL_CONTAINER_FORM_VALUE: MblContainerFormValue = {
  containerNumber: '',
  containerSealNumber: '',
  cargoDescription: '',
  grossWeightKg: '',
  volumeCbm: '',
};

function blankToUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function blankToNumber(value: string | null | undefined): number | undefined {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Strips `undefined` keys so the JSON body only carries filled-in fields. */
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function toCreateMblContainerDto(form: MblContainerFormValue): CreateMblContainerDto {
  return withoutUndefined({
    containerNumber: blankToUndefined(form.containerNumber),
    containerSealNumber: blankToUndefined(form.containerSealNumber),
    cargoDescription: blankToUndefined(form.cargoDescription),
    grossWeightKg: blankToNumber(form.grossWeightKg),
    volumeCbm: blankToNumber(form.volumeCbm),
  });
}

/**
 * Assembles the `CreateMblDto` sent to `POST /api/mbl`. Single-container
 * fields (`containerNumber`...`volumeCbm` on `form`) are sent only for the
 * three non-groupage methods; `containers` only for `groupage_fcl` — mirrors
 * the server's own `validateContainers`, which rejects sending both or
 * neither when one is required.
 */
export function toCreateMblDto(
  shippingType: MblShippingType,
  seaMethod: SeaMethod | null,
  customerId: number | null,
  freightTerms: PaymentTerms | null,
  status: MblStatus,
  form: MblFormValue,
  containers: MblContainerFormValue[],
): CreateMblDto {
  const base = {
    shippingType,
    seaMethod: seaMethod ?? undefined,
    customerId: customerId ?? undefined,
    status,
    mblNumber: blankToUndefined(form.mblNumber),
    bookingNumber: blankToUndefined(form.bookingNumber),
    vesselName: blankToUndefined(form.vesselName),
    voyageNumber: blankToUndefined(form.voyageNumber),
    portOfLoading: blankToUndefined(form.portOfLoading),
    portOfDischarge: blankToUndefined(form.portOfDischarge),
    finalDestination: blankToUndefined(form.finalDestination),
    carrierName: blankToUndefined(form.carrierName),
    shipperName: blankToUndefined(form.shipperName),
    shipperAddress: blankToUndefined(form.shipperAddress),
    consigneeName: blankToUndefined(form.consigneeName),
    consigneeAddress: blankToUndefined(form.consigneeAddress),
    notifyPartyName: blankToUndefined(form.notifyPartyName),
    notifyPartyAddress: blankToUndefined(form.notifyPartyAddress),
    freightTerms: freightTerms ?? undefined,
    receiptDeliveryType: blankToUndefined(form.receiptDeliveryType),
    placeOfIssue: blankToUndefined(form.placeOfIssue),
    dateOfIssue: blankToUndefined(form.dateOfIssue),
  };

  if (seaMethod === SeaMethod.GROUPAGE_FCL) {
    return withoutUndefined({
      ...base,
      containers: containers.map(toCreateMblContainerDto),
    });
  }

  return withoutUndefined({
    ...base,
    containerNumber: blankToUndefined(form.containerNumber),
    containerSealNumber: blankToUndefined(form.containerSealNumber),
    cargoDescription: blankToUndefined(form.cargoDescription),
    grossWeightKg: blankToNumber(form.grossWeightKg),
    volumeCbm: blankToNumber(form.volumeCbm),
  });
}

/** Maps a saved `MblDto` back into the form's flat string shape, for "ערוך פרטי MBL". */
export function mblToFormValue(mbl: MblDto): MblFormValue {
  return {
    mblNumber: mbl.mblNumber ?? '',
    bookingNumber: mbl.bookingNumber ?? '',
    vesselName: mbl.vesselName ?? '',
    voyageNumber: mbl.voyageNumber ?? '',
    portOfLoading: mbl.portOfLoading ?? '',
    portOfDischarge: mbl.portOfDischarge ?? '',
    finalDestination: mbl.finalDestination ?? '',
    carrierName: mbl.carrierName ?? '',
    shipperName: mbl.shipperName ?? '',
    shipperAddress: mbl.shipperAddress ?? '',
    consigneeName: mbl.consigneeName ?? '',
    consigneeAddress: mbl.consigneeAddress ?? '',
    notifyPartyName: mbl.notifyPartyName ?? '',
    notifyPartyAddress: mbl.notifyPartyAddress ?? '',
    containerNumber: mbl.containerNumber ?? '',
    containerSealNumber: mbl.containerSealNumber ?? '',
    cargoDescription: mbl.cargoDescription ?? '',
    grossWeightKg: mbl.grossWeightKg !== null ? String(mbl.grossWeightKg) : '',
    volumeCbm: mbl.volumeCbm !== null ? String(mbl.volumeCbm) : '',
    receiptDeliveryType: mbl.receiptDeliveryType ?? '',
    placeOfIssue: mbl.placeOfIssue ?? '',
    dateOfIssue: mbl.dateOfIssue ?? '',
  };
}

/** Maps one of a saved MBL's container rows back into the table's form shape. */
export function containerToFormValue(container: MblContainerDto): MblContainerFormValue {
  return {
    containerNumber: container.containerNumber ?? '',
    containerSealNumber: container.containerSealNumber ?? '',
    cargoDescription: container.cargoDescription ?? '',
    grossWeightKg: container.grossWeightKg !== null ? String(container.grossWeightKg) : '',
    volumeCbm: container.volumeCbm !== null ? String(container.volumeCbm) : '',
  };
}

const SAVE_FAILED = 'שמירת ה-MBL נכשלה';

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

/** Hebrew error line for a failed MBL save, with the server's message appended when present. */
export function saveErrorMessage(error: unknown): string {
  return `${SAVE_FAILED}${errorSuffix(error)}`;
}
