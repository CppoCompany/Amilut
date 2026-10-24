import { HttpErrorResponse } from '@angular/common/http';

import {
  AirMethod,
  MblShippingType,
  MblStatus,
  PaymentTerms,
  WeightRoundingMode,
} from '../../../../../api/enums';
import type {
  CreateFlightLegDto,
  CreateHblDto,
  CreateMblDto,
  FlightLegDto,
  HblDto,
  MblDto,
  PieceDimensionDto,
  UpdateHblDto,
  UpdateMblDto,
  WeightRuleDto,
} from '../../../../../api/models';

/** Free-text form values are strings (`''` = not filled), like the sea mappers. */
export interface FlightLegFormValue {
  flightNumber: string;
  fromAirport: string;
  toAirport: string;
  /** `yyyy-mm-dd HH:mm` (local), as the PrimeNG date-time picker writes it. */
  etd: string;
  eta: string;
  atd: string;
  ata: string;
}

export interface PieceDimensionFormValue {
  pieceCount: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
}

/** Fields shared by the MAWB and HAWB forms. */
interface AirPartyCargoFormValue {
  shipperName: string;
  shipperAddress: string;
  consigneeName: string;
  consigneeAddress: string;
  notifyPartyName: string;
  notifyPartyAddress: string;
  cargoDescription: string;
  pieces: string;
  grossWeightKg: string;
  volumeCbm: string;
  approvedChargeableWeightKg: string;
  chargeableWeightOverrideReason: string;
  /** Comma / space separated IATA codes, e.g. "DGR, PER". */
  specialHandlingCodes: string;
}

export interface MawbFormValue extends AirPartyCargoFormValue {
  mblNumber: string;
  bookingNumber: string;
  carrierName: string;
  departureAirportCode: string;
  destinationAirportCode: string;
  placeOfIssue: string;
  dateOfIssue: string;
}

export interface HawbFormValue extends AirPartyCargoFormValue {
  hblNumber: string;
  remarks: string;
}

const EMPTY_PARTY_CARGO: AirPartyCargoFormValue = {
  shipperName: '',
  shipperAddress: '',
  consigneeName: '',
  consigneeAddress: '',
  notifyPartyName: '',
  notifyPartyAddress: '',
  cargoDescription: '',
  pieces: '',
  grossWeightKg: '',
  volumeCbm: '',
  approvedChargeableWeightKg: '',
  chargeableWeightOverrideReason: '',
  specialHandlingCodes: '',
};

export const EMPTY_MAWB_FORM_VALUE: MawbFormValue = {
  ...EMPTY_PARTY_CARGO,
  mblNumber: '',
  bookingNumber: '',
  carrierName: '',
  departureAirportCode: '',
  destinationAirportCode: '',
  placeOfIssue: '',
  dateOfIssue: '',
};

export const EMPTY_HAWB_FORM_VALUE: HawbFormValue = {
  ...EMPTY_PARTY_CARGO,
  hblNumber: '',
  remarks: '',
};

export const EMPTY_FLIGHT_LEG: FlightLegFormValue = {
  flightNumber: '',
  fromAirport: '',
  toAirport: '',
  etd: '',
  eta: '',
  atd: '',
  ata: '',
};

export const EMPTY_PIECE_DIMENSION: PieceDimensionFormValue = {
  pieceCount: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
};

/** Value for the terminal select's "Other" entry (free text). */
export const OTHER_TERMINAL = -1;

// ── helpers ─────────────────────────────────────────────────────────────────

function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function num(value: string | null | undefined): number | undefined {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function str(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function parseHandlingCodes(value: string): string[] {
  return value
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter((code) => code.length > 0);
}

/** `yyyy-mm-dd HH:mm` (local) → ISO string; blank/invalid → undefined. */
export function localDateTimeToIso(value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(value.trim());
  if (!match) return undefined;
  const [, y, m, d, hh = '00', mm = '00'] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)).toISOString();
}

/** ISO string → `yyyy-mm-dd HH:mm` in local time; null → ''. */
export function isoToLocalDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

// ── AWB number (client-side early warning; the server is authoritative) ─────

/** Hebrew error for an invalid MAWB number, `null` when blank or valid. */
export function awbNumberError(value: string): string | null {
  const raw = value.trim();
  if (raw === '') return null;
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{11}$/.test(digits)) return 'מספר MAWB הוא 11 ספרות: קידומת חברת תעופה (3) + 8 ספרות';
  if (Number(digits.slice(3, 10)) % 7 !== Number(digits[10])) {
    return 'ספרת הביקורת של מספר ה-MAWB שגויה';
  }
  return null;
}

export function airlinePrefix(awbNumber: string): string | null {
  const digits = awbNumber.replace(/[\s-]/g, '');
  return /^\d{3}/.test(digits) ? digits.slice(0, 3) : null;
}

// ── chargeable weight preview (mirrors server/src/air/chargeable-weight.ts) ──

export function previewChargeableWeight(
  input: { grossWeightKg?: number; volumeCbm?: number; dimensions?: PieceDimensionDto[] },
  rule: WeightRuleDto,
): number | null {
  let volumetric: number | undefined;
  if (input.dimensions && input.dimensions.length > 0) {
    const cm3 = input.dimensions.reduce(
      (sum, d) => sum + d.pieceCount * d.lengthCm * d.widthCm * d.heightCm,
      0,
    );
    volumetric = cm3 / rule.volumetricDivisor;
  } else if (input.volumeCbm !== undefined) {
    volumetric = (input.volumeCbm * 1_000_000) / rule.volumetricDivisor;
  }
  if (input.grossWeightKg === undefined && volumetric === undefined) return null;
  const heavier = Math.max(input.grossWeightKg ?? 0, volumetric ?? 0);
  const steps = heavier / rule.roundingStepKg;
  const rounded =
    rule.roundingMode === WeightRoundingMode.UP ? Math.ceil(steps - 1e-9) : Math.round(steps);
  return Number((rounded * rule.roundingStepKg).toFixed(2));
}

export function dimensionsFromForm(rows: PieceDimensionFormValue[]): PieceDimensionDto[] {
  return rows
    .map((row) => ({
      pieceCount: num(row.pieceCount),
      lengthCm: num(row.lengthCm),
      widthCm: num(row.widthCm),
      heightCm: num(row.heightCm),
    }))
    .filter(
      (d): d is PieceDimensionDto =>
        d.pieceCount !== undefined &&
        d.lengthCm !== undefined &&
        d.widthCm !== undefined &&
        d.heightCm !== undefined,
    );
}

// ── shared party / cargo part ───────────────────────────────────────────────

function partyCargoToDto(value: AirPartyCargoFormValue) {
  const approved = num(value.approvedChargeableWeightKg);
  return {
    shipperName: text(value.shipperName),
    shipperAddress: text(value.shipperAddress),
    consigneeName: text(value.consigneeName),
    consigneeAddress: text(value.consigneeAddress),
    notifyPartyName: text(value.notifyPartyName),
    notifyPartyAddress: text(value.notifyPartyAddress),
    cargoDescription: text(value.cargoDescription),
    pieces: num(value.pieces),
    grossWeightKg: num(value.grossWeightKg),
    volumeCbm: num(value.volumeCbm),
    // Blank clears an approved value; the server then drops the override flag.
    approvedChargeableWeightKg: approved ?? null,
    chargeableWeightOverrideReason: text(value.chargeableWeightOverrideReason),
    specialHandlingCodes: parseHandlingCodes(value.specialHandlingCodes),
  };
}

function partyCargoToForm(dto: MblDto | HblDto): AirPartyCargoFormValue {
  return {
    shipperName: str(dto.shipperName),
    shipperAddress: str(dto.shipperAddress),
    consigneeName: str(dto.consigneeName),
    consigneeAddress: str(dto.consigneeAddress),
    notifyPartyName: str(dto.notifyPartyName),
    notifyPartyAddress: str(dto.notifyPartyAddress),
    cargoDescription: str(dto.cargoDescription),
    pieces: str(dto.pieces),
    grossWeightKg: str(dto.grossWeightKg),
    volumeCbm: str(dto.volumeCbm),
    approvedChargeableWeightKg: str(dto.approvedChargeableWeightKg),
    chargeableWeightOverrideReason: '',
    specialHandlingCodes: dto.specialHandlingCodes.join(', '),
  };
}

// ── MAWB ────────────────────────────────────────────────────────────────────

export interface MawbExtras {
  customerId: number | null;
  status: MblStatus;
  freightTerms: PaymentTerms | null;
  /** A listed terminal id, {@link OTHER_TERMINAL}, or null. */
  cargoTerminalId: number | null;
  cargoTerminalOther: string;
  legs: FlightLegFormValue[];
}

function legsToDto(legs: FlightLegFormValue[]): CreateFlightLegDto[] {
  return legs.map((leg) =>
    withoutUndefined({
      flightNumber: text(leg.flightNumber),
      fromAirport: text(leg.fromAirport)?.toUpperCase(),
      toAirport: text(leg.toAirport)?.toUpperCase(),
      etd: localDateTimeToIso(leg.etd),
      eta: localDateTimeToIso(leg.eta),
      atd: localDateTimeToIso(leg.atd),
      ata: localDateTimeToIso(leg.ata),
    }),
  );
}

export function legToFormValue(leg: FlightLegDto): FlightLegFormValue {
  return {
    flightNumber: str(leg.flightNumber),
    fromAirport: str(leg.fromAirport),
    toAirport: str(leg.toAirport),
    etd: isoToLocalDateTime(leg.etd),
    eta: isoToLocalDateTime(leg.eta),
    atd: isoToLocalDateTime(leg.atd),
    ata: isoToLocalDateTime(leg.ata),
  };
}

/** A listed terminal, an "other" free text, or neither (clears both). */
function terminalFields(extras: MawbExtras): {
  cargoTerminalId?: number | null;
  cargoTerminalOther?: string | null;
} {
  if (extras.cargoTerminalId !== null && extras.cargoTerminalId !== OTHER_TERMINAL) {
    return { cargoTerminalId: extras.cargoTerminalId };
  }
  const other =
    extras.cargoTerminalId === OTHER_TERMINAL ? text(extras.cargoTerminalOther) : undefined;
  return other
    ? { cargoTerminalOther: other }
    : { cargoTerminalId: null, cargoTerminalOther: null };
}

function mawbBody(value: MawbFormValue, extras: MawbExtras) {
  return {
    ...partyCargoToDto(value),
    mblNumber: text(value.mblNumber),
    bookingNumber: text(value.bookingNumber),
    carrierName: text(value.carrierName),
    departureAirportCode: text(value.departureAirportCode)?.toUpperCase(),
    destinationAirportCode: text(value.destinationAirportCode),
    placeOfIssue: text(value.placeOfIssue),
    dateOfIssue: text(value.dateOfIssue),
    status: extras.status,
    freightTerms: extras.freightTerms ?? undefined,
    customerId: extras.customerId ?? undefined,
    ...terminalFields(extras),
    flightLegs: legsToDto(extras.legs),
  };
}

export function toCreateMawbDto(
  airMethod: AirMethod,
  value: MawbFormValue,
  extras: MawbExtras,
): CreateMblDto {
  return withoutUndefined({
    shippingType: MblShippingType.AIR,
    airMethod,
    ...mawbBody(value, extras),
  }) as CreateMblDto;
}

export function toUpdateMawbDto(value: MawbFormValue, extras: MawbExtras): UpdateMblDto {
  return withoutUndefined(mawbBody(value, extras)) as UpdateMblDto;
}

export function mawbToFormValue(mbl: MblDto): MawbFormValue {
  return {
    ...partyCargoToForm(mbl),
    mblNumber: str(mbl.mblNumber),
    bookingNumber: str(mbl.bookingNumber),
    carrierName: str(mbl.carrierName),
    departureAirportCode: str(mbl.departureAirportCode),
    destinationAirportCode: str(mbl.destinationAirportCode),
    placeOfIssue: str(mbl.placeOfIssue),
    dateOfIssue: str(mbl.dateOfIssue),
  };
}

// ── HAWB ────────────────────────────────────────────────────────────────────

function hawbBody(value: HawbFormValue, dimensions: PieceDimensionFormValue[]) {
  return {
    ...partyCargoToDto(value),
    hblNumber: text(value.hblNumber),
    remarks: text(value.remarks),
    pieceDimensions: dimensionsFromForm(dimensions),
  };
}

/** A HAWB is created under `mblId`, or (null) on its own as an air HAWB awaiting a MAWB. */
export function toCreateHawbDto(
  mblId: number | null,
  customerId: number,
  value: HawbFormValue,
  dimensions: PieceDimensionFormValue[],
  orderIds: number[],
): CreateHblDto {
  const body = hawbBody(value, dimensions);
  return withoutUndefined({
    ...(mblId !== null ? { mblId } : { shippingType: MblShippingType.AIR }),
    customerId,
    ...body,
    // Nothing approved yet on a new HAWB: omit rather than send null.
    approvedChargeableWeightKg: body.approvedChargeableWeightKg ?? undefined,
    orderIds: orderIds.length > 0 ? orderIds : undefined,
  }) as CreateHblDto;
}

export function toUpdateHawbDto(
  value: HawbFormValue,
  dimensions: PieceDimensionFormValue[],
): UpdateHblDto {
  const body = hawbBody(value, dimensions);
  // An emptied HAWB number goes back to the temporary internal id.
  return withoutUndefined({ ...body, hblNumber: body.hblNumber ?? '' }) as UpdateHblDto;
}

export function hawbToFormValue(hbl: HblDto): HawbFormValue {
  return {
    ...partyCargoToForm(hbl),
    hblNumber: str(hbl.hblNumber),
    remarks: str(hbl.remarks),
  };
}

export function dimensionToFormValue(d: PieceDimensionDto): PieceDimensionFormValue {
  return {
    pieceCount: str(d.pieceCount),
    lengthCm: str(d.lengthCm),
    widthCm: str(d.widthCm),
    heightCm: str(d.heightCm),
  };
}

/** How a house is named in lists: the real HAWB number, else the temporary id. */
export function hawbLabel(hbl: Pick<HblDto, 'hblNumber' | 'iblNumber' | 'id'>): string {
  return hbl.hblNumber ?? `${hbl.iblNumber ?? `#${hbl.id}`} (מזהה זמני)`;
}

/** Hebrew error line for a failed request, with the server's message appended when present. */
export function airErrorMessage(prefix: string, error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: string | string[] } | string | null | undefined;
    const message =
      typeof body === 'string'
        ? body
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : body?.message;
    if (message) return `${prefix}: ${message}`;
  }
  return prefix;
}
