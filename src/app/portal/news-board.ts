/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, input, OnInit, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { switchMap } from 'rxjs';
import { Avatar } from './avatar';
import { Birthday, News, NEWS_CATEGORIES, NewsFeed, NewsService } from './news.service';

/** One slide: a news item, or today's birthdays together. */
type Slide = { kind: 'news'; news: News } | { kind: 'birthdays'; people: Birthday[] };

/** How long each slide shows, in milliseconds. */
const SLIDE_MS = 6500;

/** A news item's picture, loaded with the login token. */
@Component({
  selector: 'app-news-picture',
  template: `
    @if (url(); as u) {
      @if (whole()) {
        <img class="fill" [src]="u" alt="" aria-hidden="true" />
        <img class="whole" [src]="u" [alt]="alt()" loading="lazy" />
      } @else {
        <img [src]="u" [alt]="alt()" loading="lazy" />
      }
    } @else { <span class="ph"><i [class]="icon()" aria-hidden="true"></i></span> }`,
  styles: `
    :host { display: block; width: 100%; height: 100%; position: relative; overflow: hidden; }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
    /* the whole poster, nothing cut off; the same picture blurred fills the space around it */
    .fill { position: absolute; inset: -20px; width: calc(100% + 40px); height: calc(100% + 40px); filter: blur(18px) brightness(.7); transform: scale(1.05); }
    .whole { position: relative; object-fit: contain; }
    .ph { width: 100%; height: 100%; display: grid; place-items: center; font-size: 2.4rem; color: #9ca3af; }
  `,
})
export class NewsPicture {
  private readonly newsService = inject(NewsService);
  readonly news = input.required<News>();
  readonly alt = input('');
  /** Show the whole picture (a poster) instead of filling the box by cropping it. */
  readonly whole = input(false);
  protected readonly icon = computed(() => NEWS_CATEGORIES[this.news().category].icon);
  protected readonly url = toSignal(toObservable(this.news).pipe(switchMap((n) => this.newsService.image(n))), { initialValue: null });
}

/**
 * The home page's news: a small block sliding through today's news (pinned first) and birthdays, moving on by itself
 * (paused while pointed at, focused or the tab is hidden; not at all when the person prefers less motion). Choosing one
 * opens a popup with all of it. People with the News menu get a link to manage them.
 */
@Component({
  selector: 'app-news-board',
  imports: [DatePipe, RouterLink, ButtonModule, DialogModule, Avatar, NewsPicture],
  template: `
    <section class="board" aria-labelledby="nb-title">
      <div class="board__head">
        <h2 id="nb-title"><i class="pi pi-megaphone" aria-hidden="true"></i> News &amp; announcements</h2>
        @if (feed()?.canManage) { <a class="manage" routerLink="/portal/admin/news" aria-label="Manage news"><i class="pi pi-cog" aria-hidden="true"></i></a> }
      </div>

      @if (slides().length) {
        <div class="slider" role="region" aria-roledescription="carousel" aria-label="News" (mouseenter)="hold.set(true)" (mouseleave)="hold.set(false)"
             (focusin)="hold.set(true)" (focusout)="hold.set(false)" (pointerdown)="swipeStart($event)" (pointerup)="swipeEnd($event)">
          @for (s of slides(); track $index; let i = $index) {
            <button type="button" class="slide" [class.on]="i === at()" [attr.aria-hidden]="i !== at()" [tabindex]="i === at() ? 0 : -1"
                    aria-roledescription="slide" [attr.aria-label]="'Open: ' + slideTitle(s)" (click)="open.set(s)">
              @if (s.kind === 'news') {
                <span class="pic"><app-news-picture [news]="s.news" [alt]="s.news.title" [whole]="true" /></span>
                <span class="chip"><i [class]="cat(s.news).icon" aria-hidden="true"></i> {{ cat(s.news).label }}@if (s.news.pinned) { <i class="pi pi-thumbtack" aria-hidden="true"></i> }</span>
                <b class="title">{{ s.news.title }}</b>
                <small class="muted">{{ s.news.startDate | date: 'd MMM' }}{{ s.news.endDate ? ' – ' + (s.news.endDate | date: 'd MMM') : '' }}{{ s.news.brandCode ? ' · ' + s.news.brandCode : '' }}</small>
              } @else {
                <span class="pic bday">
                  <span class="faces">
                    @for (p of s.people.slice(0, 3); track p.id) {
                      <app-avatar [name]="p.name" [employeeId]="p.id" [photoVersion]="p.photoUpdatedAt" [size]="s.people.length > 1 ? 56 : 84" />
                    }
                  </span>
                </span>
                <span class="chip"><i class="pi pi-gift" aria-hidden="true"></i> Birthday today</span>
                <b class="title">Happy birthday, {{ names(s.people) }}! 🎂</b>
                <small class="muted">Wish them well today</small>
              }
            </button>
          }
          @if (slides().length > 1) {
            <div class="controls">
              <button type="button" class="nav" aria-label="Previous news" (click)="go(at() - 1)"><i class="pi pi-chevron-left" aria-hidden="true"></i></button>
              <div class="dots" aria-hidden="true">
                @for (s of slides(); track $index; let i = $index) {
                  <span [class.on]="i === at()">@if (i === at() && moving()) { <span class="fill" [style.animation-duration.ms]="slideMs"></span> }</span>
                }
              </div>
              <span class="count">{{ at() + 1 }} / {{ slides().length }}</span>
              <button type="button" class="nav" aria-label="Next news" (click)="go(at() + 1)"><i class="pi pi-chevron-right" aria-hidden="true"></i></button>
            </div>
          }
        </div>
      } @else if (feed()) {
        <p class="empty">No news today.@if (feed()?.canManage) { <a routerLink="/portal/admin/news"> Add one</a> }</p>
      }
    </section>

    <p-dialog [header]="open() ? slideTitle(open()!) : ''" [modal]="true" [visible]="!!open()" (visibleChange)="!$event && open.set(null)" [draggable]="false"
              [dismissableMask]="true" appendTo="body" [style]="{ width: '640px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }">
      @if (open(); as o) {
        @if (o.kind === 'news') {
          @let n = o.news;
          @if (n.imageUpdatedAt) { <div class="full-pic"><app-news-picture [news]="n" [alt]="n.title" /></div> }
          <p class="full-cat"><i [class]="cat(n).icon" aria-hidden="true"></i> {{ cat(n).label }}{{ n.brandName ? ' · ' + n.brandName : '' }}
            · {{ n.startDate | date: 'd MMM y' }}{{ n.endDate ? ' to ' + (n.endDate | date: 'd MMM y') : '' }}</p>
          @if (n.body) { <p class="full-body">{{ n.body }}</p> }
          @if (n.audience !== 'EMPLOYEES') {
            <a class="share" [href]="whatsapp(n)" target="_blank" rel="noopener"><i class="pi pi-whatsapp" aria-hidden="true"></i> Share on WhatsApp</a>
          }
        } @else {
          <p class="full-body">Wishing you a wonderful year ahead, from everyone at Amsidel.</p>
          <ul class="bday-list">
            @for (p of o.people; track p.id) {
              <li>
                <app-avatar [name]="p.name" [employeeId]="p.id" [photoVersion]="p.photoUpdatedAt" [size]="44" />
                <span><b>{{ p.name }}</b>@if (p.designation) { <small class="muted">{{ p.designation }}</small> }</span>
              </li>
            }
          </ul>
        }
      }
    </p-dialog>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .board { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 14px; box-shadow: var(--shadow); }
    .board__head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; }
    .board__head h2 { margin: 0; font-size: .98rem; display: flex; gap: 8px; align-items: center; }
    .board__head h2 i { color: var(--brass-dark); }
    .manage { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; color: var(--brass-dark); text-decoration: none; }
    .manage:hover { background: var(--accent-soft); }
    .slider { position: relative; height: 322px; touch-action: pan-y; }
    .slide { position: absolute; inset: 0 0 38px; display: flex; flex-direction: column; align-items: flex-start; gap: 5px; padding: 0; border: 0; border-radius: 10px;
      background: #fff; color: var(--ink); text-align: left; font: inherit; cursor: pointer; opacity: 0; visibility: hidden; transform: translateX(14px);
      transition: opacity .5s ease, transform .5s ease, visibility .5s; }
    .slide.on { opacity: 1; visibility: visible; transform: none; z-index: 1; }
    .slide:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
    .pic { display: block; width: 100%; height: 170px; flex: none; margin-bottom: 3px; border-radius: 10px; overflow: hidden; background: #f4f4f5; }
    .bday { display: grid; place-items: center; background: var(--accent-soft); }
    .faces { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding: 10px; }
    .chip { display: inline-flex; align-items: center; gap: 5px; font-size: .68rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--brass-dark); }
    .title { width: 100%; font-size: .94rem; line-height: 1.3; font-weight: 600; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .muted { color: var(--muted); font-size: .76rem; }
    .controls { position: absolute; inset: auto 0 0; z-index: 2; display: flex; align-items: center; gap: 8px; height: 32px; }
    .nav { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 50%; background: #fff; color: var(--ink); font-size: .72rem; cursor: pointer; }
    .nav:hover, .nav:focus-visible { border-color: var(--brass); color: var(--brass-dark); }
    .dots { flex: 1 1 auto; min-width: 0; display: flex; gap: 4px; justify-content: center; overflow: hidden; }
    .dots > span { position: relative; flex: 0 1 18px; min-width: 4px; height: 5px; border-radius: 3px; background: #d4dde8; overflow: hidden; }
    .dots > span.on { flex-basis: 30px; }
    .count { flex: none; font-size: .72rem; color: var(--muted); font-variant-numeric: tabular-nums; }
    .fill { position: absolute; inset: 0; background: var(--brass-dark); transform-origin: left; animation: fill linear forwards; }
    @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    .empty { margin: 0; padding: 14px 4px; color: var(--muted); font-size: .88rem; }
    .empty a { color: var(--brass-dark); }
    .full-pic { margin: -4px 0 14px; border-radius: 10px; overflow: hidden; max-height: 360px; }
    .full-pic app-news-picture { height: auto; }
    .full-pic ::ng-deep img { height: auto; max-height: 360px; object-fit: contain; }
    .full-cat { margin: 0 0 10px; color: var(--muted); font-size: .86rem; }
    .full-body { margin: 0 0 14px; line-height: 1.6; white-space: pre-line; }
    .share { display: inline-flex; gap: 8px; align-items: center; color: #1f7a45; font-weight: 600; text-decoration: none; }
    .bday-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .bday-list li { display: flex; align-items: center; gap: 12px; }
    .bday-list span { display: grid; }
    @media (prefers-reduced-motion: reduce) { .slide { transition: none; } .fill { animation: none; } }
  `,
})
export class NewsBoard implements OnInit {
  private readonly newsService = inject(NewsService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly slideMs = SLIDE_MS;

  protected readonly feed = signal<NewsFeed | null>(null);
  protected readonly at = signal(0);
  protected readonly hold = signal(false);
  protected readonly open = signal<Slide | null>(null);
  private readonly hidden = signal(document.hidden);
  private readonly calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private swipeX: number | null = null;

  protected readonly slides = computed<Slide[]>(() => {
    const f = this.feed();
    if (!f) return [];
    const out: Slide[] = f.news.map((n) => ({ kind: 'news', news: n }));
    if (f.birthdays.length) out.splice(Math.min(1, out.length), 0, { kind: 'birthdays', people: f.birthdays });
    return out;
  });
  protected readonly moving = computed(() => !this.calm && !this.hold() && !this.hidden() && !this.open() && this.slides().length > 1);

  constructor() {
    const onVisible = () => this.hidden.set(document.hidden);
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisible);
      if (this.timer) clearTimeout(this.timer);
    });
    // a new timer each time the slide changes or the slider pauses / goes on
    effect(() => {
      const at = this.at();
      const moving = this.moving();
      if (this.timer) clearTimeout(this.timer);
      this.timer = moving ? setTimeout(() => this.go(at + 1), SLIDE_MS) : null;
    });
  }

  ngOnInit(): void {
    this.newsService.feed().subscribe({ next: (f) => this.feed.set(f), error: () => this.feed.set(null) });
  }

  protected go(i: number): void {
    const n = this.slides().length;
    if (n) this.at.set(((i % n) + n) % n);
  }

  protected swipeStart(e: PointerEvent): void {
    this.swipeX = e.pointerType === 'mouse' ? null : e.clientX;
  }

  protected swipeEnd(e: PointerEvent): void {
    if (this.swipeX === null) return;
    const dx = e.clientX - this.swipeX;
    this.swipeX = null;
    if (Math.abs(dx) > 40) this.go(this.at() + (dx < 0 ? 1 : -1));
  }

  protected slideTitle(s: Slide): string {
    return s.kind === 'news' ? s.news.title : `Happy birthday, ${this.names(s.people)}!`;
  }

  protected cat(n: News) {
    return NEWS_CATEGORIES[n.category];
  }

  protected names(people: Birthday[]): string {
    const first = people.map((p) => p.name.split(' ')[0]);
    return first.length <= 1 ? first.join('') : first.slice(0, -1).join(', ') + ' and ' + first[first.length - 1];
  }

  protected whatsapp(n: News): string {
    const text = `*${n.title}*${n.body ? '\n\n' + n.body : ''}${n.endDate ? '\n\nValid till ' + new Date(n.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`;
    return 'https://wa.me/?text=' + encodeURIComponent(text);
  }
}
