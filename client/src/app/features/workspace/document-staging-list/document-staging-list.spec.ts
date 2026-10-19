import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImportDocumentType } from '../../../api/enums';
import type { UploadedImportFileDto } from '../../../api/models';
import { DocumentStagingList, missingRequiredTypes, type StagedFiles } from './document-staging-list';

const TYPES = [ImportDocumentType.BILL_OF_LADING, ImportDocumentType.OTHER];

function pdf(name: string): File {
  return new File(['%PDF'], name, { type: 'application/pdf' });
}

const STORED: UploadedImportFileDto = {
  id: 9,
  documentType: ImportDocumentType.BILL_OF_LADING,
  name: 'stored.pdf',
  size: 10,
  mimeType: 'application/pdf',
} as UploadedImportFileDto;

@Component({
  imports: [DocumentStagingList],
  template: `
    <app-document-staging-list
      [documentTypes]="types"
      [requiredTypes]="required"
      [(files)]="files"
      [uploaded]="uploaded()"
      [showMissing]="showMissing()"
      [deletable]="deletable()"
      (openUploaded)="opened.set($event)"
      (deleteUploaded)="deleted.set($event)"
    />
  `,
})
class Host {
  readonly types = TYPES;
  readonly required = new Set([ImportDocumentType.BILL_OF_LADING]);
  readonly files = signal<StagedFiles>({});
  readonly uploaded = signal<UploadedImportFileDto[]>([]);
  readonly showMissing = signal(false);
  readonly opened = signal<UploadedImportFileDto | null>(null);
  readonly deletable = signal(false);
  readonly deleted = signal<UploadedImportFileDto | null>(null);
}

describe('DocumentStagingList', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function rows(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('li.doc'));
  }

  function badge(row: HTMLElement): string {
    return row.querySelector('.doc-badge')?.textContent?.trim() ?? '';
  }

  it('renders one row per type, marking only the required ones', () => {
    expect(rows().length).toBe(2);
    expect(rows()[0].querySelector('.doc__required')).toBeTruthy();
    expect(rows()[1].querySelector('.doc__required')).toBeNull();
    expect(rows().map(badge)).toEqual(['חסר', 'חסר']);
  });

  it('stages dropped files on that row and removes them again', () => {
    const drop = new Event('drop') as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [pdf('a.pdf'), pdf('b.pdf')] } });
    rows()[1].dispatchEvent(drop);
    fixture.detectChanges();

    expect(host.files()[ImportDocumentType.OTHER]?.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(badge(rows()[1])).toBe('2 קבצים');

    (rows()[1].querySelector('.icon-btn--danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.files()[ImportDocumentType.OTHER]?.map((f) => f.name)).toEqual(['b.pdf']);
    expect(badge(rows()[1])).toBe('קובץ אחד');
  });

  it('counts and lists already-uploaded files, which can be opened but not removed', () => {
    host.uploaded.set([STORED]);
    fixture.detectChanges();

    expect(badge(rows()[0])).toBe('קובץ אחד');
    const stored = rows()[0].querySelector('.doc__file--uploaded') as HTMLElement;
    expect(stored.textContent).toContain('stored.pdf');
    expect(stored.querySelector('.icon-btn--danger')).toBeNull();

    (stored.querySelector('button') as HTMLButtonElement).click();
    expect(host.opened()).toEqual(STORED);
  });

  it('offers an X on uploaded files when deletable, and emits the file on click', () => {
    host.uploaded.set([STORED]);
    host.deletable.set(true);
    fixture.detectChanges();

    const remove = rows()[0].querySelector(
      '.doc__file--uploaded .icon-btn--danger',
    ) as HTMLButtonElement;
    expect(remove.getAttribute('aria-label')).toBe('מחק את stored.pdf');
    remove.click();
    expect(host.deleted()).toEqual(STORED);
  });

  it('flags empty required rows only when asked to', () => {
    expect(fixture.nativeElement.querySelector('.doc--error')).toBeNull();
    host.showMissing.set(true);
    fixture.detectChanges();
    expect(rows()[0].classList).toContain('doc--error');
    expect(rows()[1].classList).not.toContain('doc--error');
  });

  it('missingRequiredTypes counts both staged and uploaded files', () => {
    const required = new Set([ImportDocumentType.BILL_OF_LADING, ImportDocumentType.PACKING_LIST]);
    expect(missingRequiredTypes(required, {}, [])).toEqual([
      ImportDocumentType.BILL_OF_LADING,
      ImportDocumentType.PACKING_LIST,
    ]);
    expect(
      missingRequiredTypes(required, { [ImportDocumentType.PACKING_LIST]: [pdf('p.pdf')] }, [STORED]),
    ).toEqual([]);
  });
});
