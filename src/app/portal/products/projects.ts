/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { rupees, rupeesRound } from '../payroll/payroll.models';
import { phoneMatches } from '../phone-input';
import { apiProblem } from '../portal.models';
import { BrandPick, TradeBrand } from './trade-brand';
import { ProjectStages } from './project-stages';
import { ProjectRow } from './trade.models';
import { TradeService } from './trade.service';

type Show = 'OPEN' | 'COMPLETED' | 'SETTLED' | 'CANCELLED' | 'ALL';

/**
 * Projects: every customer job with its status, owner, dates, tasks done and money (to pay, paid, due). Open ones
 * (queued or in progress, not settled) first; opening a row opens the project.
 */
@Component({
  selector: 'app-projects',
  imports: [
    FormsModule, DatePipe, BrandPick, ButtonModule, IconFieldModule, InputIconModule, InputTextModule, MessageModule, SelectModule, SelectButtonModule,
    TableModule, TagModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Projects</h1>
        <p>Customer jobs with their team, tasks, quotations, invoices and payments, from start to settled.</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="load()" />
        <p-button label="New project" icon="pi pi-plus" (onClick)="router.navigate(['/portal/products/projects', 'new'])" />
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="tiles">
      <article class="tile"><span class="lbl">Open</span><b class="big">{{ sums().open }}</b><span class="meta">{{ sums().notStarted }} not started yet · {{ sums().progress }} started</span></article>
      <article class="tile"><span class="lbl">To be paid</span><b class="big">{{ round(sums().toPay) }}</b><span class="meta">open projects</span></article>
      <article class="tile"><span class="lbl">Paid so far</span><b class="big">{{ round(sums().paid) }}</b><span class="meta">on open projects</span></article>
      <article class="tile tile--warn"><span class="lbl">Still to receive</span><b class="big">{{ round(sums().due) }}</b><span class="meta">{{ sums().settledCount }} settled & closed</span></article>
    </section>

    <section class="p-card">
      <div class="bar">
        <p-selectbutton [options]="shows" optionLabel="label" optionValue="value" [allowEmpty]="false" [ngModel]="show()" (ngModelChange)="show.set($event)" />
        <p-select [options]="stages.options()" optionLabel="label" optionValue="value" placeholder="Any status" [showClear]="true"
                  ariaLabel="Status" [ngModel]="stage()" (ngModelChange)="stage.set($event)" styleClass="stage-pick" />
        <p-iconfield styleClass="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Search project, number, customer, phone, owner" aria-label="Search projects"
                 [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
      </div>
      <p-table [value]="shown()" dataKey="id" styleClass="p-stack only-desk" [loading]="loading()" [tableStyle]="{ 'min-width': '980px' }"
               [paginator]="shown().length > 25" [rows]="25">
        <ng-template #header>
          <tr><th>Project</th><th>Customer</th><th>Status</th><th>Owner</th><th>Dates</th><th class="num">Tasks</th>
            <th class="num">To pay</th><th class="num">Paid</th><th class="num">Due</th></tr>
        </ng-template>
        <ng-template #body let-p>
          <tr class="row-link" (click)="router.navigate(['/portal/products/projects', p.id])">
            <td data-label="Project" class="stack-full"><b>{{ p.name }}</b>
              <small class="muted block">{{ p.code }}{{ brand.many() && !brand.selected() ? ' · ' + p.brandCode : '' }}{{ p.createdByName ? ' · by ' + p.createdByName : '' }}</small></td>
            <td data-label="Customer">{{ p.customerName }}<small class="muted block">{{ p.customerPhone }}</small></td>
            <td data-label="Status">
              <p-tag [value]="status(p).label" [severity]="status(p).severity" />
              @if (p.settled) { <p-tag value="Settled" icon="pi pi-lock" severity="success" styleClass="ml" /> }
            </td>
            <td data-label="Owner">{{ p.ownerName ?? '—' }}</td>
            <td data-label="Dates" class="nowrap">{{ p.startDate ? (p.startDate | date: 'd MMM') : '—' }} – {{ p.endDate ? (p.endDate | date: 'd MMM y') : '—' }}</td>
            <td data-label="Tasks" class="num">{{ p.tasksDone }} / {{ p.tasks }}</td>
            <td data-label="To pay" class="num">{{ money(p.money.toPay) }}</td>
            <td data-label="Paid" class="num">{{ money(p.money.paid) }}</td>
            <td data-label="Due" class="num" [class.due]="p.money.due > 0">{{ p.money.due > 0 ? money(p.money.due) : '—' }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="9" class="p-empty">{{ rows().length ? 'Nothing matches.' : 'No projects yet.' }}</td></tr></ng-template>
      </p-table>
      <ul class="mlist only-phone" aria-label="Projects">
        @for (p of shown(); track p.id) {
          <li><button type="button" class="mrow" (click)="router.navigate(['/portal/products/projects', p.id])">
            <span><span class="mrow__title">{{ p.name }}</span>
              <span class="mrow__sub">{{ p.code }} · {{ p.customerName }}{{ p.ownerName ? ' · ' + p.ownerName : '' }}</span>
              <span class="mrow__sub"><p-tag [value]="status(p).label" [severity]="status(p).severity" styleClass="tiny" />
                @if (p.settled) { <p-tag value="Settled" severity="success" styleClass="tiny" /> }
                · tasks {{ p.tasksDone }}/{{ p.tasks }}</span></span>
            <span class="mrow__end" [class.warn]="p.money.due > 0">{{ p.money.due > 0 ? round(p.money.due) : round(p.money.paid) }}
              <small>{{ p.money.due > 0 ? 'to receive' : 'paid' }}</small></span>
          </button></li>
        } @empty { <li class="p-empty">{{ rows().length ? 'Nothing matches.' : 'No projects yet.' }}</li> }
      </ul>
    </section>
  `,
  styles: `
    :host ::ng-deep .stage-pick { min-width: 190px; }
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
    .tile { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; gap: 4px; }
    .tile .lbl { font-size: .74rem; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }
    .tile .big { font-size: 1.45rem; font-weight: 600; }
    .tile .meta { font-size: .8rem; color: var(--muted); }
    .tile--warn .big { color: #b45309; }
    .bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
    :host ::ng-deep .search { flex: 1 1 240px; max-width: 380px; margin-left: auto; }
    :host ::ng-deep .search input { width: 100%; }
    .num { text-align: right; }
    .block { display: block; }
    .due { color: #b45309; font-weight: 600; }
    :host ::ng-deep .ml { margin-left: 6px; }
    @media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    :host ::ng-deep .tiny { font-size: .66rem; padding: 1px 6px; }
    @media (max-width: 760px) {
      .num { text-align: left; } :host ::ng-deep .search { margin-left: 0; max-width: none; }
      .tiles { gap: 10px; margin-bottom: 12px; } .tile { padding: 12px; border-radius: 10px; } .tile .big { font-size: 1.15rem; } .tile .meta { font-size: .74rem; }
      .bar { gap: 8px; margin-bottom: 10px; }
    }
  `,
})
export class Projects implements OnInit {
  private readonly trade = inject(TradeService);
  protected readonly router = inject(Router);
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly round = rupeesRound;
  protected readonly stages = inject(ProjectStages);
  protected readonly status = (p: ProjectRow) => ({ label: this.stages.name(p.status), severity: this.stages.severity(p.status) });
  /** One status only (with the Open / Completed / ... choice), or any. */
  protected readonly stage = signal<string | null>(null);

  protected readonly rows = signal<ProjectRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly show = signal<Show>('OPEN');
  protected readonly shows = [
    { label: 'Open', value: 'OPEN' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Settled', value: 'SETTLED' },
    { label: 'Cancelled', value: 'CANCELLED' },
    { label: 'All', value: 'ALL' },
  ];
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const show = this.show();
    return this.rows().filter((p) =>
      (show === 'ALL' || (show === 'OPEN' ? !p.settled && this.stages.isOpen(p.status)
        : show === 'SETTLED' ? p.settled : p.status === show)) &&
      (!this.stage() || p.status === this.stage()) &&
      (!q || [p.name, p.code, p.customerName, p.ownerName].some((v) => v?.toLowerCase().includes(q)) || phoneMatches(q, p.customerPhone)));
  });
  protected readonly sums = computed(() => {
    const open = this.rows().filter((p) => !p.settled && p.status !== 'CANCELLED');
    return {
      open: open.filter((p) => this.stages.isOpen(p.status)).length,
      notStarted: open.filter((p) => this.stages.isOpen(p.status) && p.status !== 'IN_PROGRESS').length,
      progress: open.filter((p) => p.status === 'IN_PROGRESS').length,
      toPay: open.reduce((s, p) => s + p.money.toPay, 0),
      paid: open.reduce((s, p) => s + p.money.paid, 0),
      due: open.reduce((s, p) => s + Math.max(0, p.money.due), 0),
      settledCount: this.rows().filter((p) => p.settled).length,
    };
  });

  ngOnInit(): void {
    this.stages.load();
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  load(): void {
    this.loading.set(true);
    this.trade.projects(this.brand.selected()).subscribe({
      next: (r) => {
        this.rows.set(r);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }
}
