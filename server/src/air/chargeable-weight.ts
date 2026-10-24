import { WeightRoundingMode } from './air.enums';

/** The rule a chargeable weight is calculated with (`air_weight_rule`, or its snapshot on a row). */
export interface WeightRule {
  volumetricDivisor: number;
  roundingStepKg: number;
  roundingMode: WeightRoundingMode;
}

/** One dimension line: `pieceCount` pieces of L × W × H centimetres. */
export interface PieceDimension {
  pieceCount: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface ChargeableWeightInput {
  grossWeightKg: number | null;
  volumeCbm: number | null;
  /** When present and non-empty, wins over `volumeCbm` (it is the measured source). */
  dimensions?: readonly PieceDimension[];
}

export interface ChargeableWeightResult {
  volumetricWeightKg: number | null;
  /** `null` when neither a gross weight nor a volume is known. */
  calculatedKg: number | null;
}

const CM3_PER_CBM = 1_000_000;

/** Rounds to the rule's step; `up` never rounds down an exact multiple. */
export function roundWeight(
  kg: number,
  stepKg: number,
  mode: WeightRoundingMode,
): number {
  // The epsilon keeps float noise (e.g. 12.000000001 / 0.5) from adding a step.
  const steps = kg / stepKg;
  const rounded =
    mode === WeightRoundingMode.UP
      ? Math.ceil(steps - 1e-9)
      : Math.round(steps);
  return Number((rounded * stepKg).toFixed(2));
}

export function volumetricWeightKg(
  input: ChargeableWeightInput,
  divisor: number,
): number | null {
  if (input.dimensions && input.dimensions.length > 0) {
    const cm3 = input.dimensions.reduce(
      (sum, d) => sum + d.pieceCount * d.lengthCm * d.widthCm * d.heightCm,
      0,
    );
    return cm3 / divisor;
  }
  if (input.volumeCbm !== null) {
    return (input.volumeCbm * CM3_PER_CBM) / divisor;
  }
  return null;
}

/** Chargeable weight = the greater of gross and volumetric weight, rounded per the rule. */
export function calculateChargeableWeight(
  input: ChargeableWeightInput,
  rule: WeightRule,
): ChargeableWeightResult {
  const volumetric = volumetricWeightKg(input, rule.volumetricDivisor);
  if (input.grossWeightKg === null && volumetric === null) {
    return { volumetricWeightKg: null, calculatedKg: null };
  }
  const heavier = Math.max(input.grossWeightKg ?? 0, volumetric ?? 0);
  return {
    volumetricWeightKg:
      volumetric === null ? null : Number(volumetric.toFixed(2)),
    calculatedKg: roundWeight(heavier, rule.roundingStepKg, rule.roundingMode),
  };
}
