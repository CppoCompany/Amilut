import {
  classifyRow,
  detectHeaderColumns,
  normalizeText,
  parseAmount,
} from './invoice-table';

describe('parseAmount', () => {
  it('parses plain, currency-marked and thousands-separated numbers', () => {
    expect(parseAmount('15')).toBe(15);
    expect(parseAmount('$15.32')).toBe(15.32);
    expect(parseAmount('$1,518.92')).toBe(1518.92);
    expect(parseAmount(' 33,120.02 ')).toBe(33120.02);
    expect(parseAmount('USD 12')).toBe(12);
    expect(parseAmount('-3.5')).toBe(-3.5);
  });

  it('rejects text, codes, dates and malformed groupings', () => {
    for (const bad of [
      'Total',
      'USD',
      'Y8022-140BK',
      '27.05.2026',
      '1,23',
      '15 PCS',
      '',
      undefined,
    ]) {
      expect(parseAmount(bad)).toBeNull();
    }
  });
});

describe('detectHeaderColumns', () => {
  it('matches the sample invoice header', () => {
    expect(
      detectHeaderColumns([
        'ITEM. NO',
        'DESCRIPTION ',
        'QTY',
        ' PRICE',
        'TOTAL ',
      ]),
    ).toEqual({ item: 0, description: 1, quantity: 2, price: 3, total: 4 });
  });

  it('understands synonyms and specific-before-generic words', () => {
    expect(
      detectHeaderColumns([
        'Part Number',
        'Product Name',
        'Quantity',
        'Unit Price',
        'Amount',
      ]),
    ).toEqual({ item: 0, description: 1, quantity: 2, price: 3, total: 4 });
  });

  it('requires quantity + total and either price or item', () => {
    expect(detectHeaderColumns(['Qty', 'Price', 'Total'])).toEqual({
      quantity: 0,
      price: 1,
      total: 2,
    });
    expect(detectHeaderColumns(['Item', 'Qty', 'Total'])).toEqual({
      item: 0,
      quantity: 1,
      total: 2,
    });
    expect(detectHeaderColumns(['Item', 'Description', 'Qty'])).toBeNull();
    expect(detectHeaderColumns(['Carton', 'Weight', 'CBM'])).toBeNull();
  });

  it('never treats numeric cells or data rows as a header', () => {
    expect(
      detectHeaderColumns([
        'Y8022-140BK',
        'Light Fixtures',
        '15',
        '$15.32',
        '$229.80',
      ]),
    ).toBeNull();
    expect(detectHeaderColumns(['Total', 'USD', '$33,120.02'])).toBeNull();
  });
});

describe('classifyRow', () => {
  it('builds a line item when quantity, price and total are numbers', () => {
    expect(
      classifyRow({
        item: '  MS  YW8027/400GD ',
        description: 'Light  Fixtures',
        quantity: '28',
        price: '$16.38',
        total: '$458.64',
      }),
    ).toEqual({
      kind: 'item',
      lineItem: {
        item: 'MS YW8027/400GD',
        description: 'Light Fixtures',
        quantity: 28,
        price: 16.38,
        total: 458.64,
      },
    });
  });

  it('flags a numeric total without a quantity as the footer', () => {
    expect(
      classifyRow({ quantity: 'Total', price: 'USD', total: '$33,120.02' }),
    ).toEqual({ kind: 'footer' });
    expect(classifyRow({ description: 'Total', total: '36745.8' })).toEqual({
      kind: 'footer',
    });
  });

  it('skips rows without numbers or without any text', () => {
    expect(classifyRow({ description: 'Page 2 of 2' })).toEqual({
      kind: 'skip',
    });
    expect(classifyRow({ quantity: '1', price: '2', total: '2' })).toEqual({
      kind: 'skip',
    });
    expect(classifyRow({})).toEqual({ kind: 'skip' });
  });
});

describe('normalizeText', () => {
  it('trims and collapses whitespace including NBSP', () => {
    expect(normalizeText('  Y606/25P GD  A ')).toBe('Y606/25P GD A');
  });
});
