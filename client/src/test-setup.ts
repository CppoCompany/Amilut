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
