import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

const PREFERRED_MENU_HEIGHT = 280;
const MIN_COMFORTABLE_HEIGHT = 160;
const MIN_MENU_HEIGHT = 96;
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

function clampHeight(available: number): number {
  return Math.max(MIN_MENU_HEIGHT, Math.min(PREFERRED_MENU_HEIGHT, available));
}

/** One choice offered by {@link MultiSelect}. */
export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * Compact multi-choice dropdown for dense tables: a `form-control`-styled
 * button that summarises the selection and opens a checkbox list. The menu
 * is `position: fixed` so it escapes scrolling table wrappers, and closes on
 * outside click, Escape, scroll or resize. Purely presentational — emits the
 * new selection (in option order) and never stores state itself.
 */
@Component({
  selector: 'app-multi-select',
  templateUrl: './multi-select.html',
  styleUrl: './multi-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
    '(window:resize)': 'close()',
  },
})
export class MultiSelect {
  readonly options = input.required<readonly MultiSelectOption[]>();
  readonly selected = input<readonly string[]>([]);
  readonly placeholder = input('בחר');
  readonly ariaLabel = input<string | null>(null);

  readonly selectedChange = output<string[]>();

  protected readonly open = signal(false);
  /**
   * Viewport placement of the fixed-positioned menu, computed when opening:
   * below the button when there is room, otherwise above it (`menuBottom`),
   * capped so it never runs off the screen.
   */
  protected readonly menuTop = signal<number | null>(null);
  protected readonly menuBottom = signal<number | null>(null);
  protected readonly menuRight = signal(0);
  protected readonly menuMinWidth = signal(0);
  protected readonly menuMaxHeight = signal(PREFERRED_MENU_HEIGHT);

  protected readonly summary = computed(() => {
    const chosen = new Set(this.selected());
    const labels = this.options()
      .filter((option) => chosen.has(option.value))
      .map((option) => option.label);
    if (labels.length === 0) return this.placeholder();
    if (labels.length === 1) return labels[0];
    return `${labels.length} נבחרו`;
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly closeOnScroll = (): void => this.close();

  constructor() {
    this.destroyRef.onDestroy(() => this.detachScrollListener());
  }

  protected isSelected(value: string): boolean {
    return this.selected().includes(value);
  }

  protected toggle(toggleButton: HTMLElement): void {
    if (this.open()) {
      this.close();
      return;
    }
    const rect = toggleButton.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN;
    if (spaceBelow >= MIN_COMFORTABLE_HEIGHT || spaceBelow >= spaceAbove) {
      this.menuTop.set(rect.bottom + MENU_GAP);
      this.menuBottom.set(null);
      this.menuMaxHeight.set(clampHeight(spaceBelow));
    } else {
      this.menuTop.set(null);
      this.menuBottom.set(window.innerHeight - rect.top + MENU_GAP);
      this.menuMaxHeight.set(clampHeight(spaceAbove));
    }
    this.menuRight.set(window.innerWidth - rect.right);
    this.menuMinWidth.set(rect.width);
    this.open.set(true);
    // Capture phase so scrolling inside any ancestor (e.g. a table wrapper) also closes the menu.
    document.addEventListener('scroll', this.closeOnScroll, true);
    // The menu is wider than the button (long labels); once rendered, pull it back inside the viewport.
    requestAnimationFrame(() => this.keepInsideViewport());
  }

  /** Shifts an open menu right when its (RTL-leading) left edge would fall off the screen. */
  private keepInsideViewport(): void {
    const menu = this.host.nativeElement.querySelector<HTMLElement>('.multi-select__menu');
    if (!menu || !this.open()) return;
    const { left } = menu.getBoundingClientRect();
    if (left < VIEWPORT_MARGIN) {
      this.menuRight.update((right) => Math.max(VIEWPORT_MARGIN, right - (VIEWPORT_MARGIN - left)));
    }
  }

  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.detachScrollListener();
  }

  protected onToggleOption(value: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    // Emit in option order so the selection is stable regardless of click order.
    this.selectedChange.emit(
      this.options()
        .map((option) => option.value)
        .filter((candidate) => next.has(candidate)),
    );
  }

  protected onDocumentClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  private detachScrollListener(): void {
    document.removeEventListener('scroll', this.closeOnScroll, true);
  }
}
