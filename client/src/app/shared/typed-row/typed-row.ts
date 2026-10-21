import { Directive, input } from '@angular/core';

/** Template context PrimeNG passes to a `p-table` body/row template. */
export interface TypedRowContext<T> {
  $implicit: T;
  rowIndex: number;
}

/**
 * Types the row variable of a PrimeNG table template, which strict templates
 * otherwise see as `any`: `<ng-template #body let-order [rowOf]="orders()">`
 * makes `order` the array's element type. Purely a compile-time guard.
 */
@Directive({ selector: 'ng-template[rowOf]' })
export class TypedRow<T> {
  readonly rowOf = input.required<readonly T[] | null | undefined>();

  static ngTemplateContextGuard<T>(_dir: TypedRow<T>, ctx: unknown): ctx is TypedRowContext<T> {
    return true;
  }
}
