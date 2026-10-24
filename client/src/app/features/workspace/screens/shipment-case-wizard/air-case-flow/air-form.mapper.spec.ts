import {
  AirMethod,
  MblShippingType,
  MblStatus,
  WeightRoundingMode,
} from '../../../../../api/enums';
import {
  EMPTY_HAWB_FORM_VALUE,
  EMPTY_MAWB_FORM_VALUE,
  OTHER_TERMINAL,
  airlinePrefix,
  awbNumberError,
  isoToLocalDateTime,
  localDateTimeToIso,
  parseHandlingCodes,
  previewChargeableWeight,
  toCreateHawbDto,
  toCreateMawbDto,
  toUpdateHawbDto,
} from './air-form.mapper';

const RULE = {
  volumetricDivisor: 6000,
  roundingStepKg: 0.5,
  roundingMode: WeightRoundingMode.UP,
  airlinePrefix: null,
};

const EXTRAS = {
  customerId: null,
  status: MblStatus.OPEN,
  freightTerms: null,
  cargoTerminalId: null,
  cargoTerminalOther: '',
  legs: [],
};

describe('air form mapper', () => {
  it('validates the AWB check digit like the server does', () => {
    expect(awbNumberError('')).toBeNull();
    expect(awbNumberError('125-12345675')).toBeNull();
    expect(awbNumberError('125 1234 5676')).toContain('ספרת הביקורת');
    expect(awbNumberError('125-123')).toContain('11 ספרות');
    expect(airlinePrefix('125-12345675')).toBe('125');
  });

  it('previews chargeable weight as the rounded greater of gross and volumetric weight', () => {
    expect(previewChargeableWeight({ grossWeightKg: 100.2, volumeCbm: 0.3 }, RULE)).toBe(100.5);
    expect(
      previewChargeableWeight(
        {
          grossWeightKg: 20,
          dimensions: [{ pieceCount: 2, lengthCm: 100, widthCm: 50, heightCm: 40 }],
        },
        RULE,
      ),
    ).toBe(67);
    expect(previewChargeableWeight({}, RULE)).toBeNull();
  });

  it('parses special handling codes', () => {
    expect(parseHandlingCodes('dgr, per;  VAL')).toEqual(['DGR', 'PER', 'VAL']);
  });

  it('round-trips flight-leg date-times through ISO', () => {
    const iso = localDateTimeToIso('2026-10-20 08:30')!;
    expect(isoToLocalDateTime(iso)).toBe('2026-10-20 08:30');
    expect(localDateTimeToIso('')).toBeUndefined();
  });

  it('creates an unassigned air HAWB when there is no MAWB yet', () => {
    const dto = toCreateHawbDto(null, 3, { ...EMPTY_HAWB_FORM_VALUE, pieces: '4' }, [], []);
    expect(dto).toMatchObject({ shippingType: MblShippingType.AIR, customerId: 3, pieces: 4 });
    expect('mblId' in dto).toBe(false);
    expect('approvedChargeableWeightKg' in dto).toBe(false);
    expect(toCreateHawbDto(9, 3, EMPTY_HAWB_FORM_VALUE, [], [1001])).toMatchObject({
      mblId: 9,
      orderIds: [1001],
    });
  });

  it('sends an emptied HAWB number so the house falls back to its temporary id', () => {
    expect(toUpdateHawbDto(EMPTY_HAWB_FORM_VALUE, []).hblNumber).toBe('');
  });

  it('maps the terminal choice: listed id, "other" text, or clear both', () => {
    const listed = toCreateMawbDto(AirMethod.CONSOLIDATION, EMPTY_MAWB_FORM_VALUE, {
      ...EXTRAS,
      cargoTerminalId: 2,
    });
    expect(listed.cargoTerminalId).toBe(2);
    expect('cargoTerminalOther' in listed).toBe(false);

    const other = toCreateMawbDto(AirMethod.CONSOLIDATION, EMPTY_MAWB_FORM_VALUE, {
      ...EXTRAS,
      cargoTerminalId: OTHER_TERMINAL,
      cargoTerminalOther: ' Shed 7 ',
    });
    expect(other.cargoTerminalOther).toBe('Shed 7');
    expect('cargoTerminalId' in other).toBe(false);

    const none = toCreateMawbDto(AirMethod.DIRECT, EMPTY_MAWB_FORM_VALUE, EXTRAS);
    expect(none).toMatchObject({
      shippingType: MblShippingType.AIR,
      airMethod: AirMethod.DIRECT,
      cargoTerminalId: null,
      cargoTerminalOther: null,
    });
  });
});
