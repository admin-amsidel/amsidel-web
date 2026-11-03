/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, Observable } from 'rxjs';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';
import { ChatPolling } from './chat-polling';

const C = `${API_BASE}/api/chat`;

export interface ChatPerson {
  id: number;
  name: string;
  designation: string | null;
  brandCode: string | null;
  photoUpdatedAt: string | null;
  online: boolean;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  content: string;
  createdAt: string;
  /** Still on its way (shown faded). */
  sending?: boolean;
}

export interface Conversation {
  id: number;
  type: 'DIRECT' | 'GROUP';
  title: string;
  createdById: number;
  members: ChatPerson[];
  last: ChatMessage | null;
  unread: number;
  myLastRead: number;
  /** How far the others have read: my messages up to here get the double tick. */
  othersRead: number;
  lastMessageAt: string;
}

interface Sync {
  conversations: Conversation[];
  messages: ChatMessage[];
  typing: Record<string, string[]>;
  online: number[];
  unreadTotal: number;
  retentionDays: number;
  serverTime: string;
  /** My change version when this was read: the minimised window's /changes check compares it. */
  version: string;
}

/**
 * Team chat: my chats and their messages, kept fresh by ChatPolling (fast only while someone is chatting, a cheap
 * check while minimised, nothing in a hidden tab). Messages of a chat load when it is opened; older ones as you
 * scroll up. A new message while minimised plays a short sound.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly http = inject(HttpClient);
  private readonly polling = inject<ChatPolling<Sync>>(ChatPolling);

  readonly conversations = signal<Conversation[]>([]);
  readonly messages = signal<Record<number, ChatMessage[]>>({});
  readonly hasOlder = signal<Record<number, boolean>>({});
  readonly typing = signal<Record<string, string[]>>({});
  readonly online = signal<Set<number>>(new Set());
  readonly retentionDays = signal(7);
  readonly activeId = signal<number | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  /** The window is open (polls faster, marks what is shown as read). */
  readonly visible = signal(false);

  /** From the minimised check (the chat list is not fetched then); stale = it is newer than the list. */
  private readonly checkedUnread = signal(0);
  private readonly listStale = signal(true);
  /**
   * Chat calls the person waits for (opening a chat, loading people, starting or changing a chat): shown by the
   * chat window's own loader bar, never the page's loader. Background checks (sync, changes) do not count.
   */
  private readonly pending = signal(0);
  readonly working = computed(() => this.pending() > 0);

  readonly unreadTotal = computed(() => (this.listStale() ? this.checkedUnread() : this.conversations().reduce((s, c) => s + c.unread, 0)));
  readonly active = computed(() => this.conversations().find((c) => c.id === this.activeId()) ?? null);
  readonly activeMessages = computed(() => (this.activeId() ? this.messages()[this.activeId()!] ?? [] : []));
  readonly activeTyping = computed(() => (this.activeId() ? this.typing()[String(this.activeId())] ?? [] : []));

  private after = -1;
  private lastTypingSent = 0;
  private tempId = -1;
  /** Last time something happened in the chat (opened, sent, typed, a message came): fast polling for a minute. */
  private lastActivity = Date.now();
  private firstSync = true;
  private firstCheck = true;

  /** Starts polling (the window is only there for people with Team chat). */
  start(): void {
    this.polling.start({
      state: () => ({ open: this.visible(), otherTyping: this.visible() && this.activeTyping().length > 0, lastActivity: this.lastActivity }),
      synced: (s) => {
        this.apply(s);
        this.error.set('');
        this.loading.set(false);
      },
      unread: (count) => {
        const before = this.unreadTotal();
        this.checkedUnread.set(count);
        this.listStale.set(true);
        // minimised and something new came in: a short sound (in the tab in view)
        if (!this.firstCheck && count > before && document.visibilityState === 'visible') chime();
        this.firstCheck = false;
      },
      denied: () => this.loading.set(false),
      failed: () => {
        this.loading.set(false);
        this.error.set('Chat is offline; trying again…');
      },
    });
  }

  stop(): void {
    this.polling.stop();
    this.firstSync = true;
    this.firstCheck = true;
  }

  /** Ask now (the window was just opened, or a message sent). */
  pollSoon(): void {
    this.lastActivity = Date.now();
    this.polling.now();
  }

  /** When something last happened in the chat (opened, sent, typed, a message came, a click in the window). */
  lastActivityAt(): number {
    return this.lastActivity;
  }

  /** A click or key in the open window: it is in use (back to fast polling if it had gone idle). */
  touch(): void {
    const wasIdle = Date.now() - this.lastActivity > 60_000;
    this.lastActivity = Date.now();
    if (wasIdle) this.polling.changed();
  }

  /** The window was minimised: poll at the new pace. */
  paceChanged(): void {
    this.polling.changed();
  }

  private apply(s: Sync): void {
    const unreadBefore = this.unreadTotal();
    const typingBefore = this.activeTyping().length > 0;
    this.retentionDays.set(s.retentionDays);
    this.typing.set(s.typing ?? {});
    this.online.set(new Set(s.online));
    const known = new Set(this.conversations().map((c) => c.id));
    // messages of chats that are open (or were loaded) are added; others come when opened
    if (s.messages.length) {
      this.messages.update((all) => {
        const next = { ...all };
        for (const m of s.messages) {
          const list = next[m.conversationId];
          if (!list || list.some((x) => x.id === m.id)) continue;
          next[m.conversationId] = [...list.filter((x) => !(x.sending && x.content === m.content && x.senderId === m.senderId)), m];
        }
        return next;
      });
    }
    // the chats that were removed (e.g. after the clean-up) drop their loaded messages
    const ids = new Set(s.conversations.map((c) => c.id));
    if ([...known].some((id) => !ids.has(id))) {
      this.messages.update((all) => Object.fromEntries(Object.entries(all).filter(([k]) => ids.has(Number(k)))));
      if (this.activeId() && !ids.has(this.activeId()!)) this.activeId.set(null);
    }
    this.conversations.set(s.conversations);
    this.listStale.set(false);
    const lastIds = [...s.conversations.map((c) => c.last?.id ?? 0), ...s.messages.map((m) => m.id), Math.max(this.after, 0)];
    const newest = Math.max(...lastIds);
    // a new message (or someone starting to type): back to fast polling
    if (newest > this.after && !this.firstSync) this.lastActivity = Date.now();
    if (!typingBefore && this.activeTyping().length) this.lastActivity = Date.now();
    this.after = newest;
    this.polling.seen(newest);
    this.markActiveRead();
    // minimised and something new came in: a short sound (in the tab in view)
    if (!this.firstSync && !this.visible() && this.unreadTotal() > unreadBefore && document.visibilityState === 'visible') chime();
    this.firstSync = false;
    if (typingBefore !== this.activeTyping().length > 0) this.polling.changed();
  }

  /** The open chat is shown: what came in is read. */
  markActiveRead(): void {
    const c = this.active();
    if (!c || !this.visible() || !c.last || c.last.id <= c.myLastRead) return;
    const upTo = c.last.id;
    this.conversations.update((list) => list.map((x) => (x.id === c.id ? { ...x, unread: 0, myLastRead: upTo } : x)));
    this.http.post<void>(`${C}/conversations/${c.id}/read/${upTo}`, {}, { context: silent() }).subscribe({ error: () => undefined });
  }

  open(id: number | null): void {
    this.lastActivity = Date.now();
    this.activeId.set(id);
    if (id === null) return;
    if (!this.messages()[id]) this.loadPage(id, null);
    this.markActiveRead();
  }

  loadOlder(): void {
    const id = this.activeId();
    const list = id ? this.messages()[id] : null;
    if (!id || !list?.length || !this.hasOlder()[id]) return;
    this.loadPage(id, list[0].id);
  }

  private loadPage(id: number, before: number | null): void {
    let params = new HttpParams().set('size', '40');
    if (before) params = params.set('before', String(before));
    this.track(this.http.get<ChatMessage[]>(`${C}/conversations/${id}/messages`, { params, context: silent() })).subscribe({
      next: (page) => {
        this.messages.update((all) => {
          const have = all[id] ?? [];
          const seen = new Set(have.map((m) => m.id));
          return { ...all, [id]: [...page.filter((m) => !seen.has(m.id)), ...have] };
        });
        this.hasOlder.update((h) => ({ ...h, [id]: page.length === 40 }));
      },
      error: () => this.error.set('The messages could not be loaded.'),
    });
  }

  send(text: string, me: { id: number; name: string }): void {
    const c = this.active();
    const content = text.trim();
    if (!c || !content) return;
    const temp: ChatMessage = { id: this.tempId--, conversationId: c.id, senderId: me.id, senderName: me.name, content,
      createdAt: new Date().toISOString(), sending: true };
    this.messages.update((all) => ({ ...all, [c.id]: [...(all[c.id] ?? []), temp] }));
    this.http.post<ChatMessage>(`${C}/conversations/${c.id}/messages`, { content }, { context: silent() }).subscribe({
      next: (m) => {
        this.messages.update((all) => {
          const list = (all[c.id] ?? []).filter((x) => x.id !== temp.id && x.id !== m.id);
          return { ...all, [c.id]: [...list, m].sort((a, b) => a.id - b.id) };
        });
        this.conversations.update((list) => list.map((x) => (x.id === c.id ? { ...x, last: m, myLastRead: m.id, lastMessageAt: m.createdAt } : x))
          .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)));
        this.after = Math.max(this.after, m.id - 1);
        this.lastTypingSent = 0;
        // check at once: the others' answers and read ticks
        this.pollSoon();
      },
      error: () => {
        this.messages.update((all) => ({ ...all, [c.id]: (all[c.id] ?? []).filter((x) => x.id !== temp.id) }));
        this.error.set('Not sent. Check the connection and try again.');
      },
    });
  }

  /** At most every few seconds while typing. */
  typed(): void {
    const c = this.active();
    const now = Date.now();
    const wasIdle = now - this.lastActivity > 60_000;
    this.lastActivity = now;
    if (wasIdle) this.polling.changed();
    if (!c || now - this.lastTypingSent < 4000) return;
    this.lastTypingSent = now;
    this.http.post<void>(`${C}/conversations/${c.id}/typing`, {}, { context: silent() }).subscribe({ error: () => undefined });
  }

  people(): Observable<ChatPerson[]> {
    return this.track(this.http.get<ChatPerson[]>(`${C}/people`, { context: silent() }));
  }

  direct(employeeId: number): Observable<Conversation> {
    return this.track(this.http.post<Conversation>(`${C}/conversations/direct`, { employeeId }, { context: silent() }));
  }

  group(name: string, memberIds: number[]): Observable<Conversation> {
    return this.track(this.http.post<Conversation>(`${C}/conversations/group`, { name, memberIds }, { context: silent() }));
  }

  addMembers(id: number, memberIds: number[]): Observable<Conversation> {
    return this.track(this.http.post<Conversation>(`${C}/conversations/${id}/members`, { memberIds }, { context: silent() }));
  }

  leave(id: number): Observable<void> {
    return this.track(this.http.delete<void>(`${C}/conversations/${id}/members/me`, { context: silent() }));
  }

  /** Counts the call in the chat window's loader while it runs (the page's loader stays out of it). */
  private track<T>(call: Observable<T>): Observable<T> {
    return new Observable<T>((sub) => {
      this.pending.update((n) => n + 1);
      return call.pipe(finalize(() => this.pending.update((n) => Math.max(0, n - 1)))).subscribe(sub);
    });
  }

  /** A chat just made or changed: in the list at once, then opened. */
  upsert(c: Conversation): void {
    this.conversations.update((list) => [c, ...list.filter((x) => x.id !== c.id)]);
    this.after = Math.max(this.after, c.last?.id ?? 0);
  }

  remove(id: number): void {
    this.conversations.update((list) => list.filter((x) => x.id !== id));
    this.messages.update((all) => Object.fromEntries(Object.entries(all).filter(([k]) => Number(k) !== id)));
    if (this.activeId() === id) this.activeId.set(null);
  }
}

/** A soft two-note sound for a new chat message while the window is minimised (silent where audio is not allowed). */
function chime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.12;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.08, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.3);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* no sound */
  }
}
