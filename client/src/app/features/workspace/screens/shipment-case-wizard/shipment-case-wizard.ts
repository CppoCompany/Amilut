import {
  DestroyRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Chip } from 'primeng/chip';
import { DatePicker } from 'primeng/datepicker';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { catchError, finalize, forkJoin, of, switchMap } from 'rxjs';

import {
  AIR_METHODS,
  AIR_METHOD_LABELS,
  AirMethod,
  MBL_SHIPPING_TYPE_LABELS,
  MBL_STATUS_LABELS,
  MBL_STATUSES,
  MblShippingType,
  MblStatus,
  PAYMENT_TERMS,
  PAYMENT_TERMS_LABELS,
  PaymentTerms,
  SEA_METHOD_LABELS,
  SeaMethod,
} from '../../../../api/enums';
import type {
  BillOfLadingExtractDto,
  CustomerDto,
  HblDocumentExtractDto,
  HblDto,
  MblDocumentExtractDto,
  MblDto,
  OrderDto,
} from '../../../../api/models';
import { CustomersApi } from '../../../../api/customers-api';
import { HblApi } from '../../../../api/hbl-api';
import { ImportFilesApi } from '../../../../api/import-files-api';
import { MblApi } from '../../../../api/mbl-api';
import { OrdersApi } from '../../../../api/orders-api';
import { TypedRow } from '../../../../shared/typed-row/typed-row';
import { CustomerAutocomplete } from '../../../customers/customer-autocomplete/customer-autocomplete';
import { NavigationService } from '../../navigation.service';
import { SelectionStateService } from '../../selection-state.service';
import { AirCaseFlow, AirCaseState } from './air-case-flow/air-case-flow';
import {
  EMPTY_HBL_FORM_VALUE,
  hblExtractToFormValue,
  hblToFormValue,
  saveErrorMessage as saveHblErrorMessage,
  toCreateHblDto,
  toUpdateHblDto,
} from './hbl-form.mapper';
import { HblOrdersPickerDialog } from './hbl-orders-picker-dialog/hbl-orders-picker-dialog';
import {
  EMPTY_MBL_CONTAINER_FORM_VALUE,
  EMPTY_MBL_FORM_VALUE,
  MblContainerFormValue,
  containerToFormValue,
  mblExtractContainersToFormValue,
  mblExtractToFormValue,
  mblToFormValue,
  saveErrorMessage as saveMblErrorMessage,
  toCreateMblDto,
} from './mbl-form.mapper';

/** UI vocabulary: the master-level case (`mbl` row) is shown as a "Job", each
 *  house-level case under it (`hbl` row) as a "File". The data model, API and
 *  the MBL/HBL *document numbers* keep their names. */
const SEA_METHOD_DESCRIPTIONS: Record<SeaMethod, string> = {
  [SeaMethod.FCL_FCL]: 'מכולה מלאה ללקוח אחד — File יחיד',
  [SeaMethod.FCL_LCL]: 'מכולה מלאה המחולקת למספר Files עבור אותו לקוח',
  [SeaMethod.LCL_LCL]: 'מכולה משותפת, עם File נפרד לכל לקוח',
  [SeaMethod.GROUPAGE_FCL]: 'מספר מכולות, כל אחת עם Files משל עצמה',
};

const AIR_METHOD_DESCRIPTIONS: Record<AirMethod, string> = {
  [AirMethod.DIRECT]: 'MAWB בלבד, ללא HAWB — היבואן רשום ב-MAWB',
  [AirMethod.CONSOLIDATION]: 'MAWB אחד עם מספר HAWBs (יבואן לכל HAWB)',
  [AirMethod.BACK_TO_BACK]: 'MAWB אחד עם HAWB אחד',
};

/** The sea-freight wizard's four stations, as listed in the "התקדמות התיק"
 *  sidebar, in order: type → method → files → job. `null` while the air
 *  flow (`AirCaseFlow`) owns the main pane. */
type WizardStep = 'type' | 'method' | 'files' | 'job';

/** A selected order as shown in the File form's summary chips. */
interface SelectedOrderChip {
  id: number;
  text: string;
}

/** What "לשיוך להזמנה" found in the chosen orders' paperwork, as told to the user. */
interface PrefillNotice {
  severity: 'info' | 'warn';
  text: string;
}

/** The document-derived part of one File: the house B/Ls its order holds
 *  (one per page of a multi-house file, user-selectable) and the Job
 *  fields found alongside them. */
interface PrefillSource {
  hblFileName: string | null;
  hbls: HblDocumentExtractDto[];
  mblFileName: string | null;
  mbl: MblDocumentExtractDto | null;
}

/**
 * "יצירת תיק שילוח" — the File/Job (HBL/MBL) shipping-case workflow, the
 * only shipping-case screen in the app. Reached either via "יצירת תיק
 * שילוח" in the sidebar (a blank draft), or via a double-click in "התיקים
 * שלי" to load an existing case for editing (see
 * `NavigationService.openCaseForEdit`/`editCaseId`).
 *
 * The File comes first: after the shipping type/method the File form opens
 * at once, starting with "לשיוך להזמנה". Picking an order fetches the MBL
 * and HBL documents filed under it and prefills the File (from the HBL) and
 * the Job (from the MBL). Saving the first File creates the Job in the same
 * go (an `hbl` row needs its `mbl`), then opens the Job form for review.
 */
@Component({
  selector: 'app-shipment-case-wizard-screen',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    Button,
    Chip,
    DatePicker,
    InputText,
    Message,
    Select,
    SelectButton,
    TableModule,
    CustomerAutocomplete,
    HblOrdersPickerDialog,
    TypedRow,
    AirCaseFlow,
  ],
  templateUrl: './shipment-case-wizard.html',
  styleUrl: './shipment-case-wizard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShipmentCaseWizardScreen {
  private readonly nav = inject(NavigationService);
  private readonly selection = inject(SelectionStateService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly mblApi = inject(MblApi);
  private readonly hblApi = inject(HblApi);
  private readonly ordersApi = inject(OrdersApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly MblShippingType = MblShippingType;
  protected readonly SeaMethod = SeaMethod;
  protected readonly SHIPPING_TYPE_LABELS = MBL_SHIPPING_TYPE_LABELS;
  protected readonly SEA_METHOD_LABELS = SEA_METHOD_LABELS;
  protected readonly SEA_METHOD_DESCRIPTIONS = SEA_METHOD_DESCRIPTIONS;
  protected readonly AIR_METHOD_LABELS = AIR_METHOD_LABELS;
  protected readonly AIR_METHOD_DESCRIPTIONS = AIR_METHOD_DESCRIPTIONS;
  protected readonly airMethods = AIR_METHODS;
  protected readonly seaMethods: readonly SeaMethod[] = [
    SeaMethod.FCL_FCL,
    SeaMethod.FCL_LCL,
    SeaMethod.LCL_LCL,
    SeaMethod.GROUPAGE_FCL,
  ];
  /** Value/label pairs for the PrimeNG freight-terms select-button and the status select. */
  protected readonly paymentTermsSelectOptions = PAYMENT_TERMS.map((value) => ({
    value,
    label: PAYMENT_TERMS_LABELS[value],
  }));
  protected readonly mblStatusSelectOptions = MBL_STATUSES.map((value) => ({
    value,
    label: MBL_STATUS_LABELS[value],
  }));

  protected readonly shippingType = signal<MblShippingType | null>(null);
  protected readonly seaMethod = signal<SeaMethod | null>(null);
  /** Air branch: the MAWB/HAWB structure chosen in step 2. */
  protected readonly airMethod = signal<AirMethod | null>(null);
  /** Air branch: an existing MAWB opened from "התיקים שלי". */
  protected readonly airEditMblId = signal<number | null>(null);
  /** Air branch: a HAWB or MAWB has been saved — steps 1/2 are then locked. */
  protected readonly airCaseStarted = signal(false);

  // ── Job (MBL) ────────────────────────────────────────────────────────────────
  protected readonly isGroupage = computed(() => this.seaMethod() === SeaMethod.GROUPAGE_FCL);
  /** `fcl_lcl` shares one customer across every File; it is the first File's
   *  customer and is shown read-only on the Job. */
  protected readonly sharesCustomer = computed(() => this.seaMethod() === SeaMethod.FCL_LCL);
  protected readonly freightTerms = signal<PaymentTerms | null>(null);
  /** Lifecycle status of the case (`mbl.status`) — drives "תיקים בהתרה" when set to `in_release`. */
  protected readonly mblStatus = signal<MblStatus>(MblStatus.OPEN);

  protected readonly mblForm = this.fb.group({
    mblNumber: [EMPTY_MBL_FORM_VALUE.mblNumber],
    bookingNumber: [EMPTY_MBL_FORM_VALUE.bookingNumber],
    vesselName: [EMPTY_MBL_FORM_VALUE.vesselName],
    voyageNumber: [EMPTY_MBL_FORM_VALUE.voyageNumber],
    portOfLoading: [EMPTY_MBL_FORM_VALUE.portOfLoading],
    portOfDischarge: [EMPTY_MBL_FORM_VALUE.portOfDischarge],
    finalDestination: [EMPTY_MBL_FORM_VALUE.finalDestination],
    carrierName: [EMPTY_MBL_FORM_VALUE.carrierName],
    shipperName: [EMPTY_MBL_FORM_VALUE.shipperName],
    shipperAddress: [EMPTY_MBL_FORM_VALUE.shipperAddress],
    consigneeName: [EMPTY_MBL_FORM_VALUE.consigneeName],
    consigneeAddress: [EMPTY_MBL_FORM_VALUE.consigneeAddress],
    notifyPartyName: [EMPTY_MBL_FORM_VALUE.notifyPartyName],
    notifyPartyAddress: [EMPTY_MBL_FORM_VALUE.notifyPartyAddress],
    containerNumber: [EMPTY_MBL_FORM_VALUE.containerNumber],
    containerSealNumber: [EMPTY_MBL_FORM_VALUE.containerSealNumber],
    cargoDescription: [EMPTY_MBL_FORM_VALUE.cargoDescription],
    grossWeightKg: [EMPTY_MBL_FORM_VALUE.grossWeightKg],
    volumeCbm: [EMPTY_MBL_FORM_VALUE.volumeCbm],
    receiptDeliveryType: [EMPTY_MBL_FORM_VALUE.receiptDeliveryType],
    placeOfIssue: [EMPTY_MBL_FORM_VALUE.placeOfIssue],
    dateOfIssue: [EMPTY_MBL_FORM_VALUE.dateOfIssue],
    containers: this.fb.array([this.buildContainerGroup()]),
  });

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** The Job row. Created together with the first File (prefilled from the
   *  order's MBL document), then reviewed/edited on the Job step. */
  protected readonly savedMbl = signal<MblDto | null>(null);
  /** True while the Job form is open — the "Job" station of the wizard. */
  protected readonly editingMbl = signal(false);
  /** True once the user has saved the Job form (or loaded an existing case):
   *  the "Job" station shows as done. A Job auto-created with the first File
   *  is not done until it has been looked at. */
  protected readonly jobConfirmed = signal(false);

  // ── File (HBL) ───────────────────────────────────────────────────────────────
  protected readonly hbls = signal<HblDto[]>([]);
  protected readonly hblsLoading = signal(false);

  /** `fcl_fcl` allows exactly one File; every other method allows adding more freely. */
  protected readonly canAddAnotherHbl = computed(
    () => this.seaMethod() !== SeaMethod.FCL_FCL || this.hbls().length === 0,
  );

  /** A customer is picked per-File, except under an `fcl_lcl` Job that
   *  already exists — its customer (the first File's) is inherited. */
  protected readonly needsHblCustomerPicker = computed(
    () => !this.sharesCustomer() || this.savedMbl() === null,
  );
  protected readonly hblCustomer = signal<CustomerDto | null>(null);
  /** Groupage, Job already saved: the File's container, one of the Job's. */
  protected readonly hblContainerId = signal<number | null>(null);
  /** Groupage, no Job yet: the container the first File goes into, typed (or
   *  read from the HBL document). It becomes the Job's first container row. */
  protected readonly hblNewContainerNumber = signal('');
  /** The saved Job's containers as choices for a new File (groupage only). */
  protected readonly hblContainerOptions = computed(() =>
    (this.savedMbl()?.containers ?? []).map((container) => ({
      value: container.id,
      label: container.containerNumber || `מכולה #${container.id}`,
    })),
  );

  /** Non-null while editing an already-saved File (picked from the created-File
   *  list) instead of creating a new one. The main pane then shows the edit
   *  page alone — no File list, no "+ הוספת File" — and returns to them on
   *  save/cancel. `customerId`/`containerId` are immutable once created, so
   *  the picker/choice-group are hidden in this mode. */
  protected readonly editingHblId = signal<number | null>(null);
  protected readonly editingHbl = computed(() => {
    const id = this.editingHblId();
    return id === null ? null : (this.hbls().find((h) => h.id === id) ?? null);
  });

  protected readonly hblForm = this.fb.group({
    hblNumber: [EMPTY_HBL_FORM_VALUE.hblNumber],
    shipperName: [EMPTY_HBL_FORM_VALUE.shipperName],
    shipperAddress: [EMPTY_HBL_FORM_VALUE.shipperAddress],
    consigneeName: [EMPTY_HBL_FORM_VALUE.consigneeName],
    consigneeAddress: [EMPTY_HBL_FORM_VALUE.consigneeAddress],
    notifyPartyName: [EMPTY_HBL_FORM_VALUE.notifyPartyName],
    notifyPartyAddress: [EMPTY_HBL_FORM_VALUE.notifyPartyAddress],
    cargoDescription: [EMPTY_HBL_FORM_VALUE.cargoDescription],
    quantity: [EMPTY_HBL_FORM_VALUE.quantity],
    grossWeightKg: [EMPTY_HBL_FORM_VALUE.grossWeightKg],
    volumeCbm: [EMPTY_HBL_FORM_VALUE.volumeCbm],
    remarks: [EMPTY_HBL_FORM_VALUE.remarks],
  });

  // Order association, picked in the "לשיוך להזמנה" popup (`HblOrdersPickerDialog`)
  // — the first thing on the File form. The id set is what gets saved; the DTO
  // list is display detail for the summary chips and the popup's pre-checked rows.
  protected readonly hblSelectedOrderIds = signal<ReadonlySet<number>>(new Set());
  protected readonly hblSelectedOrders = signal<OrderDto[]>([]);
  /** True while the File-being-edited's already-associated orders are being
   *  fetched (ids are known at once from `hbl.orders`; details arrive async). */
  protected readonly hblSelectedOrdersLoading = signal(false);
  protected readonly showOrdersPicker = signal(false);
  protected readonly hblSelectedOrderChips = computed<SelectedOrderChip[]>(() => {
    const details = this.hblSelectedOrders();
    return [...this.hblSelectedOrderIds()].map((id) => {
      const customerName = details.find((order) => order.id === id)?.customerName;
      return { id, text: customerName ? `#${id} · ${customerName}` : `#${id}` };
    });
  });

  // ── Prefill from the order's MBL / HBL documents ────────────────────────────
  /** True while the chosen orders' bill-of-lading paperwork is being read. */
  protected readonly prefillLoading = signal(false);
  protected readonly prefillNotice = signal<PrefillNotice | null>(null);
  private readonly prefillSource = signal<PrefillSource | null>(null);
  /** Which house B/L of a multi-house file fills the form. */
  protected readonly prefillHblIndex = signal(0);
  protected readonly prefillHblOptions = computed(() =>
    (this.prefillSource()?.hbls ?? []).map((hbl, index) => ({
      value: index,
      label: hbl.hblNumber ?? `שטר מטען ${index + 1}`,
    })),
  );
  /** The Job fields to create the Job with: the order's MBL document, else
   *  the master-level boxes of the chosen house B/L. */
  private readonly jobPrefill = computed<MblDocumentExtractDto | null>(() => {
    const source = this.prefillSource();
    if (!source) return null;
    return source.mbl ?? source.hbls[this.prefillHblIndex()]?.master ?? null;
  });

  protected readonly savingHbl = signal(false);
  protected readonly hblSaveError = signal<string | null>(null);
  /** Whether the create/edit File form is open. It opens by itself for the
   *  first File (right after the sea method is chosen) and behind an explicit
   *  "+ הוספת File נוסף" afterwards, so creating more than one File is a
   *  clearly visible, deliberate action. */
  protected readonly showHblForm = signal(false);

  // ── Loading an existing case for edit (double-click in "התיקים שלי") ────────
  /** True once an existing Job was loaded for editing (vs. created in this
   *  session) — only the page title cares; locking of steps 1/2 is driven by
   *  `choicesLocked` (any saved Job), not by this. */
  protected readonly isEditingExisting = signal(false);
  protected readonly loadingCase = signal(false);
  protected readonly loadCaseError = signal<string | null>(null);

  // ── "התקדמות התיק" sidebar navigation ───────────────────────────────────────
  /** Once a Job exists in the DB its shipping type/method are fixed. Steps 1/2
   *  can still be *viewed* (choice highlighted, cards disabled) — this holds
   *  which of them is being looked at, `null` when the main pane follows the
   *  natural flow. Ignored while no Job is saved (steps 1/2 are then live). */
  private readonly viewingLockedStep = signal<'type' | 'method' | null>(null);
  /** True once the shipping type/method can no longer be changed. */
  protected readonly choicesLocked = computed(
    () => this.savedMbl() !== null || this.airCaseStarted(),
  );

  /** Which station the main pane is showing right now. */
  protected readonly currentStep = computed<WizardStep | null>(() => {
    const viewing = this.viewingLockedStep();
    if (viewing !== null && this.choicesLocked()) return viewing;
    const shippingType = this.shippingType();
    if (shippingType === null) return 'type';
    if (shippingType === MblShippingType.AIR) {
      return this.airMethod() === null ? 'method' : null;
    }
    if (this.seaMethod() === null) return 'method';
    if (this.editingMbl()) return 'job';
    return 'files';
  });
  protected readonly canGoToTypeStep = computed(() => this.currentStep() !== 'type');
  protected readonly canGoToMethodStep = computed(
    () => this.shippingType() !== null && this.currentStep() !== 'method',
  );
  protected readonly canGoToFilesStep = computed(
    () => this.seaMethod() !== null && this.currentStep() !== 'files',
  );
  protected readonly canGoToJobStep = computed(
    () => this.savedMbl() !== null && this.currentStep() !== 'job',
  );

  constructor() {
    // A double-click on a row in "התיקים שלי" navigates to
    // `/workspace/shipment?caseId=N`, which NavigationService.applyUrl turns
    // into `editCaseId` before this screen shows. Consume it once as soon as
    // it appears, so a later, ordinary navigation back to this screen (e.g.
    // via the sidebar) starts with a blank draft as usual. An effect rather
    // than a one-shot constructor read: Back/Forward can land on an edit URL
    // while this instance is already mounted (the page doesn't change, so it
    // isn't recreated), and that must load the case too.
    effect(() => {
      const editCaseId = this.nav.editCaseId();
      if (editCaseId === null) return;
      untracked(() => {
        this.nav.editCaseId.set(null);
        this.loadCaseForEdit(editCaseId);
      });
    });

    // "יצירת תיק שילוח" in the sidebar bumps this even when this screen is
    // already mounted mid-wizard (selecting it again doesn't change
    // activePage, so the component isn't recreated) — jump back to step one,
    // same reset pattern used by the order screen's newOrderRequested.
    let skipFirst = true;
    effect(() => {
      this.nav.newCaseRequested();
      if (skipFirst) {
        skipFirst = false;
        return;
      }
      this.reset();
    });

    // Keeps the app-wide "currently selected" state (see `SelectionStateService`,
    // drives the breadcrumb) in sync with whichever Job/Files this screen is
    // working on — freshly created, saved again, loaded for edit, or any time
    // a File is added/edited. Does nothing while `savedMbl` is `null` (still
    // on step 1/2, or on the first File with no Job saved yet).
    effect(() => {
      const mbl = this.savedMbl();
      if (mbl) {
        this.selection.selectShippingCase(mbl, this.hbls());
      }
    });
  }

  protected selectShippingType(type: MblShippingType): void {
    if (this.choicesLocked()) return;
    this.shippingType.set(type);
    this.seaMethod.set(null);
    this.airMethod.set(null);
  }

  /** Air step 2 → the air flow (HAWB form first; MAWB form for Direct). */
  protected selectAirMethod(method: AirMethod): void {
    if (this.choicesLocked()) return;
    this.airMethod.set(method);
  }

  /** Back to the air flow from a read-only step 1/2 view. */
  protected goToAirCase(): void {
    this.viewingLockedStep.set(null);
  }

  /** Mirrors the air case into the breadcrumb selection once it has a MAWB. */
  protected onAirCaseState(state: AirCaseState): void {
    if (state.mbl) this.selection.selectShippingCase(state.mbl, state.houses);
  }

  /** Step 2 → straight into the first File's form, "לשיוך להזמנה" first. */
  protected selectSeaMethod(method: SeaMethod): void {
    if (this.choicesLocked()) return;
    this.seaMethod.set(method);
    this.openNewHblForm();
  }

  // "התקדמות התיק" links — the wizard's only backward navigation (there are no
  // in-form back buttons). Each is a no-op unless its `canGoTo…` guard allows
  // it (the template also disables the button, this just makes them safe to
  // call). Returning to "התיקים שלי" from a loaded case goes through the app
  // sidebar / breadcrumb, like any other screen.
  /** Back to step 1. While no Job is saved this drops the draft so the type can
   *  be re-chosen; once one exists it only *shows* step 1, read-only. */
  protected goToTypeStep(): void {
    if (!this.canGoToTypeStep()) return;
    if (this.choicesLocked()) {
      this.viewingLockedStep.set('type');
      return;
    }
    this.resetMblState();
    this.shippingType.set(null);
    this.seaMethod.set(null);
    this.airMethod.set(null);
  }

  /** Back to step 2 — same live/locked split as `goToTypeStep`. */
  protected goToMethodStep(): void {
    if (!this.canGoToMethodStep()) return;
    if (this.choicesLocked()) {
      this.viewingLockedStep.set('method');
      return;
    }
    this.resetMblState();
    this.seaMethod.set(null);
    this.airMethod.set(null);
  }

  /** Leaves the Job form (discarding unsaved edits) for the Files step; with
   *  no File yet, the new-File form opens there by itself. */
  protected goToFilesStep(): void {
    if (!this.canGoToFilesStep()) return;
    this.showFilesStep();
    if (this.hbls().length === 0 && !this.showHblForm()) this.openNewHblForm();
  }

  /** Opens the saved Job's form. */
  protected goToJobStep(): void {
    if (!this.canGoToJobStep()) return;
    this.startEditMbl();
  }

  /** Makes the main pane show the Files step: closes the Job form (unsaved
   *  edits discarded) and any read-only step 1/2 view. Used by every
   *  File action so they land where the File form actually renders. */
  private showFilesStep(): void {
    this.viewingLockedStep.set(null);
    this.cancelEditMbl();
  }

  /** Top-of-page "מעבר לתיק הסליקה" link — only shown once this case has a
   *  linked Customs Clearance File (`savedMbl().ccfId`), jumps straight to
   *  viewing it, no save step. Mirrors `OrderScreen.goToFiling()` exactly. */
  protected goToCcf(): void {
    const mbl = this.savedMbl();
    if (!mbl || mbl.ccfId === null) return;
    this.nav.openCcfForView(mbl.ccfId);
  }

  protected containerControls() {
    return this.mblForm.controls.containers.controls;
  }

  protected addContainer(): void {
    this.mblForm.controls.containers.push(this.buildContainerGroup());
  }

  protected removeContainer(index: number): void {
    this.mblForm.controls.containers.removeAt(index);
  }

  /** Opens the saved Job's fields for review/editing — the customer (fcl_lcl
   *  only) is intentionally NOT editable here: it is the first File's, and
   *  changing it after Files exist under it would break their shared-customer
   *  invariant (enforced server-side by `HblService.validateCustomer`). */
  protected startEditMbl(): void {
    const mbl = this.savedMbl();
    if (!mbl) return;

    this.viewingLockedStep.set(null); // leave a read-only step 1/2 view, if open
    this.mblForm.patchValue(mblToFormValue(mbl));
    const containers = this.mblForm.controls.containers;
    containers.clear();
    if (mbl.containers.length) {
      for (const container of mbl.containers) {
        const group = this.buildContainerGroup();
        group.patchValue(containerToFormValue(container));
        containers.push(group);
      }
    } else {
      containers.push(this.buildContainerGroup());
    }
    this.freightTerms.set(mbl.freightTerms ?? null);
    this.mblStatus.set(mbl.status);
    this.saveError.set(null);
    this.editingMbl.set(true);
  }

  protected onMblStatusChange(value: string | null | undefined): void {
    if (value && (MBL_STATUSES as readonly string[]).includes(value)) {
      this.mblStatus.set(value as MblStatus);
    }
  }

  protected cancelEditMbl(): void {
    this.editingMbl.set(false);
    this.saveError.set(null);
  }

  /** Saves the Job form onto the existing Job (always created with the first
   *  File) and returns to the Files step. */
  protected onSaveMbl(): void {
    const shippingType = this.shippingType();
    const existingMbl = this.savedMbl();
    if (!shippingType || !existingMbl || this.saving()) return;
    const seaMethod = this.seaMethod();

    if (this.isGroupage() && this.mblForm.controls.containers.length === 0) {
      this.saveError.set('יש להוסיף לפחות מכולה אחת');
      return;
    }

    this.saveError.set(null);
    this.saving.set(true);

    const { containers, ...formFields } = this.mblForm.getRawValue();
    const dto = toCreateMblDto(
      shippingType,
      seaMethod,
      existingMbl.customerId,
      this.freightTerms(),
      this.mblStatus(),
      formFields,
      containers,
    );

    this.mblApi
      .update(existingMbl.id, dto)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (mbl) => {
          this.savedMbl.set(mbl);
          this.jobConfirmed.set(true);
          this.editingMbl.set(false);
        },
        error: (error: unknown) => this.saveError.set(saveMblErrorMessage(error)),
      });
  }

  /** The container a given File belongs to, for display in the File list (groupage only). */
  protected containerLabel(containerId: number | null): string {
    const container = this.savedMbl()?.containers.find((c) => c.id === containerId);
    if (!container) return '—';
    return container.containerNumber ?? `מכולה #${container.id}`;
  }

  /** "File #3 · HBL-001 · לקוח" — the File's identity line above the
   *  edit page. */
  protected hblLabel(hbl: HblDto): string {
    const parts = [`File #${hbl.sequenceNumber}`];
    if (hbl.hblNumber) parts.push(hbl.hblNumber);
    if (hbl.customerName) parts.push(hbl.customerName);
    return parts.join(' · ');
  }

  /** Picks the container for the File being created, from the form's
   *  choice-group (groupage with a saved Job). Switching to a *different*
   *  container clears whatever was typed so far: a File belongs to exactly
   *  one container, so half-filled data from the previous choice must not
   *  carry over. Ignored while editing an existing File (container is immutable). */
  protected selectHblContainer(containerId: number): void {
    if (this.editingHblId() !== null) return;
    this.showFilesStep();
    if (this.hblContainerId() === containerId) return;
    this.clearHblFormFields();
    this.hblContainerId.set(containerId);
  }

  /** Opens a blank form for a brand-new File — by itself for the first File,
   *  then via "+ הוספת File נוסף". */
  protected openNewHblForm(): void {
    this.showFilesStep();
    this.resetHblForm();
    this.showHblForm.set(true);
  }

  /** Opens the edit page for an already-saved File (from the created-File list) — `customerId`/`containerId` stay as
   *  they were. Saving or cancelling returns to the File list + "+ הוספת File". */
  protected startEditHbl(hbl: HblDto): void {
    this.showFilesStep();
    this.resetHblForm();
    this.hblForm.patchValue(hblToFormValue(hbl));
    this.hblSelectedOrderIds.set(new Set(hbl.orders.map((order) => order.id)));
    this.editingHblId.set(hbl.id);
    this.showHblForm.set(true);

    if (hbl.orders.length === 0) return;
    this.hblSelectedOrdersLoading.set(true);
    forkJoin(hbl.orders.map((order) => this.ordersApi.getById(order.id)))
      .pipe(
        finalize(() => this.hblSelectedOrdersLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (orders) => {
          // Only if the user hasn't moved on to another File meanwhile.
          if (this.editingHblId() === hbl.id) this.hblSelectedOrders.set(orders);
        },
        error: () => {},
      });
  }

  /** Closes the create/edit form without saving, collapsing back to the
   *  "+ הוספת File נוסף" button. */
  protected closeHblForm(): void {
    this.resetHblForm();
  }

  // ── "לשיוך להזמנה" popup ─────────────────────────────────────────────────────
  protected openOrdersPicker(): void {
    if (this.hblSelectedOrdersLoading()) return;
    this.showOrdersPicker.set(true);
  }

  protected closeOrdersPicker(): void {
    this.showOrdersPicker.set(false);
  }

  /** Records the chosen orders and, for a new File, reads their MBL/HBL
   *  paperwork into the form (and the Job-to-be). */
  protected onOrdersPicked(orders: OrderDto[]): void {
    this.hblSelectedOrders.set(orders);
    this.hblSelectedOrderIds.set(new Set(orders.map((order) => order.id)));
    this.showOrdersPicker.set(false);
    if (this.editingHblId() !== null) return;
    if (orders.length === 0) {
      this.clearPrefill();
      return;
    }
    this.prefillFromOrders(orders);
  }

  /** A multi-house HBL file: fills the form from the house B/L picked in the select. */
  protected selectPrefillHbl(index: number | null | undefined): void {
    const source = this.prefillSource();
    if (index === null || index === undefined || !source?.hbls[index]) return;
    this.prefillHblIndex.set(index);
    this.applyHblExtract(source.hbls[index]);
  }

  /**
   * Reads the bill-of-lading paperwork filed under the chosen orders: the
   * first order with an HBL document fills the File, the first with an MBL
   * document (or, failing that, the master boxes of the HBL) will fill the
   * Job. The File's customer, when still unpicked, follows the first order.
   */
  private prefillFromOrders(orders: OrderDto[]): void {
    this.prefillLoading.set(true);
    this.prefillNotice.set(null);
    const requestedIds = orders.map((order) => order.id);

    if (this.needsHblCustomerPicker() && this.hblCustomer() === null) {
      this.customersApi
        .getById(orders[0].customerId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (customer) => {
            if (this.hblCustomer() === null && this.editingHblId() === null) {
              this.hblCustomer.set(customer);
            }
          },
          error: () => {},
        });
    }

    forkJoin(
      orders.map((order) =>
        this.importFilesApi
          .getBillOfLadingExtract({ kind: 'order', id: order.id })
          .pipe(catchError(() => of<BillOfLadingExtractDto | null>(null))),
      ),
    )
      .pipe(
        finalize(() => this.prefillLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        // Only if these are still the orders on the form.
        const currentIds = [...this.hblSelectedOrderIds()];
        if (currentIds.join(',') !== requestedIds.join(',')) return;
        this.applyPrefillResults(results);
      });
  }

  private applyPrefillResults(results: (BillOfLadingExtractDto | null)[]): void {
    const found = results.filter((r): r is BillOfLadingExtractDto => r !== null);
    const withHbl = found.find((r) => r.hbls.length > 0) ?? null;
    const withMbl = found.find((r) => r.mbl !== null) ?? null;
    const hblError = found.find((r) => r.hblError !== null) ?? null;
    const mblError = found.find((r) => r.mblError !== null) ?? null;

    const source: PrefillSource = {
      hblFileName: withHbl?.hblFileName ?? null,
      hbls: withHbl?.hbls ?? [],
      mblFileName: withMbl?.mblFileName ?? null,
      mbl: withMbl?.mbl ?? null,
    };
    this.prefillSource.set(source);
    this.prefillHblIndex.set(0);
    if (source.hbls.length > 0) this.applyHblExtract(source.hbls[0]);

    const lines: string[] = [];
    if (source.hbls.length > 0) {
      lines.push(
        source.hbls.length > 1
          ? `ה-File מולא מתוך "${source.hblFileName}" (${source.hbls.length} שטרי מטען בקובץ — ניתן לבחור ביניהם)`
          : `ה-File מולא מתוך "${source.hblFileName}"`,
      );
    } else if (hblError) {
      lines.push(`קריאת שטר המטען "${hblError.hblFileName}" נכשלה: ${hblError.hblError}`);
    } else if (found.length === 0) {
      lines.push('לא ניתן היה לקרוא את מסמכי ההזמנה');
    } else {
      lines.push('לא נמצא שטר מטען (HBL) בהזמנה — יש למלא את ה-File ידנית');
    }
    if (this.savedMbl() === null) {
      if (source.mbl) {
        lines.push(`ה-Job ייווצר מתוך "${source.mblFileName}"`);
      } else if (mblError) {
        lines.push(`קריאת שטר המטען-מסטר "${mblError.mblFileName}" נכשלה: ${mblError.mblError}`);
      } else if (source.hbls.length > 0) {
        lines.push('לא נמצא שטר מטען-מסטר (MBL) בהזמנה — ה-Job ייווצר מפרטי המסטר שבשטר המטען');
      } else if (found.length > 0) {
        lines.push('לא נמצא שטר מטען-מסטר (MBL) בהזמנה — יש למלא את ה-Job ידנית');
      }
    }
    this.prefillNotice.set({
      severity: source.hbls.length > 0 || source.mbl ? 'info' : 'warn',
      text: lines.join('. '),
    });
  }

  /** Writes the document's stated fields over the form (the rest stay as typed). */
  private applyHblExtract(extract: HblDocumentExtractDto): void {
    this.hblForm.patchValue(hblExtractToFormValue(extract));
    if (this.isGroupage() && this.savedMbl() === null && this.hblNewContainerNumber() === '') {
      const container = extract.master.containers[0]?.containerNumber;
      if (container) this.hblNewContainerNumber.set(container);
    }
  }

  private clearPrefill(): void {
    this.prefillSource.set(null);
    this.prefillHblIndex.set(0);
    this.prefillNotice.set(null);
    this.prefillLoading.set(false);
  }

  /** Saves the File. For the very first File the Job is created first (from
   *  the order's MBL document, else blank) — an `hbl` row needs its `mbl` —
   *  and the Job form then opens for review. */
  protected onSaveHbl(): void {
    const shippingType = this.shippingType();
    const seaMethod = this.seaMethod();
    if (!shippingType || this.savingHbl()) return;
    const mbl = this.savedMbl();
    const editingId = this.editingHblId();

    let customerId: number | null = null;
    let containerId: number | null = null;
    const newContainerNumber = this.hblNewContainerNumber().trim();
    if (!editingId) {
      customerId = this.needsHblCustomerPicker()
        ? (this.hblCustomer()?.id ?? null)
        : (mbl?.customerId ?? null);
      if (customerId === null) {
        this.hblSaveError.set('יש לבחור לקוח עבור ה-File');
        return;
      }
      if (this.isGroupage()) {
        if (mbl) {
          containerId = this.hblContainerId();
          if (containerId === null) {
            this.hblSaveError.set('יש לבחור מכולה עבור ה-File');
            return;
          }
        } else if (newContainerNumber === '') {
          this.hblSaveError.set('יש להזין מספר מכולה עבור ה-File');
          return;
        }
      }
    }

    this.hblSaveError.set(null);
    this.savingHbl.set(true);

    const formValue = this.hblForm.getRawValue();
    const orderIds = [...this.hblSelectedOrderIds()];
    const createdJob = mbl === null && !editingId;

    const request$ = editingId
      ? this.hblApi
          .update(editingId, toUpdateHblDto(formValue))
          .pipe(switchMap((hbl) => this.hblApi.updateOrders(hbl.id, orderIds)))
      : mbl
        ? this.hblApi.create(toCreateHblDto(mbl.id, containerId, customerId!, formValue, orderIds))
        : this.mblApi
            .create(this.buildJobDto(shippingType, seaMethod, customerId!, newContainerNumber))
            .pipe(
              switchMap((createdMbl) => {
                this.savedMbl.set(createdMbl);
                const container = this.isGroupage()
                  ? (createdMbl.containers.find(
                      (c) =>
                        (c.containerNumber ?? '').toUpperCase() ===
                        newContainerNumber.toUpperCase(),
                    ) ?? createdMbl.containers[0])
                  : null;
                return this.hblApi.create(
                  toCreateHblDto(
                    createdMbl.id,
                    container?.id ?? null,
                    customerId!,
                    formValue,
                    orderIds,
                  ),
                );
              }),
            );

    request$
      .pipe(
        finalize(() => this.savingHbl.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (hbl) => {
          this.hbls.update((list) => {
            const index = list.findIndex((existing) => existing.id === hbl.id);
            if (index === -1) return [...list, hbl];
            const next = [...list];
            next[index] = hbl;
            return next;
          });
          this.resetHblForm();
          if (createdJob) this.startEditMbl();
        },
        error: (error: unknown) => this.hblSaveError.set(saveHblErrorMessage(error)),
      });
  }

  /** The Job created along with the first File: the order's MBL document (or
   *  the HBL's master boxes) where found, otherwise blank; `fcl_lcl` takes
   *  the File's customer as its shared one; groupage gets the document's
   *  container rows plus the File's own container when not among them. */
  private buildJobDto(
    shippingType: MblShippingType,
    seaMethod: SeaMethod | null,
    customerId: number,
    newContainerNumber: string,
  ) {
    const prefill = this.jobPrefill();
    const form = mblExtractToFormValue(prefill);
    let containers: MblContainerFormValue[] = [];
    if (this.isGroupage()) {
      containers = mblExtractContainersToFormValue(prefill);
      const known = containers.some(
        (c) => c.containerNumber.toUpperCase() === newContainerNumber.toUpperCase(),
      );
      if (!known) {
        containers.unshift({
          ...EMPTY_MBL_CONTAINER_FORM_VALUE,
          containerNumber: newContainerNumber,
        });
      }
    }
    return toCreateMblDto(
      shippingType,
      seaMethod,
      this.sharesCustomer() ? customerId : null,
      prefill?.freightTerms ?? null,
      MblStatus.OPEN,
      form,
      containers,
    );
  }

  private loadHbls(mblId: number): void {
    this.hblsLoading.set(true);
    this.hblApi
      .findByMblId(mblId)
      .pipe(
        finalize(() => this.hblsLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (rows) => {
          this.hbls.set(rows);
          if (rows.length === 0 && !this.showHblForm()) this.openNewHblForm();
        },
        error: () => this.hbls.set([]),
      });
  }

  private buildContainerGroup() {
    return this.fb.group({
      containerNumber: [EMPTY_MBL_CONTAINER_FORM_VALUE.containerNumber],
      containerSealNumber: [EMPTY_MBL_CONTAINER_FORM_VALUE.containerSealNumber],
      cargoDescription: [EMPTY_MBL_CONTAINER_FORM_VALUE.cargoDescription],
      grossWeightKg: [EMPTY_MBL_CONTAINER_FORM_VALUE.grossWeightKg],
      volumeCbm: [EMPTY_MBL_CONTAINER_FORM_VALUE.volumeCbm],
    });
  }

  private resetMblState(): void {
    this.mblForm.patchValue(EMPTY_MBL_FORM_VALUE);
    const containers = this.mblForm.controls.containers;
    containers.clear();
    containers.push(this.buildContainerGroup());
    this.freightTerms.set(null);
    this.mblStatus.set(MblStatus.OPEN);
    this.savedMbl.set(null);
    this.editingMbl.set(false);
    this.jobConfirmed.set(false);
    this.viewingLockedStep.set(null);
    this.saveError.set(null);
    this.saving.set(false);
    this.hbls.set([]);
    this.resetHblForm();
  }

  /** Blanks the user-entered part of the File form (fields, customer, orders,
   *  what the documents filled in) while leaving the form open and the
   *  container choice untouched. */
  private clearHblFormFields(): void {
    this.hblForm.reset(EMPTY_HBL_FORM_VALUE);
    this.hblCustomer.set(null);
    this.hblSelectedOrderIds.set(new Set());
    this.hblSelectedOrders.set([]);
    this.hblSelectedOrdersLoading.set(false);
    this.showOrdersPicker.set(false);
    this.hblSaveError.set(null);
    this.clearPrefill();
  }

  private resetHblForm(): void {
    this.clearHblFormFields();
    this.hblContainerId.set(null);
    this.hblNewContainerNumber.set('');
    this.savingHbl.set(false);
    this.editingHblId.set(null);
    this.showHblForm.set(false);
  }

  /** Loads an existing Job (and its Files) for editing — reached only via a
   *  double-click in "התיקים שלי" (see `NavigationService.openCaseForEdit`).
   *  Lands on the Files step; the Job is reachable from the sidebar. */
  private loadCaseForEdit(mblId: number): void {
    this.loadingCase.set(true);
    this.loadCaseError.set(null);
    this.mblApi
      .getById(mblId)
      .pipe(
        finalize(() => this.loadingCase.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (mbl) => {
          if (mbl.shippingType === MblShippingType.AIR) {
            // The air flow loads its own MAWB / HAWBs from the id.
            this.shippingType.set(MblShippingType.AIR);
            this.airMethod.set(mbl.airMethod);
            this.airEditMblId.set(mbl.id);
            this.airCaseStarted.set(true);
            this.isEditingExisting.set(true);
            return;
          }
          this.shippingType.set(mbl.shippingType);
          this.seaMethod.set(mbl.seaMethod);
          this.savedMbl.set(mbl);
          this.jobConfirmed.set(true);
          this.isEditingExisting.set(true);
          this.loadHbls(mbl.id);
        },
        error: () => this.loadCaseError.set('טעינת התיק נכשלה'),
      });
  }

  private reset(): void {
    this.shippingType.set(null);
    this.seaMethod.set(null);
    this.airMethod.set(null);
    this.airEditMblId.set(null);
    this.airCaseStarted.set(false);
    this.isEditingExisting.set(false);
    this.loadCaseError.set(null);
    this.resetMblState();
  }
}
