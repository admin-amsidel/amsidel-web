/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';

const C = `${API_BASE}/api/chat`;

/** How often the chat asks the server, by what the person is doing. */
export const ACTIVE_MS = 3_000;
export const TYPING_MS = 2_000;
export const IDLE_MS = 15_000;
export const MINIMISED_MS = 30_000;
/** Open but nothing new for this long: idle. */
export const IDLE_AFTER_MS = 60_000;
/** Never two full syncs closer than this (the server refuses them under a second). */
const MIN_GAP_MS = 1_000;
/** A tab that has not said what it needs for this long is gone. */
const WANT_STALE_MS = 45_000;
/** Each other tab says again what it needs this often (it may have gone idle). */
const WANT_EVERY_MS = 20_000;

/** What one tab's chat window is doing. */
export interface ChatState {
  /** The window is open (not minimised to the button). */
  open: boolean;
  /** Someone else is typing in the chat shown. */
  otherTyping: boolean;
  /** Last time something happened: opened, sent, typed, a message came. */
  lastActivity: number;
}

/** Answers from the server, given to the store (in every tab). */
export interface ChatPollHandler<S> {
  state(): ChatState;
  /** A full sync came in (from this tab, or the one polling for all). */
  synced(s: S): void;
  /** The minimised check: my unread count, given only when something changed. */
  unread(count: number): void;
  /** No access any more, or signed out. */
  denied(): void;
  failed(): void;
}

type Msg<S> =
  | { t: 'want'; tab: string; delay: number | null }
  | { t: 'now' }
  | { t: 'sync'; s: S }
  | { t: 'changes'; version: string; unread: number | null };

/**
 * Team chat polling (decision D16, "Team Chat Polling Change"): the window only says what it is doing, and this
 * decides when to ask.
 * - Active: every 3 seconds (2 while someone else types); idle after a quiet minute: every 15 seconds.
 * - Minimised (in every tab): never a full /sync. Every 30 seconds the cheap /changes check (from memory on the
 *   server), which brings the unread count for the chat button only when something changed.
 * - Tab hidden: nothing. Opening the window, sending, or coming back to the tab asks at once.
 * - Several tabs: the one holding a Web Lock polls for all and shares each answer over a BroadcastChannel, at the
 *   pace the busiest tab needs; when it closes another takes over. Without Web Locks each tab polls on its own.
 * - After an error: the normal interval again, not at once.
 */
@Injectable({ providedIn: 'root' })
export class ChatPolling<S extends { version: string }> {
  private readonly http = inject(HttpClient);

  private handler: ChatPollHandler<S> | null = null;
  private running = false;
  private leader = false;
  private readonly tab = Math.random().toString(36).slice(2);
  private channel: BroadcastChannel | null = null;
  private releaseLock: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wantTimer: ReturnType<typeof setInterval> | null = null;
  /** What the other tabs need: tab -> (delay, when said). */
  private readonly wants = new Map<string, { delay: number | null; at: number }>();
  private after = -1;
  private version: string | null = null;
  private lastPoll = 0;
  private lastSync = 0;
  private inFlight = false;
  private readonly onVisibility = () => this.visibilityChanged();

  /** Starts (once) for someone with Team chat; the store gives the answers to the window. */
  start(handler: ChatPollHandler<S>): void {
    if (this.running) return;
    this.handler = handler;
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('amsidel-chat');
      this.channel.onmessage = (e: MessageEvent<Msg<S>>) => this.heard(e.data);
    }
    if (this.locks() && this.channel) {
      this.requestLock();
      this.wantTimer = setInterval(() => this.tellWant(), WANT_EVERY_MS);
      this.tellWant();
      // a new tab: the polling tab (if another one) shares a fresh answer at once
      this.channel.postMessage({ t: 'now' } satisfies Msg<S>);
    } else {
      this.leader = true;
      this.now();
    }
  }

  private locks(): LockManager | undefined {
    return typeof navigator !== 'undefined' ? navigator.locks : undefined;
  }

  /** One tab holds the lock and polls; the lock passes on when it closes (or hands over, see visibilityChanged). */
  private requestLock(): void {
    this.locks()!.request('amsidel-chat-leader', () => new Promise<void>((release) => {
      if (!this.running) return release();
      this.releaseLock = release;
      this.leader = true;
      this.lastPoll = 0;
      this.now();
    })).catch(() => undefined);
  }

  stop(): void {
    this.running = false;
    this.leader = false;
    this.clear();
    if (this.wantTimer) clearInterval(this.wantTimer);
    this.wantTimer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.channel?.close();
    this.channel = null;
    this.releaseLock?.();
    this.releaseLock = null;
    this.wants.clear();
    this.after = -1;
    this.version = null;
  }

  /** Something happened here (opened, sent, typed): ask at once, then at the new pace. */
  now(): void {
    if (!this.running) return;
    if (!this.leader) {
      this.tellWant();
      this.channel?.postMessage({ t: 'now' } satisfies Msg<S>);
      return;
    }
    this.poll(true);
  }

  /** The window's state changed (no need to ask at once): poll at the new pace. */
  changed(): void {
    if (!this.running) return;
    if (this.leader) this.schedule();
    else this.tellWant();
  }

  /** The newest message id this tab knows (its own sends move it on). */
  seen(id: number): void {
    this.after = Math.max(this.after, id);
  }

  // ---- the pace ----

  /** What this tab needs: null when its tab is hidden. */
  private myDelay(): number | null {
    if (document.visibilityState === 'hidden') return null;
    const s = this.handler!.state();
    if (!s.open) return MINIMISED_MS;
    if (s.otherTyping) return TYPING_MS;
    return Date.now() - s.lastActivity > IDLE_AFTER_MS ? IDLE_MS : ACTIVE_MS;
  }

  /** The polling tab: the fastest any tab needs; null when every tab is hidden. */
  private delay(): number | null {
    const now = Date.now();
    let best = this.myDelay();
    for (const [tab, w] of this.wants) {
      if (now - w.at > WANT_STALE_MS) {
        this.wants.delete(tab);
        continue;
      }
      if (w.delay !== null && (best === null || w.delay < best)) best = w.delay;
    }
    return best;
  }

  private schedule(): void {
    this.clear();
    if (!this.running || !this.leader) return;
    const delay = this.delay();
    if (delay === null) return;
    // from the last poll, so tabs that keep saying what they need never push it back
    this.timer = setTimeout(() => this.poll(false), Math.max(0, this.lastPoll + delay - Date.now()));
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private visibilityChanged(): void {
    if (document.visibilityState === 'visible') return this.now();
    // browsers slow the timers of hidden tabs: while another tab is in view, it polls instead
    const now = Date.now();
    const others = [...this.wants.values()].some((w) => w.delay !== null && now - w.at <= WANT_STALE_MS);
    if (this.leader && others && this.releaseLock) {
      this.leader = false;
      this.clear();
      this.wants.clear();
      const release = this.releaseLock;
      this.releaseLock = null;
      release();
      this.requestLock();
      this.tellWant();
      return;
    }
    this.changed();
  }

  // ---- asking the server (the polling tab) ----

  /** urgent: asked for (opened, sent, back to the tab), so at once rather than at the next interval. */
  private poll(urgent: boolean): void {
    if (!this.running || !this.leader) return;
    if (this.inFlight) return;
    const delay = this.delay();
    if (delay === null && !urgent) return;
    // no window open in any tab: only the cheap check, never a full sync
    if (delay === null || delay === MINIMISED_MS) return this.check();
    this.sync();
  }

  /** The minimised check: the version from memory; the unread count only when it moved. */
  private check(): void {
    this.lastPoll = Date.now();
    this.inFlight = true;
    const params = this.version ? new HttpParams().set('since', this.version) : new HttpParams();
    this.http.get<{ version: string; unreadTotal: number | null }>(`${C}/changes`, { params, context: silent() }).subscribe({
      next: (c) => {
        this.inFlight = false;
        this.version = c.version;
        if (c.unreadTotal !== null) this.handler?.unread(c.unreadTotal);
        this.channel?.postMessage({ t: 'changes', version: c.version, unread: c.unreadTotal } satisfies Msg<S>);
        this.schedule();
      },
      error: (e) => this.failed(e),
    });
  }

  private sync(): void {
    const wait = this.lastSync + MIN_GAP_MS - Date.now();
    if (wait > 0) {
      this.clear();
      this.timer = setTimeout(() => this.sync(), wait);
      return;
    }
    this.lastPoll = this.lastSync = Date.now();
    this.inFlight = true;
    const params = new HttpParams().set('after', String(this.after));
    this.http.get<S>(`${C}/sync`, { params, context: silent() }).subscribe({
      next: (s) => {
        this.inFlight = false;
        this.version = s.version;
        this.handler?.synced(s);
        this.channel?.postMessage({ t: 'sync', s } satisfies Msg<S>);
        this.schedule();
      },
      error: (e) => this.failed(e),
    });
  }

  private failed(e: { status?: number }): void {
    this.inFlight = false;
    if (e?.status === 401 || e?.status === 403) {
      this.handler?.denied();
      return this.stop();
    }
    this.handler?.failed();
    // the normal interval again, not at once
    this.lastPoll = Date.now();
    this.schedule();
  }

  // ---- the other tabs ----

  private tellWant(): void {
    if (this.leader || !this.channel) return;
    this.channel.postMessage({ t: 'want', tab: this.tab, delay: this.myDelay() } satisfies Msg<S>);
  }

  private heard(m: Msg<S>): void {
    if (!this.running) return;
    if (m.t === 'sync') {
      if (!this.leader) {
        this.version = m.s.version;
        this.handler?.synced(m.s);
        this.tellWant();
      }
      return;
    }
    if (m.t === 'changes') {
      if (!this.leader) {
        this.version = m.version;
        if (m.unread !== null) this.handler?.unread(m.unread);
      }
      return;
    }
    if (!this.leader) return;
    if (m.t === 'want') {
      this.wants.set(m.tab, { delay: m.delay, at: Date.now() });
      this.schedule();
    } else {
      this.poll(true);
    }
  }
}
