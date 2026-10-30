/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { AvatarModule } from 'primeng/avatar';
import { PhotoService } from './photo.service';
import { initials } from './portal.models';

/**
 * Staff photo as a PrimeNG Avatar: the photo uploaded in the portal (when photoVersion is set), else a file in
 * public/users/ (photoPath), else the person's initials. Initials also show while loading or when a photo fails.
 */
@Component({
  selector: 'app-avatar',
  imports: [AvatarModule],
  template: `
    @if (src() && !failed()) {
      <p-avatar [image]="src()!" shape="circle" styleClass="am-avatar" [ariaLabel]="name()" (onImageError)="failed.set(true)" />
    } @else {
      <p-avatar [label]="letters()" shape="circle" styleClass="am-avatar am-avatar--initials" [ariaLabel]="name()" />
    }
  `,
  styles: `
    :host { display: inline-flex; flex: none; width: var(--size); height: var(--size); }
    :host ::ng-deep .am-avatar {
      width: var(--size); height: var(--size); border: 1.5px solid var(--brass); overflow: hidden;
      background: radial-gradient(circle at 32% 28%, #fff 0%, var(--soft) 60%, #dbe9f7 100%);
    }
    :host ::ng-deep .am-avatar img { width: 100%; height: 100%; object-fit: cover; }
    :host ::ng-deep .am-avatar--initials .p-avatar-label {
      color: var(--brass-dark); font: 600 calc(var(--size) * .36) / 1 var(--display); letter-spacing: .04em;
    }
  `,
  host: { '[style.--size.px]': 'size()' },
})
export class Avatar {
  private readonly photos = inject(PhotoService);

  readonly name = input.required<string>();
  readonly employeeId = input<number | null>(null);
  readonly photoVersion = input<string | null>(null);
  readonly photoPath = input<string | null>(null);
  readonly size = input(40);

  private readonly uploaded = signal<string | null>(null);
  protected readonly src = computed(() => (this.photoVersion() ? this.uploaded() : this.photoPath()));
  protected readonly letters = computed(() => initials(this.name()));
  /** Resets when a different photo is shown. */
  protected readonly failed = linkedSignal({ source: this.src, computation: () => false });

  constructor() {
    effect((onCleanup) => {
      const id = this.employeeId();
      const version = this.photoVersion();
      this.uploaded.set(null);
      if (id == null || !version) return;
      const sub = this.photos.url(id, version).subscribe((url) => this.uploaded.set(url));
      onCleanup(() => sub.unsubscribe());
    });
  }
}
