import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AutoComplete } from 'primeng/autocomplete';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { Step, StepList, Stepper } from 'primeng/stepper';
import { catchError, finalize, forkJoin, map, Observable, of, switchMap, tap } from 'rxjs';

import {
  DESTINATION_LABELS,
  DESTINATIONS_BY_SHIPMENT_TYPE,
  INCOTERM_LABELS,
  IMPORT_DOCUMENT_TYPE_LABELS,
  ImportDocumentType,
  INCOTERMS_BY_PAYMENT_TERMS,
  ORDER_IMPORT_DOCUMENT_TYPES,
  ORDER_REQUIRED_DOCUMENT_TYPES,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  ORDER_STEP_LABELS,
  ORDER_STEPS,
  OrderStatus,
  OrderStep,
  PAYMENT_TERMS,
  PAYMENT_TERMS_LABELS,
  PaymentTerms,
  SHIPMENT_TYPE_LABELS,
  SHIPMENT_TYPES,
  ShipmentType,
} from '../../../../api/enums';
import type { FilingContext } from '../../../../api/filing-context.model';
import { ImportFilesApi } from '../../../../api/import-files-api';
import type {
  CreateOrderDto,
  CustomerDto,
  OrderDto,
  SupplierDto,
  UploadedImportFileDto,
} from '../../../../api/models';
import { OrdersApi } from '../../../../api/orders-api';
import { AuthService } from '../../../../core/auth/auth.service';
import { ConfirmDialog } from '../../../../shared/confirm-dialog/confirm-dialog';
import { CustomerAutocomplete } from '../../../customers/customer-autocomplete/customer-autocomplete';
import { SupplierAutocomplete } from '../../../suppliers/supplier-autocomplete/supplier-autocomplete';
import {
  DocumentStagingList,
  missingRequiredTypes,
  type StagedFiles,
} from '../../document-staging-list/document-staging-list';
import { BLOB_URL_TTL_MS } from '../../import-files-panel/import-files-panel';
import { NavigationService } from '../../navigation.service';
import { SelectionStateService } from '../../selection-state.service';
import {
  chronologicalScheduleValidator,
  EMPTY_ORDER_FORM_VALUE,
  formatOrderDate,
  loadErrorMessage,
  minDateAfter,
  orderToFormValue,
  saveErrorMessage,
  toCreateOrderDto,
} from './order-form.mapper';

const SHIPPING_LINES = [
  'Conmart',
  'Green Shipping',
  'ZIM',
  'Maersk',
  'MSC',
  'CMA CGM',
  'Hapag-Lloyd',
  'Evergreen',
  'Yang Ming',
  'COSCO',
];

const AIRLINES = [
  'El Al',
  'British Airways',
  'Lufthansa',
  'Turkish Airlines',
  'Delta',
  'United',
  'Air France',
  'KLM',
  'Emirates',
  'Qatar Airways',
];

const CUSTOMER_REQUIRED = 'יש לבחור לקוח';
const SUPPLIER_REQUIRED = 'יש לבחור ספק';
/** Schedule dates that must all be filled before leaving the schedule tab forwards. */
const REQUIRED_SCHEDULE_DATES = {
  factoryReadyDate: 'יש להזין תאריך מוכנות במפעל',
  factoryPickupDate: 'יש להזין תאריך איסוף מהמפעל',
  departureDate: 'יש להזין תאריך הפלגה / טיסה (יציאה)',
  etaDate: 'יש להזין תאריך הגעה משוער (ETA)',
} as const;
type ScheduleDateField = keyof typeof REQUIRED_SCHEDULE_DATES;
const UPLOAD_FAILED = 'ההזמנה נשמרה, אך העלאת חלק מהמסמכים נכשלה';
const OPEN_FILE_FAILED = 'פתיחת הקובץ נכשלה';
const DELETE_FILE_FAILED = 'מחיקת הקובץ נכשלה';
const FILES_LOAD_FAILED = 'טעינת המסמכים של ההזמנה נכשלה';

/** Font Awesome icon per tab of the order form. */
const STEP_ICONS: Record<OrderStep, string> = {
  [OrderStep.CUSTOMER]: 'fa-user',
  [OrderStep.SHIPMENT]: 'fa-truck-fast',
  [OrderStep.SCHEDULE]: 'fa-calendar-days',
  [OrderStep.DOCUMENTS]: 'fa-file-lines',
};

/** Value/label pairs for a PrimeNG select or select-button. */
function labelled<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): { value: T; label: string }[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

/** Case-insensitive substring matches of `query` in `source` (none for a blank query). */
function matching(source: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  return q ? source.filter((item) => item.toLowerCase().includes(q)) : [];
}

function stepIndex(step: OrderStep): number {
  return ORDER_STEPS.indexOf(step);
}

/**
 * "פתיחת הזמנה" — the order form, split into tabs (`ORDER_STEPS`), wired to
 * `POST/PATCH /api/orders`. Any tab can be saved as progress once a customer
 * is picked; every save also records the furthest tab reached
 * (`lastStep`), which is where reopening the order resumes. The last tab
 * stages paperwork (`DocumentStagingList`, same UI as the CCF screen) that is
 * uploaded after each save; "סיום" requires the mandatory documents and then
 * moves on to filing.
 */
@Component({
  selector: 'app-order-screen',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    AutoComplete,
    Button,
    DatePicker,
    InputText,
    Message,
    Select,
    SelectButton,
    Step,
    StepList,
    Stepper,
    CustomerAutocomplete,
    SupplierAutocomplete,
    DocumentStagingList,
    ConfirmDialog,
  ],
  templateUrl: './order.html',
  styleUrl: './order.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderScreen {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ordersApi = inject(OrdersApi);
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);
  private readonly selection = inject(SelectionStateService);

  // ── Customer / Supplier ─────────────────────────────────────────────────────
  protected readonly selectedCustomer = signal<CustomerDto | null>(null);
  protected readonly selectedSupplier = signal<SupplierDto | null>(null);
  private readonly submitAttempted = signal(false);
  protected readonly customerError = computed(() =>
    this.submitAttempted() && !this.selectedCustomer() ? CUSTOMER_REQUIRED : null,
  );
  protected readonly supplierError = computed(() =>
    this.submitAttempted() && !this.selectedSupplier() ? SUPPLIER_REQUIRED : null,
  );

  // ── Save state ─────────────────────────────────────────────────────────────
  /** The order as last returned by the server; `null` until the first successful save. */
  protected readonly savedOrder = signal<OrderDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  /** True while an existing order is being fetched for editing (see the constructor). */
  protected readonly loadingOrder = signal(false);

  /**
   * Set once, by how this screen was reached — a double-click in "ההזמנות
   * שלי" (edit) vs. the sidebar's "יצירת הזמנה חדשה" (create) — never by
   * `savedOrder()`'s null-ness. A brand-new order still reads "יצירת הזמנה
   * חדשה" after its first save, since the user's intent was to create one;
   * only entering via an existing order's edit flow reads "עדכון הזמנה".
   */
  protected readonly isEditingExisting = signal(false);
  protected readonly pageTitle = computed(() =>
    this.isEditingExisting() ? 'עדכון הזמנה' : 'יצירת הזמנה חדשה',
  );

  // ── Tabs ───────────────────────────────────────────────────────────────────
  /** PrimeNG's stepper is keyed by number: the current step's position in `steps`. */
  protected readonly currentStepIndex = computed(() => stepIndex(this.currentStep()));
  protected readonly steps = ORDER_STEPS;
  protected readonly stepLabels = ORDER_STEP_LABELS;
  protected readonly stepIcons = STEP_ICONS;
  protected readonly OrderStep = OrderStep;
  protected readonly currentStep = signal<OrderStep>(OrderStep.CUSTOMER);
  /** Furthest tab reached — saved as `lastStep`; tabs up to one past it are clickable. */
  protected readonly furthestStep = signal<OrderStep>(OrderStep.CUSTOMER);
  protected readonly isFirstStep = computed(() => stepIndex(this.currentStep()) === 0);
  protected readonly isLastStep = computed(
    () => stepIndex(this.currentStep()) === ORDER_STEPS.length - 1,
  );

  // ── Documents tab ──────────────────────────────────────────────────────────
  protected readonly documentTypes = ORDER_IMPORT_DOCUMENT_TYPES;
  protected readonly requiredDocumentTypes = ORDER_REQUIRED_DOCUMENT_TYPES;
  /** Picked but not uploaded yet — uploaded after the next successful save. */
  protected readonly stagedFiles = signal<StagedFiles>({});
  /** Already filed under this order on the server. */
  protected readonly uploadedFiles = signal<UploadedImportFileDto[]>([]);
  protected readonly openingFileId = signal<number | null>(null);
  /** The uploaded file awaiting delete confirmation; drives the confirm dialog. */
  protected readonly fileToDelete = signal<UploadedImportFileDto | null>(null);
  protected readonly deletingFileId = signal<number | null>(null);
  /** Set by "סיום" — from then on, empty mandatory document rows are flagged. */
  private readonly finishAttempted = signal(false);
  protected readonly missingDocuments = computed(() =>
    missingRequiredTypes(this.requiredDocumentTypes, this.stagedFiles(), this.uploadedFiles()),
  );
  protected readonly showMissingDocuments = computed(
    () => this.finishAttempted() && this.missingDocuments().length > 0,
  );

  // ── Read-only header fields ────────────────────────────────────────────────
  /** Shown in the page title; a real order id only exists once the server has inserted the row. */
  protected readonly orderNumber = computed(() => {
    const order = this.savedOrder();
    return order ? String(order.id) : null;
  });
  /** Shows today until the first save, then the server's actual `createdAt`. */
  protected readonly creationDate = computed(() => {
    const order = this.savedOrder();
    return order ? formatOrderDate(order.createdAt) : formatOrderDate(new Date().toISOString());
  });
  protected readonly handlerName = computed(() => this.auth.user()?.name ?? '');

  // ── Enum tab groups (typed signals; labels come from the label maps) ──────
  protected readonly status = signal<OrderStatus>(OrderStatus.PREPARING);
  protected readonly statuses = ORDER_STATUSES;
  protected readonly statusLabels = ORDER_STATUS_LABELS;

  protected readonly shipmentType = signal<ShipmentType>(ShipmentType.SEA);
  protected readonly shipmentTypes = SHIPMENT_TYPES;
  protected readonly shipmentTypeLabels = SHIPMENT_TYPE_LABELS;

  protected readonly paymentTerms = signal<PaymentTerms>(PaymentTerms.PREPAID);
  protected readonly paymentTermsOptions = PAYMENT_TERMS;
  protected readonly paymentTermsLabels = PAYMENT_TERMS_LABELS;

  /** Incoterms offered for the current payment terms (the server rejects a mismatch). */
  protected readonly incotermOptions = computed(
    () => INCOTERMS_BY_PAYMENT_TERMS[this.paymentTerms()],
  );
  /** Resets to the first allowed code whenever the payment terms change. */
  protected readonly incoterm = linkedSignal(() => this.incotermOptions()[0]);
  protected readonly incotermLabels = INCOTERM_LABELS;

  /** Destinations offered for the current shipment type (sea ports vs. the airport). */
  protected readonly destinationOptions = computed(
    () => DESTINATIONS_BY_SHIPMENT_TYPE[this.shipmentType()],
  );
  /** Resets to the first allowed destination whenever the shipment type changes. */
  protected readonly destination = linkedSignal(() => this.destinationOptions()[0]);
  protected readonly destinationLabels = DESTINATION_LABELS;

  // Value/label pairs for the PrimeNG select-buttons and the incoterm select.
  protected readonly statusOptions = labelled(ORDER_STATUSES, ORDER_STATUS_LABELS);
  protected readonly shipmentTypeOptions = labelled(SHIPMENT_TYPES, SHIPMENT_TYPE_LABELS);
  protected readonly paymentTermsSelectOptions = labelled(PAYMENT_TERMS, PAYMENT_TERMS_LABELS);
  protected readonly incotermSelectOptions = computed(() =>
    labelled(this.incotermOptions(), INCOTERM_LABELS),
  );
  protected readonly destinationSelectOptions = computed(() =>
    labelled(this.destinationOptions(), DESTINATION_LABELS),
  );

  // ── Transport-field visibility ─────────────────────────────────────────────
  protected readonly seaVisible = computed(() => this.shipmentType() === ShipmentType.SEA);
  protected readonly airVisible = computed(() => this.shipmentType() === ShipmentType.AIR);

  // ── Dates & free-text fields ───────────────────────────────────────────────
  protected readonly form = this.fb.group(
    {
      factoryReadyDate: [EMPTY_ORDER_FORM_VALUE.factoryReadyDate],
      factoryPickupDate: [EMPTY_ORDER_FORM_VALUE.factoryPickupDate],
      departureDate: [EMPTY_ORDER_FORM_VALUE.departureDate],
      etaDate: [EMPTY_ORDER_FORM_VALUE.etaDate],
      shippingLine: [EMPTY_ORDER_FORM_VALUE.shippingLine],
      voyageNumber: [EMPTY_ORDER_FORM_VALUE.voyageNumber],
      airline: [EMPTY_ORDER_FORM_VALUE.airline],
      flightNumber: [EMPTY_ORDER_FORM_VALUE.flightNumber],
    },
    { validators: chronologicalScheduleValidator },
  );

  // Client-side suggestion lists for the free-text carrier fields (PrimeNG autocomplete).
  protected readonly shippingLineSuggestions = signal<string[]>([]);
  protected readonly airlineSuggestions = signal<string[]>([]);

  // ── Schedule: Ready Date < Pickup Date < Shipment Date ─────────────────────
  // Read reactively so `[min]`/the error messages below update live as the
  // user fills in each stage, not just on submit.
  private readonly factoryReadyDateValue = toSignal(
    this.form.controls.factoryReadyDate.valueChanges,
    { initialValue: this.form.controls.factoryReadyDate.value },
  );
  private readonly factoryPickupDateValue = toSignal(
    this.form.controls.factoryPickupDate.valueChanges,
    { initialValue: this.form.controls.factoryPickupDate.value },
  );
  private readonly departureDateValue = toSignal(this.form.controls.departureDate.valueChanges, {
    initialValue: this.form.controls.departureDate.value,
  });
  private readonly etaDateValue = toSignal(this.form.controls.etaDate.valueChanges, {
    initialValue: this.form.controls.etaDate.value,
  });

  /**
   * Set by "הבא" / a forward tab click on the schedule tab, or by "סיום" —
   * not by a plain "שמירה", so a draft can still be saved with dates missing.
   */
  private readonly scheduleAttempted = signal(false);
  private readonly missingScheduleDates = computed(() => {
    const values: Record<ScheduleDateField, string> = {
      factoryReadyDate: this.factoryReadyDateValue(),
      factoryPickupDate: this.factoryPickupDateValue(),
      departureDate: this.departureDateValue(),
      etaDate: this.etaDateValue(),
    };
    return (Object.keys(REQUIRED_SCHEDULE_DATES) as ScheduleDateField[]).filter(
      (field) => !values[field],
    );
  });
  /** Per-field "required" message for the schedule dates, once checked. */
  protected readonly scheduleRequiredErrors = computed(() => {
    const errors: Partial<Record<ScheduleDateField, string>> = {};
    if (!this.scheduleAttempted()) return errors;
    for (const field of this.missingScheduleDates()) {
      errors[field] = REQUIRED_SCHEDULE_DATES[field];
    }
    return errors;
  });

  /** `[min]` for the Pickup Date picker: the day after Ready Date, so same-day/earlier is greyed out. */
  protected readonly pickupMinDate = computed(() => minDateAfter(this.factoryReadyDateValue()));
  /** `[min]` for the Shipment Date picker: the day after Pickup Date. */
  protected readonly departureMinDate = computed(() =>
    minDateAfter(this.factoryPickupDateValue()),
  );

  protected readonly pickupDateError = computed(() => {
    if (!this.submitAttempted()) return null;
    const ready = this.factoryReadyDateValue();
    const pickup = this.factoryPickupDateValue();
    return ready && pickup && pickup <= ready
      ? 'תאריך איסוף מהמפעל חייב להיות מאוחר מתאריך מוכנות במפעל'
      : null;
  });
  protected readonly departureDateError = computed(() => {
    if (!this.submitAttempted()) return null;
    const pickup = this.factoryPickupDateValue();
    const departure = this.departureDateValue();
    return pickup && departure && departure <= pickup
      ? 'תאריך הפלגה / טיסה חייב להיות מאוחר מתאריך איסוף מהמפעל'
      : null;
  });

  /** Tabs holding a visible validation error — they get a red dot. */
  protected readonly stepsWithErrors = computed(() => {
    const steps = new Set<OrderStep>();
    if (this.customerError() || this.supplierError()) steps.add(OrderStep.CUSTOMER);
    if (
      this.pickupDateError() ||
      this.departureDateError() ||
      Object.keys(this.scheduleRequiredErrors()).length > 0
    ) {
      steps.add(OrderStep.SCHEDULE);
    }
    if (this.showMissingDocuments()) steps.add(OrderStep.DOCUMENTS);
    return steps;
  });

  constructor() {
    // A double-click on a row in "ההזמנות שלי" navigates to
    // `/workspace/order?orderId=N`, which NavigationService.applyUrl turns
    // into `editOrderId` before this screen shows. Consume it once as soon as
    // it appears, so a later, ordinary navigation back to this screen (e.g.
    // via the sidebar) starts a fresh blank order as usual. An effect rather
    // than a one-shot constructor read: Back/Forward can land on an edit URL
    // while this instance is already mounted (the page doesn't change, so it
    // isn't recreated), and that must load the order too.
    effect(() => {
      const editOrderId = this.nav.editOrderId();
      if (editOrderId === null) return;
      untracked(() => {
        this.nav.editOrderId.set(null);
        this.isEditingExisting.set(true);
        this.loadOrderForEditing(editOrderId);
      });
    });

    // "יצירת הזמנה חדשה" in the sidebar bumps this even when this screen is
    // already mounted (mid-edit of a different order — the page doesn't
    // change, so the component isn't recreated). Skip the first firing: that
    // one just reflects whatever the counter already was when this instance
    // was constructed, not a fresh click.
    let skipFirst = true;
    effect(() => {
      this.nav.newOrderRequested();
      if (skipFirst) {
        skipFirst = false;
        return;
      }
      this.resetForm();
    });

    // Keeps the app-wide "currently selected" state (see `SelectionStateService`,
    // drives the breadcrumb) in sync with whichever order this screen is
    // working on — freshly created, saved again, or loaded for edit. Does
    // nothing while `savedOrder` is `null` (a blank, unsaved draft).
    effect(() => {
      const order = this.savedOrder();
      if (order) {
        this.selection.selectOrder(order);
      }
    });
  }

  protected searchShippingLines(query: string): void {
    this.shippingLineSuggestions.set(matching(SHIPPING_LINES, query));
  }

  protected searchAirlines(query: string): void {
    this.airlineSuggestions.set(matching(AIRLINES, query));
  }

  /** `YYYY-MM-DD` (or blank) → the Date a PrimeNG date picker's `minDate` wants. */
  protected asDate(iso: string): Date | null {
    if (!iso) return null;
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /** Fetches an existing order and populates the form so Save will PATCH it. */
  private loadOrderForEditing(orderId: number): void {
    this.loadingOrder.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.ordersApi
      .getById(orderId)
      .pipe(finalize(() => this.loadingOrder.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => {
          // Placeholder fields are never read by CustomerAutocomplete (it only
          // uses `.id`/`.name`), so this avoids an extra CustomersApi round-trip.
          this.selectedCustomer.set({
            id: order.customerId,
            name: order.customerName ?? '',
            address: null,
            phone: null,
            email: null,
            companyRegNumber: null,
            contactName: null,
            contactPhone: null,
            isActive: true,
          });
          // Same placeholder trick as the customer: SupplierAutocomplete only
          // ever reads `.id`/`.name`, so this avoids an extra SuppliersApi call.
          this.selectedSupplier.set(
            order.supplierId !== null
              ? {
                  id: order.supplierId,
                  name: order.supplierName ?? '',
                  address: null,
                  phone: null,
                  email: null,
                  isActive: true,
                }
              : null,
          );
          this.status.set(order.status);
          this.shipmentType.set(order.shipmentType);
          // paymentTerms first: `incoterm` is a linkedSignal derived from it and
          // would otherwise reset to the first allowed option for that group.
          this.paymentTerms.set(order.paymentTerms);
          this.incoterm.set(order.incoterm);
          this.destination.set(order.destination);
          this.form.reset(orderToFormValue(order));
          this.savedOrder.set(order);
          // Resume where the order was left off.
          this.furthestStep.set(order.lastStep);
          this.currentStep.set(order.lastStep);
          this.loadUploadedFiles({ kind: 'order', id: order.id });
        },
        error: (error: unknown) => this.errorMessage.set(loadErrorMessage(error)),
      });
  }

  // ── Tab navigation ─────────────────────────────────────────────────────────

  /** Enter inside a field: advance like "הבא" (or finish on the last tab). */
  protected onSubmit(): void {
    if (this.isLastStep()) {
      this.onFinish();
    } else {
      this.onNext();
    }
  }

  /** "הבא" — only the current tab is validated; moving back never is. */
  protected onNext(): void {
    if (!this.validateStep(this.currentStep())) return;
    this.moveTo(ORDER_STEPS[stepIndex(this.currentStep()) + 1]);
  }

  protected onPrevious(): void {
    if (this.isFirstStep()) return;
    this.currentStep.set(ORDER_STEPS[stepIndex(this.currentStep()) - 1]);
  }

  /** A tab is reachable when visited before, or it is the very next one. */
  protected canOpenStep(step: OrderStep): boolean {
    return stepIndex(step) <= stepIndex(this.furthestStep()) + 1;
  }

  protected isStepDone(step: OrderStep): boolean {
    return (
      stepIndex(step) < stepIndex(this.furthestStep()) &&
      step !== this.currentStep() &&
      !this.stepsWithErrors().has(step)
    );
  }

  /**
   * Tab click: backwards always; forwards only when every tab being passed
   * (the current one included) is valid — otherwise lands on the first
   * invalid one, so e.g. the schedule cannot be skipped from the first tab.
   */
  protected goToStep(step: OrderStep): void {
    if (step === this.currentStep() || !this.canOpenStep(step)) return;
    const passed = ORDER_STEPS.slice(stepIndex(this.currentStep()), stepIndex(step));
    const invalid = passed.find((s) => !this.validateStep(s));
    this.moveTo(invalid ?? step);
  }

  private moveTo(step: OrderStep | undefined): void {
    if (step === undefined) return;
    this.currentStep.set(step);
    if (stepIndex(step) > stepIndex(this.furthestStep())) {
      this.furthestStep.set(step);
    }
  }

  /** Shows the tab's errors (via `submitAttempted`) and reports whether it may be left forwards. */
  private validateStep(step: OrderStep): boolean {
    this.submitAttempted.set(true);
    switch (step) {
      case OrderStep.CUSTOMER:
        return this.selectedCustomer() !== null && this.selectedSupplier() !== null;
      case OrderStep.SCHEDULE:
        this.scheduleAttempted.set(true);
        return this.form.valid && this.missingScheduleDates().length === 0;
      default:
        return true;
    }
  }

  // ── Save / finish ──────────────────────────────────────────────────────────

  /** "שמירה" — saves progress from any tab: creates the order on the first
   *  save, PATCHes it afterwards, then uploads whatever is staged. */
  protected onSave(): void {
    const request$ = this.saveOrder();
    if (!request$) {
      this.focusFirstInvalidStep();
      return;
    }
    request$.subscribe({
      next: ({ order, uploadFailed }) => {
        if (!uploadFailed) {
          this.successMessage.set(`ההזמנה נשמרה — מספר הזמנה ${order.id}`);
        }
      },
      error: (error: unknown) => this.errorMessage.set(saveErrorMessage(error)),
    });
  }

  /** "סיום" — requires the mandatory documents (staged or already filed),
   *  saves, uploads, and only then moves on to filing scoped to this order.
   *  Any failure keeps the user here with the error shown. */
  protected onFinish(): void {
    if (this.saving()) return;
    this.finishAttempted.set(true);
    this.scheduleAttempted.set(true);
    if (this.missingScheduleDates().length > 0) {
      this.currentStep.set(OrderStep.SCHEDULE);
      this.successMessage.set(null);
      this.errorMessage.set('יש להשלים את כל התאריכים בלוחות הזמנים');
      return;
    }
    const missing = this.missingDocuments();
    if (missing.length > 0) {
      this.currentStep.set(OrderStep.DOCUMENTS);
      this.successMessage.set(null);
      this.errorMessage.set(
        `יש להעלות את המסמכים הנדרשים: ${missing.map((t) => IMPORT_DOCUMENT_TYPE_LABELS[t]).join(', ')}`,
      );
      return;
    }
    const request$ = this.saveOrder();
    if (!request$) {
      this.focusFirstInvalidStep();
      return;
    }
    request$.subscribe({
      next: ({ order, uploadFailed }) => {
        if (!uploadFailed) {
          this.nav.openFilingFor({ kind: 'order', id: order.id });
        }
      },
      error: (error: unknown) => this.errorMessage.set(saveErrorMessage(error)),
    });
  }

  /** Top-of-page "מעבר לתיוק ניירת יבוא" link — only shown once editing an
   *  already-saved order (see order.html), so it jumps straight to filing
   *  scoped to this order, with no save step. Same destination, reached
   *  without saving, as the "ייבוא מסמכים" row action in "ההזמנות שלי". */
  protected goToFiling(): void {
    const order = this.savedOrder();
    if (!order) return;
    this.nav.openFilingFor({ kind: 'order', id: order.id });
  }

  /** After a blocked save, show the first tab that has an error. */
  private focusFirstInvalidStep(): void {
    const invalid = ORDER_STEPS.find((step) => this.stepsWithErrors().has(step));
    if (invalid) this.currentStep.set(invalid);
  }

  /**
   * Builds and sends the create/update request (with `lastStep`), then
   * uploads the staged documents under the saved order. Returns `null` (does
   * nothing) while a save is already in flight, no customer or supplier is picked yet, or
   * the schedule is invalid. An upload failure never fails the save — the
   * order exists by then — it is reported via `uploadFailed` and the staged
   * files are kept so the next save retries them.
   */
  private saveOrder(): Observable<{ order: OrderDto; uploadFailed: boolean }> | null {
    if (this.saving()) {
      return null;
    }
    this.submitAttempted.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    const customer = this.selectedCustomer();
    const supplier = this.selectedSupplier();
    if (!customer || !supplier) {
      return null;
    }

    // Catches a manually-typed date that bypasses the pickers' `[min]`
    // constraint (see `chronologicalScheduleValidator`); the relevant
    // `*DateError` computed signal shows the user which field to fix.
    if (this.form.invalid) {
      return null;
    }

    const dto: CreateOrderDto = {
      ...toCreateOrderDto(
        customer.id,
        supplier.id,
        {
          status: this.status(),
          shipmentType: this.shipmentType(),
          paymentTerms: this.paymentTerms(),
          incoterm: this.incoterm(),
          destination: this.destination(),
        },
        this.form.getRawValue(),
      ),
      lastStep: this.furthestStep(),
    };

    const existing = this.savedOrder();
    const request$ = existing
      ? this.ordersApi.update(existing.id, dto)
      : this.ordersApi.create(dto);

    this.saving.set(true);
    return request$.pipe(
      tap((order) => this.savedOrder.set(order)),
      switchMap((order) =>
        this.uploadStagedFiles({ kind: 'order', id: order.id }).pipe(
          map((uploadFailed) => ({ order, uploadFailed })),
        ),
      ),
      finalize(() => this.saving.set(false)),
      takeUntilDestroyed(this.destroyRef),
    );
  }

  /** Uploads every staged type; emits `true` if any upload failed. */
  private uploadStagedFiles(context: FilingContext): Observable<boolean> {
    const entries = (Object.entries(this.stagedFiles()) as [ImportDocumentType, File[]][]).filter(
      ([, files]) => files.length > 0,
    );
    if (entries.length === 0) {
      return of(false);
    }
    return forkJoin(
      entries.map(([type, files]) =>
        this.importFilesApi.uploadMultipleImportFiles(context, type, files),
      ),
    ).pipe(
      map((results) => {
        const fresh = results.flat();
        const freshNames = new Set(fresh.map((file) => file.name));
        // A re-upload with the same name replaces the older entry server-side.
        this.uploadedFiles.update((files) => [
          ...fresh,
          ...files.filter((file) => !freshNames.has(file.name)),
        ]);
        this.stagedFiles.set({});
        return false;
      }),
      catchError(() => {
        this.errorMessage.set(UPLOAD_FAILED);
        return of(true);
      }),
    );
  }

  private loadUploadedFiles(context: FilingContext): void {
    this.importFilesApi
      .listImportFiles(context)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (files) => this.uploadedFiles.set(files),
        error: () => this.errorMessage.set(FILES_LOAD_FAILED),
      });
  }

  /** X on an uploaded file → asks for confirmation first (see `confirmDeleteFile`). */
  protected requestDeleteFile(file: UploadedImportFileDto): void {
    if (this.deletingFileId() !== null) return;
    this.fileToDelete.set(file);
  }

  /** Deletes the confirmed file on the server and drops it from the list. */
  protected confirmDeleteFile(): void {
    const file = this.fileToDelete();
    const order = this.savedOrder();
    this.fileToDelete.set(null);
    if (!file || !order) return;
    this.deletingFileId.set(file.id);
    this.errorMessage.set(null);
    this.importFilesApi
      .deleteImportFile({ kind: 'order', id: order.id }, file.id)
      .pipe(
        finalize(() => this.deletingFileId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.uploadedFiles.update((files) => files.filter((f) => f.id !== file.id)),
        error: () => this.errorMessage.set(DELETE_FILE_FAILED),
      });
  }

  /** Opens an already-filed document in a new tab — same approach as `ImportFilesPanel.openDocument`:
   *  the tab opens synchronously (popup blockers allow it) and is pointed at the blob once fetched. */
  protected openUploadedFile(file: UploadedImportFileDto): void {
    const order = this.savedOrder();
    if (!order || this.openingFileId() !== null) return;
    this.openingFileId.set(file.id);
    const viewer = window.open('', '_blank');
    this.importFilesApi
      .getImportFileBlob({ kind: 'order', id: order.id }, file.id)
      .pipe(
        finalize(() => this.openingFileId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          if (viewer && !viewer.closed) {
            viewer.location.href = url;
          } else {
            window.open(url, '_blank');
          }
          setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_TTL_MS);
        },
        error: () => {
          viewer?.close();
          this.errorMessage.set(OPEN_FILE_FAILED);
        },
      });
  }

  /** Clears everything so a fresh order can be entered. */
  protected onCancel(): void {
    const hasUnsavedInput =
      this.selectedCustomer() !== null ||
      this.selectedSupplier() !== null ||
      this.form.dirty ||
      Object.values(this.stagedFiles()).some((files) => files.length > 0);
    if (hasUnsavedInput && !confirm('הפרטים שהוזנו יימחקו. לבטל בכל זאת?')) {
      return;
    }
    this.resetForm();
  }

  /** Blanks the form for a fresh order — shared by `onCancel` (after
   *  confirmation) and the "יצירת הזמנה חדשה" sidebar reset (no confirmation:
   *  it's an explicit navigation, not an accidental click). */
  private resetForm(): void {
    this.form.reset();
    this.status.set(OrderStatus.PREPARING);
    this.shipmentType.set(ShipmentType.SEA);
    this.paymentTerms.set(PaymentTerms.PREPAID);
    this.incoterm.set(this.incotermOptions()[0]);
    this.destination.set(this.destinationOptions()[0]);
    this.selectedCustomer.set(null);
    this.selectedSupplier.set(null);
    this.savedOrder.set(null);
    this.submitAttempted.set(false);
    this.successMessage.set(null);
    this.errorMessage.set(null);
    this.isEditingExisting.set(false);
    this.currentStep.set(OrderStep.CUSTOMER);
    this.furthestStep.set(OrderStep.CUSTOMER);
    this.stagedFiles.set({});
    this.uploadedFiles.set([]);
    this.finishAttempted.set(false);
  }
}
