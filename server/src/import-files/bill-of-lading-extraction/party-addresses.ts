import { BillOfLadingExtractDto } from '../dto/bill-of-lading-extract.dto';
import { FieldReader } from './bill-of-lading-extractor';
import { findLabels } from './bill-of-lading-fields';
import { DocPage } from './document-model';

/** A party box of a commercial document: the first line is the name, the rest the address. */
export interface ExtractedParty {
  name: string;
  address: string | null;
}

/** The two parties a supplier invoice names. */
export interface InvoiceParties {
  seller: ExtractedParty | null;
  buyer: ExtractedParty | null;
}

/** The "Seller" / "Buyer" (supplier / importer, bill-to …) boxes of a supplier invoice. */
export function extractInvoiceParties(pages: DocPage[]): InvoiceParties {
  const reader = new FieldReader(pages, findLabels(pages));
  return {
    seller: toParty(reader.party('seller')),
    buyer: toParty(reader.party('buyer')),
  };
}

function toParty(box: {
  name: string | null;
  address: string | null;
}): ExtractedParty | null {
  return box.name === null ? null : { name: box.name, address: box.address };
}

/** The name/address field pairs shared by the Job and File extracts. */
const PARTY_FIELDS = [
  ['shipperName', 'shipperAddress'],
  ['consigneeName', 'consigneeAddress'],
  ['notifyPartyName', 'notifyPartyAddress'],
] as const;

type PartyFields = Record<
  (typeof PARTY_FIELDS)[number][0] | (typeof PARTY_FIELDS)[number][1],
  string | null
>;

/** Whether any named party of the Job / File extracts still lacks an address. */
export function needsPartyAddresses(result: BillOfLadingExtractDto): boolean {
  const targets: PartyFields[] = [];
  if (result.mbl) targets.push(result.mbl);
  for (const hbl of result.hbls) targets.push(hbl, hbl.master);
  return targets.some((target) =>
    PARTY_FIELDS.some(
      ([nameKey, addressKey]) =>
        target[nameKey] !== null && target[addressKey] === null,
    ),
  );
}

/**
 * Fills the empty addresses of the Job / File parties from the invoice
 * parties with the same name: a bill of lading often prints only the
 * party's name, while the invoice carries the full address. A party whose
 * name matches nothing on the invoice ("To Order") stays as it was.
 */
export function completePartyAddresses(
  result: BillOfLadingExtractDto,
  parties: InvoiceParties,
): void {
  const known = [parties.seller, parties.buyer].filter(
    (party): party is ExtractedParty =>
      party !== null && party.address !== null,
  );
  if (known.length === 0) return;
  if (result.mbl) complete(result.mbl, known);
  for (const hbl of result.hbls) {
    complete(hbl, known);
    complete(hbl.master, known);
  }
}

/**
 * Completes the File parties from the master document's: a house B/L whose
 * Shipper / Consignee / Notify box is still "To be completed" takes the
 * party the Master B/L names, and a party named without an address takes
 * the master's address when the names agree. The File's own entries always
 * win.
 */
export function completePartiesFromMaster(
  result: BillOfLadingExtractDto,
): void {
  const master = result.mbl;
  if (!master) return;
  for (const hbl of result.hbls) {
    for (const [nameKey, addressKey] of PARTY_FIELDS) {
      const masterName = master[nameKey];
      if (masterName === null) continue;
      if (hbl[nameKey] === null) {
        hbl[nameKey] = masterName;
        hbl[addressKey] = master[addressKey];
      } else if (
        hbl[addressKey] === null &&
        sameParty(hbl[nameKey], masterName)
      ) {
        hbl[addressKey] = master[addressKey];
      }
    }
  }
}

function complete(target: PartyFields, known: readonly ExtractedParty[]): void {
  for (const [nameKey, addressKey] of PARTY_FIELDS) {
    const name = target[nameKey];
    if (name === null || target[addressKey] !== null) continue;
    const match = known.find((party) => sameParty(party.name, name));
    if (match) target[addressKey] = match.address;
  }
}

/** "East Harbor Components Co., Ltd." ~ "EAST HARBOR COMPONENTS CO LTD": same letters and digits. */
export function sameParty(a: string, b: string): boolean {
  const left = normalizeParty(a);
  const right = normalizeParty(b);
  if (left === '' || right === '') return false;
  if (left === right) return true;
  const [short, long] =
    left.length <= right.length ? [left, right] : [right, left];
  return short.length >= 6 && long.includes(short);
}

function normalizeParty(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '');
}
