import { vi } from 'vitest';

/** Box metrics PrimeNG's scroller `parseFloat`s — jsdom leaves them `''` (NaN). */
const BOX_METRIC = /^(padding|margin|border)(Top|Right|Bottom|Left)(Width)?$/;

/**
 * jsdom has no layout, so PrimeNG's virtual scroller (`p-table
 * [virtualScroll]`) never sees itself as visible and renders no rows. Give
 * every element an offset parent, a size and zero padding/borders so it does;
 * call in `beforeEach` (before creating the fixture) and undo with
 * `vi.restoreAllMocks()`. The scroller lays its rows out on a timer, so wait
 * a macrotask before reading them.
 */
export function stubLayoutForVirtualScroll(size = 1000): void {
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(size);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(size);

  const realGetComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = realGetComputedStyle(element, pseudo);
    return new Proxy(style, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property, target);
        if (typeof value === 'function') return value.bind(target);
        if (value === '' && typeof property === 'string' && BOX_METRIC.test(property)) return '0px';
        return value;
      },
    });
  });
}
