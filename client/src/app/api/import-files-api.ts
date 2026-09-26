import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { ImportDocumentType } from './enums';
import type { UploadedImportFileDto } from './models';

/** Multipart field name the server reads every file from (`ImportFilesController`). */
export const IMPORT_FILES_FIELD = 'files';

/** Multipart text field naming the kind of paperwork every file in the request is (`ImportDocumentType`). */
export const IMPORT_DOCUMENT_TYPE_FIELD = 'documentType';

/**
 * Thin HTTP client over `/api/import-files`. Files are sent as
 * `multipart/form-data`; the bearer token is attached by the auth interceptor.
 */
@Injectable({ providedIn: 'root' })
export class ImportFilesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/import-files';

  /**
   * `POST /api/import-files/:accountNumber` — stores every file under
   * `storage/<accountNumber>/` on the server, keeping the original names, and
   * records each one as a `documentType` document of that case. The server
   * requires `documentType` and rejects the request without it.
   */
  uploadMultipleImportFiles(
    accountNumber: number,
    documentType: ImportDocumentType,
    files: readonly File[],
  ): Observable<UploadedImportFileDto[]> {
    const body = new FormData();
    body.append(IMPORT_DOCUMENT_TYPE_FIELD, documentType);
    for (const file of files) {
      body.append(IMPORT_FILES_FIELD, file, file.name);
    }
    return this.http.post<UploadedImportFileDto[]>(`${this.baseUrl}/${accountNumber}`, body);
  }
}
