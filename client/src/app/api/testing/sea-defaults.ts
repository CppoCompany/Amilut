import { MblShippingType } from '../enums';
import type { CcfDto, HblDto, MblDto } from '../models';

/**
 * The air-only fields every MBL/HBL/CCF DTO carries, at the values a sea row
 * has (null / empty). Spec fixtures for sea records spread these in so they
 * stay valid as the shared DTOs grow.
 */
export const SEA_MBL_AIR_FIELDS = {
  airMethod: null,
  departureAirportCode: null,
  destinationAirportCode: null,
  cargoTerminalId: null,
  cargoTerminalName: null,
  cargoTerminalOther: null,
  pieces: null,
  calculatedChargeableWeightKg: null,
  approvedChargeableWeightKg: null,
  chargeableWeightOverridden: false,
  volumetricDivisor: null,
  weightRoundingStepKg: null,
  specialHandlingCodes: [],
  shipmentStatus: null,
  shipmentStatusSource: null,
  flightLegs: [],
  mirrorHblId: null,
} satisfies Partial<MblDto>;

export const SEA_HBL_AIR_FIELDS = {
  mblNumber: null,
  shippingType: MblShippingType.SEA,
  isMasterMirror: false,
  pieces: null,
  pieceDimensions: [],
  calculatedChargeableWeightKg: null,
  approvedChargeableWeightKg: null,
  chargeableWeightOverridden: false,
  volumetricDivisor: null,
  weightRoundingStepKg: null,
  specialHandlingCodes: [],
  documentStatus: null,
  piecesReceived: 0,
  arrivalState: null,
  ccfId: null,
} satisfies Partial<HblDto>;

export const SEA_CCF_HOUSE_FIELDS = {
  hblId: null,
  hblNumber: null,
  clearanceStatus: null,
} satisfies Partial<CcfDto>;
