import { HttpErrorResponse } from '@angular/common/http';

import type { CreateHblDto, HblDto, UpdateHblDto } from '../../../../api/models';

/** Free-text / numeric fields of the HBL form (always strings; `''` = not filled).
 *  `mblId`/`containerId`/`customerId`/`orderIds` are assembled separately in
 *  `toCreateHblDto` — they come from component state, not this form group. */
export interface HblFormValue {
  hblNumber: string;
  shipperName: string;
  shipperAddress: string;
  consigneeName: string;
  consigneeAddress: string;
  notifyPartyName: string;
  notifyPartyAddress: string;
  cargoDescription: string;
  quantity: string;
  grossWeightKg: string;
  volumeCbm: string;
  remarks: string;
}

export const EMPTY_HBL_FORM_VALUE: HblFormValue = {
  hblNumber: '',
  shipperName: '',
  shipperAddress: '',
  consigneeName: '',
  consigneeAddress: '',
  notifyPartyName: '',
  notifyPartyAddress: '',
  cargoDescription: '',
  quantity: '',
  grossWeightKg: '',
  volumeCbm: '',
  remarks: '',
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

/** Assembles the `CreateHblDto` sent to `POST /api/hbl`. `containerId` must be
 *  `null` for every method except `groupage_fcl`, where it's required (enforced
 *  server-side — see `HblService.validateContainer`). */
export function toCreateHblDto(
  mblId: number,
  containerId: number | null,
  customerId: number,
  form: HblFormValue,
  orderIds: number[],
): CreateHblDto {
  return withoutUndefined({
    mblId,
    containerId: containerId ?? undefined,
    customerId,
    hblNumber: blankToUndefined(form.hblNumber),
    shipperName: blankToUndefined(form.shipperName),
    shipperAddress: blankToUndefined(form.shipperAddress),
    consigneeName: blankToUndefined(form.consigneeName),
    consigneeAddress: blankToUndefined(form.consigneeAddress),
    notifyPartyName: blankToUndefined(form.notifyPartyName),
    notifyPartyAddress: blankToUndefined(form.notifyPartyAddress),
    cargoDescription: blankToUndefined(form.cargoDescription),
    quantity: blankToUndefined(form.quantity),
    grossWeightKg: blankToNumber(form.grossWeightKg),
    volumeCbm: blankToNumber(form.volumeCbm),
    remarks: blankToUndefined(form.remarks),
    orderIds: orderIds.length > 0 ? orderIds : undefined,
  });
}

/** Assembles the `UpdateHblDto` sent to `PATCH /api/hbl/:id`. `mblId`/`containerId`/
 *  `customerId` are fixed at creation and never included here — order association
 *  has its own dedicated `PATCH /api/hbl/:id/orders` call. */
export function toUpdateHblDto(form: HblFormValue): UpdateHblDto {
  return withoutUndefined({
    hblNumber: blankToUndefined(form.hblNumber),
    shipperName: blankToUndefined(form.shipperName),
    shipperAddress: blankToUndefined(form.shipperAddress),
    consigneeName: blankToUndefined(form.consigneeName),
    consigneeAddress: blankToUndefined(form.consigneeAddress),
    notifyPartyName: blankToUndefined(form.notifyPartyName),
    notifyPartyAddress: blankToUndefined(form.notifyPartyAddress),
    cargoDescription: blankToUndefined(form.cargoDescription),
    quantity: blankToUndefined(form.quantity),
    grossWeightKg: blankToNumber(form.grossWeightKg),
    volumeCbm: blankToNumber(form.volumeCbm),
    remarks: blankToUndefined(form.remarks),
  });
}

/** Maps a saved `HblDto` back into the form's flat string shape, for editing from the sidebar tree. */
export function hblToFormValue(hbl: HblDto): HblFormValue {
  return {
    hblNumber: hbl.hblNumber ?? '',
    shipperName: hbl.shipperName ?? '',
    shipperAddress: hbl.shipperAddress ?? '',
    consigneeName: hbl.consigneeName ?? '',
    consigneeAddress: hbl.consigneeAddress ?? '',
    notifyPartyName: hbl.notifyPartyName ?? '',
    notifyPartyAddress: hbl.notifyPartyAddress ?? '',
    cargoDescription: hbl.cargoDescription ?? '',
    quantity: hbl.quantity ?? '',
    grossWeightKg: hbl.grossWeightKg !== null ? String(hbl.grossWeightKg) : '',
    volumeCbm: hbl.volumeCbm !== null ? String(hbl.volumeCbm) : '',
    remarks: hbl.remarks ?? '',
  };
}

const SAVE_FAILED = 'שמירת ה-HBL נכשלה';

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

/** Hebrew error line for a failed HBL save, with the server's message appended when present. */
export function saveErrorMessage(error: unknown): string {
  return `${SAVE_FAILED}${errorSuffix(error)}`;
}
