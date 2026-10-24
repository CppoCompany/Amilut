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
import { Checkbox } from 'primeng/checkbox';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Observable, finalize, forkJoin, of } from 'rxjs';

import { AirApi } from '../../../../../../api/air-api';
import { CcfApi } from '../../../../../../api/ccf-api';
import {
  AirMethod,
  ARRIVAL_STATE_LABELS,
  CLEARANCE_STATUSES,
  CLEARANCE_STATUS_LABELS,
  ClearanceStatus,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DocumentStatus,
  MblShippingType,
  SHIPMENT_STATUS_LABELS,
  STATUS_CHANGE_SOURCE_LABELS,
  StatusEntityType,
} from '../../../../../../api/enums';
import { HblApi } from '../../../../../../api/hbl-api';
import { MblApi } from '../../../../../../api/mbl-api';
import type {
  CcfDto,
  HblArrivalDto,
  HblDto,
  HblLinkHistoryEntryDto,
  StatusHistoryEntryDto,
} from '../../../../../../api/models';
import { StatusTag } from '../../../../../../shared/status-tag/status-tag';
import { ToastService } from '../../../../../../shared/toast/toast.service';
import { TypedRow } from '../../../../../../shared/typed-row/typed-row';
import { NavigationService } from '../../../../navigation.service';
import { airErrorMessage } from '../air-form.mapper';

/** Progress order of the document / clearance tracks (mirrors the server's
 *  STATUS_RANK) — moving to a lower rank is a correction that needs a reason. */
const RANK: Record<string, number> = {
  [DocumentStatus.PENDING]: 1,
  [DocumentStatus.UNDER_REVIEW]: 2,
  [DocumentStatus.MISSING_INFORMATION]: 2,
  [DocumentStatus.APPROVED]: 3,
  [ClearanceStatus.NOT_STARTED]: 1,
  [ClearanceStatus.CLASSIFICATION]: 2,
  [ClearanceStatus.COMPLIANCE_CHECK]: 3,
  [ClearanceStatus.READY_FOR_DECLARATION]: 4,
};

interface PendingCorrection {
  track: 'document' | 'clearance';
  value: DocumentStatus | ClearanceStatus;
}

/** Labels for any status value shown in the history list. */
const STATUS_VALUE_LABELS: Record<string, string> = {
  ...SHIPMENT_STATUS_LABELS,
  ...DOCUMENT_STATUS_LABELS,
  ...CLEARANCE_STATUS_LABELS,
};

/**
 * Operations on one saved air house (a HAWB, or a Direct MAWB's mirror):
 * the document status, arrival events (partial arrivals, over-receipt only
 * as a reasoned override, voiding instead of deleting), the per-HAWB CCF and
 * its clearance status, moving the HAWB to another MAWB, and the audit
 * history. Partial arrival never blocks documents or classification.
 */
@Component({
  selector: 'app-air-house-ops',
  imports: [
    FormsModule,
    Button,
    Checkbox,
    DatePicker,
    Dialog,
    InputText,
    Message,
    Select,
    TableModule,
    StatusTag,
    TypedRow,
  ],
  templateUrl: './air-house-ops.html',
  styleUrl: './air-house-ops.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirHouseOps {
  private readonly hblApi = inject(HblApi);
  private readonly mblApi = inject(MblApi);
  private readonly ccfApi = inject(CcfApi);
  private readonly airApi = inject(AirApi);
  private readonly toast = inject(ToastService);
  private readonly nav = inject(NavigationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly house = input.required<HblDto>();
  readonly changed = output<HblDto>();

  protected readonly ARRIVAL_STATE_LABELS = ARRIVAL_STATE_LABELS;
  protected readonly STATUS_VALUE_LABELS = STATUS_VALUE_LABELS;
  protected readonly SOURCE_LABELS = STATUS_CHANGE_SOURCE_LABELS;
  protected readonly documentOptions = DOCUMENT_STATUSES.map((value) => ({
    value,
    label: DOCUMENT_STATUS_LABELS[value],
  }));
  protected readonly clearanceOptions = CLEARANCE_STATUSES.map((value) => ({
    value,
    label: CLEARANCE_STATUS_LABELS[value],
  }));

  protected readonly arrivals = signal<HblArrivalDto[]>([]);
  protected readonly ccf = signal<CcfDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  // add-arrival form
  protected readonly arrivalFlight = signal('');
  protected readonly arrivalDate = signal('');
  protected readonly arrivalPieces = signal<string>('');
  protected readonly arrivalNotes = signal('');
  protected readonly arrivalOverride = signal(false);
  protected readonly arrivalOverrideReason = signal('');

  // status correction / void / relink
  protected readonly pendingCorrection = signal<PendingCorrection | null>(null);
  protected readonly correctionReason = signal('');
  protected readonly voidTarget = signal<HblArrivalDto | null>(null);
  protected readonly voidReason = signal('');
  protected readonly relinkOptions = signal<{ value: number; label: string }[]>([]);
  protected readonly relinkTarget = signal<number | null>(null);
  protected readonly relinkReason = signal('');

  // history
  protected readonly showHistory = signal(false);
  protected readonly statusHistory = signal<StatusHistoryEntryDto[]>([]);
  protected readonly linkHistory = signal<HblLinkHistoryEntryDto[]>([]);

  protected readonly isMirror = computed(() => this.house().isMasterMirror);
  protected readonly piecesLabel = computed(() => {
    const h = this.house();
    return `${h.piecesReceived} / ${h.pieces ?? '?'} חלקים`;
  });
  protected readonly newTotalExceeds = computed(() => {
    const h = this.house();
    const adding = Number(this.arrivalPieces());
    return h.pieces !== null && adding > 0 && h.piecesReceived + adding > h.pieces;
  });
  protected readonly relinkNeedsReason = computed(() => this.house().piecesReceived > 0);

  constructor() {
    effect(() => {
      const house = this.house();
      untracked(() => this.load(house));
    });
  }

  // ── statuses ──────────────────────────────────────────────────────────────

  protected onDocumentStatus(value: DocumentStatus): void {
    this.requestStatus({ track: 'document', value }, this.house().documentStatus);
  }

  protected onClearanceStatus(value: ClearanceStatus): void {
    this.requestStatus({ track: 'clearance', value }, this.ccf()?.clearanceStatus ?? null);
  }

  protected confirmCorrection(): void {
    const pending = this.pendingCorrection();
    const reason = this.correctionReason().trim();
    if (!pending || reason === '') return;
    this.applyStatus(pending, reason);
  }

  protected cancelCorrection(): void {
    this.pendingCorrection.set(null);
    this.correctionReason.set('');
  }

  private requestStatus(change: PendingCorrection, current: string | null): void {
    if (change.value === current) return;
    if ((RANK[change.value] ?? 0) < (current ? (RANK[current] ?? 0) : 0)) {
      this.pendingCorrection.set(change);
      this.correctionReason.set('');
      return;
    }
    this.applyStatus(change);
  }

  private applyStatus(change: PendingCorrection, reason?: string): void {
    const house = this.house();
    if (change.track === 'document') {
      this.run(
        this.hblApi.changeDocumentStatus(house.id, change.value as DocumentStatus, reason),
        'עדכון סטטוס המסמכים נכשל',
        (updated) => {
          this.pendingCorrection.set(null);
          this.changed.emit(updated);
        },
      );
      return;
    }
    const ccf = this.ccf();
    if (!ccf) return;
    this.run(
      this.ccfApi.changeClearanceStatus(ccf.id, change.value as ClearanceStatus, reason),
      'עדכון סטטוס הסליקה נכשל',
      (updated) => {
        this.pendingCorrection.set(null);
        this.ccf.set(updated);
      },
    );
  }

  // ── arrivals ──────────────────────────────────────────────────────────────

  protected addArrival(): void {
    const pieces = Number(this.arrivalPieces());
    if (!this.arrivalFlight().trim() || !this.arrivalDate() || !(pieces > 0)) {
      this.error.set('יש להזין מספר טיסה, תאריך הגעה ומספר חלקים שהתקבלו');
      return;
    }
    if (
      this.newTotalExceeds() &&
      !(this.arrivalOverride() && this.arrivalOverrideReason().trim())
    ) {
      this.error.set('הכמות עולה על מספר החלקים הצפוי — נדרש אישור חריגה עם סיבה');
      return;
    }
    this.run(
      this.hblApi.addArrival(this.house().id, {
        flightNumber: this.arrivalFlight().trim(),
        arrivalDate: this.arrivalDate(),
        piecesReceived: pieces,
        notes: this.arrivalNotes().trim() || undefined,
        override: this.newTotalExceeds() ? true : undefined,
        overrideReason: this.newTotalExceeds() ? this.arrivalOverrideReason().trim() : undefined,
      }),
      'רישום ההגעה נכשל',
      (updated) => {
        this.arrivalFlight.set('');
        this.arrivalPieces.set('');
        this.arrivalNotes.set('');
        this.arrivalOverride.set(false);
        this.arrivalOverrideReason.set('');
        this.toast.success('ההגעה נרשמה');
        this.changed.emit(updated);
      },
    );
  }

  protected setArrivalPieces(value: string | number | null): void {
    this.arrivalPieces.set(value === null ? '' : String(value));
  }

  protected onVoidDialogVisible(visible: boolean): void {
    if (!visible) this.voidTarget.set(null);
  }

  protected confirmVoid(): void {
    const target = this.voidTarget();
    const reason = this.voidReason().trim();
    if (!target || reason === '') return;
    this.run(
      this.hblApi.voidArrival(this.house().id, target.id, reason),
      'ביטול הרישום נכשל',
      (updated) => {
        this.voidTarget.set(null);
        this.voidReason.set('');
        this.changed.emit(updated);
      },
    );
  }

  // ── CCF ───────────────────────────────────────────────────────────────────

  protected openCcf(): void {
    const ccf = this.ccf();
    if (ccf) {
      this.nav.openCcfForView(ccf.id);
      return;
    }
    this.run(
      this.ccfApi.create({ hblId: this.house().id }),
      'פתיחת תיק הסליקה נכשלה',
      (created) => {
        this.ccf.set(created);
        this.toast.success(`נפתח תיק סליקה ${created.fileNumber}`);
        this.changed.emit({ ...this.house(), ccfId: created.id });
      },
    );
  }

  // ── relink ────────────────────────────────────────────────────────────────

  protected relink(detach: boolean): void {
    const target = detach ? null : this.relinkTarget();
    if (!detach && target === null) return;
    const reason = this.relinkReason().trim();
    if (this.relinkNeedsReason() && reason === '') {
      this.error.set('כבר נרשמו הגעות ל-HAWB — שינוי שיוך הוא תיקון ומחייב סיבה');
      return;
    }
    this.run(
      this.hblApi.linkToMaster(this.house().id, target, reason || undefined),
      'שינוי השיוך נכשל',
      (updated) => {
        this.relinkTarget.set(null);
        this.relinkReason.set('');
        this.toast.success(detach ? 'ה-HAWB נותק מה-MAWB' : 'ה-HAWB הועבר ל-MAWB אחר');
        this.changed.emit(updated);
      },
    );
  }

  // ── history ───────────────────────────────────────────────────────────────

  protected toggleHistory(): void {
    const show = !this.showHistory();
    this.showHistory.set(show);
    if (show) this.loadHistory();
  }

  protected statusValueLabel(value: string | null): string {
    return value ? (STATUS_VALUE_LABELS[value] ?? value) : '—';
  }

  private loadHistory(): void {
    const house = this.house();
    const ccf = this.ccf();
    forkJoin({
      house: this.airApi.statusHistory(StatusEntityType.HBL, house.id),
      ccf: ccf
        ? this.airApi.statusHistory(StatusEntityType.CCF, ccf.id)
        : of<StatusHistoryEntryDto[]>([]),
      links: this.hblApi.linkHistory(house.id),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ house: h, ccf: c, links }) => {
        this.statusHistory.set([...h, ...c].sort((a, b) => b.changedAt.localeCompare(a.changedAt)));
        this.linkHistory.set(links);
      });
  }

  private load(house: HblDto): void {
    this.error.set(null);
    this.pendingCorrection.set(null);
    this.hblApi
      .listArrivals(house.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.arrivals.set(list));
    if (house.ccfId !== null) {
      this.ccfApi
        .getById(house.ccfId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((ccf) => this.ccf.set(ccf));
    } else {
      this.ccf.set(null);
    }
    if (!house.isMasterMirror) {
      this.mblApi
        .list({ limit: 200 })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((list) =>
          this.relinkOptions.set(
            list
              .filter(
                (m) =>
                  m.shippingType === MblShippingType.AIR &&
                  m.airMethod !== AirMethod.DIRECT &&
                  m.id !== house.mblId,
              )
              .map((m) => ({ value: m.id, label: `${m.mblNumber ?? 'ללא מספר'} — תיק ${m.id}` })),
          ),
        );
    }
    if (this.showHistory()) this.loadHistory();
  }

  private run<T>(request: Observable<T>, failure: string, done: (value: T) => void): void {
    this.busy.set(true);
    this.error.set(null);
    request
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: done,
        error: (err: unknown) => this.error.set(airErrorMessage(failure, err)),
      });
  }
}
