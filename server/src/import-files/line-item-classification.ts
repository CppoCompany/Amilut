import {
  ClassificationApproval,
  TradeAgreement,
} from '../classification/classification.enums';

/**
 * What the classification ("סיווג") screen records against one supplier
 * invoice line. Stored next to the extracted fields inside
 * `import_account_files.data.lineItems[i].classification`; absent on lines
 * that have never been classified.
 */
export interface LineItemClassification {
  tradeAgreement: TradeAgreement | null;
  classificationCode: string;
  approvals: ClassificationApproval[];
  /** `countries.id`, or `null` when no country was chosen. */
  countryId: number | null;
}

export const EMPTY_LINE_ITEM_CLASSIFICATION: Readonly<LineItemClassification> =
  Object.freeze({
    tradeAgreement: null,
    classificationCode: '',
    approvals: [],
    countryId: null,
  });

/**
 * Coerces whatever is stored under `classification` (possibly missing or
 * hand-edited) into the full shape, dropping values outside the enums.
 */
export function normaliseLineItemClassification(
  raw: unknown,
): LineItemClassification {
  const value = (raw ?? {}) as Partial<
    Record<keyof LineItemClassification, unknown>
  >;
  const approvals = Array.isArray(value.approvals)
    ? value.approvals.filter(isClassificationApproval)
    : [];
  return {
    tradeAgreement: isTradeAgreement(value.tradeAgreement)
      ? value.tradeAgreement
      : null,
    classificationCode:
      typeof value.classificationCode === 'string'
        ? value.classificationCode
        : '',
    approvals: Array.from(new Set(approvals)),
    countryId:
      typeof value.countryId === 'number' &&
      Number.isInteger(value.countryId) &&
      value.countryId > 0
        ? value.countryId
        : null,
  };
}

export function isClassificationApproval(
  value: unknown,
): value is ClassificationApproval {
  return (
    typeof value === 'string' &&
    (Object.values(ClassificationApproval) as string[]).includes(value)
  );
}

export function isTradeAgreement(value: unknown): value is TradeAgreement {
  return (
    typeof value === 'string' &&
    (Object.values(TradeAgreement) as string[]).includes(value)
  );
}
