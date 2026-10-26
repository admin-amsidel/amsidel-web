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
 * The dashboard's news: a slider of today's news (pinned first) and birthdays, moving on by itself (paused while
 * pointed at, focused or the tab is hidden; not at all when the person prefers less motion), then every news item
 * showing today as cards. Opening one shows all of it. People with the News menu get a link to manage them.
 */
@Component({
  selector: 'app-news-board',
  imports: [DatePipe, RouterLink, ButtonModule, DialogModule, Avatar, NewsPicture],
  template: `
    @if (feed(); as f) {
      @if (slides().length || f.canManage) {
        <section class="board" aria-labelledby="nb-title">
          <div class="board__head">
            <h2 id="nb-title"><i class="pi pi-megaphone" aria-hidden="true"></i> News & announcements</h2>
            @if (f.canManage) { <a class="manage" routerLink="/portal/admin/news"><i class="pi pi-cog" aria-hidden="true"></i> Manage news</a> }
          </div>

          @if (slides().length) {
            <div class="slider" role="region" aria-roledescription="carousel" aria-label="News" (mouseenter)="hold.set(true)" (mouseleave)="hold.set(false)"
                 (focusin)="hold.set(true)" (focusout)="hold.set(false)" (pointerdown)="swipeStart($event)" (pointerup)="swipeEnd($event)">
              @for (s of slides(); track $index; let i = $index) {
                <article class="slide" [class.on]="i === at()" [attr.aria-hidden]="i !== at()" aria-roledescription="slide"
                         [attr.aria-label]="(i + 1) + ' of ' + slides().length" [class]="'slide tone-' + tone(s)">
                  @if (s.kind === 'news') {
                    <div class="slide__pic"><app-news-picture [news]="s.news" [alt]="s.news.title" [whole]="true" /></div>
                    <div class="slide__text">
                      <span class="chip"><i [class]="cat(s.news).icon" aria-hidden="true"></i> {{ cat(s.news).label }}
                        @if (s.news.pinned) { · <i class="pi pi-thumbtack" aria-hidden="true"></i> }</span>
                      <h3>{{ s.news.title }}</h3>
                      @if (s.news.body) { <p class="body">{{ s.news.body }}</p> }
                      <div class="meta">
                        @if (s.news.brandCode) { <span>{{ s.news.brandName }}</span> }
                        @if (s.news.audience !== 'EMPLOYEES') { <span><i [class]="s.news.audience === 'CUSTOMERS' ? 'pi pi-users' : 'pi pi-globe'" aria-hidden="true"></i> {{ audienceNote(s.news) }}</span> }
                        @if (s.news.endDate) { <span>Till {{ s.news.endDate | date: 'd MMM' }}</span> }
                      </div>
                      <button type="button" class="more" [tabindex]="i === at() ? 0 : -1" (click)="open.set(s.news)">Read more <i class="pi pi-arrow-right" aria-hidden="true"></i></button>
                    </div>
                  } @else {
                    <div class="slide__pic bday">
                      <div class="faces">
                        @for (p of s.people.slice(0, 4); track p.id) {
                          <app-avatar [name]="p.name" [employeeId]="p.id" [photoVersion]="p.photoUpdatedAt" [size]="s.people.length > 1 ? 72 : 120" />
                        }
                      </div>
                    </div>
                    <div class="slide__text">
                      <span class="chip"><i class="pi pi-gift" aria-hidden="true"></i> Birthday today</span>
                      <h3>Happy birthday, {{ names(s.people) }}! 🎂</h3>
                      <p class="body">Wishing you a wonderful year ahead, from everyone at Amsidel.</p>
                      <div class="meta">
                        @for (p of s.people; track p.id) { <span>{{ p.name }}{{ p.designation ? ' · ' + p.designation : '' }}</span> }
                      </div>
                    </div>
                  }
                </article>
              }
              @if (slides().length > 1) {
                <button type="button" class="nav prev" aria-label="Previous news" (click)="go(at() - 1)"><i class="pi pi-chevron-left" aria-hidden="true"></i></button>
                <button type="button" class="nav next" aria-label="Next news" (click)="go(at() + 1)"><i class="pi pi-chevron-right" aria-hidden="true"></i></button>
                <div class="dots" role="tablist" aria-label="Choose news">
                  @for (s of slides(); track $index; let i = $index) {
                    <button type="button" role="tab" [attr.aria-selected]="i === at()" [attr.aria-label]="'News ' + (i + 1)" [class.on]="i === at()" (click)="go(i)">
                      @if (i === at() && moving()) { <span class="fill" [style.animation-duration.ms]="slideMs"></span> }
                    </button>
                  }
                </div>
              }
            </div>
          } @else {
            <p class="empty">No news showing today. <a routerLink="/portal/admin/news">Add the first one</a>.</p>
          }

          @if (f.news.length > 1) {
            <ul class="cards" aria-label="All news showing today">
              @for (n of f.news; track n.id) {
                <li>
                  <button type="button" class="card" [class]="'card tone-' + cat(n).tone" (click)="open.set(n)">
                    <span class="card__pic"><app-news-picture [news]="n" /></span>
                    <span class="card__text">
                      <small class="card__cat"><i [class]="cat(n).icon" aria-hidden="true"></i> {{ cat(n).label }}</small>
                      <b>{{ n.title }}</b>
                      <small class="muted">{{ n.startDate | date: 'd MMM' }}{{ n.endDate ? ' – ' + (n.endDate | date: 'd MMM') : '' }}{{ n.brandCode ? ' · ' + n.brandCode : '' }}</small>
                    </span>
                  </button>
                </li>
              }
            </ul>
          }
        </section>
      }
    }

    <p-dialog [header]="open()?.title ?? ''" [modal]="true" [visible]="!!open()" (visibleChange)="!$event && open.set(null)" [draggable]="false"
              [dismissableMask]="true" appendTo="body" [style]="{ width: '640px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }">
      @if (open(); as n) {
        @if (n.imageUpdatedAt) { <div class="full-pic"><app-news-picture [news]="n" [alt]="n.title" /></div> }
        <p class="full-cat"><i [class]="cat(n).icon" aria-hidden="true"></i> {{ cat(n).label }}{{ n.brandName ? ' · ' + n.brandName : '' }}
          · {{ n.startDate | date: 'd MMM y' }}{{ n.endDate ? ' to ' + (n.endDate | date: 'd MMM y') : '' }}</p>
        @if (n.body) { <p class="full-body">{{ n.body }}</p> }
        @if (n.audience !== 'EMPLOYEES') {
          <a class="share" [href]="whatsapp(n)" target="_blank" rel="noopener"><i class="pi pi-whatsapp" aria-hidden="true"></i> Share on WhatsApp</a>
        }
      }
    </p-dialog>
  `,
  styles: `
    .board { margin-bottom: 22px; }
    .board__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
    .board__head h2 { margin: 0; font-size: 1.2rem; display: flex; gap: 10px; align-items: center; }
    .board__head h2 i { color: var(--brass-dark); }
    .manage { font-size: .86rem; font-weight: 600; color: var(--brass-dark); text-decoration: none; display: inline-flex; gap: 6px; align-items: center; }
    .manage:hover { text-decoration: underline; }

    /* every kind of news on plain white: the poster carries the colour */
    .slider { position: relative; height: 340px; border-radius: 16px; overflow: hidden; background: #fff; border: 1px solid var(--line);
      box-shadow: 0 10px 30px rgba(23, 59, 99, .08); touch-action: pan-y; }
    .slide { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 70%) minmax(0, 1fr); opacity: 0; visibility: hidden;
      transform: translateX(24px); transition: opacity .6s ease, transform .6s ease, visibility .6s; color: var(--ink); background: #fff; }
    .slide.on { opacity: 1; visibility: visible; transform: none; z-index: 1; }
    .slide__pic { position: relative; overflow: hidden; background: #f4f4f5; border-right: 1px solid var(--line); }
    .bday { display: grid; place-items: center; }
    .faces { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; padding: 20px; }
    .faces ::ng-deep .av { box-shadow: 0 0 0 4px #fff, 0 2px 10px rgba(0, 0, 0, .12); }
    /* the poster gets 70%, the details 30%: a narrow column, so smaller type and the text clipped to fit */
    .slide__text { padding: 24px 58px 44px 22px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .chip { align-self: flex-start; font-size: .74rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
      background: #f4f4f5; color: var(--brass-dark); border: 1px solid var(--line); padding: 5px 10px; border-radius: 999px; display: inline-flex; gap: 6px; align-items: center; }
    .slide h3 { margin: 0; font-size: 1.25rem; line-height: 1.3; font-weight: 600; color: var(--ink); overflow-wrap: anywhere;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .body { margin: 0; font-size: .9rem; line-height: 1.5; color: #3f3f46; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; }
    .meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: .8rem; color: var(--muted); }
    .more { align-self: flex-start; margin-top: auto; background: #fff; color: var(--ink); border: 1px solid #d4d4d8; border-radius: 8px; padding: 8px 14px;
      font-weight: 600; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; font: inherit; font-weight: 600; }
    .more:hover { background: #f4f4f5; }
    .nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; width: 38px; height: 38px; border-radius: 50%; border: 0;
      background: rgba(255, 255, 255, .92); color: var(--ink); border: 1px solid #d4d4d8; box-shadow: 0 2px 8px rgba(0, 0, 0, .1); cursor: pointer; display: grid; place-items: center; }
    .nav:hover, .nav:focus-visible { background: #fff; border-color: #a1a1aa; }
    .prev { left: 10px; }
    .next { right: 10px; }
    .dots { position: absolute; z-index: 2; bottom: 14px; right: 20px; display: flex; gap: 6px; }
    .dots button { width: 22px; height: 6px; border-radius: 4px; border: 0; padding: 0; background: #d4d4d8; cursor: pointer; overflow: hidden; position: relative; }
    .dots button.on { width: 40px; background: #d4d4d8; }
    .fill { position: absolute; inset: 0; background: #52525b; transform-origin: left; animation: fill linear forwards; }
    @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    .empty { margin: 0; padding: 18px; border: 1px dashed var(--line); border-radius: 12px; color: var(--muted); background: #fff; }

    .cards { list-style: none; margin: 14px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .card { width: 100%; text-align: left; display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: center; padding: 10px;
      background: #fff; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; font: inherit; color: var(--ink); background-image: none; }
    .card:hover { border-color: #a1a1aa; box-shadow: 0 6px 18px rgba(0, 0, 0, .06); }
    .card__pic { width: 64px; height: 64px; border-radius: 10px; overflow: hidden; background: #f4f4f5; border: 1px solid var(--line); display: block; }
    .card__pic ::ng-deep .ph { font-size: 1.3rem; }
    .card__text { display: grid; gap: 2px; min-width: 0; }
    .card__text b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .card__cat { color: var(--brass-dark); font-weight: 600; font-size: .74rem; }
    .muted { color: var(--muted); font-size: .76rem; }

    .full-pic { margin: -4px 0 14px; border-radius: 10px; overflow: hidden; max-height: 360px; }
    .full-pic app-news-picture { height: auto; }
    .full-pic ::ng-deep img { height: auto; max-height: 360px; }
    .full-cat { margin: 0 0 10px; color: var(--muted); font-size: .86rem; }
    .full-body { margin: 0 0 14px; line-height: 1.6; white-space: pre-line; }
    .share { display: inline-flex; gap: 8px; align-items: center; color: #1f7a45; font-weight: 600; text-decoration: none; }

    @media (max-width: 760px) {
      .slider { height: 470px; }
      .slide { grid-template-columns: 1fr; grid-template-rows: 210px minmax(0, 1fr); }
      .slide__pic { border-right: 0; border-bottom: 1px solid var(--line); }
      .slide__text { padding: 16px 18px 44px; }
      .slide h3 { font-size: 1.2rem; }
      .body { -webkit-line-clamp: 2; }
      .slide__text { gap: 8px; }
      .nav { top: 105px; }
      .body { -webkit-line-clamp: 2; }
      .dots { left: 18px; right: auto; }
    }
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
  protected readonly open = signal<News | null>(null);
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

  protected cat(n: News) {
    return NEWS_CATEGORIES[n.category];
  }

  protected tone(s: Slide): string {
    return s.kind === 'birthdays' ? 'bday' : NEWS_CATEGORIES[s.news.category].tone;
  }

  protected names(people: Birthday[]): string {
    const first = people.map((p) => p.name.split(' ')[0]);
    return first.length <= 1 ? first.join('') : first.slice(0, -1).join(', ') + ' and ' + first[first.length - 1];
  }

  protected audienceNote(n: News): string {
    return n.audience === 'CUSTOMERS' ? 'For customers: share it' : n.audience === 'PUBLIC' ? 'Public · on the website' : 'All · also on the website';
  }

  protected whatsapp(n: News): string {
    const text = `*${n.title}*${n.body ? '\n\n' + n.body : ''}${n.endDate ? '\n\nValid till ' + new Date(n.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`;
    return 'https://wa.me/?text=' + encodeURIComponent(text);
  }
}
