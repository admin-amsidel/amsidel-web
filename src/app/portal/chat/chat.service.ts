/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';

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
}

/**
 * Team chat: my chats and their messages, kept fresh by asking the server every few seconds (more often while the
 * chat window is open). Messages of a chat load when it is opened; older ones as you scroll up.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly http = inject(HttpClient);

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

  readonly unreadTotal = computed(() => this.conversations().reduce((s, c) => s + c.unread, 0));
  readonly active = computed(() => this.conversations().find((c) => c.id === this.activeId()) ?? null);
  readonly activeMessages = computed(() => (this.activeId() ? this.messages()[this.activeId()!] ?? [] : []));
  readonly activeTyping = computed(() => (this.activeId() ? this.typing()[String(this.activeId())] ?? [] : []));

  private after = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastTypingSent = 0;
  private tempId = -1;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Ask now (e.g. the window was just opened). */
  pollSoon(): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.poll();
  }

  private poll(): void {
    const params = new HttpParams().set('after', String(this.after));
    this.http.get<Sync>(`${C}/sync`, { params, context: silent() }).subscribe({
      next: (s) => {
        this.apply(s);
        this.error.set('');
        this.loading.set(false);
        this.next();
      },
      error: (e) => {
        this.loading.set(false);
        // no access any more (or signed out): stop asking
        if (e?.status === 401 || e?.status === 403) return this.stop();
        this.error.set('Chat is offline; trying again…');
        this.next(15000);
      },
    });
  }

  private next(ms?: number): void {
    if (!this.running) return;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const wait = ms ?? (hidden ? 30000 : this.visible() ? 3500 : 15000);
    this.timer = setTimeout(() => this.poll(), wait);
  }

  private apply(s: Sync): void {
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
    const lastIds = [...s.conversations.map((c) => c.last?.id ?? 0), ...s.messages.map((m) => m.id), Math.max(this.after, 0)];
    this.after = Math.max(...lastIds);
    this.markActiveRead();
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
    this.http.get<ChatMessage[]>(`${C}/conversations/${id}/messages`, { params, context: silent() }).subscribe({
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
    if (!c || now - this.lastTypingSent < 4000) return;
    this.lastTypingSent = now;
    this.http.post<void>(`${C}/conversations/${c.id}/typing`, {}, { context: silent() }).subscribe({ error: () => undefined });
  }

  people(): Observable<ChatPerson[]> {
    return this.http.get<ChatPerson[]>(`${C}/people`);
  }

  direct(employeeId: number): Observable<Conversation> {
    return this.http.post<Conversation>(`${C}/conversations/direct`, { employeeId });
  }

  group(name: string, memberIds: number[]): Observable<Conversation> {
    return this.http.post<Conversation>(`${C}/conversations/group`, { name, memberIds });
  }

  addMembers(id: number, memberIds: number[]): Observable<Conversation> {
    return this.http.post<Conversation>(`${C}/conversations/${id}/members`, { memberIds });
  }

  leave(id: number): Observable<void> {
    return this.http.delete<void>(`${C}/conversations/${id}/members/me`);
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
