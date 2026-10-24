import { BadRequestException } from '@nestjs/common';
import { WeightRoundingMode } from './air.enums';
import {
  airlinePrefixOf,
  normalizeAwbNumber,
  normalizeHawbNumber,
} from './awb-number';
import {
  calculateChargeableWeight,
  roundWeight,
  WeightRule,
} from './chargeable-weight';

const DEFAULT_RULE: WeightRule = {
  volumetricDivisor: 6000,
  roundingStepKg: 0.5,
  roundingMode: WeightRoundingMode.UP,
};

describe('normalizeAwbNumber', () => {
  it('formats any spacing as XXX-XXXXXXXX when the check digit holds', () => {
    // 1234567 % 7 = 5 → serial 12345675 is valid.
    expect(normalizeAwbNumber('125 1234 5675')).toBe('125-12345675');
    expect(normalizeAwbNumber('12512345675')).toBe('125-12345675');
    expect(normalizeAwbNumber(' 125-12345675 ')).toBe('125-12345675');
  });

  it('returns null for blank input', () => {
    expect(normalizeAwbNumber('   ')).toBeNull();
    expect(normalizeAwbNumber(undefined)).toBeNull();
  });

  it('rejects a wrong check digit, a wrong length and letters', () => {
    expect(() => normalizeAwbNumber('125-12345676')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeAwbNumber('125-1234567')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeAwbNumber('ABC-12345675')).toThrow(
      BadRequestException,
    );
  });

  it('exposes the airline prefix', () => {
    expect(airlinePrefixOf('125-12345675')).toBe('125');
    expect(airlinePrefixOf(null)).toBeNull();
  });
});

describe('normalizeHawbNumber', () => {
  it('trims and upper-cases, blank → null', () => {
    expect(normalizeHawbNumber('  ab-12 ')).toBe('AB-12');
    expect(normalizeHawbNumber('')).toBeNull();
  });
});

describe('roundWeight', () => {
  it('rounds up to the step without bumping exact multiples', () => {
    expect(roundWeight(12.01, 0.5, WeightRoundingMode.UP)).toBe(12.5);
    expect(roundWeight(12.5, 0.5, WeightRoundingMode.UP)).toBe(12.5);
    expect(roundWeight(12, 0.5, WeightRoundingMode.UP)).toBe(12);
  });

  it('supports nearest rounding', () => {
    expect(roundWeight(12.2, 0.5, WeightRoundingMode.NEAREST)).toBe(12);
    expect(roundWeight(12.3, 0.5, WeightRoundingMode.NEAREST)).toBe(12.5);
  });
});

describe('calculateChargeableWeight', () => {
  it('takes gross weight when it is heavier', () => {
    const result = calculateChargeableWeight(
      { grossWeightKg: 100.2, volumeCbm: 0.3 },
      DEFAULT_RULE,
    );
    // 0.3 cbm → 300000 / 6000 = 50 kg volumetric.
    expect(result.volumetricWeightKg).toBe(50);
    expect(result.calculatedKg).toBe(100.5);
  });

  it('takes volumetric weight when it is heavier, preferring dimensions over volume', () => {
    const result = calculateChargeableWeight(
      {
        grossWeightKg: 20,
        volumeCbm: 0.01,
        dimensions: [
          { pieceCount: 2, lengthCm: 100, widthCm: 50, heightCm: 40 },
        ],
      },
      DEFAULT_RULE,
    );
    // 2 × 200000 cm³ = 400000 / 6000 = 66.67 kg.
    expect(result.volumetricWeightKg).toBe(66.67);
    expect(result.calculatedKg).toBe(67);
  });

  it('uses the rule divisor', () => {
    const result = calculateChargeableWeight(
      { grossWeightKg: 1, volumeCbm: 1 },
      { ...DEFAULT_RULE, volumetricDivisor: 5000 },
    );
    expect(result.calculatedKg).toBe(200);
  });

  it('is null when nothing is known', () => {
    expect(
      calculateChargeableWeight(
        { grossWeightKg: null, volumeCbm: null },
        DEFAULT_RULE,
      ).calculatedKg,
    ).toBeNull();
  });
});
