import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { AttendancePhoto } from './attendance-photo';
import { AttendanceRecord, FLAG_LABELS, IST, LocationFlag, mapLink, MODE_LABELS, worked } from './attendance.models';

/** A day's entries one under the other: each visit's place, times, locations, note and photo. */
@Component({
  selector: 'app-attendance-entries',
  imports: [DatePipe, TagModule, AttendancePhoto],
  template: `
    <ol class="entries">
      @for (e of entries(); track e.id) {
        <li class="entry" [class.open]="!e.checkOut">
          <app-attendance-photo [attendanceId]="e.id" [name]="e.name" [when]="(e.checkIn.at | date: 'd MMM, hh:mm a' : IST) ?? ''" [size]="44" />
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
  readonly entries = input.required<AttendanceRecord[]>();
  protected readonly IST = IST;
  protected readonly modeLabels: Record<string, string> = MODE_LABELS;
  protected readonly flagLabels: Record<LocationFlag, string> = FLAG_LABELS;
  protected readonly worked = worked;
  protected readonly mapLink = mapLink;
}
