/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, ElementRef, HostListener, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { silent } from '../busy';
import { timeLabel } from '../dashboard/dashboard.service';
import { API_BASE } from '../portal.config';

const API = `${API_BASE}/api/notifications`;
const MINUTE = 60_000;

type Kind = 'STARTING' | 'CLOSED';

interface Item {
  meetingId: number;
  kind: Kind;
  started: boolean;
  title: string;
  date: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
}

interface Feed {
  pollMinutes: number;
  items: Item[];
}

/**
 * The bell beside the chat button: meetings about to start or under way, and meetings that have closed. The shell only
 * creates this for people with the Notifications tick, so everyone else makes no calls at all. It checks every few minutes
 * (the time comes from the server's settings), not while the tab is hidden, and at once when the tab comes back if a check
 * was missed. Opening the bell checks too.
 */
@Component({
  selector: 'app-notification-bell',
  template: `
    <button type="button" class="bell" [class.alone]="!besideChat()" [attr.aria-label]="label()" aria-haspopup="dialog" [attr.aria-expanded]="open()" (click)="toggle()">
      <i class="pi pi-bell" aria-hidden="true"></i>
      @if (items().length) { <span class="badge" aria-hidden="true">{{ items().length > 99 ? '99+' : items().length }}</span> }
    </button>

    @if (open()) {
      <section class="panel" [class.alone]="!besideChat()" role="dialog" aria-label="Notifications">
        <header>
          <h2>Notifications</h2>
          @if (items().length > 1) { <button type="button" class="all" [disabled]="clearing()" (click)="clearAll()">Clear all</button> }
          <button type="button" class="close" aria-label="Close notifications" (click)="open.set(false)"><i class="pi pi-times" aria-hidden="true"></i></button>
        </header>
        <ul>
          @for (n of items(); track n.meetingId + n.kind) {
            <li [class.closed]="n.kind === 'CLOSED'">
              <span class="icon" aria-hidden="true"><i [class]="n.kind === 'CLOSED' ? 'pi pi-check-circle' : 'pi pi-calendar-clock'"></i></span>
              <div class="text">
                <small class="state">{{ stateOf(n) }}</small>
                <b>{{ n.title }}</b>
                <small>{{ timeOf(n) }}{{ n.location ? ' · ' + n.location : '' }}</small>
              </div>
              <button type="button" class="clear" [attr.aria-label]="'Clear: ' + n.title" (click)="clear(n)"><i class="pi pi-times" aria-hidden="true"></i></button>
            </li>
          } @empty {
            <li class="none">{{ loaded() ? 'Nothing new.' : 'Checking…' }}</li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    .bell { position: fixed; right: 22px; bottom: 92px; z-index: 999; width: 48px; height: 48px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 50%;
      background: #fff; color: var(--brass-dark); font-size: 1.15rem; cursor: pointer; box-shadow: 0 6px 18px rgba(23, 59, 99, .22); margin-right: 5px; }
    .bell.alone { bottom: 22px; }
    .bell:hover { background: var(--accent-softer); }
    .bell:focus-visible { outline: 3px solid var(--brass); outline-offset: 2px; }
    .badge { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px; background: #dc2626; color: #fff; font: 700 .7rem/20px var(--body); text-align: center; }
    .panel { position: fixed; right: 22px; bottom: 150px; z-index: 999; width: 360px; max-height: min(460px, calc(100dvh - 190px)); display: flex; flex-direction: column; overflow: hidden;
      background: #fff; border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 16px 44px rgba(23, 59, 99, .24); }
    .panel.alone { bottom: 80px; }
    header { display: flex; align-items: center; gap: 8px; padding: 12px 10px 12px 16px; border-bottom: 1px solid var(--line); }
    h2 { flex: 1 1 auto; margin: 0; font-size: 1rem; }
    .all { padding: 4px 8px; border: 0; border-radius: 6px; background: none; color: var(--brass-dark); font: 600 .8rem var(--body); cursor: pointer; }
    .all:hover { background: var(--accent-softer); }
    .close, .clear { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 50%; background: none; color: var(--muted); font-size: .78rem; cursor: pointer; }
    .close:hover, .clear:hover { background: var(--accent-soft); color: var(--ink); }
    .all:focus-visible, .close:focus-visible, .clear:focus-visible { outline: 2px solid var(--brass); }
    ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
    li { display: flex; align-items: flex-start; gap: 10px; padding: 12px 10px 12px 16px; border-bottom: 1px solid var(--line); }
    li:last-child { border-bottom: 0; }
    li.none { display: block; padding: 22px 16px; color: var(--muted); font-size: .88rem; text-align: center; }
    .icon { flex: none; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; background: var(--accent-soft); color: var(--brass-dark); }
    .closed .icon { background: #edf0f3; color: var(--muted); }
    .text { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; overflow-wrap: anywhere; }
    .text b { font-size: .9rem; font-weight: 600; }
    small { font-size: .77rem; color: var(--muted); }
    .state { font-weight: 700; color: var(--brass-dark); }
    .closed .state { color: var(--muted); }
    @media (max-width: 760px) {
      .bell { right: 16px; bottom: 80px; margin-right: 3px; }
      .bell.alone { bottom: 16px; }
      .panel { right: 8px; left: 8px; width: auto; bottom: 136px; max-height: calc(100dvh - 200px); }
      .panel.alone { bottom: 72px; }
    }
  `,
})
export class NotificationBell implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The chat button is there, so the bell sits above it. */
  readonly besideChat = input(false);

  protected readonly items = signal<Item[]>([]);
  protected readonly open = signal(false);
  protected readonly loaded = signal(false);
  protected readonly clearing = signal(false);
  protected readonly label = computed(() => {
    const n = this.items().length;
    return n ? `Notifications, ${n} new` : 'Notifications';
  });

  private everyMs = 5 * MINUTE;
  private lastCheck = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly onVisibility = () => {
    if (!document.hidden && Date.now() - this.lastCheck >= this.everyMs) this.check();
  };

  ngOnInit(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    this.check();
  }

  ngOnDestroy(): void {
    this.stopped = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.timer) clearTimeout(this.timer);
  }

  /** Clicking anywhere else closes it. */
  @HostListener('document:click', ['$event'])
  protected outside(e: Event): void {
    if (this.open() && !e.composedPath().includes(this.host.nativeElement)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  protected escape(): void {
    this.open.set(false);
  }

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) this.check();
  }

  private check(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.lastCheck = Date.now();
    this.http.get<Feed>(API, { context: silent() }).subscribe({
      next: (f) => {
        this.items.set(f.items);
        this.loaded.set(true);
        this.everyMs = Math.max(1, f.pollMinutes) * MINUTE;
        this.next();
      },
      error: (e: HttpErrorResponse) => {
        // the tick was taken away: no more calls until the page learns its menus again
        if (e.status === 403) {
          this.stopped = true;
          return;
        }
        this.next();
      },
    });
  }

  /** The next check; a hidden tab makes none and catches up when it comes back. */
  private next(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (document.hidden) this.timer = null;
      else this.check();
    }, this.everyMs);
  }

  protected clear(n: Item): void {
    this.items.update((list) => list.filter((x) => x !== n));
    this.http.delete(`${API}/${n.meetingId}/${n.kind}`, { context: silent() }).subscribe({ error: () => this.failed() });
  }

  protected clearAll(): void {
    const kept = this.items();
    this.items.set([]);
    this.clearing.set(true);
    this.http.delete(API, { context: silent() }).subscribe({
      next: () => this.clearing.set(false),
      error: () => {
        this.clearing.set(false);
        this.items.set(kept);
        this.failed();
      },
    });
  }

  private failed(): void {
    this.messages.add({ severity: 'error', summary: 'Not cleared', detail: 'Please try again.' });
    this.check();
  }

  protected stateOf(n: Item): string {
    return n.kind === 'CLOSED' ? 'Meeting closed' : n.started ? 'In progress' : 'Starting soon';
  }

  protected timeOf(n: Item): string {
    const range = n.endTime ? `${timeLabel(n.startTime)} – ${timeLabel(n.endTime)}` : timeLabel(n.startTime);
    const today = new Date().toLocaleDateString('en-CA');
    return n.date === today ? range : `${new Date(`${n.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${range}`;
  }
}
