import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { PaymentTerms } from '../../orders/orders.enums';
import {
  classifyBillOfLading,
  extractHblDocuments,
  extractMblDocument,
} from './bill-of-lading-extractor';
import {
  DocPage,
  readDocument,
  readHtmlDocument,
  readTextDocument,
} from './document-model';
import {
  completePartiesFromMaster,
  completePartyAddresses,
  extractInvoiceParties,
  needsPartyAddresses,
  sameParty,
} from './party-addresses';

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

  describe('Master B/L sample (PDF, "Field | Value" table)', () => {
    let pages: DocPage[];

    beforeAll(async () => {
      pages = await readDocument(
        fixture('mbl-sample.pdf'),
        '01_Master_Bill_of_Lading_MBL.pdf',
        'application/pdf',
      );
    });

    it('reads every row of the table into Job fields', () => {
      const mbl = extractMblDocument(pages);

      expect(mbl.mblNumber).toBe('SAMPLE-MBL-778845');
      expect(mbl.carrierName).toBe('Example Ocean Line');
      expect(mbl.shipperName).toBe('East Harbor Components Co., Ltd.');
      expect(mbl.consigneeName).toBe('To Order / As instructed');
      expect(mbl.notifyPartyName).toBe('Amilut Demo Imports Ltd.');
      expect(mbl.portOfLoading).toBe('Shanghai, China (CNSHA)');
      expect(mbl.portOfDischarge).toBe('Ashdod, Israel (ILASH)');
      expect(mbl.finalDestination).toBe('Ashdod, Israel');
      expect(mbl.vesselName).toBe('MV SAMPLE HORIZON');
      expect(mbl.voyageNumber).toBe('V. 026W');
      expect(mbl.bookingNumber).toBeNull();
    });

    it('takes "Freight Prepaid" beside "Freight terms" as the value, not as a new label', () => {
      expect(extractMblDocument(pages).freightTerms).toBe(PaymentTerms.PREPAID);
    });

    it('reads the cargo summary table for packages, weight and volume', () => {
      const mbl = extractMblDocument(pages);

      expect(mbl.totalPackages).toBe('120 cartons');
      expect(mbl.grossWeightKg).toBe(2400);
      expect(mbl.volumeCbm).toBe(12.8);
      expect(mbl.containers).toEqual([
        {
          containerNumber: null,
          containerSealNumber: null,
          cargoDescription: 'Electronic control modules; non-hazardous',
          grossWeightKg: 2400,
          volumeCbm: 12.8,
        },
      ]);
    });
  });

  describe('House B/L sample (PDF, single house B/L)', () => {
    let pages: DocPage[];

    beforeAll(async () => {
      pages = await readDocument(
        fixture('hbl-single-sample.pdf'),
        '02_House_Bill_of_Lading_HBL.pdf',
        'application/pdf',
      );
    });

    it('reads the File fields and the goods line', () => {
      const hbls = extractHblDocuments(pages);

      expect(hbls).toHaveLength(1);
      const [hbl] = hbls;
      expect(hbl.hblNumber).toBe('EHC-HA-260901');
      expect(hbl.shipperName).toBe('East Harbor Components Co., Ltd.');
      expect(hbl.consigneeName).toBe('Amilut Demo Imports Ltd.');
      expect(hbl.notifyPartyName).toBe('Amilut Demo Imports Ltd.');
      expect(hbl.quantity).toBe('120 cartons');
      expect(hbl.cargoDescription).toBe(
        'Electronic control modules; non-hazardous',
      );
      expect(hbl.remarks).toBe('AM-DEMO / 001-120');
      expect(hbl.grossWeightKg).toBe(2400);
      expect(hbl.volumeCbm).toBe(12.8);
    });

    it('splits a "Container / Seal" box into container and seal, described by the goods line', () => {
      const [hbl] = extractHblDocuments(pages);

      expect(hbl.master.mblNumber).toBe('SAMPLE-MBL-778845');
      expect(hbl.master.freightTerms).toBe(PaymentTerms.PREPAID);
      expect(hbl.master.totalPackages).toBe('120 cartons');
      expect(hbl.master.containers).toEqual([
        {
          containerNumber: 'TGHU1234567',
          containerSealNumber: 'SEAL-DEMO-88421',
          cargoDescription: 'Electronic control modules; non-hazardous',
          grossWeightKg: 2400,
          volumeCbm: 12.8,
        },
      ]);
    });
  });

  describe('File parties completed from the Master B/L', () => {
    it('fills a "To be completed" party box from the master, keeping what the File states', async () => {
      const master = extractMblDocument(
        await readDocument(fixture('mbl-sample.html'), 'MBL.html', 'text/html'),
      );
      const hbls = extractHblDocuments(
        await readDocument(
          fixture('hbl-sample.pdf'),
          'hbl.pdf',
          'application/pdf',
        ),
      );
      hbls[1].consigneeName = 'Someone Else Ltd.';
      hbls[2].shipperName = 'ASIA LOGISTICS CONSOLIDATION CO LTD';
      const result = {
        mblFileName: 'MBL.html',
        mbl: master,
        mblError: null,
        hblFileName: 'hbl.pdf',
        hbls,
        hblError: null,
      };

      completePartiesFromMaster(result);

      expect(hbls[0].shipperName).toBe(
        'Asia Logistics Consolidation Co., Ltd.',
      );
      expect(hbls[0].shipperAddress).toBe(
        'Port Zone B, Shanghai, China, Tel: +86-21-68881234',
      );
      expect(hbls[0].consigneeName).toBe('Global Freight Services Israel Ltd.');
      expect(hbls[0].consigneeAddress).toBe(
        'HaShoftim St 12, Haifa, Israel, Tel: +972-4-8664422',
      );
      expect(hbls[0].notifyPartyName).toBeNull();
      // A party the File names itself is kept, and gets no foreign address.
      expect(hbls[1].consigneeName).toBe('Someone Else Ltd.');
      expect(hbls[1].consigneeAddress).toBeNull();
      // Same party, differently written: the address is taken.
      expect(hbls[2].shipperAddress).toBe(
        'Port Zone B, Shanghai, China, Tel: +86-21-68881234',
      );
    });
  });

  describe('party addresses from the supplier invoice', () => {
    let hblPages: DocPage[];
    let invoicePages: DocPage[];

    beforeAll(async () => {
      hblPages = await readDocument(
        fixture('hbl-single-sample.pdf'),
        'hbl.pdf',
        'application/pdf',
      );
      invoicePages = await readDocument(
        fixture('invoice-sample.pdf'),
        '03_Supplier_Commercial_Invoice.pdf',
        'application/pdf',
      );
    });

    it('reads the seller and buyer boxes, splitting a printed <br/> into name and address', () => {
      expect(extractInvoiceParties(invoicePages)).toEqual({
        seller: {
          name: 'East Harbor Components Co., Ltd.',
          address: '88 Fictional Road, Shanghai, China',
        },
        buyer: {
          name: 'Amilut Demo Imports Ltd.',
          address: '18 Example Avenue, Rosh HaAyin, Israel',
        },
      });
    });

    it('completes the addresses of the parties whose names match, leaving "To Order" alone', () => {
      const result = {
        mblFileName: null,
        mbl: {
          ...extractMblDocument(hblPages),
          consigneeName: 'To Order / As instructed',
        },
        mblError: null,
        hblFileName: 'hbl.pdf',
        hbls: extractHblDocuments(hblPages),
        hblError: null,
      };
      expect(needsPartyAddresses(result)).toBe(true);

      completePartyAddresses(result, extractInvoiceParties(invoicePages));

      expect(result.mbl.shipperAddress).toBe(
        '88 Fictional Road, Shanghai, China',
      );
      expect(result.mbl.consigneeAddress).toBeNull();
      expect(result.mbl.notifyPartyAddress).toBe(
        '18 Example Avenue, Rosh HaAyin, Israel',
      );
      const [hbl] = result.hbls;
      expect(hbl.shipperAddress).toBe('88 Fictional Road, Shanghai, China');
      expect(hbl.consigneeAddress).toBe(
        '18 Example Avenue, Rosh HaAyin, Israel',
      );
      expect(hbl.notifyPartyAddress).toBe(
        '18 Example Avenue, Rosh HaAyin, Israel',
      );
      expect(hbl.master.shipperAddress).toBe(
        '88 Fictional Road, Shanghai, China',
      );
    });

    it('matches party names loosely but not short fragments', () => {
      expect(
        sameParty(
          'EAST HARBOR COMPONENTS CO LTD',
          'East Harbor Components Co., Ltd.',
        ),
      ).toBe(true);
      expect(
        sameParty('East Harbor Components', 'East Harbor Components Co., Ltd.'),
      ).toBe(true);
      expect(sameParty('Ltd.', 'East Harbor Components Co., Ltd.')).toBe(false);
      expect(
        sameParty(
          'Amilut Demo Imports Ltd.',
          'East Harbor Components Co., Ltd.',
        ),
      ).toBe(false);
    });
  });

  describe('classifyBillOfLading', () => {
    it('tells the sample masters from the sample house B/Ls', async () => {
      const kinds = await Promise.all(
        [
          ['mbl-sample.html', 'text/html'],
          ['mbl-sample.pdf', 'application/pdf'],
          ['hbl-sample.pdf', 'application/pdf'],
          ['hbl-single-sample.pdf', 'application/pdf'],
        ].map(async ([name, mime]) =>
          classifyBillOfLading(await readDocument(fixture(name), name, mime)),
        ),
      );

      expect(kinds).toEqual(['master', 'master', 'house', 'house']);
    });

    it('falls back to the title, then to "house"', () => {
      expect(
        classifyBillOfLading(
          readTextDocument('MASTER BILL OF LADING\nShipper: A\nConsignee: B'),
        ),
      ).toBe('master');
      expect(
        classifyBillOfLading(
          readTextDocument('BILL OF LADING\nB/L No.: X-1\nShipper: A'),
        ),
      ).toBe('house');
    });
  });

  describe('plain text', () => {
    it('sums the packages column of a multi-container table when the units agree', () => {
      const pages = readTextDocument(
        [
          'Master B/L No.: M-1',
          'Container No.\tPackages\tDescription\tGross Weight',
          'ABCD1234567\t10 cartons\tTools\t100 kg',
          'EFGH7654321\t16 cartons\tParts\t200 kg',
        ].join('\n'),
      );

      const mbl = extractMblDocument(pages);

      expect(mbl.containers.map((c) => c.containerNumber)).toEqual([
        'ABCD1234567',
        'EFGH7654321',
      ]);
      expect(mbl.totalPackages).toBe('26 cartons');
    });

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
