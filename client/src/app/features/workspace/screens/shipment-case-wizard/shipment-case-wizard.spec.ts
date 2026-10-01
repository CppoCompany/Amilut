import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NavigationService } from '../../navigation.service';
import { ShipmentCaseWizardScreen } from './shipment-case-wizard';

describe('ShipmentCaseWizardScreen', () => {
  let fixture: ComponentFixture<ShipmentCaseWizardScreen>;
  let nav: NavigationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ShipmentCaseWizardScreen] });
    nav = TestBed.inject(NavigationService);
    fixture = TestBed.createComponent(ShipmentCaseWizardScreen);
    fixture.detectChanges();
  });

  function methodCards(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.method-card'));
  }

  function sectionTitle(): string {
    return fixture.nativeElement.querySelector('.section-title')?.textContent?.trim() ?? '';
  }

  function hintText(): string {
    return fixture.nativeElement.querySelector('.hint-text')?.textContent?.trim() ?? '';
  }

  function backButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.back-btn');
  }

  it('starts on step 1 with the two Hebrew shipping-type options', () => {
    expect(sectionTitle()).toContain('בחירת סוג משלוח');
    const cards = methodCards();
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('ימי');
    expect(cards[1].textContent).toContain('אווירי');
    expect(backButton()).toBeNull(); // no step to go back to yet
  });

  it('selecting אווירי shows a blank/placeholder page, not the sea method step', () => {
    methodCards()[1].click(); // אווירי
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.method-card')).toBeNull();
    expect(hintText()).toContain('אווירי');
    expect(backButton()).toBeTruthy();
  });

  it('selecting ימי shows the four sea freight methods', () => {
    methodCards()[0].click(); // ימי
    fixture.detectChanges();

    const cards = methodCards();
    expect(cards.length).toBe(4);
    expect(cards.map((c) => c.querySelector('.method-card__label')?.textContent?.trim())).toEqual([
      'FCL / FCL',
      'FCL / LCL',
      'LCL / LCL',
      'Groupage FCL',
    ]);
  });

  it('selecting a sea method advances to the MBL step placeholder, labeled with that method', () => {
    methodCards()[0].click(); // ימי
    fixture.detectChanges();
    methodCards()[2].click(); // LCL / LCL
    fixture.detectChanges();

    expect(sectionTitle()).toContain('LCL / LCL');
    expect(sectionTitle()).toContain('MBL');
    expect(fixture.nativeElement.querySelector('.method-card')).toBeNull();
  });

  it('the back button from the MBL step returns to the sea method list, not step 1', () => {
    methodCards()[0].click(); // ימי
    fixture.detectChanges();
    methodCards()[0].click(); // FCL / FCL
    fixture.detectChanges();

    backButton().click();
    fixture.detectChanges();

    expect(sectionTitle()).toContain('בחירת שיטת שילוח ימי');
    expect(methodCards().length).toBe(4);
  });

  it('the back button from the sea method list returns to step 1 (shipping type)', () => {
    methodCards()[0].click(); // ימי
    fixture.detectChanges();

    backButton().click();
    fixture.detectChanges();

    expect(sectionTitle()).toContain('בחירת סוג משלוח');
    expect(methodCards().length).toBe(2);
  });

  it('the back button from אווירי returns to step 1', () => {
    methodCards()[1].click(); // אווירי
    fixture.detectChanges();

    backButton().click();
    fixture.detectChanges();

    expect(sectionTitle()).toContain('בחירת סוג משלוח');
  });

  it('re-selecting "יצירת תיק שילוח" from the sidebar resets a mid-wizard screen back to step 1', () => {
    methodCards()[0].click(); // ימי
    fixture.detectChanges();
    methodCards()[0].click(); // FCL / FCL
    fixture.detectChanges();
    expect(sectionTitle()).toContain('FCL / FCL');

    nav.newCaseRequested.update((n) => n + 1); // same signal selectChild bumps on that sidebar click
    fixture.detectChanges(); // flushes the effect watching newCaseRequested

    expect(sectionTitle()).toContain('בחירת סוג משלוח');
    expect(methodCards().length).toBe(2);
  });
});
