import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { ImportDocumentType } from './enums';
import type {
  InvoiceLineItemDto,
  LineItemClassificationUpdateDto,
  PagedClassificationsDto,
  SaveLineItemClassificationsDto,
  UploadedImportFileDto,
} from './models';
import type { FilingContext } from './filing-context.model';
import { PagedQueryParams, toHttpParams } from './paging';

/** Sort keys accepted by `GET /api/import-files/classifications` (whitelisted server-side). */
export type ClassificationSortKey = 'createdAt' | 'orderId' | 'ccfId' | 'item' | 'classificationCode';

/** Query parameters accepted by `GET /api/import-files/classifications` — "הסיווגים שלי". */
export interface PagedClassificationsParams extends PagedQueryParams {
  /** Only lines filed under this order. */
  orderId?: number;
  /** Only lines filed under this Customs Clearance File. */
  ccfId?: number;
  sort?: ClassificationSortKey;
}

/** Multipart field name the server reads every file from (`ImportFilesController`). */
export const IMPORT_FILES_FIELD = 'files';

/** Multipart text field naming the kind of paperwork every file in the request is (`ImportDocumentType`). */
export const IMPORT_DOCUMENT_TYPE_FIELD = 'documentType';

/** `?orderId=`/`?ccfId=` — every import-files route is scoped by exactly one. */
function contextParams(context: FilingContext): HttpParams {
  return new HttpParams().set(
    context.kind === 'order' ? 'orderId' : 'ccfId',
    String(context.id),
  );
}

/**
 * Thin HTTP client over `/api/import-files`. Every route is scoped by an
 * Order or a Customs Clearance File (`?orderId=`/`?ccfId=`), never a path
 * param. Files are sent as `multipart/form-data`; the bearer token is
 * attached by the auth interceptor.
 */
@Injectable({ providedIn: 'root' })
export class ImportFilesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/import-files';

  /**
   * `GET /api/import-files/classifications` — one page of classified
   * supplier-invoice lines across every order/CCF, filtered/sorted server-side.
   */
  listClassifications(params: PagedClassificationsParams = {}): Observable<PagedClassificationsDto> {
    return this.http.get<PagedClassificationsDto>(`${this.baseUrl}/classifications`, {
      params: toHttpParams(params),
    });
  }

  /**
   * `GET /api/import-files?orderId=|ccfId=` — the files filed under the
   * order/CCF, newest first, one per file name (a re-upload replaces the
   * older entry).
   */
  listImportFiles(context: FilingContext): Observable<UploadedImportFileDto[]> {
    return this.http.get<UploadedImportFileDto[]>(this.baseUrl, { params: contextParams(context) });
  }

  /**
   * `GET /api/import-files/files/:fileId?orderId=|ccfId=` — the bytes of one
   * filed document, typed with its stored MIME type. Fetched through
   * `HttpClient` (not a plain link) so the bearer token travels with it.
   */
  getImportFileBlob(context: FilingContext, fileId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/files/${fileId}`, {
      params: contextParams(context),
      responseType: 'blob',
    });
  }

  /**
   * `DELETE /api/import-files/files/:fileId?orderId=|ccfId=` — removes the
   * filed document (every upload of that file name in the order/CCF) and its
   * bytes on disk.
   */
  deleteImportFile(context: FilingContext, fileId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/files/${fileId}`, {
      params: contextParams(context),
    });
  }

  /**
   * `POST /api/import-files?orderId=|ccfId=` — stores every file under
   * `storage/<order-N|ccf-N>/` on the server, keeping the original names,
   * and records each one as a `documentType` document of that order/CCF.
   * The server requires `documentType` and rejects the request without it.
   */
  uploadMultipleImportFiles(
    context: FilingContext,
    documentType: ImportDocumentType,
    files: readonly File[],
  ): Observable<UploadedImportFileDto[]> {
    const body = new FormData();
    body.append(IMPORT_DOCUMENT_TYPE_FIELD, documentType);
    for (const file of files) {
      body.append(IMPORT_FILES_FIELD, file, file.name);
    }
    return this.http.post<UploadedImportFileDto[]>(this.baseUrl, body, {
      params: contextParams(context),
    });
  }

  /**
   * `GET /api/import-files/line-items?orderId=|ccfId=` — the line items the
   * server extracted from every supplier invoice filed under that order/CCF.
   */
  getSupplierInvoiceLineItems(context: FilingContext): Observable<InvoiceLineItemDto[]> {
    return this.http.get<InvoiceLineItemDto[]>(`${this.baseUrl}/line-items`, {
      params: contextParams(context),
    });
  }

  /**
   * `PUT /api/import-files/line-items/classification?orderId=|ccfId=` —
   * records the classification screen's columns against the stored
   * supplier-invoice lines (`fileId` + `lineIndex` from the GET above) and
   * returns the refreshed line list.
   */
  saveLineItemClassifications(
    context: FilingContext,
    items: readonly LineItemClassificationUpdateDto[],
  ): Observable<InvoiceLineItemDto[]> {
    const body: SaveLineItemClassificationsDto = { items: [...items] };
    return this.http.put<InvoiceLineItemDto[]>(
      `${this.baseUrl}/line-items/classification`,
      body,
      { params: contextParams(context) },
    );
  }
}
