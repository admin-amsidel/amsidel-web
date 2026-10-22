import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { DialogModule } from 'primeng/dialog';
import { AttendanceService } from './attendance.service';

/** A check-in photo thumbnail (loaded with the login token); clicking it shows the photo large. */
@Component({
  selector: 'app-attendance-photo',
  imports: [AsyncPipe, DialogModule],
  template: `
    @if (url$ | async; as url) {
      <button type="button" class="thumb" [style.width.px]="size()" [style.height.px]="size()"
              [attr.aria-label]="'Check-in photo of ' + label()" (click)="open.set(true)">
        <img [src]="url" alt="" />
      </button>
      <p-dialog [header]="label()" [modal]="true" [visible]="open()" (visibleChange)="open.set($event)" [dismissableMask]="true"
                [style]="{ width: '560px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
        <img class="big" [src]="url" [alt]="'Check-in photo of ' + label()" />
      </p-dialog>
    } @else {
      <span class="thumb none" [style.width.px]="size()" [style.height.px]="size()" aria-label="No photo"><i class="pi pi-camera"></i></span>
    }
  `,
  styles: `
    :host { display: inline-block; line-height: 0; }
    .thumb { padding: 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--soft); cursor: zoom-in; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .thumb.none { display: inline-grid; place-items: center; color: var(--muted); cursor: default; }
    .big { width: 100%; height: auto; border-radius: 6px; }
  `,
})
export class AttendancePhoto {
  private readonly service = inject(AttendanceService);
  readonly attendanceId = input.required<number>();
  readonly name = input('');
  readonly when = input('');
  readonly size = input(44);
  protected readonly open = signal(false);
  protected readonly label = computed(() => [this.name(), this.when()].filter(Boolean).join(' · '));
  protected readonly url$ = toObservable(this.attendanceId).pipe(switchMap((id) => this.service.photoUrl(id)));
}
