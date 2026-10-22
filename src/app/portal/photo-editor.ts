import { Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Avatar } from './avatar';
import { PhotoService, prepareProfilePhoto } from './photo.service';
import { apiProblem, Employee } from './portal.models';

/** The person's photo with "Change photo" / "Remove", used on My profile and on an admin's employee page. */
@Component({
  selector: 'app-photo-editor',
  imports: [Avatar, ButtonModule],
  template: `
    <app-avatar [name]="employee().name" [employeeId]="employee().id" [photoVersion]="employee().photoUpdatedAt"
                [photoPath]="employee().photoPath" [size]="size()" />
    <div class="side">
      <input #file type="file" accept="image/*" class="visually-hidden" tabindex="-1" aria-hidden="true" (change)="pick($event)" />
      <div class="actions">
        <p-button size="small" [outlined]="true" icon="pi pi-camera" [loading]="busy()"
                  [label]="busy() ? 'Saving…' : employee().photoUpdatedAt ? 'Change photo' : 'Upload photo'"
                  (onClick)="fileInput().nativeElement.click()" />
        @if (employee().photoUpdatedAt && !busy()) {
          <p-button size="small" [text]="true" severity="danger" label="Remove" (onClick)="remove()" />
        }
      </div>
      @if (error()) {
        <small class="msg msg--err" role="alert">{{ error() }}</small>
      } @else {
        <small class="msg">JPG, PNG or WebP. Cropped to a square from the centre.</small>
      }
    </div>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    :host(.stacked) { flex-direction: column; align-items: center; text-align: center; gap: 12px; }
    :host(.stacked) .actions { justify-content: center; }
    .side { display: grid; gap: 6px; min-width: 0; }
    .actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .msg { font-size: .78rem; color: var(--muted); max-width: 32ch; }
    .msg--err { color: #b3261e; }
  `,
})
export class PhotoEditor {
  private readonly photos = inject(PhotoService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

  readonly employee = input.required<Employee>();
  readonly size = input(104);
  /** The employee as saved, with the new photoUpdatedAt. */
  readonly changed = output<Employee>();

  protected readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('file');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async pick(event: Event): Promise<void> {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    field.value = ''; // picking the same file again still fires (change)
    if (!file) return;

    this.error.set('');
    this.busy.set(true);
    try {
      const photo = await prepareProfilePhoto(file);
      this.photos.upload(this.employee().id, photo).subscribe({
        next: (e) => this.done(e, 'Photo updated'),
        error: (err) => this.fail(apiProblem(err).message),
      });
    } catch (e) {
      this.fail((e as Error).message);
    }
  }

  protected remove(): void {
    this.confirm.confirm({
      header: 'Remove photo',
      message: `Remove the photo of ${this.employee().name}?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () => {
        this.error.set('');
        this.busy.set(true);
        this.photos.remove(this.employee().id).subscribe({
          next: (e) => this.done(e, 'Photo removed'),
          error: (err) => this.fail(apiProblem(err).message),
        });
      },
    });
  }

  private done(e: Employee, summary: string): void {
    this.busy.set(false);
    this.toast.add({ severity: 'success', summary });
    this.changed.emit(e);
  }

  private fail(message: string): void {
    this.busy.set(false);
    this.error.set(message);
  }
}
