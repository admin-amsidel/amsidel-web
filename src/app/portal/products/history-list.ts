/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { HISTORY_ACTIONS, HistoryEntry } from './trade.models';

/**
 * A record's history as a timeline, newest first: what was done (made, changed, issued, paid…), what changed
 * (before → after), who did it and when. showSubject: also say which record (the activity report).
 */
@Component({
  selector: 'app-history-list',
  imports: [DatePipe],
  template: `
    @if (entries().length) {
      <ol class="tl">
        @for (h of entries(); track h.id) {
          <li [class]="'tl__i tone-' + look(h).tone">
            <span class="tl__dot"><i [class]="look(h).icon" aria-hidden="true"></i></span>
            <div class="tl__body">
              <div class="tl__head">
                <b>{{ look(h).label }}</b>
                @if (showSubject()) { <span class="subj">{{ h.subjectLabel }}{{ h.brandCode ? ' · ' + h.brandCode : '' }}</span> }
              </div>
              @if (h.details) { <p class="tl__det">{{ h.details }}</p> }
              <small class="muted">{{ h.byName ?? 'Someone' }} · {{ h.at | date: 'd MMM y, h:mm a' }}</small>
            </div>
          </li>
        }
      </ol>
    } @else {
      <p class="muted none">{{ empty() }}</p>
    }
  `,
  styles: `
    .tl { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
    .tl__i { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 10px; position: relative; padding-bottom: 14px; }
    .tl__i:not(:last-child)::before { content: ''; position: absolute; left: 14px; top: 28px; bottom: 0; width: 2px; background: var(--line); }
    .tl__dot { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: .85rem;
      background: var(--accent-soft); color: var(--brass-dark); }
    .tone-green .tl__dot { background: #e3f3ea; color: #1f7a45; }
    .tone-amber .tl__dot { background: #fdf1df; color: #b45309; }
    .tone-red .tl__dot { background: #fbe7e5; color: #b3261e; }
    .tone-grey .tl__dot { background: #eef2f6; color: var(--muted); }
    .tl__body { min-width: 0; padding-top: 4px; }
    .tl__head { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
    .subj { font-size: .84rem; color: var(--ink); }
    .tl__det { margin: 3px 0 2px; font-size: .86rem; line-height: 1.45; overflow-wrap: anywhere; }
    small { font-size: .76rem; }
    .none { margin: 0; font-size: .88rem; }
  `,
})
export class HistoryList {
  readonly entries = input<HistoryEntry[]>([]);
  readonly showSubject = input(false);
  readonly empty = input('No history yet.');

  protected look(h: HistoryEntry) {
    return HISTORY_ACTIONS[h.action] ?? { label: h.action, icon: 'pi pi-circle', tone: 'grey' as const };
  }
}
