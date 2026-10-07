import { ApiProperty } from '@nestjs/swagger';

/** Service-side shape of one page of results. */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Swagger base for paged responses. Generics do not survive OpenAPI export,
 * so each endpoint declares a concrete subclass that only adds a typed
 * `items` property (e.g. `PagedOrdersDto`).
 */
export abstract class PagedResponseBase {
  /** Total number of rows matching the filters (across all pages). */
  @ApiProperty({ type: 'integer', example: 137 })
  total!: number;

  /** The 1-based page that was returned. */
  @ApiProperty({ type: 'integer', example: 1 })
  page!: number;

  @ApiProperty({ type: 'integer', example: 25 })
  pageSize!: number;
}
