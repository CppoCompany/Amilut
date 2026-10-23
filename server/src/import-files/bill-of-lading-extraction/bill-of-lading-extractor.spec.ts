import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { PaymentTerms } from '../../orders/orders.enums';
import {
  extractHblDocuments,
  extractMblDocument,
} from './bill-of-lading-extractor';
import {
  DocPage,
  readDocument,
  readHtmlDocument,
  readTextDocument,
} from './document-model';

const FIXTURES = path.join(__dirname, '__fixtures__');

function fixture(name: string): Buffer {
  return readFileSync(path.join(FIXTURES, name));
}

describe('bill-of-lading extraction', () => {
  describe('Master B/L sample (HTML)', () => {
    let pages: DocPage[];

    beforeAll(async () => {
      pages = await readDocument(
        fixture('mbl-sample.html'),
        'MBL.html',
        'text/html',
      );
    });

    it('reads the labelled boxes into Job fields', () => {
      const mbl = extractMblDocument(pages);

      expect(mbl.mblNumber).toBe('NGB-LCL-2026-7731');
      expect(mbl.bookingNumber).toBe('BKG-CFS-8820');
      expect(mbl.vesselName).toBe('OOCL HONG KONG');
      expect(mbl.voyageNumber).toBe('088E');
      expect(mbl.portOfLoading).toBe('Shanghai, China');
      expect(mbl.portOfDischarge).toBe('Haifa Port, Israel');
      expect(mbl.finalDestination).toBe('Haifa CFS Terminal');
      expect(mbl.shipperName).toBe('Asia Logistics Consolidation Co., Ltd.');
      expect(mbl.shipperAddress).toBe(
        'Port Zone B, Shanghai, China, Tel: +86-21-68881234',
      );
      expect(mbl.consigneeName).toBe('Global Freight Services Israel Ltd.');
      expect(mbl.consigneeAddress).toBe(
        'HaShoftim St 12, Haifa, Israel, Tel: +972-4-8664422',
      );
      expect(mbl.notifyPartyName).toBeNull();
      expect(mbl.freightTerms).toBe(PaymentTerms.PREPAID);
      expect(mbl.receiptDeliveryType).toBe('CFS/CFS');
      expect(mbl.totalPackages).toBe('26 PACKAGES');
      expect(mbl.grossWeightKg).toBe(8950);
      expect(mbl.volumeCbm).toBe(32.4);
      expect(mbl.placeOfIssue).toBeNull();
      expect(mbl.dateOfIssue).toBeNull();
    });

    it('reads the container table, falling back to the document totals for weight and volume', () => {
      const mbl = extractMblDocument(pages);

      expect(mbl.containers).toHaveLength(1);
      const [container] = mbl.containers;
      expect(container.containerNumber).toBe('BMOU4512398');
      expect(container.containerSealNumber).toBe('SL-332211');
      expect(container.cargoDescription).toBe(
        "1 x 40' High Cube Container; SAID TO CONTAIN: 3 LCL CONSIGNMENTS; 8 WOODEN CRATES (MACHINERY); 12 CARTONS (ELECTRONIC COMPONENTS); 6 PALLETS (CERAMIC TILES)",
      );
      expect(container.grossWeightKg).toBe(8950);
      expect(container.volumeCbm).toBe(32.4);
    });
  });

  describe('House B/L sample (PDF, three house B/Ls on three pages)', () => {
    let pages: DocPage[];

    beforeAll(async () => {
      pages = await readDocument(
        fixture('hbl-sample.pdf'),
        'hbl.pdf',
        'application/pdf',
      );
    });

    it('yields one File per page, keyed by its house B/L number', () => {
      const hbls = extractHblDocuments(pages);

      expect(hbls.map((h) => h.hblNumber)).toEqual([
        'HBL-NGB-LCL-2026-7731-01',
        'HBL-NGB-LCL-2026-7731-02',
        'HBL-NGB-LCL-2026-7731-03',
      ]);
    });

    it('reads the cargo table and treats "To be completed" / "Not allocated" as empty', () => {
      const [first, second, third] = extractHblDocuments(pages);

      expect(first.quantity).toBe('8 wooden crates');
      expect(first.cargoDescription).toBe(
        'Said to contain: machinery packed in 8 wooden crates.',
      );
      expect(first.remarks).toBe('LCL CONSOL / CFS TO CFS');
      expect(first.grossWeightKg).toBeNull();
      expect(first.volumeCbm).toBeNull();
      expect(first.shipperName).toBeNull();
      expect(first.shipperAddress).toBeNull();
      expect(first.consigneeName).toBeNull();
      expect(first.notifyPartyName).toBeNull();

      expect(second.quantity).toBe('12 cartons');
      expect(second.cargoDescription).toBe(
        'Said to contain: electronic components packed in 12 cartons.',
      );
      expect(third.quantity).toBe('6 pallets');
      expect(third.cargoDescription).toBe(
        'Said to contain: ceramic tiles packed on 6 pallets.',
      );
    });

    it('also reads the master-level boxes the house B/L prints, for the Job', () => {
      const [first] = extractHblDocuments(pages);
      const master = first.master;

      expect(master.mblNumber).toBe('NGB-LCL-2026-7731');
      expect(master.bookingNumber).toBe('BKG-CFS-8820');
      expect(master.vesselName).toBe('OOCL HONG KONG');
      expect(master.voyageNumber).toBe('088E');
      expect(master.portOfLoading).toBe('Shanghai, China');
      expect(master.portOfDischarge).toBe('Haifa Port, Israel');
      expect(master.finalDestination).toBe('Haifa CFS Terminal');
      expect(master.freightTerms).toBe(PaymentTerms.PREPAID);
      expect(master.containers).toHaveLength(1);
      expect(master.containers[0].containerNumber).toBe('BMOU4512398');
      expect(master.containers[0].containerSealNumber).toBe('SL-332211');
      expect(master.placeOfIssue).toBeNull();
      expect(master.dateOfIssue).toBeNull();
    });
  });

  describe('plain text', () => {
    it('reads "label: value" lines and a "Place / Date of Issue" box', () => {
      const pages = readTextDocument(
        [
          'MASTER BILL OF LADING',
          'B/L No.: MAEU123456789',
          'Carrier: MAERSK LINE',
          'Vessel: EVER GLORY   Voyage No.: 062W',
          'Shipper:',
          'ALPHA TOOLS CO.',
          '12 Industrial Road, Ningbo, China',
          'Consignee: TO ORDER',
          'Place / Date of Issue: Shanghai, 20 Sep 2026',
          'Freight collect',
        ].join('\n'),
      );
      const mbl = extractMblDocument(pages);

      expect(mbl.mblNumber).toBe('MAEU123456789');
      expect(mbl.carrierName).toBe('MAERSK LINE');
      expect(mbl.vesselName).toBe('EVER GLORY');
      expect(mbl.voyageNumber).toBe('062W');
      expect(mbl.shipperName).toBe('ALPHA TOOLS CO.');
      expect(mbl.shipperAddress).toBe('12 Industrial Road, Ningbo, China');
      expect(mbl.consigneeName).toBe('TO ORDER');
      expect(mbl.placeOfIssue).toBe('Shanghai');
      expect(mbl.dateOfIssue).toBe('2026-09-20');
      expect(mbl.freightTerms).toBe(PaymentTerms.COLLECT);
    });

    it('reads a bare "B/L No." as the house number on a document without a master number', () => {
      const pages = readTextDocument(
        'HOUSE BILL OF LADING\nB/L No.: HBL-001\nShipper: Beta Ltd.',
      );
      const [hbl] = extractHblDocuments(pages);

      expect(hbl.hblNumber).toBe('HBL-001');
      expect(hbl.shipperName).toBe('Beta Ltd.');
      expect(hbl.master.mblNumber).toBeNull();
    });
  });

  describe('HTML reader', () => {
    it('keeps a table row as one row with multi-line cells and skips head/script', () => {
      const [page] = readHtmlDocument(
        '<html><head><title>T</title><style>.x{}</style></head><body>' +
          '<div><span>MBL NO.</span><strong>ABC-1</strong></div>' +
          '<table><tr><td>A<br>B</td><td>C &amp; D</td></tr></table>' +
          '<script>var x = 1;</script></body></html>',
      );

      expect(page.rows).toEqual([
        {
          cells: [
            { text: 'MBL NO.', x: 0 },
            { text: 'ABC-1', x: 1 },
          ],
        },
        {
          cells: [
            { text: 'A\nB', x: 0 },
            { text: 'C & D', x: 1 },
          ],
        },
      ]);
    });
  });
});
