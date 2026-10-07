/**
 * Thin, hand-written layer over the generated OpenAPI enums.
 *
 * The enums themselves come from `./generated/schema.ts` (regenerate with `npm run api:generate`
 * at the repo root). This file only re-exports them and adds Hebrew UI labels. The label maps are
 * typed as `Record<Enum, string>` so that adding a member on the server (and regenerating) fails
 * compilation here until a label is provided.
 */
import {
  ClassificationApproval,
  ClassificationLicense,
  Destination,
  ImportDocumentType,
  Incoterm,
  MblShippingType,
  MblStatus,
  OrderStatus,
  PaymentTerms,
  SeaMethod,
  ShipmentType,
  TradeAgreement,
} from './generated/schema';

export {
  ClassificationApproval,
  ClassificationLicense,
  Destination,
  ImportDocumentType,
  Incoterm,
  MblShippingType,
  MblStatus,
  OrderStatus,
  PaymentTerms,
  SeaMethod,
  ShipmentType,
  TradeAgreement,
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PREPARING]: 'בהכנה',
  [OrderStatus.READY_FOR_PICKUP]: 'מוכנה לאיסוף',
  [OrderStatus.PICKED_UP]: 'נאספה',
  [OrderStatus.WAITING_AT_PORT]: 'ממתינה בנמל',
  [OrderStatus.DEPARTED]: 'יצאה לדרך',
};

export const SHIPMENT_TYPE_LABELS: Record<ShipmentType, string> = {
  [ShipmentType.SEA]: 'ימי',
  [ShipmentType.AIR]: 'אווירי',
  [ShipmentType.LAND]: 'יבשתי',
};

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  [PaymentTerms.PREPAID]: 'Prepaid',
  [PaymentTerms.COLLECT]: 'Collect',
};

/** Step 1 of "יצירת תיק שילוח" (the MBL/HBL workflow). Narrower than
 *  `ShipmentType` (no LAND) — kept as its own enum/label map since the two
 *  are structurally unrelated, even though the Hebrew text matches. */
export const MBL_SHIPPING_TYPE_LABELS: Record<MblShippingType, string> = {
  [MblShippingType.SEA]: 'ימי',
  [MblShippingType.AIR]: 'אווירי',
};

/** Step 2 (sea only) of "יצירת תיק שילוח" — determines the HBL workflow. */
export const SEA_METHOD_LABELS: Record<SeaMethod, string> = {
  [SeaMethod.FCL_FCL]: 'FCL / FCL',
  [SeaMethod.FCL_LCL]: 'FCL / LCL',
  [SeaMethod.LCL_LCL]: 'LCL / LCL',
  [SeaMethod.GROUPAGE_FCL]: 'Groupage FCL',
};

/** Lifecycle status of an MBL shipping case (`mbl.status`) — set on the wizard's MBL step. */
export const MBL_STATUS_LABELS: Record<MblStatus, string> = {
  [MblStatus.OPEN]: 'פתוח',
  [MblStatus.IN_RELEASE]: 'בהתרה',
  [MblStatus.RELEASED]: 'שוחרר',
  [MblStatus.CLOSED]: 'סגור',
};

/** Incoterms are shown as their codes. */
export const INCOTERM_LABELS: Record<Incoterm, string> = {
  [Incoterm.CFR]: 'CFR',
  [Incoterm.CAF]: 'CAF',
  [Incoterm.CPT]: 'CPT',
  [Incoterm.CIP]: 'CIP',
  [Incoterm.EXW]: 'EXW',
  [Incoterm.FCA]: 'FCA',
  [Incoterm.FOB]: 'FOB',
  [Incoterm.FAC]: 'FAC',
  [Incoterm.DAF]: 'DAF',
  [Incoterm.DES]: 'DES',
  [Incoterm.DEQ]: 'DEQ',
  [Incoterm.DDU]: 'DDU',
  [Incoterm.DDP]: 'DDP',
};

/**
 * Incoterms offered under each payment-terms choice (mirrors the server's
 * INCOTERMS_BY_PAYMENT_TERMS; the server rejects a mismatch).
 */
export const INCOTERMS_BY_PAYMENT_TERMS: Record<PaymentTerms, readonly Incoterm[]> = {
  [PaymentTerms.PREPAID]: [Incoterm.CFR, Incoterm.CAF, Incoterm.CPT, Incoterm.CIP],
  [PaymentTerms.COLLECT]: [
    Incoterm.EXW,
    Incoterm.FCA,
    Incoterm.FOB,
    Incoterm.FAC,
    Incoterm.DAF,
    Incoterm.DES,
    Incoterm.DEQ,
    Incoterm.DDU,
    Incoterm.DDP,
  ],
};

export const DESTINATION_LABELS: Record<Destination, string> = {
  [Destination.ASHDOD]: 'נמל אשדוד',
  [Destination.SOUTH_PORT]: 'נמל הדרום',
  [Destination.HAIFA]: 'נמל חיפה',
  [Destination.BEN_GURION]: 'נתב"ג',
};

/** Kinds of import paperwork a file can be filed as ("תיוק ניירת יבוא"). */
export const IMPORT_DOCUMENT_TYPE_LABELS: Record<ImportDocumentType, string> = {
  [ImportDocumentType.SUPPLIER_INVOICE]: 'חשבון ספק',
  [ImportDocumentType.BILL_OF_LADING]: 'שטר מטען',
  [ImportDocumentType.MASTER_BILL_OF_LADING]: 'שטר מטען-מסטר',
  [ImportDocumentType.PACKING_LIST]: 'מפרט אריזות',
  [ImportDocumentType.CERTIFICATE_OF_ORIGIN]: 'תעודת שוק/מקור',
};

/** Regulatory approvals a classified product line may need ("אישורים" on the classification screen, multi-select). */
export const CLASSIFICATION_APPROVAL_LABELS: Record<ClassificationApproval, string> = {
  [ClassificationApproval.PLANT_PROTECTION]: 'אישור הגנת הצומח',
  [ClassificationApproval.FOOD_SERVICE]: 'אישור שירות המזון',
  [ClassificationApproval.PHARMACY_DIVISION]: 'אישור אגף הרוקחות',
  [ClassificationApproval.STANDARD_OR_DECLARATION]: 'ת"ר/הצהרה',
  [ClassificationApproval.VETERINARY_SERVICE]: 'אישור השירות הוטרינרי',
  [ClassificationApproval.COSMETICS]: 'אישור תמרוקים',
  [ClassificationApproval.FEED_QUALITY]: 'אישור טיב מספוא',
  [ClassificationApproval.MEDICAL_DEVICES]: 'אישור אמ"ר',
  [ClassificationApproval.TRAFFIC_SAFETY_DEVICES_COMMITTEE]:
    'אישור הועדה הבין משרדית להתקני תנועה ובטיחות',
  [ClassificationApproval.TRANSPORT_MINISTRY_VEHICLES]: 'משרד התחבורה – אגף הרכב ושירותי תחזוקה',
  [ClassificationApproval.DEFENSE_MINISTRY_ARMS_IMPORT]:
    'אישור משרד הביטחון - היחידה לרישוי יבוא אמל"ח',
  [ClassificationApproval.FISHERIES_DIVISION]: 'אישור אגף הדיג',
  [ClassificationApproval.MECHANIZATION_TECHNOLOGY]: 'אישור מיכון וטכנולוגיה',
  [ClassificationApproval.RADIATION_COMMISSIONER]: 'אישור הממונה על הקרינה',
  [ClassificationApproval.SUSTAINABLE_ENERGY]: 'אישור אנרגיה מקיימת',
  [ClassificationApproval.VEHICLE_ACCREDITED_LAB]: 'אישור מעבדה מוסמכת לרכב',
};

/** Import licenses a classified product line may need ("רישיונות" on the classification screen, multi-select). */
export const CLASSIFICATION_LICENSE_LABELS: Record<ClassificationLicense, string> = {
  [ClassificationLicense.INDUSTRY_ADMINISTRATION]: 'רישיון מינהל התעשיות (משרד הכלכלה)',
  [ClassificationLicense.ENVIRONMENT_ADMINISTRATION]:
    'רישיון מינהל סביבה ופיתוח בר קיימא (משרד הכלכלה)',
  [ClassificationLicense.TRANSPORT_VEHICLE_DIVISION]: 'רישיון תחבורה (משרד התחבורה - אגף הרכב)',
  [ClassificationLicense.TRANSPORT_HEAVY_EQUIPMENT]: 'רישיון תחבורה – (משרד התחבורה - אגף צמ"א)',
  [ClassificationLicense.MINAMATA_COMMISSIONER]:
    'רישיון הממונה לפי תקנות מינמטה (0608) (המשרד להגנת הסביבה)',
  [ClassificationLicense.VEHICLE_PARTS_TRADE]: 'רישיון לסחר במוצרי תעבורה (0212)',
  [ClassificationLicense.PUBLIC_SECURITY_FIREARMS]:
    'רישיון המשרד לביטחון הפנים – (משרד פנים/כלכלה -אגף לפיקוח ורישוי כלי יריה)',
  [ClassificationLicense.AGRICULTURE_FOREIGN_TRADE]:
    'רישיון חקלאות (משרד החקלאות - המרכז לסחר חוץ)',
  [ClassificationLicense.PEST_CONTROL_PREPARATION]:
    'רישיון לתכשיר לפי צו תכשירים להדברת מזיקים לאדם (0715) (משרד הבריאות)',
  [ClassificationLicense.HEALTH_PHARMACY_DIVISION]:
    'רישיון משרד הבריאות – (משרד הבריאות - אגף הרוקחות)',
};

/** Trade agreement a product line is declared under ("הסכם סחר" on the classification screen). */
export const TRADE_AGREEMENT_LABELS: Record<TradeAgreement, string> = {
  [TradeAgreement.GENERAL]: 'כללי',
  [TradeAgreement.USA]: 'ארה"ב',
  [TradeAgreement.UK]: 'בריטניה (הממלכה המאוחדת)',
  [TradeAgreement.EU]: 'איחוד',
  [TradeAgreement.CANADA]: 'קנדה',
  [TradeAgreement.EFTA]: 'אפט"א',
  [TradeAgreement.TURKEY]: 'טורקיה',
  [TradeAgreement.MEXICO]: 'מקסיקו',
  [TradeAgreement.COLOMBIA]: 'קולומביה',
  [TradeAgreement.UKRAINE]: 'אוקראינה',
  [TradeAgreement.GUATEMALA]: 'גואטמלה',
  [TradeAgreement.UAE]: 'איחוד האמירויות',
  [TradeAgreement.PANAMA]: 'הסכם פנמה',
  [TradeAgreement.SOUTH_KOREA]: 'קוריאה הדרומית',
  [TradeAgreement.URUGUAY_MERCOSUR]: 'אורוגוואי -- מרקוסור',
  [TradeAgreement.BRAZIL_MERCOSUR]: 'ברזיל -- מרקוסור',
  [TradeAgreement.PARAGUAY_MERCOSUR]: 'פרגוואי -- מרקוסור',
  [TradeAgreement.ARGENTINA_MERCOSUR]: 'ארגנטינה -- מרקוסור',
  [TradeAgreement.VIETNAM]: 'וייטנאם',
};

/** All members of each enum, in server declaration order — handy for rendering option lists. */
export const ORDER_STATUSES: readonly OrderStatus[] = Object.values(OrderStatus);
export const SHIPMENT_TYPES: readonly ShipmentType[] = Object.values(ShipmentType);
export const PAYMENT_TERMS: readonly PaymentTerms[] = Object.values(PaymentTerms);
export const DESTINATIONS: readonly Destination[] = Object.values(Destination);
export const INCOTERMS: readonly Incoterm[] = Object.values(Incoterm);
export const IMPORT_DOCUMENT_TYPES: readonly ImportDocumentType[] =
  Object.values(ImportDocumentType);
export const CLASSIFICATION_APPROVALS: readonly ClassificationApproval[] =
  Object.values(ClassificationApproval);
export const CLASSIFICATION_LICENSES: readonly ClassificationLicense[] =
  Object.values(ClassificationLicense);
export const TRADE_AGREEMENTS: readonly TradeAgreement[] = Object.values(TradeAgreement);
export const MBL_STATUSES: readonly MblStatus[] = Object.values(MblStatus);

/**
 * Destinations offered under each shipment type — sea shipments go to a port,
 * air shipments go to the airport. This is a client-side UI convenience only
 * (the server does not enforce a destination/shipment-type pairing).
 */
export const DESTINATIONS_BY_SHIPMENT_TYPE: Record<ShipmentType, readonly Destination[]> = {
  [ShipmentType.SEA]: [Destination.ASHDOD, Destination.SOUTH_PORT, Destination.HAIFA],
  [ShipmentType.AIR]: [Destination.BEN_GURION],
  [ShipmentType.LAND]: DESTINATIONS,
};
