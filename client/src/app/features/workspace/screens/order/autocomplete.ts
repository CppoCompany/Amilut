import { computed, Signal, signal } from '@angular/core';

/**
 * Small reactive helper backing a text input with a filtered suggestion list —
 * the signal-based equivalent of the mock's `setupAutocomplete()`.
 */
export class Autocomplete {
  /** Current text in the input. */
  readonly query = signal('');

  /** Whether the suggestion list is visible. */
  readonly open = signal(false);

  /** Suggestions matching the current query (empty when the query is blank). */
  readonly matches: Signal<string[]>;

  constructor(private readonly source: readonly string[]) {
    this.matches = computed(() => {
      const q = this.query().trim().toLowerCase();
      if (!q) return [];
      return this.source.filter((item) => item.toLowerCase().includes(q));
    });
  }

  /** Handle typing: update the query and open the list when there are matches. */
  onInput(value: string): void {
    this.query.set(value);
    this.open.set(this.matches().length > 0);
  }

  /** Pick a suggestion and close the list. */
  select(value: string): void {
    this.query.set(value);
    this.open.set(false);
  }

  /** Close the suggestion list (e.g. on blur/outside click). */
  close(): void {
    this.open.set(false);
  }
}
