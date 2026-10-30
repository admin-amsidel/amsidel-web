/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { apiProblem } from '../portal.models';
import { AttendanceService } from './attendance.service';
import { AttendancePhoto } from './attendance-photo';
import { AttendanceRecord, FLAG_LABELS, IST, LocationFlag, mapLink, MODE_LABELS, worked } from './attendance.models';

/** A day's entries one under the other: each visit's place, times, locations, note and photo; owners may delete one. */
@Component({
  selector: 'app-attendance-entries',
  imports: [DatePipe, ButtonModule, TagModule, AttendancePhoto],
  template: `
    <ol class="entries">
      @for (e of entries(); track e.id) {
        <li class="entry" [class.open]="!e.checkOut">
          <app-attendance-photo [attendanceId]="e.id" [hasPhoto]="e.hasPhoto" [name]="e.name" [when]="(e.checkIn.at | date: 'd MMM, hh:mm a' : IST) ?? ''" [size]="44" />
          <div class="entry__main">
            <div class="entry__top">
              <b>{{ e.place || modeLabels[e.workMode] }}</b>
              @if (e.place) { <span class="muted">· {{ modeLabels[e.workMode] }}</span> }
              @if (!e.checkOut) { <p-tag value="Open" severity="success" /> }
            </div>
            <div class="entry__times">
              {{ e.checkIn.at | date: 'hh:mm a' : IST }} – {{ e.checkOut ? (e.checkOut.at | date: 'hh:mm a' : IST) : 'now' }}
              @if (e.checkOut) { <span class="muted">· {{ worked(e.workedMinutes) }}</span> }
            </div>
            <div class="entry__where">
              @if (mapLink(e.checkIn); as link) {
                <a [href]="link" target="_blank" rel="noopener"><i class="pi pi-map-marker" aria-hidden="true"></i> In</a>
                <span class="muted">± {{ e.checkIn.accuracy ?? '?' }} m</span>
              }
              @if (e.checkOut && mapLink(e.checkOut); as link) {
                <a [href]="link" target="_blank" rel="noopener"><i class="pi pi-flag" aria-hidden="true"></i> Out</a>
              }
              @for (f of e.checkIn.flags; track f) { <p-tag [value]="'In: ' + flagLabels[f]" severity="warn" /> }
              @for (f of e.checkOut?.flags ?? []; track f) { <p-tag [value]="'Out: ' + flagLabels[f]" severity="warn" /> }
            </div>
            @if (e.note) { <p class="entry__note"><i class="pi pi-comment" aria-hidden="true"></i> {{ e.note }}</p> }
          </div>
          @if (canDelete()) {
            <p-button icon="pi pi-trash" severity="danger" [text]="true" [rounded]="true" size="small" title="Delete this attendance"
                      [ariaLabel]="'Delete attendance of ' + e.name + ', ' + ((e.checkIn.at | date: 'd MMM, hh:mm a' : IST) ?? '')" (onClick)="remove(e)" />
          }
        </li>
      }
    </ol>
  `,
  styles: `
    .entries { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .entry { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); }
    .entry.open { border-color: #9fd3b3; background: #f4fbf6; }
    .entry__main { min-width: 0; flex: 1; display: grid; gap: 3px; font-size: .88rem; }
    .entry__top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .entry__times { font-variant-numeric: tabular-nums; }
    .entry__where { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
    .entry__where a { color: var(--brass-dark); font-weight: 600; text-decoration: none; }
    .entry__note { margin: 2px 0 0; color: var(--ink); white-space: pre-line; overflow-wrap: anywhere; }
    .entry__note i { font-size: .78rem; color: var(--muted); margin-right: 4px; }
    .muted { color: var(--muted); }
  `,
})
export class AttendanceEntries {
  private readonly service = inject(AttendanceService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  readonly entries = input.required<AttendanceRecord[]>();
  /** Owners: a delete button on each entry. */
  readonly canDelete = input(false);
  /** An entry was deleted: the page loads the day again. */
  readonly deleted = output<AttendanceRecord>();
  protected readonly IST = IST;
  protected readonly modeLabels: Record<string, string> = MODE_LABELS;
  protected readonly flagLabels: Record<LocationFlag, string> = FLAG_LABELS;
  protected readonly worked = worked;
  protected readonly mapLink = mapLink;

  protected remove(e: AttendanceRecord): void {
    const when = new Date(e.checkIn.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    this.confirm.confirm({
      header: 'Delete attendance', icon: 'pi pi-trash',
      message: `Delete ${e.name}'s ${e.place ? 'visit to ' + e.place : MODE_LABELS[e.workMode].toLowerCase() + ' check-in'} of ${when}${e.hasPhoto ? ', with its photo' : ''}? This cannot be undone.`,
      acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.service.deleteEntry(e.id).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Attendance deleted', detail: `${e.name} · ${when}` });
          this.deleted.emit(e);
        },
        error: (err) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(err).message }),
      }),
    });
  }
}
