// Unit-test environment shims (wired via angular.json → test.options.setupFiles).
// jsdom has no matchMedia; PrimeNG's dialog and overlays query it for their
// responsive breakpoints.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom has no ResizeObserver either; PrimeNG's tab list observes its own size
// to position the active-tab ink bar.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// …nor Element.scrollTo, which PrimeNG's virtual scroller calls to jump to a row.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => undefined;
}
