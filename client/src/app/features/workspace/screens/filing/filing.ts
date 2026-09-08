import { Component, signal } from '@angular/core';

interface ShipmentDocument {
  name: string;
  date: string;
  size: string;
}

/** "תיוק ניירת יבוא" — import paperwork filing view. */
@Component({
  selector: 'app-filing-screen',
  templateUrl: './filing.html',
})
export class FilingScreen {
  protected readonly documents = signal<ShipmentDocument[]>([
    { name: 'שטר מטען- מאסטרpdf', date: '18/05/2025', size: '1.2 MB' },
    { name: 'שטר מטען- פנימי', date: '18/05/2025', size: '1.2 MB' },
    { name: 'חשבון ספק.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'מפרט אריזות.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'תעודת שוק/תעודת מקור.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'הצעת מחיר ללקוח.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'חשבון מטענים.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'אישורים.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'רישיונות.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'ניירת כללית.pdf', date: '17/05/2025', size: '850 KB' },
  ]);
}
