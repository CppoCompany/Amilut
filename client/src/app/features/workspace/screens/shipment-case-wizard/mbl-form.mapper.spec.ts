import { describe, expect, it } from 'vitest';

import type { MblDocumentExtractDto } from '../../../../api/models';
import { mergeMblExtracts } from './mbl-form.mapper';

const EMPTY: MblDocumentExtractDto = {
  mblNumber: null,
  bookingNumber: null,
  vesselName: null,
  voyageNumber: null,
  portOfLoading: null,
  portOfDischarge: null,
  finalDestination: null,
  carrierName: null,
  shipperName: null,
  shipperAddress: null,
  consigneeName: null,
  consigneeAddress: null,
  notifyPartyName: null,
  notifyPartyAddress: null,
  freightTerms: null,
  receiptDeliveryType: null,
  placeOfIssue: null,
  dateOfIssue: null,
  totalPackages: null,
  grossWeightKg: null,
  volumeCbm: null,
  containers: [],
};

describe('mergeMblExtracts', () => {
  const fromMblDocument: MblDocumentExtractDto = {
    ...EMPTY,
    mblNumber: 'SAMPLE-MBL-778845',
    carrierName: 'Example Ocean Line',
    consigneeName: 'To Order / As instructed',
    containers: [
      {
        containerNumber: null,
        containerSealNumber: null,
        cargoDescription: 'Electronic control modules',
        grossWeightKg: 2400,
        volumeCbm: 12.8,
      },
    ],
  };
  const fromHblMasterBoxes: MblDocumentExtractDto = {
    ...EMPTY,
    mblNumber: 'SAMPLE-MBL-778845',
    consigneeName: 'Amilut Demo Imports Ltd.',
    bookingNumber: 'BKG-1',
    containers: [
      {
        containerNumber: 'TGHU1234567',
        containerSealNumber: 'SEAL-DEMO-88421',
        cargoDescription: null,
        grossWeightKg: null,
        volumeCbm: null,
      },
    ],
  };

  it('keeps the MBL document first and fills only what it left empty', () => {
    const merged = mergeMblExtracts(fromMblDocument, fromHblMasterBoxes);

    expect(merged?.carrierName).toBe('Example Ocean Line');
    expect(merged?.consigneeName).toBe('To Order / As instructed');
    expect(merged?.bookingNumber).toBe('BKG-1');
  });

  it('copies a party address only when the party names agree', () => {
    const withAddresses: MblDocumentExtractDto = {
      ...fromHblMasterBoxes,
      shipperName: 'EAST HARBOR COMPONENTS CO., LTD',
      shipperAddress: '88 Fictional Road, Shanghai, China',
      consigneeAddress: '18 Example Avenue, Rosh HaAyin, Israel',
    };
    const merged = mergeMblExtracts(
      { ...fromMblDocument, shipperName: 'East Harbor Components Co., Ltd.' },
      withAddresses,
    );

    expect(merged?.shipperAddress).toBe('88 Fictional Road, Shanghai, China');
    expect(merged?.consigneeName).toBe('To Order / As instructed');
    expect(merged?.consigneeAddress).toBeNull();
  });

  it("takes the house B/L's numbered container and describes it with the MBL's cargo line", () => {
    const merged = mergeMblExtracts(fromMblDocument, fromHblMasterBoxes);

    expect(merged?.containers).toEqual([
      {
        containerNumber: 'TGHU1234567',
        containerSealNumber: 'SEAL-DEMO-88421',
        cargoDescription: 'Electronic control modules',
        grossWeightKg: 2400,
        volumeCbm: 12.8,
      },
    ]);
  });

  it('keeps the MBL containers when it names any', () => {
    const numbered = {
      ...fromMblDocument,
      containers: [{ ...fromMblDocument.containers[0], containerNumber: 'BMOU4512398' }],
    };
    expect(mergeMblExtracts(numbered, fromHblMasterBoxes)?.containers[0].containerNumber).toBe(
      'BMOU4512398',
    );
  });

  it('returns whichever side exists when the other is missing', () => {
    expect(mergeMblExtracts(null, fromHblMasterBoxes)).toBe(fromHblMasterBoxes);
    expect(mergeMblExtracts(fromMblDocument, null)).toBe(fromMblDocument);
    expect(mergeMblExtracts(null, null)).toBeNull();
  });
});
