import { HttpErrorResponse } from '@angular/common/http';

import { MblShippingType, MblStatus, PaymentTerms, SeaMethod } from '../../../../api/enums';
import type {
  CreateMblContainerDto,
  CreateMblDto,
  MblContainerDto,
  MblContainerExtractDto,
  MblDocumentExtractDto,
  MblDto,
} from '../../../../api/models';

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

/** Maps a saved `MblDto` back into the form's flat string shape, for re-editing a saved Job. */
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

/**
 * The Job fields from the order's MBL document, completed from the house
 * B/L's master-level boxes: every field the MBL document left empty, and the
 * containers when the MBL document names none (a house B/L often prints the
 * container / seal the master only lists in its cargo table). Either side may
 * be missing.
 */
export function mergeMblExtracts(
  primary: MblDocumentExtractDto | null,
  fallback: MblDocumentExtractDto | null,
): MblDocumentExtractDto | null {
  if (!primary) return fallback;
  if (!fallback) return primary;
  const merged: MblDocumentExtractDto = { ...primary };
  for (const key of Object.keys(primary) as (keyof MblDocumentExtractDto)[]) {
    if (key === 'containers' || primary[key] !== null) continue;
    // An address belongs to a name: the house B/L's consignee address must
    // not land on a master consigned "To Order".
    const nameKey = PARTY_NAME_OF_ADDRESS[key];
    if (nameKey && primary[nameKey] !== null && !sameName(primary[nameKey], fallback[nameKey])) {
      continue;
    }
    (merged as Record<string, unknown>)[key] = fallback[key];
  }
  const numbered = (c: MblContainerExtractDto) => c.containerNumber !== null;
  if (!primary.containers.some(numbered) && fallback.containers.some(numbered)) {
    // The MBL's only (unnumbered) cargo line describes the single container.
    const describe = primary.containers.length === 1 && fallback.containers.length === 1;
    merged.containers = fallback.containers.map((container) =>
      describe ? completeContainer(container, primary.containers[0]) : container,
    );
  }
  return merged;
}

const PARTY_NAME_OF_ADDRESS: Partial<
  Record<keyof MblDocumentExtractDto, 'shipperName' | 'consigneeName' | 'notifyPartyName'>
> = {
  shipperAddress: 'shipperName',
  consigneeAddress: 'consigneeName',
  notifyPartyAddress: 'notifyPartyName',
};

/** "East Harbor Components Co., Ltd." ~ "EAST HARBOR COMPONENTS CO LTD". */
function sameName(a: string | null, b: string | null): boolean {
  const normalize = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return a !== null && b !== null && normalize(a) === normalize(b);
}

function completeContainer(
  container: MblContainerExtractDto,
  from: MblContainerExtractDto,
): MblContainerExtractDto {
  return {
    containerNumber: container.containerNumber ?? from.containerNumber,
    containerSealNumber: container.containerSealNumber ?? from.containerSealNumber,
    cargoDescription: container.cargoDescription ?? from.cargoDescription,
    grossWeightKg: container.grossWeightKg ?? from.grossWeightKg,
    volumeCbm: container.volumeCbm ?? from.volumeCbm,
  };
}

/** The Job form prefilled from a Master B/L document (or the master-level
 *  boxes of a House B/L): every stated field, blanks for the rest. The
 *  single-container fields take the document's first container. */
export function mblExtractToFormValue(extract: MblDocumentExtractDto | null): MblFormValue {
  if (!extract) return { ...EMPTY_MBL_FORM_VALUE };
  const first: MblContainerExtractDto | undefined = extract.containers[0];
  const text = (source: string | null | undefined) => source ?? '';
  const number = (source: number | null | undefined) =>
    source === null || source === undefined ? '' : String(source);
  return {
    mblNumber: text(extract.mblNumber),
    bookingNumber: text(extract.bookingNumber),
    vesselName: text(extract.vesselName),
    voyageNumber: text(extract.voyageNumber),
    portOfLoading: text(extract.portOfLoading),
    portOfDischarge: text(extract.portOfDischarge),
    finalDestination: text(extract.finalDestination),
    carrierName: text(extract.carrierName),
    shipperName: text(extract.shipperName),
    shipperAddress: text(extract.shipperAddress),
    consigneeName: text(extract.consigneeName),
    consigneeAddress: text(extract.consigneeAddress),
    notifyPartyName: text(extract.notifyPartyName),
    notifyPartyAddress: text(extract.notifyPartyAddress),
    containerNumber: text(first?.containerNumber),
    containerSealNumber: text(first?.containerSealNumber),
    cargoDescription: text(first?.cargoDescription),
    grossWeightKg: number(first?.grossWeightKg ?? extract.grossWeightKg),
    volumeCbm: number(first?.volumeCbm ?? extract.volumeCbm),
    receiptDeliveryType: text(extract.receiptDeliveryType),
    placeOfIssue: text(extract.placeOfIssue),
    dateOfIssue: text(extract.dateOfIssue),
  };
}

/** The groupage container table prefilled from a Master B/L document's container rows. */
export function mblExtractContainersToFormValue(
  extract: MblDocumentExtractDto | null,
): MblContainerFormValue[] {
  return (extract?.containers ?? []).map((container) => ({
    containerNumber: container.containerNumber ?? '',
    containerSealNumber: container.containerSealNumber ?? '',
    cargoDescription: container.cargoDescription ?? '',
    grossWeightKg: container.grossWeightKg !== null ? String(container.grossWeightKg) : '',
    volumeCbm: container.volumeCbm !== null ? String(container.volumeCbm) : '',
  }));
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
