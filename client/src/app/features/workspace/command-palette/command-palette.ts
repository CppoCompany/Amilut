import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';

import { isTreeChildGroup, TreeChild, TreeEntry } from '../navigation.model';
import { NavigationService } from '../navigation.service';

interface PaletteItem {
  readonly id: string;
  readonly label: string;
  /** Parent group label, shown as context; `null` for a top-level row. */
  readonly group: string | null;
  readonly icon: string;
  readonly child: TreeChild;
}

interface ScoredItem {
  readonly item: PaletteItem;
  readonly score: number;
}

/** Every leaf of the tree, including rows hidden from the sidebar: the palette is the power user's way in. */
function flatten(tree: readonly TreeEntry[]): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const entry of tree) {
    if (isTreeChildGroup(entry)) {
      for (const child of entry.children) {
        items.push({ id: child.id, label: child.label, group: entry.label, icon: child.icon, child });
      }
    } else {
      items.push({ id: entry.id, label: entry.label, group: null, icon: entry.icon, child: entry });
    }
  }
  return items;
}

/** Lower is better; `null` when a query token matches neither label nor group. */
function score(item: PaletteItem, query: string): number | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const label = item.label.toLowerCase();
  const group = (item.group ?? '').toLowerCase();
  let total = 0;
  for (const token of tokens) {
    if (label.startsWith(token)) continue;
    if (label.includes(token)) total += 1;
    else if (group.includes(token)) total += 2;
    else return null;
  }
  return total;
}

/**
 * Ctrl+K / Cmd+K launcher: type a few letters of any screen and press Enter.
 * A PrimeNG modal dialog (focus-trapped, Escape and the mask close it) with
 * the open/close motion switched off — it is keyboard-driven and used many
 * times a day, so it must feel instant.
 */
@Component({
  selector: 'app-command-palette',
  imports: [Dialog, InputText],
  templateUrl: './command-palette.html',
  styleUrl: './command-palette.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
})
export class CommandPalette {
  private readonly nav = inject(NavigationService);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);
  protected readonly isOpen = signal(false);

  private readonly items = computed(() => flatten(this.nav.tree()));

  protected readonly results = computed<PaletteItem[]>(() => {
    const query = this.query().trim();
    const scored: ScoredItem[] = [];
    for (const item of this.items()) {
      const s = score(item, query);
      if (s !== null) scored.push({ item, score: s });
    }
    // Stable sort: ties keep sidebar order.
    return scored.sort((a, b) => a.score - b.score).map((s) => s.item);
  });

  constructor() {
    // Keep the highlighted row in view while arrowing through a long list.
    effect(() => {
      const index = this.activeIndex();
      if (!this.isOpen()) return;
      document.getElementById(`cmdk-item-${index}`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  open(): void {
    if (this.isOpen()) return;
    this.query.set('');
    this.activeIndex.set(0);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  /** The dialog finished opening — put the caret in the search box. */
  protected onShown(): void {
    this.input()?.nativeElement.focus();
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.isOpen()) this.close();
      else this.open();
    }
  }

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  protected onInputKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count) this.activeIndex.set((this.activeIndex() + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.activeIndex.set((this.activeIndex() - 1 + count) % count);
        break;
      case 'Home':
        event.preventDefault();
        this.activeIndex.set(0);
        break;
      case 'End':
        event.preventDefault();
        if (count) this.activeIndex.set(count - 1);
        break;
      case 'Enter': {
        event.preventDefault();
        const item = this.results()[this.activeIndex()];
        if (item) this.select(item);
        break;
      }
    }
  }

  protected select(item: PaletteItem): void {
    this.close();
    this.nav.selectChild(item.child);
  }
}
