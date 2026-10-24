import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Observable, concatMap, finalize, from, last, map, of, switchMap, toArray } from 'rxjs';

import {
  AIR_METHOD_LABELS,
  ARRIVAL_STATE_LABELS,
  AirMethod,
  DOCUMENT_STATUS_LABELS,
  MBL_STATUS_LABELS,
  MblShippingType,
  SHIPMENT_STATUSES,
  SHIPMENT_STATUS_LABELS,
  ShipmentStatus,
} from '../../../../../api/enums';
import { HblApi } from '../../../../../api/hbl-api';
import { MblApi } from '../../../../../api/mbl-api';
import type { HblDto, MblDto } from '../../../../../api/models';
import { StatusTag } from '../../../../../shared/status-tag/status-tag';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { TypedRow } from '../../../../../shared/typed-row/typed-row';
import {
  airErrorMessage,
  hawbLabel,
  toCreateHawbDto,
  toCreateMawbDto,
  toUpdateHawbDto,
  toUpdateMawbDto,
} from './air-form.mapper';
import { AirHawbForm, HawbSubmit } from './air-hawb-form/air-hawb-form';
import { AirHouseOps } from './air-house-ops/air-house-ops';
import { AirMawbForm, MawbSubmit } from './air-mawb-form/air-mawb-form';

/** What the parent wizard mirrors into the breadcrumb selection. */
export interface AirCaseState {
  mbl: MblDto | null;
  houses: HblDto[];
}

type View = 'houses' | 'hawb' | 'mawb';

const SHIPMENT_RANK: Record<ShipmentStatus, number> = {
  [ShipmentStatus.BOOKING_CONFIRMED]: 1,
  [ShipmentStatus.DEPARTED]: 2,
  [ShipmentStatus.IN_TRANSIT]: 3,
  [ShipmentStatus.ARRIVED]: 4,
};

/**
 * The air-freight branch of "יצירת תיק שילוח" (HAWB → MAWB).
 *
 * Consolidation / Back-to-back: HAWBs may be saved before any MAWB exists
 * (they wait, unassigned); creating the MAWB — or choosing an existing one —
 * links them. HAWBs that were left unassigned earlier can be pulled in from
 * the "awaiting a MAWB" list. Direct: the MAWB alone carries the importer;
 * the server keeps a hidden mirror house for orders / CCF / arrivals, which
 * is never shown as a HAWB.
 */
@Component({
  selector: 'app-air-case-flow',
  imports: [
    FormsModule,
    Button,
    InputText,
    Message,
    Select,
    TableModule,
    StatusTag,
    TypedRow,
    AirHawbForm,
    AirMawbForm,
    AirHouseOps,
  ],
  templateUrl: './air-case-flow.html',
  styleUrl: './air-case-flow.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirCaseFlow {
  private readonly mblApi = inject(MblApi);
  private readonly hblApi = inject(HblApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly airMethod = input.required<AirMethod>();
  /** An existing air MAWB to open (from "התיקים שלי"); `null` for a new case. */
  readonly editMblId = input<number | null>(null);

  /** Emitted once the first HAWB or MAWB is saved — the wizard then locks steps 1/2. */
  readonly started = output<void>();
  readonly stateChange = output<AirCaseState>();

  protected readonly AIR_METHOD_LABELS = AIR_METHOD_LABELS;
  protected readonly ARRIVAL_STATE_LABELS = ARRIVAL_STATE_LABELS;
  protected readonly DOCUMENT_STATUS_LABELS = DOCUMENT_STATUS_LABELS;
  protected readonly MBL_STATUS_LABELS = MBL_STATUS_LABELS;
  protected readonly SHIPMENT_STATUS_LABELS = SHIPMENT_STATUS_LABELS;
  protected readonly hawbLabel = hawbLabel;
  protected readonly shipmentOptions = SHIPMENT_STATUSES.map((value) => ({
    value,
    label: SHIPMENT_STATUS_LABELS[value],
  }));

  protected readonly master = signal<MblDto | null>(null);
  /** Real HAWBs of the MAWB — or, before a MAWB exists, the draft HAWBs of this session. */
  protected readonly houses = signal<HblDto[]>([]);
  protected readonly mirror = signal<HblDto | null>(null);
  protected readonly unassigned = signal<HblDto[]>([]);
  protected readonly existingMawbOptions = signal<{ value: number; label: string }[]>([]);
  protected readonly linkExistingId = signal<number | null>(null);

  protected readonly view = signal<View>('houses');
  protected readonly editingHouse = signal<HblDto | null>(null);
  protected readonly opsHouseId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly pendingShipmentStatus = signal<ShipmentStatus | null>(null);
  protected readonly shipmentReason = signal('');

  protected readonly isDirect = computed(() => this.airMethod() === AirMethod.DIRECT);
  protected readonly canAddHouse = computed(
    () => this.airMethod() !== AirMethod.BACK_TO_BACK || this.houses().length === 0,
  );
  /** Direct: orders on the hidden mirror house, edited from the MAWB form. */
  protected readonly mirrorOrderIds = computed(() => this.mirror()?.orders.map((o) => o.id) ?? []);
  protected readonly unassignedToOffer = computed(() => {
    const inCase = new Set(this.houses().map((h) => h.id));
    return this.unassigned().filter((h) => !inCase.has(h.id));
  });
  private announcedStart = false;

  constructor() {
    effect(() => {
      const id = this.editMblId();
      const method = this.airMethod();
      untracked(() => (id !== null ? this.loadCase(id) : this.startNew(method)));
    });
  }

  // ── navigation ────────────────────────────────────────────────────────────

  protected openNewHawb(): void {
    this.editingHouse.set(null);
    this.formError.set(null);
    this.view.set('hawb');
  }

  protected editHawb(house: HblDto): void {
    this.editingHouse.set(house);
    this.formError.set(null);
    this.view.set('hawb');
  }

  protected openMawbForm(): void {
    this.formError.set(null);
    this.view.set('mawb');
  }

  protected backToList(): void {
    this.editingHouse.set(null);
    this.view.set(this.isDirect() && this.master() === null ? 'mawb' : 'houses');
  }

  protected toggleOps(house: HblDto): void {
    this.opsHouseId.update((id) => (id === house.id ? null : house.id));
  }

  // ── HAWB ──────────────────────────────────────────────────────────────────

  protected onSaveHawb(submit: HawbSubmit): void {
    const editing = this.editingHouse();
    const master = this.master();
    const request$ = editing
      ? this.hblApi
          .update(editing.id, toUpdateHawbDto(submit.value, submit.dimensions))
          .pipe(switchMap((hbl) => this.hblApi.updateOrders(hbl.id, submit.orderIds)))
      : this.hblApi.create(
          toCreateHawbDto(
            master?.id ?? null,
            submit.customerId!,
            submit.value,
            submit.dimensions,
            submit.orderIds,
          ),
        );
    this.saveWith(request$, 'שמירת ה-HAWB נכשלה', (hbl) => {
      this.upsertHouse(hbl);
      this.editingHouse.set(null);
      this.view.set('houses');
      this.toast.success(master ? 'ה-HAWB נשמר' : 'ה-HAWB נשמר וממתין לשיוך ל-MAWB');
      this.announceStart();
    });
  }

  /** Brings an unassigned HAWB into this case (linked at once when a MAWB exists). */
  protected attachUnassigned(house: HblDto): void {
    if (!this.canAddHouse()) return;
    const master = this.master();
    if (!master) {
      this.upsertHouse(house);
      this.announceStart();
      return;
    }
    this.saveWith(this.hblApi.linkToMaster(house.id, master.id), 'שיוך ה-HAWB נכשל', (hbl) => {
      this.upsertHouse(hbl);
      this.unassigned.update((list) => list.filter((h) => h.id !== hbl.id));
      this.announceStart();
    });
  }

  protected onHouseChanged(updated: HblDto): void {
    if (updated.isMasterMirror) {
      this.mirror.set(updated);
      return;
    }
    const master = this.master();
    if (master && updated.mblId !== master.id) {
      // Moved to another MAWB / detached: it no longer belongs to this case.
      this.houses.update((list) => list.filter((h) => h.id !== updated.id));
      this.opsHouseId.set(null);
      this.emitState();
      if (updated.mblId === null) this.loadUnassigned();
      return;
    }
    this.upsertHouse(updated);
  }

  // ── MAWB ──────────────────────────────────────────────────────────────────

  protected onSaveMawb(submit: MawbSubmit): void {
    const master = this.master();
    const request$: Observable<MblDto> = master
      ? this.mblApi.update(master.id, toUpdateMawbDto(submit.value, submit.extras))
      : this.mblApi
          .create(toCreateMawbDto(this.airMethod(), submit.value, submit.extras))
          .pipe(switchMap((created) => this.linkDrafts(created)));
    this.saveWith(
      request$.pipe(switchMap((mbl) => this.syncMirrorOrders(mbl, submit.orderIds))),
      'שמירת ה-MAWB נכשלה',
      (mbl) => {
        this.master.set(mbl);
        this.view.set('houses');
        this.toast.success(master ? 'ה-MAWB נשמר' : 'ה-MAWB נוצר');
        this.afterMasterLoaded(mbl);
        this.announceStart();
      },
    );
  }

  /** Links the draft HAWBs of this session to an existing MAWB instead of creating one. */
  protected linkToExisting(): void {
    const id = this.linkExistingId();
    if (id === null) return;
    this.saveWith(
      this.mblApi.getById(id).pipe(switchMap((mbl) => this.linkDrafts(mbl))),
      'השיוך ל-MAWB הקיים נכשל',
      (mbl) => {
        this.master.set(mbl);
        this.linkExistingId.set(null);
        this.toast.success('ה-HAWBs שויכו ל-MAWB');
        this.afterMasterLoaded(mbl);
      },
    );
  }

  protected onShipmentStatus(value: ShipmentStatus): void {
    const master = this.master();
    if (!master || value === master.shipmentStatus) return;
    const current = master.shipmentStatus ? SHIPMENT_RANK[master.shipmentStatus] : 0;
    if (SHIPMENT_RANK[value] < current) {
      this.pendingShipmentStatus.set(value);
      this.shipmentReason.set('');
      return;
    }
    this.applyShipmentStatus(value);
  }

  protected confirmShipmentCorrection(): void {
    const value = this.pendingShipmentStatus();
    const reason = this.shipmentReason().trim();
    if (value === null || reason === '') return;
    this.applyShipmentStatus(value, reason);
  }

  protected cancelShipmentCorrection(): void {
    this.pendingShipmentStatus.set(null);
  }

  private applyShipmentStatus(value: ShipmentStatus, reason?: string): void {
    const master = this.master();
    if (!master) return;
    this.error.set(null);
    this.mblApi
      .changeShipmentStatus(master.id, value, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mbl) => {
          this.master.set(mbl);
          this.pendingShipmentStatus.set(null);
          this.emitState();
        },
        error: (err: unknown) => this.error.set(airErrorMessage('עדכון סטטוס המשלוח נכשל', err)),
      });
  }

  // ── loading ───────────────────────────────────────────────────────────────

  private startNew(method: AirMethod): void {
    this.master.set(null);
    this.houses.set([]);
    this.mirror.set(null);
    this.editingHouse.set(null);
    this.opsHouseId.set(null);
    this.announcedStart = false;
    this.view.set(method === AirMethod.DIRECT ? 'mawb' : 'hawb');
    if (method !== AirMethod.DIRECT) {
      this.loadUnassigned();
      this.loadExistingMawbs();
    }
  }

  private loadCase(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.mblApi
      .getById(id)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (mbl) => {
          this.master.set(mbl);
          this.announcedStart = true;
          this.view.set('houses');
          this.afterMasterLoaded(mbl);
        },
        error: () => this.error.set('טעינת התיק נכשלה'),
      });
  }

  /** Houses (or the Direct mirror) of a saved MAWB, plus the pick lists. */
  private afterMasterLoaded(mbl: MblDto): void {
    if (mbl.airMethod === AirMethod.DIRECT) {
      if (mbl.mirrorHblId !== null) {
        this.hblApi
          .getById(mbl.mirrorHblId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((mirror) => {
            this.mirror.set(mirror);
            this.emitState();
          });
      }
      return;
    }
    this.hblApi
      .findByMblId(mbl.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => {
        this.houses.set(list);
        this.emitState();
      });
    this.loadUnassigned();
  }

  private loadUnassigned(): void {
    this.hblApi
      .listUnassigned()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.unassigned.set(list));
  }

  private loadExistingMawbs(): void {
    this.mblApi
      .list({ limit: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) =>
        this.existingMawbOptions.set(
          list
            .filter(
              (m) => m.shippingType === MblShippingType.AIR && m.airMethod === this.airMethod(),
            )
            .map((m) => ({ value: m.id, label: `${m.mblNumber ?? 'ללא מספר'} — תיק ${m.id}` })),
        ),
      );
  }

  /** Links every draft HAWB (no MAWB yet) to `mbl`, one after another. */
  private linkDrafts(mbl: MblDto): Observable<MblDto> {
    const drafts = this.houses().filter((h) => h.mblId === null);
    if (drafts.length === 0) return of(mbl);
    return from(drafts).pipe(
      concatMap((h) => this.hblApi.linkToMaster(h.id, mbl.id)),
      toArray(),
      map(() => mbl),
    );
  }

  /** Direct: the orders chosen on the MAWB form live on its mirror house. */
  private syncMirrorOrders(mbl: MblDto, orderIds: number[] | null): Observable<MblDto> {
    if (orderIds === null || mbl.mirrorHblId === null) return of(mbl);
    return this.hblApi.updateOrders(mbl.mirrorHblId, orderIds).pipe(
      last(),
      map(() => mbl),
    );
  }

  private upsertHouse(hbl: HblDto): void {
    this.houses.update((list) => {
      const index = list.findIndex((h) => h.id === hbl.id);
      if (index === -1) return [...list, hbl];
      const next = [...list];
      next[index] = hbl;
      return next;
    });
    this.emitState();
  }

  private announceStart(): void {
    if (this.announcedStart) return;
    this.announcedStart = true;
    this.started.emit();
  }

  private emitState(): void {
    this.stateChange.emit({ mbl: this.master(), houses: this.houses() });
  }

  private saveWith<T>(request: Observable<T>, failure: string, done: (value: T) => void): void {
    this.saving.set(true);
    this.formError.set(null);
    request
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: done,
        error: (err: unknown) => this.formError.set(airErrorMessage(failure, err)),
      });
  }
}
