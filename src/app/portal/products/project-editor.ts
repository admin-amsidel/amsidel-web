import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { forkJoin, of, switchMap } from 'rxjs';
import { AuthService } from '../auth.service';
import { rupees } from '../payroll/payroll.models';
import { phoneSearchText } from '../phone-input';
import { apiProblem, fromIsoDate, toIsoDate } from '../portal.models';
import { CustomerForm } from './customer-form';
import { HistoryList } from './history-list';
import { TradeBrand } from './trade-brand';
import {
  Customer, DOC_STATUS, PAY_MODES, payLabel, PersonRef, Project, PROJECT_STATUS, PROJECT_STATUS_OPTIONS, ProjectBody, ProjectStatus,
  ProjectTask, SalesRow, TaskBody,
} from './trade.models';
import { TradeService } from './trade.service';

/**
 * One project: its details (customer, owner, team, dates, description, estimated and finalized amounts), its tasks
 * (registered, start and end dates, person, bill, status, each with its own history), its quotations and invoices,
 * every payment, the money still to come, and the whole history with comments. Settled projects are read-only for
 * everyone but owners and admins; only they reopen or delete.
 */
@Component({
  selector: 'app-project-editor',
  imports: [
    FormsModule, DatePipe, RouterLink, CustomerForm, HistoryList, ButtonModule, DatePickerModule, DialogModule, InputNumberModule,
    InputTextModule, MessageModule, MultiSelectModule, ProgressBarModule, SelectModule, TagModule, TextareaModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <a class="back" routerLink="/portal/products/projects">← Projects</a>
        <h1>{{ p() ? p()!.name : 'New project' }}
          @if (p(); as x) {
            <span class="tags">
              <p-tag [value]="statusOf(x.status).label" [severity]="statusOf(x.status).severity" />
              @if (x.settled) { <p-tag value="Settled & closed" icon="pi pi-lock" severity="success" /> }
            </span>
          }
        </h1>
        @if (p(); as x) {
          <p>{{ x.code }} · {{ x.brand.name }} · created by <b>{{ x.createdByName ?? '—' }}</b> on {{ x.createdAt | date: 'd MMM y, h:mm a' }}
            @if (x.updatedByName && x.updatedAt) { · last updated by <b>{{ x.updatedByName }}</b>, {{ x.updatedAt | date: 'd MMM y, h:mm a' }} }
            @if (x.settled) { · settled by {{ x.settledByName }}, {{ x.settledAt | date: 'd MMM y' }} }</p>
        } @else {
          <p>A customer's job: who owns it, who works on it, the dates and the money. Tasks, quotations and invoices are added once it is saved.</p>
        }
      </div>
      @if (p(); as x) {
        <div class="head-actions">
          @if (x.editable && !x.settled) {
            <p-select [options]="statusOptions" optionLabel="label" optionValue="value" ariaLabel="Project status" [ngModel]="x.status"
                      (ngModelChange)="setStatus($event)" />
          }
          @if (!x.settled && x.editable) {
            <p-button label="Settle & close" icon="pi pi-lock" severity="success" size="small" (onClick)="settleOpen.set(true)" />
          }
          @if (x.settled && x.admin) {
            <p-button label="Reopen" icon="pi pi-lock-open" [outlined]="true" size="small" (onClick)="reopen()" />
          }
          @if (x.admin) {
            <p-button label="Delete" icon="pi pi-trash" [text]="true" severity="danger" size="small" (onClick)="remove()" />
          }
        </div>
      }
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    @if (p()?.settled && !p()?.editable) {
      <p-message severity="info" styleClass="page-message">This project is settled and closed. Only an admin or owner can change it; you can still add comments.</p-message>
    }

    @if (ready()) {
      <div class="layout">
        <div class="main">
          <!-- details -->
          <section class="p-card">
            <h2>Details</h2>
            <div class="grid">
              @if (!p() && brand.many()) {
                <div class="pf"><label for="pj-brand">Brand *</label>
                  <p-select inputId="pj-brand" [options]="brand.brands()" optionLabel="name" optionValue="id" placeholder="Choose the brand"
                            [ngModel]="f.brandId()" (ngModelChange)="f.brandId.set($event); f.customerId.set(null)" /></div>
              }
              <div class="pf span"><label for="pj-name">Project name *</label>
                <input pInputText id="pj-name" maxlength="150" placeholder="e.g. Varghese villa – all windows" [disabled]="!editable()"
                       [ngModel]="f.name()" (ngModelChange)="f.name.set($event); dirty.set(true)" /></div>
              <div class="pf span"><label for="pj-cust">Customer *</label>
                <div class="with-btn">
                  <p-select inputId="pj-cust" [options]="customerOptions()" optionLabel="label" optionValue="value" [filter]="true" filterBy="label,phone"
                            placeholder="Search name or phone" [disabled]="!editable()" [ngModel]="f.customerId()" (ngModelChange)="f.customerId.set($event); dirty.set(true)" />
                  @if (editable()) { <p-button icon="pi pi-user-plus" [outlined]="true" ariaLabel="New customer" (onClick)="customerOpen.set(true)" /> }
                </div></div>
              <div class="pf"><label for="pj-owner">Project owner</label>
                <p-select inputId="pj-owner" [options]="peopleOptions()" optionLabel="label" optionValue="value" [filter]="true" [showClear]="true"
                          placeholder="Who answers for it" [disabled]="!editable()" [ngModel]="f.ownerId()" (ngModelChange)="f.ownerId.set($event); dirty.set(true)" /></div>
              <div class="pf"><label for="pj-team">Allocated employees</label>
                <p-multiselect inputId="pj-team" [options]="peopleOptions()" optionLabel="label" optionValue="value" [filter]="true" display="chip"
                               placeholder="Who works on it" appendTo="body" [disabled]="!editable()" [ngModel]="f.memberIds()"
                               (ngModelChange)="f.memberIds.set($event); dirty.set(true)" /></div>
              <div class="pf"><label for="pj-start">Start date</label>
                <p-datepicker inputId="pj-start" dateFormat="dd/mm/yy" [showIcon]="true" [disabled]="!editable()" [ngModel]="f.startDate()" (ngModelChange)="f.startDate.set($event); dirty.set(true)" /></div>
              <div class="pf"><label for="pj-end">End date</label>
                <p-datepicker inputId="pj-end" dateFormat="dd/mm/yy" [showIcon]="true" [disabled]="!editable()" [minDate]="f.startDate() ?? undefined"
                              [ngModel]="f.endDate()" (ngModelChange)="f.endDate.set($event); dirty.set(true)" /></div>
              <div class="pf"><label for="pj-est">Estimated amount</label>
                <p-inputnumber inputId="pj-est" mode="currency" currency="INR" locale="en-IN" [min]="0" [disabled]="!editable()" placeholder="₹"
                               [ngModel]="f.estimated()" (ngModelChange)="f.estimated.set($event); dirty.set(true)" /></div>
              <div class="pf"><label for="pj-final">Finalized amount</label>
                <p-inputnumber inputId="pj-final" mode="currency" currency="INR" locale="en-IN" [min]="0" [disabled]="!editable()" placeholder="When agreed"
                               [ngModel]="f.final()" (ngModelChange)="f.final.set($event); dirty.set(true)" /></div>
              <div class="pf span"><label for="pj-desc">Project details</label>
                <textarea pTextarea id="pj-desc" rows="4" maxlength="4000" [autoResize]="true" [disabled]="!editable()"
                          placeholder="Site, scope, sizes, colours, special requests…" [ngModel]="f.description()" (ngModelChange)="f.description.set($event); dirty.set(true)"></textarea></div>
              <div class="pf span"><label for="pj-rem">Remarks</label>
                <textarea pTextarea id="pj-rem" rows="2" maxlength="2000" [autoResize]="true" [disabled]="!editable()"
                          [ngModel]="f.remarks()" (ngModelChange)="f.remarks.set($event); dirty.set(true)"></textarea></div>
            </div>
            @if (formError()) { <p-message severity="error" styleClass="mt">{{ formError() }}</p-message> }
            @if (editable()) {
              <div class="p-actions">
                <p-button [label]="p() ? 'Save changes' : 'Create project'" icon="pi pi-check" [loading]="busy()" [disabled]="!!p() && !dirty()" (onClick)="save()" />
              </div>
            }
          </section>

          @if (p(); as x) {
            <!-- tasks -->
            <section class="p-card">
              <div class="sec-head">
                <h2>Tasks <small class="muted">{{ doneTasks() }} of {{ x.tasks.length }} completed</small></h2>
                @if (x.editable) { <p-button label="Add task" icon="pi pi-plus" size="small" (onClick)="editTask(null)" /> }
              </div>
              <ul class="tasks">
                @for (t of x.tasks; track t.id) {
                  <li class="task">
                    <div class="task__top">
                      <div class="task__title">
                        <b>{{ t.title }}</b>
                        <small class="muted block">Registered {{ t.regDate | date: 'd MMM y' }} · {{ t.startDate ? (t.startDate | date: 'd MMM') : '—' }} to
                          {{ t.endDate ? (t.endDate | date: 'd MMM y') : '—' }}{{ t.assignee ? ' · ' + t.assignee.name : '' }}</small>
                        @if (t.billNumber) {
                          <a class="bill" [routerLink]="(t.billKind === 'INVOICE' ? '/portal/products/invoices/' : '/portal/products/quotations/') + t.billId">
                            <i class="pi pi-receipt" aria-hidden="true"></i> {{ t.billNumber }}</a>
                        }
                      </div>
                      <div class="task__acts">
                        @if (x.editable) {
                          <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [ariaLabel]="'Status of ' + t.title" size="small"
                                    [ngModel]="t.status" (ngModelChange)="taskStatus(t, $event)" styleClass="st" />
                          <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + t.title" (onClick)="editTask(t)" />
                          <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete ' + t.title" (onClick)="deleteTask(t)" />
                        } @else {
                          <p-tag [value]="statusOf(t.status).label" [severity]="statusOf(t.status).severity" />
                        }
                      </div>
                    </div>
                    @if (t.description) { <p class="task__desc">{{ t.description }}</p> }
                    @if (t.remarks) { <p class="task__desc muted">Remarks: {{ t.remarks }}</p> }
                    <button type="button" class="link small" (click)="toggle(t.id)">{{ open().has(t.id) ? 'Hide' : 'Show' }} history ({{ t.history.length }})
                      · last by {{ t.updatedByName ?? t.createdByName }}</button>
                    @if (open().has(t.id)) { <app-history-list [entries]="t.history" /> }
                  </li>
                } @empty { <li class="muted">No tasks yet. Add the steps of the job: measure, order, deliver, install…</li> }
              </ul>
            </section>

            <!-- bills -->
            <section class="p-card">
              <div class="sec-head">
                <h2>Quotations &amp; invoices</h2>
                @if (x.editable) {
                  <div class="acts">
                    <p-button label="New quotation" icon="pi pi-file-edit" size="small" [outlined]="true" routerLink="/portal/products/quotations/new"
                              [queryParams]="{ customer: x.customer.id, project: x.id }" />
                    <p-button label="New invoice" icon="pi pi-receipt" size="small" routerLink="/portal/products/invoices/new"
                              [queryParams]="{ customer: x.customer.id, project: x.id }" />
                  </div>
                }
              </div>
              <ul class="docs">
                @for (d of x.bills; track d.id) {
                  <li>
                    <a [routerLink]="(d.kind === 'INVOICE' ? '/portal/products/invoices/' : '/portal/products/quotations/') + d.id">
                      <b>{{ d.kind === 'INVOICE' ? 'Invoice' : 'Quotation' }} {{ d.number ?? '(draft)' }}</b></a>
                    <p-tag [value]="docStatus(d).label" [severity]="docStatus(d).severity" styleClass="tiny" />
                    @if (pay(d); as pl) { <p-tag [value]="pl.label" [severity]="pl.severity" styleClass="tiny" /> }
                    <span class="right">{{ money(d.total) }}<small class="muted block">{{ d.docDate | date: 'd MMM y' }}{{ d.createdByName ? ' · ' + d.createdByName : '' }}</small></span>
                  </li>
                } @empty { <li class="muted">No quotations or invoices yet.</li> }
              </ul>
            </section>

            <!-- payments -->
            <section class="p-card">
              <h2>Payments received</h2>
              <ul class="pays">
                @for (pm of x.payments; track pm.id) {
                  <li [class.void]="pm.voided">
                    <span><b>{{ pm.kind === 'REFUND' ? 'Refund ' : '' }}{{ money(pm.amount) }}</b> by {{ mode(pm.mode) }} · {{ pm.paidOn | date: 'd MMM y' }}
                      <small class="muted block">{{ pm.docNumber }}{{ pm.transactionId ? ' · txn ' + pm.transactionId : '' }}{{ pm.remarks ? ' · ' + pm.remarks : '' }}
                        · {{ pm.recordedByName }}{{ pm.voided ? ' · VOIDED: ' + pm.voidReason : '' }}</small></span>
                  </li>
                } @empty { <li class="muted">No payments yet. Record them on the project's invoices.</li> }
              </ul>
            </section>
          }
        </div>

        @if (p(); as x) {
          <aside class="side">
            <section class="p-card money">
              <h2>Money</h2>
              <dl>
                <dt>Estimated</dt><dd>{{ x.money.estimated !== null ? money(x.money.estimated) : '—' }}</dd>
                <dt>Quoted</dt><dd>{{ money(x.money.quoted) }}</dd>
                <dt>Billed</dt><dd>{{ money(x.money.billed) }}</dd>
                <dt>Finalized</dt><dd>{{ x.money.finalAmount !== null ? money(x.money.finalAmount) : '—' }}</dd>
              </dl>
              <div class="paybox">
                <div class="row"><span>Paid</span><b>{{ money(x.money.paid) }}</b></div>
                @if (x.money.writtenOff > 0) { <div class="row"><span>Discount written off</span><b>{{ money(x.money.writtenOff) }}</b></div> }
                <p-progressbar [value]="paidPct()" [showValue]="false" styleClass="pbar" />
                <div class="row"><span>of {{ money(x.money.toPay) }}</span><span [class.due]="x.money.due > 0">{{ x.money.due > 0 ? money(x.money.due) + ' to receive' : 'Fully paid' }}</span></div>
              </div>
              <small class="muted">To pay = the finalized amount, else what is billed, else the estimate.</small>
            </section>
            <section class="p-card people">
              <h2>People</h2>
              <dl>
                <dt>Customer</dt><dd><a [routerLink]="'/portal/products/customers'">{{ x.customer.name }}</a><small class="muted block">{{ x.customer.phone }}</small></dd>
                <dt>Owner</dt><dd>{{ x.owner?.name ?? '—' }}<small class="muted block">{{ x.owner?.designation ?? '' }}</small></dd>
                <dt>Team</dt><dd>@for (m of x.members; track m.id) { <span class="chip">{{ m.name }}</span> } @empty { — }</dd>
                <dt>Created</dt><dd>{{ x.createdByName }}<small class="muted block">{{ x.createdAt | date: 'd MMM y, h:mm a' }}</small></dd>
                <dt>Last updated</dt><dd>{{ x.updatedByName ?? '—' }}<small class="muted block">{{ x.updatedAt | date: 'd MMM y, h:mm a' }}</small></dd>
                @if (x.completedAt) { <dt>Completed</dt><dd>{{ x.completedAt | date: 'd MMM y' }}</dd> }
              </dl>
            </section>
            <section class="p-card">
              <h2>History &amp; comments</h2>
              <div class="comment">
                <textarea pTextarea rows="2" maxlength="1000" [autoResize]="true" placeholder="Add a comment or remark…" aria-label="Comment"
                          [ngModel]="comment()" (ngModelChange)="comment.set($event)"></textarea>
                <p-button label="Add" icon="pi pi-send" size="small" [disabled]="!comment().trim()" [loading]="busy()" (onClick)="addComment()" />
              </div>
              <app-history-list [entries]="x.history" [showSubject]="true" />
            </section>
          </aside>
        }
      </div>
    } @else if (!error()) {
      <p class="p-loading">Loading…</p>
    }

    <app-customer-form [(visible)]="customerOpen" [fixedBrand]="f.brandId()" (saved)="customerAdded($event)" />

    <!-- task -->
    <p-dialog [header]="taskEditing() ? 'Change task' : 'Add task'" [modal]="true" [visible]="taskOpen()" (visibleChange)="taskOpen.set($event)"
              [style]="{ width: '640px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      <div class="grid">
        <div class="pf span"><label for="tk-title">Task *</label>
          <input pInputText id="tk-title" maxlength="200" placeholder="e.g. Measure all openings" [ngModel]="t.title()" (ngModelChange)="t.title.set($event)" /></div>
        <div class="pf"><label for="tk-reg">Registered on *</label>
          <p-datepicker inputId="tk-reg" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [ngModel]="t.regDate()" (ngModelChange)="t.regDate.set($event)" /></div>
        <div class="pf"><label for="tk-status">Status</label>
          <p-select inputId="tk-status" [options]="statusOptions" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="t.status()" (ngModelChange)="t.status.set($event)" /></div>
        <div class="pf"><label for="tk-start">Start date</label>
          <p-datepicker inputId="tk-start" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [ngModel]="t.startDate()" (ngModelChange)="t.startDate.set($event)" /></div>
        <div class="pf"><label for="tk-end">End date</label>
          <p-datepicker inputId="tk-end" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [minDate]="t.startDate() ?? undefined" [ngModel]="t.endDate()" (ngModelChange)="t.endDate.set($event)" /></div>
        <div class="pf"><label for="tk-who">Person</label>
          <p-select inputId="tk-who" [options]="peopleOptions()" optionLabel="label" optionValue="value" [filter]="true" [showClear]="true" appendTo="body"
                    placeholder="Who does it" [ngModel]="t.assigneeId()" (ngModelChange)="t.assigneeId.set($event)" /></div>
        <div class="pf"><label for="tk-bill">Bill</label>
          <p-select inputId="tk-bill" [options]="billOptions()" optionLabel="label" optionValue="value" [showClear]="true" appendTo="body"
                    placeholder="Quotation or invoice" [ngModel]="t.billId()" (ngModelChange)="t.billId.set($event)" /></div>
        <div class="pf span"><label for="tk-desc">Details</label>
          <textarea pTextarea id="tk-desc" rows="2" maxlength="2000" [autoResize]="true" [ngModel]="t.description()" (ngModelChange)="t.description.set($event)"></textarea></div>
        <div class="pf span"><label for="tk-rem">Remarks</label>
          <input pInputText id="tk-rem" maxlength="1000" [ngModel]="t.remarks()" (ngModelChange)="t.remarks.set($event)" /></div>
        @if (taskError()) { <p-message severity="error" styleClass="span">{{ taskError() }}</p-message> }
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="taskOpen.set(false)" />
        <p-button label="Save task" icon="pi pi-check" [loading]="busy()" (onClick)="saveTask()" />
      </ng-template>
    </p-dialog>

    <!-- settle -->
    <p-dialog header="Settle & close the project" [modal]="true" [visible]="settleOpen()" (visibleChange)="settleOpen.set($event)"
              [style]="{ width: '480px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      @if (p(); as x) {
        <p>Paid <b>{{ money(x.money.paid) }}</b> of {{ money(x.money.toPay) }}.
          @if (x.money.due > 0) { <span class="due">{{ money(x.money.due) }} is still to be paid{{ x.admin ? '' : ': only an admin can settle it now' }}.</span> }</p>
        <p class="muted">After this, only admins and owners can change the project or its tasks.</p>
        <div class="pf"><label for="st-note">Note</label>
          <input pInputText id="st-note" maxlength="500" placeholder="e.g. Final payment received in cash" [ngModel]="settleNote()" (ngModelChange)="settleNote.set($event)" /></div>
      }
      <ng-template #footer>
        <p-button label="Not yet" [text]="true" (onClick)="settleOpen.set(false)" />
        <p-button label="Settle & close" icon="pi pi-lock" severity="success" [loading]="busy()" (onClick)="settle()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .tags { display: inline-flex; gap: 6px; vertical-align: middle; margin-left: 8px; font-size: .9rem; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 20px; align-items: start; }
    .main > .p-card:first-child, .side > .p-card:first-child { margin-top: 0; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .span { grid-column: 1 / -1; }
    .with-btn { display: flex; gap: 8px; }
    .with-btn > :first-child { flex: 1 1 auto; min-width: 0; }
    :host ::ng-deep .mt { margin-top: 12px; }
    .sec-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .sec-head h2 { margin: 0; font-size: 1.25rem; }
    .sec-head h2 small { font-size: .8rem; font-weight: 400; }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; }
    .tasks, .docs, .pays { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .task { border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: #fff; display: grid; gap: 6px; }
    .task__top { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .task__title { min-width: 0; }
    .task__acts { display: flex; align-items: center; gap: 4px; }
    :host ::ng-deep .st { min-width: 140px; }
    .task__desc { margin: 0; font-size: .88rem; white-space: pre-line; }
    .bill { display: inline-flex; gap: 6px; align-items: center; font-size: .84rem; margin-top: 4px; }
    .link { background: none; border: 0; padding: 0; color: var(--brass-dark); cursor: pointer; font: inherit; text-align: left; }
    .small { font-size: .8rem; }
    .docs li, .pays li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
    .docs li:last-child, .pays li:last-child { border-bottom: 0; }
    .right { margin-left: auto; text-align: right; font-variant-numeric: tabular-nums; }
    .pays li.void { opacity: .6; text-decoration: line-through; }
    .block { display: block; }
    :host ::ng-deep .tiny { font-size: .66rem; padding: 1px 6px; }
    .side { display: grid; gap: 20px; }
    .side .p-card { margin-top: 0; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; margin: 0 0 12px; font-size: .9rem; }
    dt { color: var(--muted); }
    dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
    .people dd { text-align: left; }
    .paybox { display: grid; gap: 6px; padding: 12px; border-radius: 10px; background: var(--accent-softer); margin-bottom: 8px; }
    .paybox .row { display: flex; justify-content: space-between; gap: 8px; font-size: .88rem; }
    :host ::ng-deep .pbar { height: 8px; }
    .due { color: #b45309; font-weight: 600; }
    .chip { display: inline-block; padding: 2px 8px; margin: 0 4px 4px 0; border-radius: 12px; background: var(--accent-soft); font-size: .8rem; }
    .comment { display: grid; gap: 8px; margin-bottom: 16px; justify-items: end; }
    .comment textarea { width: 100%; }
    @media (max-width: 1180px) { .layout { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class ProjectEditor implements OnInit {
  private readonly trade = inject(TradeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly auth = inject(AuthService);
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly statusOptions = PROJECT_STATUS_OPTIONS;
  protected readonly statusOf = (s: ProjectStatus) => PROJECT_STATUS[s];
  protected readonly docStatus = (d: SalesRow) => DOC_STATUS[d.status];
  protected readonly pay = (d: SalesRow) => payLabel(d.payStatus);

  protected readonly p = signal<Project | null>(null);
  protected readonly ready = signal(false);
  protected readonly error = signal('');
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly dirty = signal(false);
  protected readonly customers = signal<Customer[]>([]);
  protected readonly people = signal<PersonRef[]>([]);
  protected readonly customerOpen = signal(false);
  protected readonly comment = signal('');
  protected readonly open = signal<ReadonlySet<number>>(new Set());
  protected readonly settleOpen = signal(false);
  protected readonly settleNote = signal('');

  protected readonly f = {
    brandId: signal<number | null>(null),
    name: signal(''),
    customerId: signal<number | null>(null),
    ownerId: signal<number | null>(null),
    memberIds: signal<number[]>([]),
    startDate: signal<Date | null>(null),
    endDate: signal<Date | null>(null),
    estimated: signal<number | null>(null),
    final: signal<number | null>(null),
    description: signal(''),
    remarks: signal(''),
  };

  // task dialog
  protected readonly taskOpen = signal(false);
  protected readonly taskEditing = signal<ProjectTask | null>(null);
  protected readonly taskError = signal('');
  protected readonly t = {
    title: signal(''),
    status: signal<ProjectStatus>('QUEUED'),
    regDate: signal<Date | null>(new Date()),
    startDate: signal<Date | null>(null),
    endDate: signal<Date | null>(null),
    assigneeId: signal<number | null>(null),
    billId: signal<number | null>(null),
    description: signal(''),
    remarks: signal(''),
  };

  protected readonly editable = computed(() => !this.p() || this.p()!.editable);
  protected readonly customerOptions = computed(() =>
    this.customers().filter((c) => c.brand.id === this.f.brandId() && (c.active || c.id === this.f.customerId()))
      .map((c) => ({ value: c.id, label: `${c.name} · ${c.phone}`, phone: phoneSearchText(c.phone, c.phone2) })),
  );
  protected readonly peopleOptions = computed(() =>
    this.people().map((x) => ({ value: x.id, label: x.name + (x.designation ? ' · ' + x.designation : '') })));
  protected readonly billOptions = computed(() =>
    (this.p()?.bills ?? []).map((d) => ({ value: d.id, label: `${d.kind === 'INVOICE' ? 'Invoice' : 'Quotation'} ${d.number ?? '(draft)'} · ${rupees(d.total)}` })));
  protected readonly doneTasks = computed(() => (this.p()?.tasks ?? []).filter((x) => x.status === 'COMPLETED').length);
  protected readonly paidPct = computed(() => {
    const m = this.p()?.money;
    return m && m.toPay > 0 ? Math.min(100, Math.round(((m.paid + m.writtenOff) / m.toPay) * 100)) : 0;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    const presetCustomer = Number(this.route.snapshot.queryParamMap.get('customer')) || null;
    this.brand.load().pipe(
      switchMap(() => (id && id !== 'new' ? this.trade.project(Number(id)) : of(null))),
      switchMap((x) => {
        if (x) this.fill(x);
        else {
          this.f.brandId.set(this.auth.user()?.brandId ?? this.brand.brandId());
          this.f.customerId.set(presetCustomer);
          this.f.ownerId.set(this.auth.user()?.id ?? null);
          this.f.startDate.set(new Date());
        }
        return forkJoin([this.trade.customers(null), this.trade.people(x?.brand.id ?? this.f.brandId())]);
      }),
    ).subscribe({
      next: ([c, people]) => {
        this.customers.set(c);
        this.people.set(people);
        if (presetCustomer && !this.p()) {
          const pc = c.find((x) => x.id === presetCustomer);
          if (pc) this.f.brandId.set(pc.brand.id);
        }
        this.ready.set(true);
      },
      error: (e) => this.error.set(apiProblem(e).message),
    });
  }

  private fill(x: Project): void {
    this.p.set(x);
    this.f.brandId.set(x.brand.id);
    this.f.name.set(x.name);
    this.f.customerId.set(x.customer.id);
    this.f.ownerId.set(x.owner?.id ?? null);
    this.f.memberIds.set(x.members.map((m) => m.id));
    this.f.startDate.set(fromIsoDate(x.startDate));
    this.f.endDate.set(fromIsoDate(x.endDate));
    this.f.estimated.set(x.money.estimated);
    this.f.final.set(x.money.finalAmount);
    this.f.description.set(x.description ?? '');
    this.f.remarks.set(x.remarks ?? '');
    this.dirty.set(false);
  }

  private done(x: Project, message?: string): void {
    this.busy.set(false);
    this.fill(x);
    if (message) this.toast.add({ severity: 'success', summary: message, detail: `${x.code} · ${x.name}` });
  }

  private failed(e: unknown, target?: (m: string) => void): void {
    this.busy.set(false);
    const pr = apiProblem(e);
    const m = Object.values(pr.fields)[0] ?? pr.message;
    if (target) target(m);
    else this.toast.add({ severity: 'error', summary: 'Not saved', detail: m, life: 8000 });
  }

  protected save(): void {
    const f = this.f;
    this.formError.set('');
    if (!f.brandId()) return this.formError.set('Choose the brand.');
    if (!f.name().trim()) return this.formError.set('Give the project a name.');
    if (!f.customerId()) return this.formError.set('Choose the customer.');
    const body: ProjectBody = {
      brandId: f.brandId(), name: f.name().trim(), customerId: f.customerId()!, description: f.description().trim() || null,
      ownerId: f.ownerId(), memberIds: f.memberIds(), startDate: toIsoDate(f.startDate()), endDate: toIsoDate(f.endDate()),
      estimatedAmount: f.estimated(), finalAmount: f.final(), status: this.p()?.status ?? null, remarks: f.remarks().trim() || null,
    };
    this.busy.set(true);
    this.trade.saveProject(this.p()?.id ?? null, body).subscribe({
      next: (x) => {
        const fresh = !this.p();
        this.done(x, fresh ? 'Project created' : 'Project saved');
        if (fresh) this.router.navigate(['/portal/products/projects', x.id], { replaceUrl: true });
      },
      error: (e) => this.failed(e, (m) => this.formError.set(m)),
    });
  }

  protected setStatus(status: ProjectStatus): void {
    const x = this.p();
    if (!x || x.status === status) return;
    this.trade.projectStatus(x.id, status, '').subscribe({ next: (r) => this.done(r, 'Status: ' + PROJECT_STATUS[status].label), error: (e) => this.failed(e) });
  }

  protected settle(): void {
    const x = this.p();
    if (!x) return;
    this.busy.set(true);
    this.trade.settleProject(x.id, this.settleNote().trim()).subscribe({
      next: (r) => {
        this.settleOpen.set(false);
        this.done(r, 'Settled & closed');
      },
      error: (e) => this.failed(e),
    });
  }

  protected reopen(): void {
    const x = this.p();
    if (!x) return;
    this.trade.reopenProject(x.id, '').subscribe({ next: (r) => this.done(r, 'Reopened'), error: (e) => this.failed(e) });
  }

  protected remove(): void {
    const x = this.p();
    if (!x) return;
    this.confirm.confirm({
      header: 'Delete project',
      message: `Delete project ${x.code} "${x.name}" and its ${x.tasks.length} task(s)? Its quotations and invoices stay, without the project.`,
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.trade.deleteProject(x.id).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Project deleted', detail: x.code });
          this.router.navigate(['/portal/products/projects']);
        },
        error: (e) => this.failed(e),
      }),
    });
  }

  protected addComment(): void {
    const x = this.p();
    if (!x || !this.comment().trim()) return;
    this.busy.set(true);
    this.trade.commentProject(x.id, this.comment().trim()).subscribe({
      next: (r) => {
        this.comment.set('');
        this.done(r);
      },
      error: (e) => this.failed(e),
    });
  }

  protected toggle(id: number): void {
    this.open.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  protected editTask(task: ProjectTask | null): void {
    this.taskEditing.set(task);
    this.t.title.set(task?.title ?? '');
    this.t.status.set(task?.status ?? 'QUEUED');
    this.t.regDate.set(task ? fromIsoDate(task.regDate) : new Date());
    this.t.startDate.set(fromIsoDate(task?.startDate));
    this.t.endDate.set(fromIsoDate(task?.endDate));
    this.t.assigneeId.set(task?.assignee?.id ?? null);
    this.t.billId.set(task?.billId ?? null);
    this.t.description.set(task?.description ?? '');
    this.t.remarks.set(task?.remarks ?? '');
    this.taskError.set('');
    this.taskOpen.set(true);
  }

  protected saveTask(): void {
    const x = this.p();
    if (!x) return;
    if (!this.t.title().trim()) return this.taskError.set('Give the task a title.');
    if (!this.t.regDate()) return this.taskError.set('Give the registered date.');
    const body: TaskBody = {
      title: this.t.title().trim(), status: this.t.status(), regDate: toIsoDate(this.t.regDate())!, startDate: toIsoDate(this.t.startDate()),
      endDate: toIsoDate(this.t.endDate()), assigneeId: this.t.assigneeId(), billId: this.t.billId(),
      description: this.t.description().trim() || null, remarks: this.t.remarks().trim() || null,
    };
    this.busy.set(true);
    const editing = this.taskEditing();
    (editing ? this.trade.saveTask(editing.id, body) : this.trade.addTask(x.id, body)).subscribe({
      next: (r) => {
        this.taskOpen.set(false);
        this.done(r, editing ? 'Task saved' : 'Task added');
      },
      error: (e) => this.failed(e, (m) => this.taskError.set(m)),
    });
  }

  protected taskStatus(task: ProjectTask, status: ProjectStatus): void {
    if (task.status === status) return;
    this.trade.taskStatus(task.id, status).subscribe({ next: (r) => this.done(r, `${task.title}: ${PROJECT_STATUS[status].label}`), error: (e) => this.failed(e) });
  }

  protected deleteTask(task: ProjectTask): void {
    this.confirm.confirm({
      header: 'Delete task', message: `Delete the task "${task.title}"? It stays in the project's history.`, icon: 'pi pi-trash',
      acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.trade.deleteTask(task.id).subscribe({ next: (r) => this.done(r, 'Task deleted'), error: (e) => this.failed(e) }),
    });
  }

  protected customerAdded(c: Customer): void {
    this.customers.update((cs) => [...cs, c]);
    this.f.customerId.set(c.id);
    this.dirty.set(true);
  }

  protected mode(m: string): string {
    return PAY_MODES.find((x) => x.value === m)?.label ?? m;
  }
}
