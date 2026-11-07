/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';
import { AuthService } from '../auth.service';
import { apiProblem } from '../portal.models';
import { zoneDateTime } from '../portal-time';
import { ExcelTable } from '../excel-export';

interface ActiveUser {
  id: number;
  name: string;
  empNumber: string | null;
  brandCode: string | null;
  signedInAt: string;
  expiresAt: string;
  /** Their brand's: their times are shown in it. */
  timeZone: string;
}

interface ActiveUsers {
  count: number;
  maxMinutes: number;
  at: string;
  people: ActiveUser[];
}

/**
 * The Overview's Active users section: just how many are signed in now, in one line. Who they are opens in a popup, and is
 * only asked for then, so the Overview stays short and loads no one's details.
 */
@Component({
  selector: 'app-active-users-card',
  imports: [ExcelTable, FormsModule, ButtonModule, DialogModule, InputTextModule, MessageModule, SkeletonModule, TableModule],
  template: `
    <section class="p-card card" aria-label="Active users">
      <span class="title"><i class="pi pi-users" aria-hidden="true"></i> Active users</span>
      @if (v(); as a) {
        <b class="n">{{ a.count }}</b>
        <small class="muted grow">{{ a.count === 1 ? 'person' : 'people' }} signed in now</small>
        @if (a.count) { <p-button label="View employees" icon="pi pi-list" [outlined]="true" size="small" (onClick)="openList()" /> }
      } @else if (failed()) {
        <small class="muted grow">Could not load the count.</small>
      } @else {
        <span class="grow" role="status" aria-label="Loading active users"><p-skeleton width="120px" height="20px" /></span>
      }
      <p-button icon="pi pi-refresh" [text]="true" [rounded]="true" size="small" ariaLabel="Refresh active users" (onClick)="load()" />
    </section>

    <p-dialog [visible]="open()" (visibleChange)="!$event && open.set(false)" [modal]="true" [draggable]="false" [style]="{ width: '680px' }" [breakpoints]="{ '720px': 'calc(100vw - 16px)' }"
              [header]="'Active users' + (list() ? ' (' + list()!.count + ')' : '')">
      @if (listError()) { <p-message severity="error">{{ listError() }}</p-message> }
      @if (list(); as a) {
        <input pInputText type="search" class="find" placeholder="Search name, employee number or brand" aria-label="Search active users" [ngModel]="query()" (ngModelChange)="query.set($event)" />
        <p-table appExcel="Active users" [value]="shown()" dataKey="id" styleClass="p-stack" [paginator]="shown().length > 10" [rows]="10">
          <ng-template #header><tr><th>Employee</th><th>Brand</th><th>Signed in</th><th>Session ends</th></tr></ng-template>
          <ng-template #body let-p>
            <tr>
              <td data-label="Employee" class="stack-full"><b>{{ p.name }}</b>@if (p.empNumber && p.empNumber !== p.name) { <small class="muted block">{{ p.empNumber }}</small> }</td>
              <td data-label="Brand">{{ p.brandCode || 'Group' }}</td>
              <td data-label="Signed in" class="nowrap">{{ when(p.signedInAt, p.timeZone) }}</td>
              <td data-label="Session ends" class="nowrap">{{ when(p.expiresAt, p.timeZone) }}</td>
            </tr>
          </ng-template>
          <ng-template #emptymessage><tr><td colspan="4" class="p-empty">{{ query().trim() ? 'No one matches.' : 'No one is signed in now.' }}</td></tr></ng-template>
        </p-table>
        <small class="muted foot">A sign-in lasts {{ a.maxMinutes }} minutes. Someone who closed the browser without signing out counts until then. Times are in each person's brand time zone. As of {{ when(a.at, auth.zone()) }}.</small>
      } @else if (!listError()) {
        <div role="status" aria-label="Loading the list"><p-skeleton height="120px" /></div>
      }
    </p-dialog>
  `,
  styles: `
    .card { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; padding-top: 12px; padding-bottom: 12px; }
    .title { font-weight: 600; font-size: 1.05rem; }
    .title i { margin-right: 4px; }
    .n { font-size: 1.4rem; font-variant-numeric: tabular-nums; margin-left: 6px; }
    .grow { flex: 1 1 auto; min-width: 100px; }
    small { font-size: .78rem; }
    .block { display: block; }
    .nowrap { white-space: nowrap; }
    .find { width: 100%; margin-bottom: 10px; }
    .foot { display: block; margin-top: 10px; }
  `,
})
export class ActiveUsersCard implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(AuthService);
  protected readonly v = signal<ActiveUsers | null>(null);
  protected readonly failed = signal(false);

  protected readonly open = signal(false);
  protected readonly list = signal<ActiveUsers | null>(null);
  protected readonly listError = signal('');
  protected readonly query = signal('');
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const people = this.list()?.people ?? [];
    return !q ? people : people.filter((p) => [p.name, p.empNumber, p.brandCode].some((v) => v?.toLowerCase().includes(q)));
  });

  ngOnInit(): void {
    this.load();
  }

  protected when(at: string, zone: string): string | null {
    return zoneDateTime(at, zone, false);
  }

  protected load(): void {
    this.failed.set(false);
    this.http.get<ActiveUsers>(`${API_BASE}/api/sessions/active/count`, { context: silent() }).subscribe({
      next: (a) => this.v.set(a),
      error: () => this.failed.set(true),
    });
  }

  /** The list is asked for each time it opens, so it is never older than the popup. */
  protected openList(): void {
    this.list.set(null);
    this.listError.set('');
    this.query.set('');
    this.open.set(true);
    this.http.get<ActiveUsers>(`${API_BASE}/api/sessions/active`, { context: silent() }).subscribe({
      next: (a) => {
        this.list.set(a);
        // the number on the card follows what the list found
        this.v.set({ ...a, people: [] });
      },
      error: (e) => this.listError.set(apiProblem(e).message),
    });
  }
}
