import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { UploadedImportFileDto } from './models';

/** Multipart field name the server reads every file from (`ImportFilesController`). */
export const IMPORT_FILES_FIELD = 'files';

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
   * `storage/<accountNumber>/` on the server, keeping the original names.
   */
  uploadMultipleImportFiles(
    accountNumber: number,
    files: readonly File[],
  ): Observable<UploadedImportFileDto[]> {
    const body = new FormData();
    for (const file of files) {
      body.append(IMPORT_FILES_FIELD, file, file.name);
    }
    return this.http.post<UploadedImportFileDto[]>(`${this.baseUrl}/${accountNumber}`, body);
  }
}
