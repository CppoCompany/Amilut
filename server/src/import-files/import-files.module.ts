import { Module } from '@nestjs/common';
import { ImportFilesController } from './import-files.controller';
import {
  IMPORT_FILES_STORAGE_DIR,
  ImportFilesService,
  defaultStorageDir,
} from './import-files.service';

/** File uploads for "תיוק ניירת יבוא" — stored on disk, no database table. */
@Module({
  controllers: [ImportFilesController],
  providers: [
    { provide: IMPORT_FILES_STORAGE_DIR, useFactory: defaultStorageDir },
    ImportFilesService,
  ],
  exports: [ImportFilesService],
})
export class ImportFilesModule {}
