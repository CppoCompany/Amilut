import {
  DestroyRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize, forkJoin, switchMap } from 'rxjs';

import {
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
import type { CustomerDto, HblDto, MblDto, OrderDto } from '../../../../api/models';
import { HblApi } from '../../../../api/hbl-api';
import { MblApi } from '../../../../api/mbl-api';
import { OrdersApi } from '../../../../api/orders-api';
import { CustomerAutocomplete } from '../../../customers/customer-autocomplete/customer-autocomplete';
import { NavigationService } from '../../navigation.service';
import { SelectionStateService } from '../../selection-state.service';
import {
  ContainerDetailsDialog,
  type ContainerSummary,
} from './container-details-dialog/container-details-dialog';
import {
  EMPTY_HBL_FORM_VALUE,
  hblToFormValue,
  saveErrorMessage as saveHblErrorMessage,
  toCreateHblDto,
  toUpdateHblDto,
} from './hbl-form.mapper';
import { HblOrdersPickerDialog } from './hbl-orders-picker-dialog/hbl-orders-picker-dialog';
import {
  EMPTY_MBL_CONTAINER_FORM_VALUE,
  EMPTY_MBL_FORM_VALUE,
  containerToFormValue,
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

/** The sea-freight wizard's four stations, as listed in the "התקדמות התיק"
 *  sidebar. `null` while on the air placeholder (no station applies). */
type WizardStep = 'type' | 'method' | 'job' | 'files';

/** A selected order as shown in the File form's summary chips. */
interface SelectedOrderChip {
  id: number;
  text: string;
}

/** "יצירת תיק שילוח" — the Job/File (MBL/HBL) shipping-case workflow. The only
 *  shipping-case screen in the app: reached either via "יצירת תיק שילוח" in the
 *  sidebar (a blank draft), or via a double-click in "התיקים שלי" to load an
 *  existing Job for editing (see `NavigationService.openCaseForEdit`/`editCaseId`). */
@Component({
  selector: 'app-shipment-case-wizard-screen',
  imports: [ReactiveFormsModule, CustomerAutocomplete, HblOrdersPickerDialog, ContainerDetailsDialog],
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
  private readonly destroyRef = inject(DestroyRef);

  protected readonly MblShippingType = MblShippingType;
  protected readonly SeaMethod = SeaMethod;
  protected readonly SHIPPING_TYPE_LABELS = MBL_SHIPPING_TYPE_LABELS;
  protected readonly SEA_METHOD_LABELS = SEA_METHOD_LABELS;
  protected readonly SEA_METHOD_DESCRIPTIONS = SEA_METHOD_DESCRIPTIONS;
  protected readonly seaMethods: readonly SeaMethod[] = [
    SeaMethod.FCL_FCL,
    SeaMethod.FCL_LCL,
    SeaMethod.LCL_LCL,
    SeaMethod.GROUPAGE_FCL,
  ];
  protected readonly paymentTermsOptions = PAYMENT_TERMS;
  protected readonly paymentTermsLabels = PAYMENT_TERMS_LABELS;
  protected readonly mblStatusOptions = MBL_STATUSES;
  protected readonly mblStatusLabels = MBL_STATUS_LABELS;

  protected readonly shippingType = signal<MblShippingType | null>(null);
  protected readonly seaMethod = signal<SeaMethod | null>(null);

  // ── Job (MBL) step ───────────────────────────────────────────────────────────
  /** Set only for `fcl_lcl` — one customer, shared by every File under this Job. */
  protected readonly needsCustomer = computed(() => this.seaMethod() === SeaMethod.FCL_LCL);
  protected readonly isGroupage = computed(() => this.seaMethod() === SeaMethod.GROUPAGE_FCL);
  protected readonly mblCustomer = signal<CustomerDto | null>(null);
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
  protected readonly savedMbl = signal<MblDto | null>(null);
  /** True while re-showing the Job form to edit an already-saved Job (triggered
   *  from the sidebar tree's Job node or the "Job" progress link). */
  protected readonly editingMbl = signal(false);

  // ── File (HBL) step ──────────────────────────────────────────────────────────
  protected readonly hbls = signal<HblDto[]>([]);
  protected readonly hblsLoading = signal(false);

  /** `fcl_fcl` allows exactly one File; every other method allows adding more freely. */
  protected readonly canAddAnotherHbl = computed(
    () => this.seaMethod() !== SeaMethod.FCL_FCL || this.hbls().length === 0,
  );

  /** A customer must be picked per-File for every method except `fcl_lcl`, where
   *  it's inherited from the Job's own `customerId` (chosen once, in the Job step). */
  protected readonly needsHblCustomerPicker = computed(() => this.seaMethod() !== SeaMethod.FCL_LCL);
  protected readonly hblCustomer = signal<CustomerDto | null>(null);
  protected readonly hblContainerId = signal<number | null>(null);

  /** Non-null while editing an already-saved File (picked from the created-File
   *  list or the sidebar's "עריכת File" link) instead of creating a new one. The
   *  main pane then shows the edit page alone — no File list, no "+ הוספת File" —
   *  and returns to them on save/cancel. `customerId`/`containerId` are immutable
   *  once created, so the picker/choice-group are hidden in this mode. */
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

  // Optional order association, picked in the "לשיוך להזמנה" popup
  // (`HblOrdersPickerDialog`). The id set is what gets saved; the DTO list is
  // display detail for the summary chips and the popup's pre-checked rows.
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

  protected readonly savingHbl = signal(false);
  protected readonly hblSaveError = signal<string | null>(null);
  /** Whether the create/edit File form is currently open — collapsed by default
   *  behind an explicit "+ הוספת File נוסף" button (see `openNewHblForm`),
   *  so creating more than one File is a clearly visible, deliberate action. */
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
  protected readonly choicesLocked = computed(() => this.savedMbl() !== null);

  /** Which station the main pane is showing right now. */
  protected readonly currentStep = computed<WizardStep | null>(() => {
    const viewing = this.viewingLockedStep();
    if (viewing !== null && this.choicesLocked()) return viewing;
    const shippingType = this.shippingType();
    if (shippingType === null) return 'type';
    if (shippingType === MblShippingType.AIR) return null;
    if (this.seaMethod() === null) return 'method';
    if (!this.savedMbl() || this.editingMbl()) return 'job';
    return 'files';
  });
  protected readonly canGoToTypeStep = computed(() => this.currentStep() !== 'type');
  protected readonly canGoToMethodStep = computed(
    () => this.shippingType() === MblShippingType.SEA && this.currentStep() !== 'method',
  );
  protected readonly canGoToJobStep = computed(
    () => this.seaMethod() !== null && this.currentStep() !== 'job',
  );
  protected readonly canGoToFilesStep = computed(
    () => this.savedMbl() !== null && this.currentStep() !== 'files',
  );

  // ── "מבנה התיק" sidebar ──────────────────────────────────────────────────────
  // A dropdown of the Job's Files plus a small grid of the chosen File's
  // container(s) — replaces the earlier nested Job → container → File tree,
  // which grew a scrollbar of its own on long cases.
  /** The File picked in the sidebar dropdown. Follows the File being edited,
   *  otherwise keeps the user's pick (falling back to the first File). */
  protected readonly treeHblId = linkedSignal<{ editing: number | null; hbls: HblDto[] }, number | null>({
    source: () => ({ editing: this.editingHblId(), hbls: this.hbls() }),
    computation: ({ editing, hbls }, previous) => {
      const candidate = editing ?? previous?.value ?? null;
      if (candidate !== null && hbls.some((hbl) => hbl.id === candidate)) return candidate;
      return hbls[0]?.id ?? null;
    },
  });
  protected readonly treeHbl = computed(() => {
    const id = this.treeHblId();
    return id === null ? null : (this.hbls().find((hbl) => hbl.id === id) ?? null);
  });
  /** The Job's containers, shown once a File is picked: every `mbl_container`
   *  row for groupage (the picked File's own one is highlighted — see
   *  `isTreeHblContainer`), otherwise the Job's single container shared by
   *  all its Files. */
  protected readonly treeContainers = computed<ContainerSummary[]>(() => {
    const mbl = this.savedMbl();
    if (!mbl || !this.treeHbl()) return [];
    if (this.isGroupage()) {
      return mbl.containers.map((container) => ({
        ...container,
        files: this.hblsForContainer(container.id),
      }));
    }
    return [
      {
        id: null,
        containerNumber: mbl.containerNumber,
        containerSealNumber: mbl.containerSealNumber,
        cargoDescription: mbl.cargoDescription,
        grossWeightKg: mbl.grossWeightKg,
        volumeCbm: mbl.volumeCbm,
        files: this.hbls(),
      },
    ];
  });
  /** The container whose details popup is open, `null` when closed. */
  protected readonly viewedContainer = signal<ContainerSummary | null>(null);

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
    // on step 1/2, or mid-wizard with no Job saved yet).
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
  }

  protected selectSeaMethod(method: SeaMethod): void {
    if (this.choicesLocked()) return;
    this.seaMethod.set(method);
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
  }

  /** Re-opens the saved Job's form (same as the tree's Job node). */
  protected goToJobStep(): void {
    if (!this.canGoToJobStep()) return;
    this.startEditMbl();
  }

  /** Leaves the Job form (discarding unsaved edits) for the Files step. */
  protected goToFilesStep(): void {
    if (!this.canGoToFilesStep()) return;
    this.showFilesStep();
  }

  /** Makes the main pane show the Files step: closes the Job form (unsaved
   *  edits discarded) and any read-only step 1/2 view. Used by every tree /
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

  /** Re-opens the already-saved Job's fields for editing — the customer picker
   *  (fcl_lcl only) is intentionally NOT re-editable here: changing it after
   *  Files already exist under the old customer would break their shared-customer
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

  protected onMblStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if ((MBL_STATUSES as readonly string[]).includes(value)) {
      this.mblStatus.set(value as MblStatus);
    }
  }

  protected cancelEditMbl(): void {
    this.editingMbl.set(false);
    this.saveError.set(null);
  }

  protected onSaveMbl(): void {
    const shippingType = this.shippingType();
    if (!shippingType || this.saving()) return;
    const seaMethod = this.seaMethod();
    const editing = this.editingMbl();
    const existingMbl = this.savedMbl();

    if (this.needsCustomer() && !editing && !this.mblCustomer()) {
      this.saveError.set('יש לבחור לקוח לפני השמירה');
      return;
    }
    if (this.isGroupage() && this.mblForm.controls.containers.length === 0) {
      this.saveError.set('יש להוסיף לפחות מכולה אחת');
      return;
    }

    this.saveError.set(null);
    this.saving.set(true);

    const { containers, ...formFields } = this.mblForm.getRawValue();
    const customerId = editing ? (existingMbl?.customerId ?? null) : (this.mblCustomer()?.id ?? null);
    const dto = toCreateMblDto(
      shippingType,
      seaMethod,
      customerId,
      this.freightTerms(),
      this.mblStatus(),
      formFields,
      containers,
    );

    const request$ =
      editing && existingMbl ? this.mblApi.update(existingMbl.id, dto) : this.mblApi.create(dto);

    request$
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mbl) => {
          this.savedMbl.set(mbl);
          this.editingMbl.set(false);
          if (!editing) {
            this.loadHbls(mbl.id);
          }
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

  /** The Files belonging to one container, in sequence order (groupage only). */
  protected hblsForContainer(containerId: number): HblDto[] {
    return this.hbls().filter((hbl) => hbl.containerId === containerId);
  }

  /** "File #3 · HBL-001 · לקוח" — the File's identity line in the sidebar
   *  dropdown and above the edit page. */
  protected hblLabel(hbl: HblDto): string {
    const parts = [`File #${hbl.sequenceNumber}`];
    if (hbl.hblNumber) parts.push(hbl.hblNumber);
    if (hbl.customerName) parts.push(hbl.customerName);
    return parts.join(' · ');
  }

  /** Whether this grid row is the container the picked File ships in. */
  protected isTreeHblContainer(container: ContainerSummary): boolean {
    const hbl = this.treeHbl();
    return hbl !== null && container.id !== null && hbl.containerId === container.id;
  }

  protected onTreeHblChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.treeHblId.set(value === '' ? null : Number(value));
  }

  /** The sidebar's "עריכת File" link — opens the picked File's edit page. */
  protected editTreeHbl(): void {
    const hbl = this.treeHbl();
    if (hbl) this.startEditHbl(hbl);
  }

  protected openContainerDetails(container: ContainerSummary): void {
    this.viewedContainer.set(container);
  }

  protected closeContainerDetails(): void {
    this.viewedContainer.set(null);
  }

  /** Picks the container for the File being created, from the form's
   *  choice-group. Switching to a *different* container clears whatever was
   *  typed so far: a File belongs to exactly one container, so half-filled
   *  data from the previous choice must not carry over. Ignored while editing
   *  an existing File (container is immutable). */
  protected selectHblContainer(containerId: number): void {
    if (this.editingHblId() !== null) return;
    this.showFilesStep();
    if (this.hblContainerId() === containerId) return;
    this.clearHblFormFields();
    this.hblContainerId.set(containerId);
  }

  /** Opens a blank form for a brand-new File — the explicit "+ הוספת File
   *  נוסף" action (or "+ יצירת File" for the first one). */
  protected openNewHblForm(): void {
    this.showFilesStep();
    this.resetHblForm();
    this.showHblForm.set(true);
  }

  /** Opens the edit page for an already-saved File (from the created-File list
   *  or the sidebar's "עריכת File" link) — `customerId`/`containerId` stay as
   *  they were. Saving or cancelling returns to the File list + "+ הוספת File". */
  protected startEditHbl(hbl: HblDto): void {
    this.showFilesStep();
    this.hblForm.patchValue(hblToFormValue(hbl));
    this.hblSelectedOrderIds.set(new Set(hbl.orders.map((order) => order.id)));
    this.hblSelectedOrders.set([]);
    this.hblSaveError.set(null);
    this.editingHblId.set(hbl.id);
    this.showOrdersPicker.set(false);
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

  protected onOrdersPicked(orders: OrderDto[]): void {
    this.hblSelectedOrders.set(orders);
    this.hblSelectedOrderIds.set(new Set(orders.map((order) => order.id)));
    this.showOrdersPicker.set(false);
  }

  protected onSaveHbl(): void {
    const mbl = this.savedMbl();
    if (!mbl || this.savingHbl()) return;
    const editingId = this.editingHblId();

    let customerId: number | null = null;
    let containerId: number | null = null;
    if (!editingId) {
      customerId = this.needsHblCustomerPicker() ? (this.hblCustomer()?.id ?? null) : mbl.customerId;
      if (customerId === null) {
        this.hblSaveError.set('יש לבחור לקוח עבור ה-File');
        return;
      }
      if (this.isGroupage()) {
        containerId = this.hblContainerId();
        if (containerId === null) {
          this.hblSaveError.set('יש לבחור מכולה עבור ה-File');
          return;
        }
      }
    }

    this.hblSaveError.set(null);
    this.savingHbl.set(true);

    const formValue = this.hblForm.getRawValue();
    const orderIds = [...this.hblSelectedOrderIds()];

    const request$ = editingId
      ? this.hblApi
          .update(editingId, toUpdateHblDto(formValue))
          .pipe(switchMap((hbl) => this.hblApi.updateOrders(hbl.id, orderIds)))
      : this.hblApi.create(toCreateHblDto(mbl.id, containerId, customerId!, formValue, orderIds));

    request$
      .pipe(finalize(() => this.savingHbl.set(false)), takeUntilDestroyed(this.destroyRef))
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
        },
        error: (error: unknown) => this.hblSaveError.set(saveHblErrorMessage(error)),
      });
  }

  private loadHbls(mblId: number): void {
    this.hblsLoading.set(true);
    this.hblApi
      .findByMblId(mblId)
      .pipe(finalize(() => this.hblsLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.hbls.set(rows),
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
    this.mblCustomer.set(null);
    this.freightTerms.set(null);
    this.mblStatus.set(MblStatus.OPEN);
    this.savedMbl.set(null);
    this.editingMbl.set(false);
    this.viewingLockedStep.set(null);
    this.saveError.set(null);
    this.saving.set(false);
    this.hbls.set([]);
    this.viewedContainer.set(null);
    this.resetHblForm();
  }

  /** Blanks the user-entered part of the File form (fields, customer, orders)
   *  while leaving the form open and the container choice untouched. */
  private clearHblFormFields(): void {
    this.hblForm.reset(EMPTY_HBL_FORM_VALUE);
    this.hblCustomer.set(null);
    this.hblSelectedOrderIds.set(new Set());
    this.hblSelectedOrders.set([]);
    this.hblSelectedOrdersLoading.set(false);
    this.showOrdersPicker.set(false);
    this.hblSaveError.set(null);
  }

  private resetHblForm(): void {
    this.clearHblFormFields();
    this.hblContainerId.set(null);
    this.savingHbl.set(false);
    this.editingHblId.set(null);
    this.showHblForm.set(false);
  }

  /** Loads an existing Job (and its Files) for editing — reached only via a
   *  double-click in "התיקים שלי" (see `NavigationService.openCaseForEdit`).
   *  Jumps straight to the Files step; there's no step 1/2 to show since the
   *  shipping type/method are already fixed. */
  private loadCaseForEdit(mblId: number): void {
    this.loadingCase.set(true);
    this.loadCaseError.set(null);
    this.mblApi
      .getById(mblId)
      .pipe(finalize(() => this.loadingCase.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mbl) => {
          this.shippingType.set(mbl.shippingType);
          this.seaMethod.set(mbl.seaMethod);
          this.savedMbl.set(mbl);
          this.isEditingExisting.set(true);
          this.loadHbls(mbl.id);
        },
        error: () => this.loadCaseError.set('טעינת התיק נכשלה'),
      });
  }

  private reset(): void {
    this.shippingType.set(null);
    this.seaMethod.set(null);
    this.isEditingExisting.set(false);
    this.loadCaseError.set(null);
    this.resetMblState();
  }
}
