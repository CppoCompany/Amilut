import { Module } from '@nestjs/common';
import { ImportFilesController } from './import-files.controller';
import {
  IMPORT_FILES_STORAGE_DIR,
  ImportFilesService,
  defaultStorageDir,
} from './import-files.service';
import { InvoiceExtractorService } from './invoice-extraction/invoice-extractor.service';

/**
 * File uploads for "תיוק ניירת יבוא" — bytes stored on disk, one
 * `import_account_files` row per file. `DatabaseService` comes from the
 * global `DatabaseModule`, so nothing needs importing here.
 */
@Module({
  controllers: [ImportFilesController],
  providers: [
    { provide: IMPORT_FILES_STORAGE_DIR, useFactory: defaultStorageDir },
    InvoiceExtractorService,
    ImportFilesService,
  ],
  exports: [ImportFilesService],
})
export class ImportFilesModule {}
