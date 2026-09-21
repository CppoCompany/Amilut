import { HttpErrorResponse } from '@angular/common/http';

import { ShipmentDocumentType } from '../../../../api/enums';
import type { ShipmentDto, UpdateShipmentDto } from '../../../../api/models';

/** Free-text / date / numeric fields of the shipment form (always strings; `''` = not filled). */
export interface ShipmentFormValue {
  billOfLadingNumber: string;
  blIssueDate: string;
  forwarderName: string;
  voyageFlightNumber: string;
  vesselName: string;
  portOfLoading: string;
  portOfDischarge: string;
  manifestNumber: string;
  transactionNumber: string;
  shipperName: string;
  shipperAddress: string;
  consigneeName: string;
  consigneeAddress: string;
  notifyParty: string;
  cargoDescription: string;
  packageCount: string;
  packageUnit: string;
  grossWeightKg: string;
  netWeightKg: string;
  volumeCbm: string;
  hsCode: string;
  dangerousGoodsImoClass: string;
  containerNumber: string;
  containerType: string;
  containerSealNumber: string;
}

/** Tab-driven selections of the shipment form. */
export interface ShipmentSelection {
  documentType: ShipmentDocumentType | null;
  dangerousGoods: boolean;
}

export const EMPTY_SHIPMENT_FORM_VALUE: ShipmentFormValue = {
  billOfLadingNumber: '',
  blIssueDate: '',
  forwarderName: '',
  voyageFlightNumber: '',
  vesselName: '',
  portOfLoading: '',
  portOfDischarge: '',
  manifestNumber: '',
  transactionNumber: '',
  shipperName: '',
  shipperAddress: '',
  consigneeName: '',
  consigneeAddress: '',
  notifyParty: '',
  cargoDescription: '',
  packageCount: '',
  packageUnit: '',
  grossWeightKg: '',
  netWeightKg: '',
  volumeCbm: '',
  hsCode: '',
  dangerousGoodsImoClass: '',
  containerNumber: '',
  containerType: '',
  containerSealNumber: '',
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

function sharedFields(selection: ShipmentSelection, form: ShipmentFormValue) {
  return {
    documentType: selection.documentType ?? undefined,
    dangerousGoods: selection.dangerousGoods,
    billOfLadingNumber: blankToUndefined(form.billOfLadingNumber),
    blIssueDate: blankToUndefined(form.blIssueDate),
    forwarderName: blankToUndefined(form.forwarderName),
    voyageFlightNumber: blankToUndefined(form.voyageFlightNumber),
    vesselName: blankToUndefined(form.vesselName),
    portOfLoading: blankToUndefined(form.portOfLoading),
    portOfDischarge: blankToUndefined(form.portOfDischarge),
    manifestNumber: blankToUndefined(form.manifestNumber),
    transactionNumber: blankToUndefined(form.transactionNumber),
    shipperName: blankToUndefined(form.shipperName),
    shipperAddress: blankToUndefined(form.shipperAddress),
    consigneeName: blankToUndefined(form.consigneeName),
    consigneeAddress: blankToUndefined(form.consigneeAddress),
    notifyParty: blankToUndefined(form.notifyParty),
    cargoDescription: blankToUndefined(form.cargoDescription),
    packageCount: blankToNumber(form.packageCount),
    packageUnit: blankToUndefined(form.packageUnit),
    grossWeightKg: blankToNumber(form.grossWeightKg),
    netWeightKg: blankToNumber(form.netWeightKg),
    volumeCbm: blankToNumber(form.volumeCbm),
    hsCode: blankToUndefined(form.hsCode),
    dangerousGoodsImoClass: selection.dangerousGoods
      ? blankToUndefined(form.dangerousGoodsImoClass)
      : undefined,
    containerNumber: blankToUndefined(form.containerNumber),
    containerType: blankToUndefined(form.containerType),
    containerSealNumber: blankToUndefined(form.containerSealNumber),
  };
}

/** Assembles the `UpdateShipmentDto` sent to `PATCH /api/shipments/:id`. */
export function toUpdateShipmentDto(
  selection: ShipmentSelection,
  form: ShipmentFormValue,
): UpdateShipmentDto {
  return withoutUndefined(sharedFields(selection, form));
}

/** Maps a `ShipmentDto` from the server back into the form's flat string shape. */
export function shipmentToFormValue(shipment: ShipmentDto): ShipmentFormValue {
  return {
    billOfLadingNumber: shipment.billOfLadingNumber ?? '',
    blIssueDate: shipment.blIssueDate ?? '',
    forwarderName: shipment.forwarderName ?? '',
    voyageFlightNumber: shipment.voyageFlightNumber ?? '',
    vesselName: shipment.vesselName ?? '',
    portOfLoading: shipment.portOfLoading ?? '',
    portOfDischarge: shipment.portOfDischarge ?? '',
    manifestNumber: shipment.manifestNumber ?? '',
    transactionNumber: shipment.transactionNumber ?? '',
    shipperName: shipment.shipperName ?? '',
    shipperAddress: shipment.shipperAddress ?? '',
    consigneeName: shipment.consigneeName ?? '',
    consigneeAddress: shipment.consigneeAddress ?? '',
    notifyParty: shipment.notifyParty ?? '',
    cargoDescription: shipment.cargoDescription ?? '',
    packageCount: shipment.packageCount !== null ? String(shipment.packageCount) : '',
    packageUnit: shipment.packageUnit ?? '',
    grossWeightKg: shipment.grossWeightKg !== null ? String(shipment.grossWeightKg) : '',
    netWeightKg: shipment.netWeightKg !== null ? String(shipment.netWeightKg) : '',
    volumeCbm: shipment.volumeCbm !== null ? String(shipment.volumeCbm) : '',
    hsCode: shipment.hsCode ?? '',
    dangerousGoodsImoClass: shipment.dangerousGoodsImoClass ?? '',
    containerNumber: shipment.containerNumber ?? '',
    containerType: shipment.containerType ?? '',
    containerSealNumber: shipment.containerSealNumber ?? '',
  };
}

const LOAD_FAILED = 'טעינת ההזמנה נכשלה';
const SAVE_FAILED = 'שמירת התיק נכשלה';

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

/** Hebrew error line for a failed order lookup, with the server's message appended when present. */
export function loadErrorMessage(error: unknown): string {
  return `${LOAD_FAILED}${errorSuffix(error)}`;
}

/** Hebrew error line for a failed save, with the server's message appended when present. */
export function saveErrorMessage(error: unknown): string {
  return `${SAVE_FAILED}${errorSuffix(error)}`;
}
