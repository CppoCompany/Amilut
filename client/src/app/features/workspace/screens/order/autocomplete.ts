import { computed, Signal, signal } from '@angular/core';

/**
 * Client-side suggestion list for a free-text input (shipping line / airline).
 * The text itself lives in a reactive form control; this helper only derives
 * the matching suggestions from a `query` signal and tracks list visibility.
 */
export class Autocomplete {
  /** Whether the suggestion list is visible. */
  readonly open = signal(false);

  /** Suggestions matching the current query (empty when the query is blank). */
  readonly matches: Signal<string[]>;

  constructor(
    private readonly source: readonly string[],
    query: Signal<string>,
  ) {
    this.matches = computed(() => {
      const q = query().trim().toLowerCase();
      if (!q) return [];
      return this.source.filter((item) => item.toLowerCase().includes(q));
    });
  }

  /** Handle typing: open the list when there are matches. */
  onInput(): void {
    this.open.set(this.matches().length > 0);
  }

  /** Close the suggestion list (after picking a suggestion, on blur, on reset). */
  close(): void {
    this.open.set(false);
  }
}
