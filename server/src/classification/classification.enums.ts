/**
 * Regulatory approval (import permit) a classified product line may require.
 * A line can need several, so the client stores an array of these in the
 * "אישורים" column of the classification ("סיווג") screen.
 *
 * Hebrew UI labels (owned by the client):
 * - PLANT_PROTECTION                 → אישור הגנת הצומח
 * - FOOD_SERVICE                     → אישור שירות המזון
 * - PHARMACY_DIVISION                → אישור אגף הרוקחות
 * - STANDARD_OR_DECLARATION          → ת"ר/הצהרה
 * - VETERINARY_SERVICE               → אישור השירות הוטרינרי
 * - COSMETICS                        → אישור תמרוקים
 * - FEED_QUALITY                     → אישור טיב מספוא
 * - MEDICAL_DEVICES                  → אישור אמ"ר
 * - TRAFFIC_SAFETY_DEVICES_COMMITTEE → אישור הועדה הבין משרדית להתקני תנועה ובטיחות
 * - TRANSPORT_MINISTRY_VEHICLES      → משרד התחבורה – אגף הרכב ושירותי תחזוקה
 * - DEFENSE_MINISTRY_ARMS_IMPORT     → אישור משרד הביטחון - היחידה לרישוי יבוא אמל"ח
 * - FISHERIES_DIVISION               → אישור אגף הדיג
 * - MECHANIZATION_TECHNOLOGY         → אישור מיכון וטכנולוגיה
 * - RADIATION_COMMISSIONER           → אישור הממונה על הקרינה
 * - SUSTAINABLE_ENERGY               → אישור אנרגיה מקיימת
 * - VEHICLE_ACCREDITED_LAB           → אישור מעבדה מוסמכת לרכב
 */
export enum ClassificationApproval {
  PLANT_PROTECTION = 'plant_protection',
  FOOD_SERVICE = 'food_service',
  PHARMACY_DIVISION = 'pharmacy_division',
  STANDARD_OR_DECLARATION = 'standard_or_declaration',
  VETERINARY_SERVICE = 'veterinary_service',
  COSMETICS = 'cosmetics',
  FEED_QUALITY = 'feed_quality',
  MEDICAL_DEVICES = 'medical_devices',
  TRAFFIC_SAFETY_DEVICES_COMMITTEE = 'traffic_safety_devices_committee',
  TRANSPORT_MINISTRY_VEHICLES = 'transport_ministry_vehicles',
  DEFENSE_MINISTRY_ARMS_IMPORT = 'defense_ministry_arms_import',
  FISHERIES_DIVISION = 'fisheries_division',
  MECHANIZATION_TECHNOLOGY = 'mechanization_technology',
  RADIATION_COMMISSIONER = 'radiation_commissioner',
  SUSTAINABLE_ENERGY = 'sustainable_energy',
  VEHICLE_ACCREDITED_LAB = 'vehicle_accredited_lab',
}

/**
 * Import license a classified product line may require. A line can need
 * several, so the client stores an array of these in the "רישיונות" column
 * of the classification screen.
 *
 * Hebrew UI labels (owned by the client):
 * - INDUSTRY_ADMINISTRATION        → רישיון מינהל התעשיות (משרד הכלכלה)
 * - ENVIRONMENT_ADMINISTRATION     → רישיון מינהל סביבה ופיתוח בר קיימא (משרד הכלכלה)
 * - TRANSPORT_VEHICLE_DIVISION     → רישיון תחבורה (משרד התחבורה - אגף הרכב)
 * - TRANSPORT_HEAVY_EQUIPMENT      → רישיון תחבורה – (משרד התחבורה - אגף צמ"א)
 * - MINAMATA_COMMISSIONER          → רישיון הממונה לפי תקנות מינמטה (0608) (המשרד להגנת הסביבה)
 * - VEHICLE_PARTS_TRADE            → רישיון לסחר במוצרי תעבורה (0212)
 * - PUBLIC_SECURITY_FIREARMS       → רישיון המשרד לביטחון הפנים – (משרד פנים/כלכלה -אגף לפיקוח ורישוי כלי יריה)
 * - AGRICULTURE_FOREIGN_TRADE      → רישיון חקלאות (משרד החקלאות - המרכז לסחר חוץ)
 * - PEST_CONTROL_PREPARATION       → רישיון לתכשיר לפי צו תכשירים להדברת מזיקים לאדם (0715) (משרד הבריאות)
 * - HEALTH_PHARMACY_DIVISION       → רישיון משרד הבריאות – (משרד הבריאות - אגף הרוקחות)
 */
export enum ClassificationLicense {
  INDUSTRY_ADMINISTRATION = 'industry_administration',
  ENVIRONMENT_ADMINISTRATION = 'environment_administration',
  TRANSPORT_VEHICLE_DIVISION = 'transport_vehicle_division',
  TRANSPORT_HEAVY_EQUIPMENT = 'transport_heavy_equipment',
  MINAMATA_COMMISSIONER = 'minamata_commissioner',
  VEHICLE_PARTS_TRADE = 'vehicle_parts_trade',
  PUBLIC_SECURITY_FIREARMS = 'public_security_firearms',
  AGRICULTURE_FOREIGN_TRADE = 'agriculture_foreign_trade',
  PEST_CONTROL_PREPARATION = 'pest_control_preparation',
  HEALTH_PHARMACY_DIVISION = 'health_pharmacy_division',
}

/**
 * Trade agreement (preferential-origin regime) a product line is declared
 * under — the "הסכם סחר" column of the classification screen.
 *
 * Hebrew UI labels (owned by the client):
 * - GENERAL            → כללי
 * - USA                → ארה"ב
 * - UK                 → בריטניה (הממלכה המאוחדת)
 * - EU                 → איחוד
 * - CANADA             → קנדה
 * - EFTA               → אפט"א
 * - TURKEY             → טורקיה
 * - MEXICO             → מקסיקו
 * - COLOMBIA           → קולומביה
 * - UKRAINE            → אוקראינה
 * - GUATEMALA          → גואטמלה
 * - UAE                → איחוד האמירויות
 * - PANAMA             → הסכם פנמה
 * - SOUTH_KOREA        → קוריאה הדרומית
 * - URUGUAY_MERCOSUR   → אורוגוואי -- מרקוסור
 * - BRAZIL_MERCOSUR    → ברזיל -- מרקוסור
 * - PARAGUAY_MERCOSUR  → פרגוואי -- מרקוסור
 * - ARGENTINA_MERCOSUR → ארגנטינה -- מרקוסור
 * - VIETNAM            → וייטנאם
 */
export enum TradeAgreement {
  GENERAL = 'general',
  USA = 'usa',
  UK = 'uk',
  EU = 'eu',
  CANADA = 'canada',
  EFTA = 'efta',
  TURKEY = 'turkey',
  MEXICO = 'mexico',
  COLOMBIA = 'colombia',
  UKRAINE = 'ukraine',
  GUATEMALA = 'guatemala',
  UAE = 'uae',
  PANAMA = 'panama',
  SOUTH_KOREA = 'south_korea',
  URUGUAY_MERCOSUR = 'uruguay_mercosur',
  BRAZIL_MERCOSUR = 'brazil_mercosur',
  PARAGUAY_MERCOSUR = 'paraguay_mercosur',
  ARGENTINA_MERCOSUR = 'argentina_mercosur',
  VIETNAM = 'vietnam',
}
