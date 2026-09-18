import { Injectable, signal } from '@angular/core';

/**
 * Info shown in the workspace shell's `.info-bar`. Every field is a plain
 * string (never optional/nullable) so every card can always be rendered —
 * `''` just means that field is blank right now. Flat, not a
 * `kind`-discriminated union, so each screen can contribute only the fields
 * it knows — today only the order screen sets `orderNumber` / `customerName`;
 * the shipment/case-file screen can start setting the rest (`caseNumber`,
 * `supplierName`, etc.) once it has real state of its own, without any change
 * to how this service or the template work.
 */
export interface WorkspaceContextInfo {
  orderNumber: string;
  customerName: string;
  supplierName: string;
  caseNumber: string;
  goodsDescription: string;
  transactionNumber: string;
  manifestNumber: string;
  billOfLadingNumber: string;
}

export const EMPTY_WORKSPACE_CONTEXT: WorkspaceContextInfo = {
  orderNumber: '',
  customerName: '',
  supplierName: '',
  caseNumber: '',
  goodsDescription: '',
  transactionNumber: '',
  manifestNumber: '',
  billOfLadingNumber: '',
};

/**
 * Whatever order/case a screen is currently working on, for the workspace
 * shell's info bar to display. Starts (and resets to) all-blank fields — the
 * cards are always shown, just empty. Screens push updates as the user works
 * and clear their own fields on navigation away.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceContextService {
  private readonly _context = signal<WorkspaceContextInfo>(EMPTY_WORKSPACE_CONTEXT);

  readonly context = this._context.asReadonly();

  /** Merges the given fields into the current context; fields not given are untouched. */
  set(info: Partial<WorkspaceContextInfo>): void {
    this._context.update((current) => ({ ...current, ...info }));
  }

  /** Resets every field back to blank. */
  clear(): void {
    this._context.set(EMPTY_WORKSPACE_CONTEXT);
  }
}
