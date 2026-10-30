/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TimelineModule } from 'primeng/timeline';
import { TooltipModule } from 'primeng/tooltip';
import { forkJoin, from, Observable, of, switchMap } from 'rxjs';
import { shrinkPicture } from '../news.service';
import { apiProblem } from '../portal.models';
import { ProjectPhoto, ProjectStatusService, ProjectStatusView, ProjectUpdate, StatusRow } from './project-status.service';
import { BrandPick, TradeBrand } from './trade-brand';
import { ProjectStages } from './project-stages';
import { ProjectStatus } from './trade.models';

type Show = 'ALL' | 'OPEN' | 'SHARED';

/**
 * Projects > Project status: status updates for each project's customer. People with the Project status checkpoint
 * post an update (stage, title, what was done, date and time, photos of the work), change or remove their own, and
 * share the customer's link: a page with the updates and photos that needs no sign-in and opens nothing else.
 */
@Component({
  selector: 'app-project-status',
  imports: [
    FormsModule, DatePipe, RouterLink, BrandPick, ButtonModule, DatePickerModule, DialogModule, IconFieldModule, InputIconModule,
    InputTextModule, MessageModule, SelectModule, SelectButtonModule, TagModule, TextareaModule, TimelineModule, TooltipModule, ProjectPhoto,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Project status</h1>
        <p>Updates with photos of the work for each project's customer, and the link they open to follow it, no sign-in needed.</p>
      </div>
      <div class="head-actions"><app-brand-pick (changed)="load()" /></div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <div class="layout" [class.has-pick]="!!view()">
      <section class="p-card list-card">
        <p-iconfield styleClass="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Search project, customer, phone" aria-label="Search projects" [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
        <p-selectbutton [options]="shows" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Show" styleClass="shows"
                        [ngModel]="show()" (ngModelChange)="show.set($event)" />
        <ul class="plist" aria-label="Projects">
          @for (p of shown(); track p.id) {
            <li><button type="button" class="prow" [class.on]="p.id === view()?.project?.id" (click)="open(p.id)">
              <span class="prow__main"><b>{{ p.name }}</b>
                <small class="muted">{{ p.code }} · {{ p.customerName }}{{ brand.many() && !brand.selected() ? ' · ' + p.brandCode : '' }}</small>
                <small class="muted">@if (p.lastUpdateAt) { Last update {{ p.lastUpdateAt | date: 'd MMM, h:mm a' }} } @else { No updates yet }</small></span>
              <span class="prow__end">
                <p-tag [value]="label(p.status)" [severity]="severity(p.status)" />
                <span class="counts">
                  @if (p.shared) { <i class="pi pi-link" pTooltip="Shared with the customer" aria-label="Shared with the customer"></i> }
                  <span class="count" [attr.aria-label]="p.updates + ' updates'"><i class="pi pi-images" aria-hidden="true"></i> {{ p.updates }}</span>
                </span>
              </span>
            </button></li>
          } @empty { <li class="p-empty">{{ loading() ? 'Loading…' : rows().length ? 'Nothing matches.' : 'No projects yet.' }}</li> }
        </ul>
      </section>

      <section class="detail">
        @if (view(); as v) {
          <div class="p-card proj">
            <button type="button" class="back only-phone" (click)="view.set(null)"><i class="pi pi-chevron-left" aria-hidden="true"></i> Projects</button>
            <div class="proj__head">
              <div>
                <h2>{{ v.project.name }}</h2>
                <p class="muted">{{ v.project.code }} · {{ v.project.customerName }}{{ v.project.customerPhone ? ' · ' + v.project.customerPhone : '' }}
                  · <a [routerLink]="'/portal/products/projects/' + v.project.id">Open the project</a></p>
              </div>
              <p-tag [value]="label(v.project.status)" [severity]="severity(v.project.status)" styleClass="big-tag" />
            </div>

            <div class="share" [class.share--on]="!!v.sharePath">
              <i class="pi" [class.pi-link]="v.sharePath" [class.pi-lock]="!v.sharePath" aria-hidden="true"></i>
              @if (v.sharePath) {
                <div class="share__text"><b>Shared with {{ v.project.customerName }}</b>
                  <small class="muted">Anyone with this link sees the updates and photos (nothing else, no sign-in).</small>
                  <input pInputText readonly class="link" [value]="link(v.sharePath)" aria-label="Customer's status link" (focus)="$any($event.target).select()" /></div>
                <div class="share__acts">
                  <p-button icon="pi pi-copy" label="Copy" size="small" (onClick)="copy(v.sharePath)" />
                  <p-button icon="pi pi-whatsapp" label="WhatsApp" size="small" severity="success" [outlined]="true" (onClick)="whatsapp(v)" />
                  <p-button icon="pi pi-external-link" size="small" [text]="true" ariaLabel="Open the link" pTooltip="Open the customer's page" (onClick)="openLink(v.sharePath)" />
                  @if (v.canPost) {
                    <p-button icon="pi pi-refresh" size="small" [text]="true" ariaLabel="New link" pTooltip="A new link (the old one stops working)" (onClick)="renew(v)" />
                    <p-button icon="pi pi-ban" size="small" [text]="true" severity="danger" ariaLabel="Stop sharing" pTooltip="Stop sharing" (onClick)="unshare(v)" />
                  }
                </div>
              } @else {
                <div class="share__text"><b>Not shared yet</b><small class="muted">Make a link for {{ v.project.customerName }} to follow this project's progress.</small></div>
                @if (v.canPost) { <p-button icon="pi pi-share-alt" label="Share with the customer" size="small" (onClick)="share(v)" /> }
              }
            </div>
          </div>

          <div class="tl-head">
            <h3>Updates <small class="muted">{{ v.updates.length }}</small></h3>
            @if (v.canPost) { <p-button label="Post an update" icon="pi pi-plus" (onClick)="startPost(v)" /> }
          </div>
          @if (!v.canPost) { <p-message severity="info" styleClass="note">Posting updates needs the Project status access; you can see them.</p-message> }

          @if (v.updates.length) {
            <p-timeline [value]="v.updates" styleClass="tl">
              <ng-template #marker let-u>
                <span class="mark" [style.background]="stages.color(u.status)"><i [class]="icon(u.status)" aria-hidden="true"></i></span>
              </ng-template>
              <ng-template #opposite let-u>
                <span class="when"><b>{{ u.happenedAt | date: 'd MMM y' }}</b><small>{{ u.happenedAt | date: 'h:mm a' }}</small></span>
              </ng-template>
              <ng-template #content let-u>
                <article class="upd">
                  <div class="upd__head">
                    <p-tag [value]="label(u.status)" [severity]="severity(u.status)" />
                    <span class="when-phone muted">{{ u.happenedAt | date: 'd MMM y, h:mm a' }}</span>
                    @if (u.canEdit) {
                      <span class="upd__acts">
                        <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + u.title" (onClick)="startEdit(v, u)" />
                        <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Remove ' + u.title" (onClick)="remove(u)" />
                      </span>
                    }
                  </div>
                  <h4>{{ u.title }}</h4>
                  @if (u.description) { <p class="desc">{{ u.description }}</p> }
                  @if (u.photoIds.length) {
                    <div class="photos">
                      @for (id of u.photoIds; track id) { <app-project-photo class="photo" [photoId]="id" [alt]="u.title" /> }
                    </div>
                  }
                  <small class="by muted">Posted by {{ u.createdByName ?? '—' }} on {{ u.createdAt | date: 'd MMM y, h:mm a' }}
                    @if (u.updatedAt) { · changed by {{ u.updatedByName ?? '—' }} on {{ u.updatedAt | date: 'd MMM y, h:mm a' }} }</small>
                </article>
              </ng-template>
            </p-timeline>
          } @else {
            <div class="p-card empty"><i class="pi pi-images" aria-hidden="true"></i><b>No updates yet</b>
              <span class="muted">Post the first update with photos of the work; the customer sees it on their link.</span></div>
          }
        } @else {
          <div class="p-card empty pick"><i class="pi pi-briefcase" aria-hidden="true"></i><b>Choose a project</b>
            <span class="muted">Its updates and the customer's link show here.</span></div>
        }
      </section>
    </div>

    <p-dialog [header]="editing() ? 'Change the update' : 'Post an update'" [modal]="true" [visible]="dlgOpen()" (visibleChange)="dlgOpen.set($event)"
              [draggable]="false" appendTo="body" [style]="{ width: '640px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }">
      <div class="form">
        <div class="pf"><label for="up-stage">Stage *</label>
          <p-select inputId="up-stage" [options]="statuses()" optionLabel="label" optionValue="value" appendTo="body" styleClass="stages"
                    [ngModel]="fStatus()" (ngModelChange)="fStatus.set($event)">
            <ng-template #selectedItem let-o>
              @if (o) { <span class="st-opt"><i [class]="icon(o.value)" [style.color]="stages.color(o.value)" aria-hidden="true"></i>{{ o.label }}</span> }
            </ng-template>
            <ng-template #item let-o>
              <span class="st-opt"><i [class]="icon(o.value)" [style.color]="stages.color(o.value)" aria-hidden="true"></i>{{ o.label }}</span>
            </ng-template>
          </p-select>
          <small class="hint">The newest update sets the project's status.</small></div>
        <div class="pf"><label for="up-title">Title *</label>
          <input pInputText id="up-title" maxlength="150" placeholder="e.g. Ground floor windows fixed" [ngModel]="fTitle()" (ngModelChange)="fTitle.set($event)" /></div>
        <div class="pf"><label for="up-desc">What was done</label>
          <textarea pTextarea id="up-desc" rows="4" maxlength="2000" [autoResize]="true" placeholder="Details for the customer: work done, what is next, any visit planned…"
                    [ngModel]="fDesc()" (ngModelChange)="fDesc.set($event)"></textarea></div>
        <div class="pf"><label for="up-when">Date &amp; time *</label>
          <p-datepicker inputId="up-when" [showTime]="true" hourFormat="12" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [maxDate]="now()"
                        [ngModel]="fWhen()" (ngModelChange)="fWhen.set($event)" /></div>
        <div class="pf"><span class="pf-label">Photos of the work <small class="muted">(up to 8)</small></span>
          <div class="pick-photos">
            @for (id of keptPhotos(); track id) {
              <span class="thumb"><app-project-photo [photoId]="id" />
                <button type="button" class="x" (click)="dropKept(id)" aria-label="Remove this photo"><i class="pi pi-times"></i></button></span>
            }
            @for (f of newPhotos(); track f.url) {
              <span class="thumb"><img [src]="f.url" alt="New photo" />
                <button type="button" class="x" (click)="dropNew(f.url)" aria-label="Remove this photo"><i class="pi pi-times"></i></button></span>
            }
            @if (keptPhotos().length + newPhotos().length < 8) {
              <button type="button" class="thumb add" (click)="fileIn.click()"><i class="pi pi-camera" aria-hidden="true"></i><span>Add photos</span></button>
            }
            <input #fileIn type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/*" (change)="pickPhotos(fileIn)" />
          </div></div>
        @if (fError()) { <p-message severity="error">{{ fError() }}</p-message> }
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="dlgOpen.set(false)" />
        <p-button [label]="editing() ? 'Save' : 'Post'" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 18px; align-items: start; }
    .list-card { position: sticky; top: 76px; display: grid; gap: 10px; padding: 14px; max-height: calc(100dvh - 100px); grid-template-rows: auto auto minmax(0, 1fr); }
    :host ::ng-deep .search, :host ::ng-deep .search input { width: 100%; }
    :host ::ng-deep .shows { display: flex; }
    :host ::ng-deep .shows .p-togglebutton { flex: 1; }
    .plist { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: grid; gap: 4px; align-content: start; }
    .prow { width: 100%; display: flex; gap: 10px; justify-content: space-between; align-items: flex-start; text-align: left; padding: 10px; border: 1px solid transparent;
      border-radius: 10px; background: transparent; cursor: pointer; font: inherit; color: inherit; }
    .prow:hover { background: #f8fafc; }
    .prow.on { background: #eef4fc; border-color: #c7dbf3; }
    .prow__main { display: grid; gap: 2px; min-width: 0; }
    .prow__main b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .prow__end { display: grid; justify-items: end; gap: 6px; flex: none; }
    .counts { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: .8rem; }
    .counts .pi-link { color: #1f7a45; }
    .muted { color: var(--muted); font-size: .8rem; }
    .detail { display: grid; gap: 14px; min-width: 0; }
    .proj { display: grid; gap: 14px; }
    .proj__head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .proj__head h2 { margin: 0 0 4px; font-size: 1.3rem; }
    .proj__head p { margin: 0; }
    :host ::ng-deep .big-tag { font-size: .85rem; padding: 6px 12px; }
    .share { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px 14px; border: 1px dashed var(--line); border-radius: 12px; background: #fafafa; }
    .share--on { border-style: solid; border-color: #bfe3cc; background: #f3fbf6; }
    .share > .pi { font-size: 1.2rem; color: var(--muted); }
    .share--on > .pi { color: #1f7a45; }
    .share__text { flex: 1 1 260px; display: grid; gap: 3px; min-width: 0; }
    .link { width: 100%; font-size: .82rem; margin-top: 4px; }
    .share__acts { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .tl-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .tl-head h3 { margin: 0; font-size: 1.1rem; display: flex; gap: 8px; align-items: baseline; }
    :host ::ng-deep .note { margin: 0; }
    :host ::ng-deep .tl .p-timeline-event-opposite { flex: 0 0 120px; padding-top: 10px; }
    :host ::ng-deep .tl .p-timeline-event-content { padding-bottom: 22px; }
    .when { display: grid; justify-items: end; text-align: right; }
    .when small { color: var(--muted); }
    .when-phone { display: none; }
    .mark { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: #fff; box-shadow: 0 0 0 4px #fff, 0 2px 8px rgba(0, 0, 0, .12); }
    .upd { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; display: grid; gap: 8px; box-shadow: 0 4px 14px rgba(23, 59, 99, .05); }
    .upd__head { display: flex; align-items: center; gap: 10px; }
    .upd__acts { margin-left: auto; display: flex; }
    .upd h4 { margin: 0; font-size: 1.02rem; }
    .desc { margin: 0; white-space: pre-line; line-height: 1.55; color: #334155; }
    .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
    .photo { aspect-ratio: 4 / 3; cursor: zoom-in; }
    .by { font-size: .76rem; }
    .empty { display: grid; justify-items: center; gap: 6px; padding: 36px 16px; text-align: center; }
    .empty .pi { font-size: 1.8rem; color: var(--muted); }
    .form { display: grid; gap: 14px; }
    .form input, .form textarea { width: 100%; }
    :host ::ng-deep .stages { width: 100%; }
    .st-opt { display: inline-flex; align-items: center; gap: 8px; }
    .pick-photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
    .thumb { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; border: 1px solid var(--line); background: #f8fafc; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .thumb.add { display: grid; place-items: center; align-content: center; gap: 4px; cursor: pointer; color: #1d5fa3; font: inherit; font-size: .78rem; border-style: dashed; }
    .thumb.add .pi { font-size: 1.3rem; }
    .x { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; border: 0; background: rgba(15, 23, 42, .7); color: #fff;
      display: grid; place-items: center; cursor: pointer; font-size: .7rem; }
    .back { border: 0; background: none; color: #1d5fa3; padding: 0; font: inherit; font-weight: 600; cursor: pointer; justify-self: start; }
    @media (max-width: 960px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .list-card { position: static; max-height: none; }
      .layout.has-pick .list-card { display: none; }
      .layout:not(.has-pick) .detail { display: none; }
      :host ::ng-deep .tl .p-timeline-event-opposite { display: none; }
      .when-phone { display: inline; }
      .photos { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .share__acts { width: 100%; }
    }
  `,
})
export class ProjectStatusPage implements OnInit {
  private readonly api = inject(ProjectStatusService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly brand = inject(TradeBrand);
  /** ?project= : opened straight away (from a project's page). */
  readonly project = input<string>();

  protected readonly rows = signal<StatusRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly show = signal<Show>('ALL');
  protected readonly shows = [{ label: 'All', value: 'ALL' }, { label: 'Open', value: 'OPEN' }, { label: 'Shared', value: 'SHARED' }];
  protected readonly view = signal<ProjectStatusView | null>(null);
  protected readonly stages = inject(ProjectStages);
  /** The stages to choose from, with the one being changed even when switched off. */
  protected readonly statuses = computed(() => {
    const list = this.stages.options();
    const cur = this.fStatus();
    return list.some((o) => o.value === cur) ? list : [...list, { value: cur, label: this.stages.name(cur) }];
  });
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.rows().filter((p) =>
      (this.show() === 'ALL' || (this.show() === 'SHARED' ? p.shared : this.stages.isOpen(p.status))) &&
      (!q || [p.name, p.code, p.customerName, p.customerPhone].some((v) => v?.toLowerCase().includes(q))));
  });

  // the post / change dialog
  protected readonly dlgOpen = signal(false);
  protected readonly editing = signal<ProjectUpdate | null>(null);
  protected readonly fStatus = signal<ProjectStatus>('IN_PROGRESS');
  protected readonly fTitle = signal('');
  protected readonly fDesc = signal('');
  protected readonly fWhen = signal<Date | null>(new Date());
  protected readonly keptPhotos = signal<number[]>([]);
  protected readonly droppedPhotos = signal<number[]>([]);
  protected readonly newPhotos = signal<{ url: string; file: File }[]>([]);
  protected readonly fError = signal('');
  protected readonly busy = signal(false);
  protected readonly now = signal(new Date());

  ngOnInit(): void {
    this.stages.load();
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
    const id = Number(this.project());
    if (id) this.open(id);
  }

  load(): void {
    this.loading.set(true);
    this.api.board(this.brand.selected()).subscribe({
      next: (r) => {
        this.rows.set(r);
        this.loading.set(false);
        this.error.set('');
        const v = this.view();
        if (v && !r.some((x) => x.id === v.project.id)) this.view.set(null);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected open(id: number): void {
    this.api.of(id).subscribe({ next: (v) => this.show_(v), error: (e) => this.error.set(apiProblem(e).message) });
  }

  /** A fresh view of the project, and its row in the list. */
  private show_(v: ProjectStatusView): void {
    this.view.set(v);
    this.rows.update((list) => list.map((r) => (r.id === v.project.id ? v.project : r)));
  }

  protected label(s: ProjectStatus): string {
    return this.stages.name(s);
  }

  protected severity(s: ProjectStatus) {
    return this.stages.severity(s);
  }

  protected icon(s: ProjectStatus): string {
    return this.stages.icon(s);
  }

  protected link(path: string): string {
    return ProjectStatusService.link(path);
  }

  // ---- sharing ----

  protected share(v: ProjectStatusView): void {
    this.api.share(v.project.id).subscribe({
      next: (n) => {
        this.show_(n);
        this.toast.add({ severity: 'success', summary: 'Link ready', detail: `Send it to ${n.project.customerName}.` });
      },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Not shared', detail: apiProblem(e).message }),
    });
  }

  protected renew(v: ProjectStatusView): void {
    this.confirm.confirm({
      header: 'A new link', message: 'Make a new link? The link sent before stops working.', icon: 'pi pi-refresh',
      acceptLabel: 'New link', rejectLabel: 'Keep', rejectButtonProps: { outlined: true },
      accept: () => this.share(v),
    });
  }

  protected unshare(v: ProjectStatusView): void {
    this.confirm.confirm({
      header: 'Stop sharing', message: `Stop sharing with ${v.project.customerName}? The link stops working; you can share again later.`,
      icon: 'pi pi-ban', acceptLabel: 'Stop sharing', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.api.unshare(v.project.id).subscribe({
        next: (n) => {
          this.show_(n);
          this.toast.add({ severity: 'success', summary: 'Not shared any more' });
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not changed', detail: apiProblem(e).message }),
      }),
    });
  }

  protected copy(path: string): void {
    navigator.clipboard?.writeText(this.link(path)).then(
      () => this.toast.add({ severity: 'success', summary: 'Link copied' }),
      () => this.toast.add({ severity: 'warn', summary: 'Copy it from the box' }),
    );
  }

  protected openLink(path: string): void {
    window.open(this.link(path), '_blank', 'noopener');
  }

  protected whatsapp(v: ProjectStatusView): void {
    const text = `Hello ${v.project.customerName}, you can follow the progress of your project ${v.project.name} (${v.project.code}) here: ${this.link(v.sharePath!)}`;
    const phone = (v.project.customerPhone ?? '').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  // ---- posting ----

  protected startPost(v: ProjectStatusView): void {
    this.editing.set(null);
    this.fStatus.set(v.project.status);
    this.fTitle.set('');
    this.fDesc.set('');
    this.now.set(new Date());
    this.fWhen.set(new Date());
    this.keptPhotos.set([]);
    this.droppedPhotos.set([]);
    this.clearNew();
    this.fError.set('');
    this.dlgOpen.set(true);
  }

  protected startEdit(v: ProjectStatusView, u: ProjectUpdate): void {
    this.editing.set(u);
    this.fStatus.set(u.status);
    this.fTitle.set(u.title);
    this.fDesc.set(u.description ?? '');
    this.now.set(new Date());
    this.fWhen.set(new Date(u.happenedAt));
    this.keptPhotos.set([...u.photoIds]);
    this.droppedPhotos.set([]);
    this.clearNew();
    this.fError.set('');
    this.dlgOpen.set(true);
  }

  protected pickPhotos(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = '';
    const room = 8 - this.keptPhotos().length - this.newPhotos().length;
    const ok = files.filter((f) => f.type.startsWith('image/')).slice(0, Math.max(room, 0));
    if (files.length > ok.length) this.toast.add({ severity: 'warn', summary: 'Some photos were left out', detail: 'Pictures only, at most 8 an update.' });
    this.newPhotos.update((list) => [...list, ...ok.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  protected dropNew(url: string): void {
    URL.revokeObjectURL(url);
    this.newPhotos.update((list) => list.filter((f) => f.url !== url));
  }

  protected dropKept(id: number): void {
    this.keptPhotos.update((list) => list.filter((x) => x !== id));
    this.droppedPhotos.update((list) => [...list, id]);
  }

  private clearNew(): void {
    this.newPhotos().forEach((f) => URL.revokeObjectURL(f.url));
    this.newPhotos.set([]);
  }

  protected save(): void {
    const v = this.view();
    if (!v) return;
    const title = this.fTitle().trim();
    if (!title) return this.fError.set('Give the update a title.');
    const when = this.fWhen();
    if (!when) return this.fError.set('Give the date and time.');
    if (when.getTime() > Date.now() + 10 * 60_000) return this.fError.set('The date and time cannot be in the future.');
    this.fError.set('');
    this.busy.set(true);
    const body = { status: this.fStatus(), title, description: this.fDesc().trim() || null, happenedAt: when.toISOString() };
    const editing = this.editing();
    const saved$: Observable<ProjectStatusView> = editing ? this.api.edit(editing.id, body) : this.api.post(v.project.id, body);
    let saved: ProjectStatusView | null = null;
    saved$.pipe(
      // then its photos: the ones taken out, then the new ones (made lighter first)
      switchMap((after) => {
        saved = after;
        const id = after.touchedId;
        const drops = this.droppedPhotos().map((p) => this.api.removePhoto(p));
        const files = this.newPhotos().map((f) => f.file);
        const removed$ = drops.length ? forkJoin(drops) : of([]);
        return removed$.pipe(switchMap(() => !id || !files.length ? of(after)
          : from(Promise.all(files.map((f) => shrinkPicture(f)))).pipe(switchMap((blobs) => this.api.addPhotos(id, blobs)))),
          switchMap(() => this.api.of(v.project.id)));
      }),
    ).subscribe({
      next: (n) => {
        this.busy.set(false);
        this.dlgOpen.set(false);
        this.clearNew();
        this.show_(n);
        this.toast.add({ severity: 'success', summary: editing ? 'Update saved' : 'Update posted', detail: title });
      },
      error: (e) => {
        this.busy.set(false);
        const s = saved as ProjectStatusView | null;
        const posted = s?.updates.find((u) => u.id === s.touchedId);
        if (s && posted) {
          // the update itself is saved: show it, and a retry only adds the photos
          this.show_(s);
          this.editing.set(posted);
          this.keptPhotos.set([...posted.photoIds]);
          this.droppedPhotos.set([]);
          this.fError.set('The update is saved, but the photos could not be added: ' + apiProblem(e).message);
          return;
        }
        this.fError.set(apiProblem(e).message);
      },
    });
  }

  protected remove(u: ProjectUpdate): void {
    this.confirm.confirm({
      header: 'Remove update', message: `Remove “${u.title}” and its photos? The customer will not see it any more.`, icon: 'pi pi-trash',
      acceptLabel: 'Remove', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.api.remove(u.id).subscribe({
        next: (n) => {
          this.show_(n);
          this.toast.add({ severity: 'success', summary: 'Update removed' });
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not removed', detail: apiProblem(e).message }),
      }),
    });
  }
}
