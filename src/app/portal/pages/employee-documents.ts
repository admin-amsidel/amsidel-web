/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { DocumentsService, DocumentType, EmployeeDocument, MAX_DOCUMENT_BYTES } from '../documents.service';
import { apiProblem } from '../portal.models';

const ICONS: Record<DocumentType, string> = {
  PAN_CARD: 'pi-id-card', AADHAAR_CARD: 'pi-id-card', BANK_PROOF: 'pi-building-columns', OFFER_LETTER: 'pi-file', PASSPORT_PHOTO: 'pi-user',
};

/**
 * An employee's documents: PAN card, Aadhaar card, bank statement / passbook, offer letter and passport size photo,
 * each a PDF or a photo / scan up to 2 MB (the passport size photo an image). Upload, replace, open and delete.
 * Without an employeeId: my own (My profile); with one: that employee's (owners and admins, on the employee page).
 */
@Component({
  selector: 'app-employee-documents',
  imports: [DatePipe, ButtonModule, MessageModule, TagModule],
  template: `
    <section class="p-card">
      <h2>{{ employeeId() ? 'Documents' : 'My documents' }}</h2>
      <p class="p-intro">PDF, JPG or PNG, up to 2 MB each. Only {{ employeeId() ? 'the employee' : 'you' }}, and the owners and admins who manage
        {{ employeeId() ? 'them' : 'you' }}, can see these.</p>
      <input #file type="file" class="visually-hidden" tabindex="-1" aria-hidden="true" [accept]="accept()" (change)="pick($event)" />
      @if (error()) { <p-message severity="error" styleClass="msg">{{ error() }}</p-message> }
      <ul class="docs">
        @for (d of docs(); track d.type) {
          <li [class.done]="d.uploaded">
            <span class="ico" aria-hidden="true"><i [class]="'pi ' + icon(d.type)"></i></span>
            <div class="what">
              <b>{{ d.label }}</b>
              @if (d.uploaded) {
                <small class="muted">{{ d.fileName }} · {{ kb(d.sizeBytes) }} · {{ d.uploadedAt | date: 'd MMM y' }}{{ d.uploadedByName ? ' by ' + d.uploadedByName : '' }}</small>
              } @else {
                <small class="muted">{{ d.imageOnly ? 'JPG or PNG photo' : 'PDF, JPG or PNG' }}, up to 2 MB</small>
              }
            </div>
            <p-tag [value]="d.uploaded ? 'Uploaded' : 'Missing'" [severity]="d.uploaded ? 'success' : 'warn'" styleClass="state" />
            <div class="acts">
              @if (d.uploaded) {
                <p-button icon="pi pi-eye" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Open ' + d.label" (onClick)="view(d)" />
              }
              <p-button size="small" [outlined]="true" [icon]="d.uploaded ? 'pi pi-refresh' : 'pi pi-upload'" [label]="d.uploaded ? 'Replace' : 'Upload'"
                        [loading]="busy() === d.type" [disabled]="!!busy()" (onClick)="choose(d, file)" />
              @if (d.uploaded) {
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete ' + d.label"
                          [disabled]="!!busy()" (onClick)="remove(d)" />
              }
            </div>
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    .docs { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 12px;
      padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
    li.done { background: #f6fbf7; border-color: #cfe9d7; }
    .ico { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-soft); color: var(--brass-dark); }
    li.done .ico { background: #dff3e6; color: #1f7a45; }
    .what { display: grid; gap: 2px; min-width: 0; }
    .what small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .acts { display: flex; align-items: center; gap: 4px; justify-content: flex-end; }
    :host ::ng-deep .state { font-size: .7rem; }
    :host ::ng-deep .msg { margin-bottom: 10px; }
    @media (max-width: 640px) {
      li { grid-template-columns: auto minmax(0, 1fr) auto; }
      .acts { grid-column: 1 / -1; justify-content: flex-start; }
      .what small { white-space: normal; }
    }
  `,
})
export class EmployeeDocuments {
  private readonly documents = inject(DocumentsService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

  /** null = my own. */
  readonly employeeId = input<number | null>(null);
  /** A document was uploaded, replaced or deleted (the profile completion changes). */
  readonly changed = output<void>();

  protected readonly docs = signal<EmployeeDocument[]>([]);
  protected readonly error = signal('');
  /** The type being uploaded. */
  protected readonly busy = signal<DocumentType | null>(null);
  protected readonly accept = signal('application/pdf,image/jpeg,image/png');
  private target: EmployeeDocument | null = null;

  constructor() {
    effect(() => {
      const id = this.employeeId();
      untracked(() => this.load(id));
    });
  }

  protected icon(t: DocumentType): string {
    return ICONS[t];
  }

  protected kb(bytes: number | null): string {
    const b = bytes ?? 0;
    return b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  }

  protected choose(d: EmployeeDocument, field: HTMLInputElement): void {
    this.target = d;
    this.accept.set(d.imageOnly ? 'image/jpeg,image/png' : 'application/pdf,image/jpeg,image/png');
    // the accept list must be on the field before the picker opens
    field.accept = this.accept();
    field.click();
  }

  protected pick(event: Event): void {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    field.value = ''; // picking the same file again still fires (change)
    const d = this.target;
    if (!file || !d) return;
    this.error.set('');
    if (file.size > MAX_DOCUMENT_BYTES) {
      this.error.set(`${d.label}: the file is ${this.kb(file.size)}; it must be 2 MB or smaller.`);
      return;
    }
    this.busy.set(d.type);
    this.documents.upload(this.employeeId(), d.type, file).subscribe({
      next: (saved) => {
        this.busy.set(null);
        this.docs.update((ds) => ds.map((x) => (x.type === saved.type ? saved : x)));
        this.toast.add({ severity: 'success', summary: d.uploaded ? 'Document replaced' : 'Document uploaded', detail: d.label });
        this.changed.emit();
      },
      error: (e) => {
        this.busy.set(null);
        this.error.set(`${d.label}: ${apiProblem(e).message}`);
      },
    });
  }

  /** Opens in a new tab; the tab is opened at once (pop-up blockers allow that), then given the file. */
  protected view(d: EmployeeDocument): void {
    const tab = window.open('', '_blank');
    this.documents.file(this.employeeId(), d.type).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        if (tab) {
          tab.location.href = url;
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = d.fileName ?? d.label;
          a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e) => {
        tab?.close();
        this.error.set(`${d.label}: ${apiProblem(e).message}`);
      },
    });
  }

  protected remove(d: EmployeeDocument): void {
    this.confirm.confirm({
      header: 'Delete document',
      message: `Delete the ${d.label.toLowerCase()} (${d.fileName})?`,
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.documents.remove(this.employeeId(), d.type).subscribe({
        next: () => {
          this.docs.update((ds) => ds.map((x) => (x.type === d.type
            ? { ...x, uploaded: false, fileName: null, contentType: null, sizeBytes: null, uploadedAt: null, uploadedByName: null } : x)));
          this.toast.add({ severity: 'success', summary: 'Document deleted', detail: d.label });
          this.changed.emit();
        },
        error: (e) => this.error.set(`${d.label}: ${apiProblem(e).message}`),
      }),
    });
  }

  private load(id: number | null): void {
    this.error.set('');
    this.documents.list(id).subscribe({ next: (d) => this.docs.set(d), error: (e) => this.error.set(apiProblem(e).message) });
  }
}
