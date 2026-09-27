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
