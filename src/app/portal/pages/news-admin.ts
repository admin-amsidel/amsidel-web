/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { NewsPicture } from '../news-board';
import {
  News, NEWS_AUDIENCES, NEWS_CATEGORIES, NEWS_CATEGORY_OPTIONS, NewsAudience, NewsCategory, NewsService, NewsStatus, onWebsite, shrinkPicture,
} from '../news.service';
import { apiProblem, Brand, toIsoDate } from '../portal.models';
import { StaffService } from '../staff.service';

type Show = 'NOW' | NewsStatus | 'ALL';

const STATUS: Record<NewsStatus, { label: string; severity: 'success' | 'info' | 'secondary' | 'warn' }> = {
  LIVE: { label: 'Showing', severity: 'success' },
  SCHEDULED: { label: 'Coming', severity: 'info' },
  ENDED: { label: 'Ended', severity: 'secondary' },
  HIDDEN: { label: 'Hidden', severity: 'warn' },
};

/**
 * Administration > News & announcements: what the dashboard slider shows (and the website, for customers). Each
 * item has a heading, text, picture, what it is about, who it is for, a brand (or the whole group), the days it
 * shows, and can be pinned first or hidden. Deleting removes it and its picture.
 */
@Component({
  selector: 'app-news-admin',
  imports: [
    FormsModule, DatePipe, ButtonModule, CheckboxModule, DatePickerModule, DialogModule, InputTextModule, MessageModule, SelectModule,
    SelectButtonModule, TableModule, TagModule, TextareaModule, NewsPicture,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>News & announcements</h1>
        <p>What everyone sees on the dashboard after signing in: discounts, promotions, birthday wishes, important notices.
          News for customers also shows on the website. Birthdays come up by themselves from the employees' dates of birth.</p>
      </div>
      <div class="head-actions"><p-button label="Add news" icon="pi pi-plus" (onClick)="add()" /></div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <div class="bar">
        <p-selectbutton [options]="shows()" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Show"
                        [ngModel]="show()" (ngModelChange)="show.set($event)" />
      </div>
      <p-table [value]="shown()" dataKey="id" styleClass="p-stack only-desk" [loading]="loading()" [tableStyle]="{ 'min-width': '900px' }"
               [paginator]="shown().length > 20" [rows]="20">
        <ng-template #header>
          <tr><th style="width: 84px">Picture</th><th>News</th><th>For</th><th>Shows</th><th>Status</th><th>By</th><th class="acts-h"><span class="sr-only">Actions</span></th></tr>
        </ng-template>
        <ng-template #body let-n>
          <tr>
            <td data-label="Picture"><span class="thumb" [class]="'thumb tone-' + cat(n).tone"><app-news-picture [news]="n" /></span></td>
            <td data-label="News" class="stack-full">
              <b>{{ n.title }}</b>@if (n.pinned) { <i class="pi pi-thumbtack pin" title="Pinned first" aria-label="Pinned"></i> }
              <small class="block muted"><i [class]="cat(n).icon" aria-hidden="true"></i> {{ cat(n).label }}{{ n.brandName ? ' · ' + n.brandName : ' · Whole group' }}</small>
              @if (n.body) { <small class="block clip">{{ n.body }}</small> }
            </td>
            <td data-label="For">{{ audience(n.audience) }}
              @if (web(n.audience)) { <small class="block web"><i class="pi pi-globe" aria-hidden="true"></i> {{ n.category === 'DISCOUNT' ? 'Website offer' : 'On the website' }}</small> }</td>
            <td data-label="Shows" class="nowrap">{{ n.startDate | date: 'd MMM y' }}<small class="block muted">{{ n.endDate ? 'to ' + (n.endDate | date: 'd MMM y') : 'until hidden' }}</small></td>
            <td data-label="Status"><p-tag [value]="status(n).label" [severity]="status(n).severity" /></td>
            <td data-label="By" class="by">{{ n.updatedByName ?? n.createdByName ?? '—' }}<small class="block muted">{{ (n.updatedAt ?? n.createdAt) | date: 'd MMM y, h:mm a' }}</small></td>
            <td class="acts">
              <p-button [icon]="n.active ? 'pi pi-eye-slash' : 'pi pi-eye'" [text]="true" [rounded]="true" size="small"
                        [ariaLabel]="(n.active ? 'Hide ' : 'Show ') + n.title" (onClick)="toggle(n)" />
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + n.title" (onClick)="edit(n)" />
              <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete ' + n.title" (onClick)="remove(n)" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ rows().length ? 'Nothing here.' : 'No news yet: add the first one.' }}</td></tr></ng-template>
      </p-table>
      <ul class="mlist only-phone" aria-label="News">
        @for (n of shown(); track n.id) {
          <li class="mrow">
            <span class="nrow"><span [class]="'thumb sm tone-' + cat(n).tone"><app-news-picture [news]="n" /></span>
              <span><span class="mrow__title">{{ n.title }}@if (n.pinned) { <i class="pi pi-thumbtack pin" aria-label="Pinned"></i> }</span>
                <span class="mrow__sub">{{ cat(n).label }} · {{ audience(n.audience) }}{{ web(n.audience) ? (n.category === 'DISCOUNT' ? ' · website offer' : ' · on the website') : '' }}{{ n.brandCode ? ' · ' + n.brandCode : '' }}</span>
                <span class="mrow__sub">{{ n.startDate | date: 'd MMM' }} – {{ n.endDate ? (n.endDate | date: 'd MMM y') : 'until hidden' }}</span></span></span>
            <span class="mrow__end"><p-tag [value]="status(n).label" [severity]="status(n).severity" /></span>
            <span class="mrow__acts">
              <p-button [label]="n.active ? 'Hide' : 'Show'" [icon]="n.active ? 'pi pi-eye-slash' : 'pi pi-eye'" [text]="true" size="small" (onClick)="toggle(n)" />
              <p-button label="Edit" icon="pi pi-pencil" [text]="true" size="small" (onClick)="edit(n)" />
              <p-button label="Delete" icon="pi pi-trash" [text]="true" size="small" severity="danger" (onClick)="remove(n)" />
            </span>
          </li>
        } @empty { <li class="p-empty">{{ rows().length ? 'Nothing here.' : 'No news yet: add the first one.' }}</li> }
      </ul>
    </section>

    <p-dialog [header]="editing() ? 'Change news' : 'Add news'" [modal]="true" [visible]="open()" (visibleChange)="open.set($event)" [draggable]="false"
              appendTo="body" [style]="{ width: '680px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }">
      <div class="form">
        <div class="pf"><label for="nw-title">Heading *</label>
          <input pInputText id="nw-title" maxlength="150" placeholder="e.g. Diwali offer: 15% off all uPVC windows" [ngModel]="title()" (ngModelChange)="title.set($event)" /></div>
        <div class="pf"><label for="nw-body">Description</label>
          <textarea pTextarea id="nw-body" rows="4" maxlength="4000" [autoResize]="true" placeholder="The details: what, for whom, till when, how to claim it"
                    [ngModel]="text()" (ngModelChange)="text.set($event)"></textarea>
          <small class="hint">{{ text().length }} / 4000</small></div>
        <div class="two">
          <div class="pf"><label for="nw-cat">About *</label>
            <p-select inputId="nw-cat" [options]="categories" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="category()" (ngModelChange)="setCategory($event)">
              <ng-template #item let-c><span class="opt"><i [class]="c.icon" aria-hidden="true"></i> {{ c.label }}</span></ng-template>
            </p-select></div>
          <div class="pf"><label for="nw-brand">Brand</label>
            <p-select inputId="nw-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="brandId()" (ngModelChange)="brandId.set($event)" />
            <small class="hint">A brand's news shows to that brand's people only.</small></div>
        </div>
        <div class="pf"><span class="pf-label" id="nw-aud">For *</span>
          <p-selectbutton [options]="audiences" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabelledBy="nw-aud"
                          [ngModel]="audienceV()" (ngModelChange)="audienceV.set($event)" />
          <small class="hint">{{ audienceHint() }}</small>
          @if ((category() === 'DISCOUNT' || category() === 'PROMOTION') && !web(audienceV())) {
            <small class="hint warn-hint"><i class="pi pi-info-circle" aria-hidden="true"></i> Not on the public website, so it will not show under its Offers. Choose Public or All to show it there.</small>
          }</div>
        <div class="two">
          <div class="pf"><label for="nw-from">Shows from *</label>
            <p-datepicker inputId="nw-from" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" panelStyleClass="over-dialog" [ngModel]="from()" (ngModelChange)="from.set($event)" /></div>
          <div class="pf"><label for="nw-to">Last day</label>
            <p-datepicker inputId="nw-to" dateFormat="dd/mm/yy" [showIcon]="true" [showClear]="true" appendTo="body" panelStyleClass="over-dialog"
                          [minDate]="from()" placeholder="Until hidden" [ngModel]="to()" (ngModelChange)="to.set($event)" /></div>
        </div>
        <div class="checks">
          <label class="check"><p-checkbox [binary]="true" inputId="nw-active" [ngModel]="active()" (ngModelChange)="active.set($event)" /> Showing (untick to hide it for now)</label>
          <label class="check"><p-checkbox [binary]="true" inputId="nw-pin" [ngModel]="pinned()" (ngModelChange)="pinned.set($event)" /> Pin first in the slider</label>
        </div>

        <div class="pf"><span class="pf-label">Picture</span>
          <div class="pic">
            <div class="pic__box" [class]="'pic__box tone-' + toneOf(category())">
              @if (preview()) { <img [src]="preview()" alt="The picture to upload" /> }
              @else if (editing()?.imageUpdatedAt && !dropImage()) { <app-news-picture [news]="editing()!" alt="The picture" /> }
              @else { <span class="pic__none"><i class="pi pi-image" aria-hidden="true"></i> No picture</span> }
            </div>
            <div class="pic__acts">
              <input #picFile type="file" accept="image/jpeg,image/png,image/webp" class="hidden" (change)="pick($event)" aria-label="Picture file" />
              <p-button label="Choose picture" icon="pi pi-upload" size="small" [outlined]="true" (onClick)="picFile.click()" />
              @if (preview() || (editing()?.imageUpdatedAt && !dropImage())) {
                <p-button label="Remove" icon="pi pi-times" size="small" [text]="true" severity="danger" (onClick)="clearPicture()" />
              }
              <small class="hint">JPEG, PNG or WebP. Wide pictures look best (about 1600 × 900); large ones are made smaller.</small>
            </div>
          </div>
        </div>
        @if (formError()) { <p-message severity="error">{{ formError() }}</p-message> }
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="open.set(false)" />
        <p-button [label]="editing() ? 'Save changes' : 'Publish news'" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .bar { margin-bottom: 14px; }
    .thumb { display: block; width: 72px; height: 48px; border-radius: 8px; overflow: hidden; background: linear-gradient(120deg, #123a63, #1d5fa3); }
    .thumb ::ng-deep .ph { font-size: 1.1rem; }
    .tone-green { background: linear-gradient(120deg, #0f4d33, #1f7a45); }
    .tone-red { background: linear-gradient(120deg, #6b1712, #b3261e); }
    .tone-violet { background: linear-gradient(120deg, #3b1f6b, #6941b8); }
    .tone-pink { background: linear-gradient(120deg, #7a1f4b, #c2457f); }
    .tone-amber { background: linear-gradient(120deg, #6b3c07, #b45309); }
    .tone-grey { background: linear-gradient(120deg, #2b3440, #4b5868); }
    .pin { color: var(--brass-dark); margin-left: 6px; font-size: .8rem; }
    .block { display: block; }
    .muted { color: var(--muted); }
    .clip { max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
    .acts { text-align: right; white-space: nowrap; }
    .acts-h { width: 132px; }
    .by { min-width: 130px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .form { display: grid; gap: 14px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .opt { display: inline-flex; gap: 8px; align-items: center; }
    .warn-hint { color: #b45309; display: flex; gap: 6px; align-items: flex-start; }
    .web { color: #1f7a45; font-size: .76rem; }
    .checks { display: flex; gap: 20px; flex-wrap: wrap; }
    .check { display: inline-flex; gap: 8px; align-items: center; font-size: .9rem; cursor: pointer; }
    .pic { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 14px; align-items: start; }
    .pic__box { aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; display: grid; place-items: center; background: linear-gradient(120deg, #123a63, #1d5fa3); }
    .pic__box img { width: 100%; height: 100%; object-fit: cover; }
    .pic__none { color: rgba(255, 255, 255, .85); font-size: .86rem; display: inline-flex; gap: 6px; align-items: center; }
    .pic__acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .pic__acts .hint { flex-basis: 100%; }
    .hidden { display: none; }
    .nrow { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
    .nrow > span:last-child { min-width: 0; }
    .thumb.sm { width: 52px; height: 52px; flex: none; }
    .mrow__acts { margin-left: -8px; }
    @media (max-width: 760px) { .acts { text-align: left; } .clip { max-width: none; white-space: normal; } }
    @media (max-width: 520px) { .two, .pic { grid-template-columns: 1fr; } }
  `,
})
export class NewsAdmin implements OnInit {
  private readonly newsService = inject(NewsService);
  private readonly staff = inject(StaffService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly categories = NEWS_CATEGORY_OPTIONS;
  protected readonly audiences = NEWS_AUDIENCES.map((a) => ({ value: a.value, label: a.label }));
  protected readonly rows = signal<News[]>([]);
  protected readonly brands = signal<Brand[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly show = signal<Show>('NOW');
  protected readonly shows = computed(() => {
    const count = (s: NewsStatus) => this.rows().filter((n) => n.status === s).length;
    return [
      { label: `Showing & coming (${count('LIVE') + count('SCHEDULED')})`, value: 'NOW' },
      { label: `Hidden (${count('HIDDEN')})`, value: 'HIDDEN' },
      { label: `Ended (${count('ENDED')})`, value: 'ENDED' },
      { label: `All (${this.rows().length})`, value: 'ALL' },
    ];
  });
  protected readonly shown = computed(() => this.rows().filter((n) =>
    this.show() === 'ALL' || (this.show() === 'NOW' ? n.status === 'LIVE' || n.status === 'SCHEDULED' : n.status === this.show())));
  protected readonly brandOptions = computed(() => [{ value: null, label: 'Whole group' }, ...this.brands().map((b) => ({ value: b.id, label: b.name }))]);

  protected readonly open = signal(false);
  protected readonly editing = signal<News | null>(null);
  protected readonly title = signal('');
  protected readonly text = signal('');
  protected readonly category = signal<NewsCategory>('ANNOUNCEMENT');
  protected readonly audienceV = signal<NewsAudience>('EMPLOYEES');
  protected readonly brandId = signal<number | null>(null);
  protected readonly from = signal<Date | null>(new Date());
  protected readonly to = signal<Date | null>(null);
  protected readonly active = signal(true);
  protected readonly pinned = signal(false);
  protected readonly picture = signal<Blob | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly dropImage = signal(false);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly audienceHint = computed(() => NEWS_AUDIENCES.find((a) => a.value === this.audienceV())?.hint ?? '');

  ngOnInit(): void {
    this.load();
    this.staff.brands().subscribe({ next: (b) => this.brands.set(b.filter((x) => x.active)), error: () => undefined });
  }

  private load(): void {
    this.loading.set(true);
    this.newsService.all().subscribe({
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

  protected cat(n: News) {
    return NEWS_CATEGORIES[n.category];
  }

  protected toneOf(c: NewsCategory): string {
    return NEWS_CATEGORIES[c].tone;
  }

  /** A new discount or promotion is usually for the website too: For becomes All (it can still be changed). */
  protected setCategory(c: NewsCategory): void {
    this.category.set(c);
    if (!this.editing() && (c === 'DISCOUNT' || c === 'PROMOTION') && !onWebsite(this.audienceV())) this.audienceV.set('EVERYONE');
  }

  protected readonly web = onWebsite;

  protected status(n: News) {
    return STATUS[n.status];
  }

  protected audience(a: NewsAudience): string {
    return NEWS_AUDIENCES.find((x) => x.value === a)?.label ?? a;
  }

  protected add(): void {
    this.editing.set(null);
    this.title.set('');
    this.text.set('');
    this.category.set('ANNOUNCEMENT');
    this.audienceV.set('EMPLOYEES');
    this.brandId.set(null);
    this.from.set(new Date());
    this.to.set(null);
    this.active.set(true);
    this.pinned.set(false);
    this.resetPicture();
    this.formError.set('');
    this.open.set(true);
  }

  protected edit(n: News): void {
    this.editing.set(n);
    this.title.set(n.title);
    this.text.set(n.body ?? '');
    this.category.set(n.category);
    this.audienceV.set(n.audience);
    this.brandId.set(n.brandId);
    this.from.set(new Date(n.startDate));
    this.to.set(n.endDate ? new Date(n.endDate) : null);
    this.active.set(n.active);
    this.pinned.set(n.pinned);
    this.resetPicture();
    this.formError.set('');
    this.open.set(true);
  }

  private resetPicture(): void {
    if (this.preview()) URL.revokeObjectURL(this.preview()!);
    this.picture.set(null);
    this.preview.set(null);
    this.dropImage.set(false);
  }

  protected async pick(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return this.formError.set('Choose a JPEG, PNG or WebP picture.');
    try {
      const small = await shrinkPicture(file);
      if (small.size > 3 * 1024 * 1024) return this.formError.set('The picture is still larger than 3 MB; choose a smaller one.');
      if (this.preview()) URL.revokeObjectURL(this.preview()!);
      this.picture.set(small);
      this.preview.set(URL.createObjectURL(small));
      this.dropImage.set(false);
      this.formError.set('');
    } catch {
      this.formError.set('That picture could not be read.');
    }
  }

  protected clearPicture(): void {
    if (this.preview()) {
      URL.revokeObjectURL(this.preview()!);
      this.preview.set(null);
      this.picture.set(null);
    } else {
      this.dropImage.set(true);
    }
  }

  protected save(): void {
    if (!this.title().trim()) return this.formError.set('Give the heading.');
    if (!this.from()) return this.formError.set('Give the first day it shows.');
    if (this.to() && this.to()! < this.from()!) return this.formError.set('The last day is before the first day.');
    const existing = this.editing();
    this.busy.set(true);
    this.newsService.save(existing?.id ?? null, {
      title: this.title().trim(), body: this.text().trim() || null, category: this.category(), audience: this.audienceV(),
      brandId: this.brandId(), startDate: toIsoDate(this.from()), endDate: toIsoDate(this.to()), active: this.active(), pinned: this.pinned(),
    }).subscribe({
      next: (n) => {
        const done = () => {
          this.busy.set(false);
          this.open.set(false);
          this.resetPicture();
          this.toast.add({ severity: 'success', summary: existing ? 'News saved' : 'News published', detail: n.title });
          this.load();
        };
        const pic = this.picture();
        if (pic) {
          this.newsService.uploadImage(n.id, pic).subscribe({ next: done, error: (e) => this.failed(e, 'The news is saved, but the picture was not: ') });
        } else if (this.dropImage() && existing?.imageUpdatedAt) {
          this.newsService.deleteImage(n.id).subscribe({ next: done, error: (e) => this.failed(e, 'The news is saved, but the picture was not removed: ') });
        } else {
          done();
        }
      },
      error: (e) => this.failed(e, ''),
    });
  }

  private failed(e: unknown, prefix: string): void {
    this.busy.set(false);
    const p = apiProblem(e);
    this.formError.set(prefix + (Object.values(p.fields)[0] ?? p.message));
    if (prefix) this.load();
  }

  protected toggle(n: News): void {
    this.newsService.save(n.id, {
      title: n.title, body: n.body, category: n.category, audience: n.audience, brandId: n.brandId, startDate: n.startDate,
      endDate: n.endDate, active: !n.active, pinned: n.pinned,
    }).subscribe({
      next: (x) => {
        this.toast.add({ severity: 'success', summary: x.active ? 'Showing again' : 'Hidden', detail: x.title });
        this.load();
      },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Not changed', detail: apiProblem(e).message }),
    });
  }

  protected remove(n: News): void {
    this.confirm.confirm({
      header: 'Delete news', message: `Delete "${n.title}" and its picture? To take it off the dashboard for now, hide it instead.`,
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.newsService.delete(n.id).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'News deleted', detail: n.title });
          this.load();
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message }),
      }),
    });
  }
}
