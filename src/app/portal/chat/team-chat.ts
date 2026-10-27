import { NgTemplateOutlet } from '@angular/common';
import { AfterViewChecked, Component, computed, effect, ElementRef, inject, OnDestroy, OnInit, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../auth.service';
import { Avatar } from '../avatar';
import { apiProblem } from '../portal.models';
import { ChatMessage, ChatPerson, ChatStore, Conversation } from './chat.service';

type Mode = 'closed' | 'open' | 'max';
type View = 'list' | 'thread' | 'new';
type Pick = 'PERSON' | 'GROUP' | 'ADD';

const MODE_KEY = 'amsidel.chat.mode';
const PALETTE = ['#2563eb', '#0d9488', '#9333ea', '#ea580c', '#db2777', '#0891b2', '#65a30d', '#4f46e5'];

interface Row { msg: ChatMessage; mine: boolean; day?: string; first: boolean; showName: boolean; showAvatar: boolean }

/**
 * Team chat: a chat button at the bottom right of the portal, for people with the Team chat checkpoint. It opens a
 * chat window that stays while moving between pages, can be minimised back to the button, or expanded to a large
 * two-pane window (the chats beside the open chat). One-to-one and group chats, unread badges, read ticks, typing
 * and who is online. Messages are cleared after the days set on the server.
 */
@Component({
  selector: 'app-team-chat',
  imports: [FormsModule, NgTemplateOutlet, Avatar],
  template: `
    @if (mode() === 'closed') {
      <button type="button" class="launcher" (click)="setMode('open')" [attr.aria-label]="'Team chat' + (store.unreadTotal() ? ', ' + store.unreadTotal() + ' unread' : '')" title="Team chat">
        <i class="pi pi-comments" aria-hidden="true"></i>
        @if (store.unreadTotal()) { <span class="launch-badge">{{ store.unreadTotal() > 99 ? '99+' : store.unreadTotal() }}</span> }
      </button>
    } @else {
      <section class="chat" [class.max]="mode() === 'max'" role="dialog" aria-label="Team chat">
        <header class="bar">
          <i class="pi pi-comments" aria-hidden="true"></i>
          <b>Team chat</b>
          @if (store.unreadTotal()) { <span class="bar-badge">{{ store.unreadTotal() }}</span> }
          <span class="grow"></span>
          <button type="button" class="bar-btn only-wide" (click)="setMode(mode() === 'max' ? 'open' : 'max')"
                  [attr.aria-label]="mode() === 'max' ? 'Make the chat smaller' : 'Expand the chat'" [title]="mode() === 'max' ? 'Smaller' : 'Expand'">
            <i [class]="mode() === 'max' ? 'pi pi-window-minimize' : 'pi pi-window-maximize'" aria-hidden="true"></i></button>
          <button type="button" class="bar-btn" (click)="setMode('closed')" aria-label="Minimise the chat" title="Minimise">
            <i class="pi pi-minus" aria-hidden="true"></i></button>
        </header>
        @if (store.error()) { <div class="banner">{{ store.error() }}</div> }

        <div class="body" [class.two]="twoPane()">
          @if (twoPane()) {
            <div class="pane pane--list">
              <ng-container [ngTemplateOutlet]="view() === 'new' ? newTpl : listTpl" />
            </div>
            <div class="pane pane--thread">
              @if (store.active()) { <ng-container [ngTemplateOutlet]="threadTpl" /> }
              @else {
                <div class="placeholder"><span class="ph-icon"><i class="pi pi-comments" aria-hidden="true"></i></span>
                  <h2>Your team chat</h2><p>Choose a chat on the left, or start a new one with a colleague or a group.</p></div>
              }
            </div>
          } @else {
            <div class="pane">
              <ng-container [ngTemplateOutlet]="view() === 'new' ? newTpl : view() === 'thread' && store.active() ? threadTpl : listTpl" />
            </div>
          }
        </div>
      </section>
    }

    <!-- the chats -->
    <ng-template #listTpl>
      <div class="list-head">
        <h2>Messages</h2>
        <button type="button" class="icon-btn primary" (click)="startNew('PERSON')" aria-label="New chat" title="New chat"><i class="pi pi-plus" aria-hidden="true"></i></button>
      </div>
      <label class="search"><i class="pi pi-search" aria-hidden="true"></i>
        <input type="search" placeholder="Search chats" aria-label="Search chats" [ngModel]="query()" (ngModelChange)="query.set($event)" /></label>
      <ul class="list" aria-label="Chats">
        @if (store.loading()) {
          @for (i of [1, 2, 3]; track i) { <li class="skeleton"><span></span><div><i></i><i></i></div></li> }
        }
        @for (c of shownChats(); track c.id) {
          <li [class.active]="c.id === store.activeId() && twoPane()" [class.unread]="c.unread > 0">
            <button type="button" class="conv" (click)="openChat(c.id)">
              <span class="av-wrap">
                @if (c.type === 'GROUP') { <span class="group-av" [style.background]="color(c.id)"><i class="pi pi-users" aria-hidden="true"></i></span> }
                @else if (other(c); as o) {
                  <app-avatar [name]="o.name" [employeeId]="o.id" [photoVersion]="o.photoUpdatedAt" [size]="44" />
                  <span class="dot" [class.on]="isOnline(o.id)"></span>
                }
              </span>
              <span class="meta">
                <span class="row"><span class="title">{{ c.title }}</span><span class="time">{{ c.last ? listTime(c.last.createdAt) : '' }}</span></span>
                <span class="row">
                  <span class="preview">
                    @if (typingIn(c.id).length) { <em class="typing-text">{{ typingIn(c.id)[0] }} is typing…</em> }
                    @else if (c.last) { @if (c.last.senderId === meId()) { <b>You:</b> } @else if (c.type === 'GROUP') { <b>{{ firstName(c.last.senderName) }}:</b> } {{ c.last.content }} }
                    @else { <span class="muted">No messages yet</span> }
                  </span>
                  @if (c.unread) { <span class="badge">{{ c.unread }}</span> }
                </span>
              </span>
            </button>
          </li>
        } @empty {
          @if (!store.loading()) {
            <li class="empty">{{ query() ? 'No chat matches.' : 'No chats yet. Press + to start one.' }}</li>
          }
        }
      </ul>
    </ng-template>

    <!-- one chat -->
    <ng-template #threadTpl>
      @if (store.active(); as c) {
        <div class="head">
          @if (!twoPane()) { <button type="button" class="back" (click)="backToList()" aria-label="Back to the chats"><i class="pi pi-chevron-left" aria-hidden="true"></i></button> }
          <span class="av-wrap">
            @if (c.type === 'GROUP') { <span class="group-av sm" [style.background]="color(c.id)"><i class="pi pi-users" aria-hidden="true"></i></span> }
            @else if (other(c); as o) {
              <app-avatar [name]="o.name" [employeeId]="o.id" [photoVersion]="o.photoUpdatedAt" [size]="38" />
              <span class="dot" [class.on]="isOnline(o.id)"></span>
            }
          </span>
          <div class="who"><div class="title">{{ c.title }}</div><div class="sub" [class.typing-text]="store.activeTyping().length">{{ subtitle() }}</div></div>
          @if (c.type === 'GROUP') {
            <button type="button" class="icon-btn" (click)="startNew('ADD')" aria-label="Add people" title="Add people"><i class="pi pi-user-plus" aria-hidden="true"></i></button>
            <button type="button" class="icon-btn" (click)="leave(c)" aria-label="Leave the group" title="Leave the group"><i class="pi pi-sign-out" aria-hidden="true"></i></button>
          }
        </div>
        <div class="scroller" #scroller (scroll)="onScroll()">
          <div class="msgs">
            @if (store.hasOlder()[c.id]) { <div class="day"><span>Scroll up for earlier messages</span></div> }
            @for (r of rows(); track r.msg.id) {
              @if (r.day) { <div class="day"><span>{{ r.day }}</span></div> }
              <div class="line" [class.mine]="r.mine" [class.first]="r.first">
                @if (!r.mine) {
                  <span class="av-slot">@if (r.showAvatar) { <app-avatar [name]="r.msg.senderName" [employeeId]="r.msg.senderId" [photoVersion]="photoOf(r.msg.senderId)" [size]="28" /> }</span>
                }
                <div class="bubble" [class.sending]="r.msg.sending">
                  @if (r.showName) { <div class="name" [style.color]="color(r.msg.senderId)">{{ r.msg.senderName }}</div> }
                  <span class="text">{{ r.msg.content }}</span>
                  <span class="stamp">{{ clock(r.msg.createdAt) }}
                    @if (r.mine) {
                      @if (r.msg.sending) { <i class="pi pi-clock" aria-label="Sending"></i> }
                      @else if (c.othersRead >= r.msg.id) {
                        <svg class="ticks read" viewBox="0 0 18 12" width="16" height="11" role="img" aria-label="Read"><path d="M1 6.5 4.5 10 11 2.5M7 9.5 7.5 10 14 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      } @else {
                        <svg class="ticks" viewBox="0 0 18 12" width="16" height="11" role="img" aria-label="Sent"><path d="M3 6.5 6.5 10 13 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      }
                    }</span>
                </div>
              </div>
            } @empty { <p class="no-msgs">Say hello to {{ c.type === 'GROUP' ? 'the group' : firstName(c.title) }} 👋</p> }
            @if (store.activeTyping().length) {
              <div class="line first typing-line"><span class="av-slot"></span>
                <div class="bubble typing" [attr.aria-label]="store.activeTyping().join(', ') + ' typing'"><span></span><span></span><span></span></div></div>
            }
          </div>
        </div>
        <form class="composer" (ngSubmit)="submit()">
          <textarea #box rows="1" placeholder="Write a message…" aria-label="Message" maxlength="4000" [ngModel]="draft()" name="draft"
                    (ngModelChange)="onInput($event)" (keydown.enter)="onEnter($any($event))"></textarea>
          <button type="submit" class="send" [disabled]="!draft().trim()" aria-label="Send"><i class="pi pi-send" aria-hidden="true"></i></button>
        </form>
      }
    </ng-template>

    <!-- starting a chat, or adding people to a group -->
    <ng-template #newTpl>
      <div class="head">
        <button type="button" class="back" (click)="cancelNew()" aria-label="Back"><i class="pi pi-chevron-left" aria-hidden="true"></i></button>
        <div class="who"><div class="title">{{ pick() === 'ADD' ? 'Add people to ' + (store.active()?.title ?? 'the group') : 'New chat' }}</div>
          <div class="sub">{{ pick() === 'PERSON' ? 'Choose a colleague' : 'Choose the people' }}</div></div>
      </div>
      @if (pick() !== 'ADD') {
        <div class="seg" role="tablist" aria-label="Chat with">
          <button type="button" role="tab" [attr.aria-selected]="pick() === 'PERSON'" [class.on]="pick() === 'PERSON'" (click)="pick.set('PERSON')"><i class="pi pi-user" aria-hidden="true"></i> One person</button>
          <button type="button" role="tab" [attr.aria-selected]="pick() === 'GROUP'" [class.on]="pick() === 'GROUP'" (click)="pick.set('GROUP')"><i class="pi pi-users" aria-hidden="true"></i> Group</button>
        </div>
      }
      @if (pick() === 'GROUP') {
        <label class="search"><i class="pi pi-tag" aria-hidden="true"></i>
          <input placeholder="Group name, e.g. Kochi site team" aria-label="Group name" maxlength="120" [ngModel]="groupName()" (ngModelChange)="groupName.set($event)" /></label>
      }
      <label class="search"><i class="pi pi-search" aria-hidden="true"></i>
        <input type="search" placeholder="Search people" aria-label="Search people" [ngModel]="peopleQuery()" (ngModelChange)="peopleQuery.set($event)" /></label>
      <ul class="list">
        @for (p of shownPeople(); track p.id) {
          <li [class.active]="picked().has(p.id)">
            <button type="button" class="conv" (click)="choose(p)" [attr.aria-pressed]="pick() === 'PERSON' ? null : picked().has(p.id)">
              <span class="av-wrap"><app-avatar [name]="p.name" [employeeId]="p.id" [photoVersion]="p.photoUpdatedAt" [size]="40" />
                <span class="dot" [class.on]="isOnline(p.id)"></span></span>
              <span class="meta"><span class="title">{{ p.name }}</span><span class="preview">{{ [p.designation, p.brandCode].filter(present).join(' · ') || ' ' }}</span></span>
              @if (pick() !== 'PERSON') { <i class="check pi" [class.pi-check-square]="picked().has(p.id)" [class.pi-stop]="!picked().has(p.id)" aria-hidden="true"></i> }
            </button>
          </li>
        } @empty { <li class="empty">{{ peopleLoading() ? 'Loading…' : 'Nobody else has Team chat yet.' }}</li> }
      </ul>
      @if (newError()) { <div class="banner err">{{ newError() }}</div> }
      @if (pick() !== 'PERSON') {
        <div class="foot">
          <button type="button" class="primary-btn" [disabled]="!picked().size || (pick() === 'GROUP' && !groupName().trim()) || busy()" (click)="makeGroup()">
            {{ pick() === 'ADD' ? 'Add ' + picked().size + (picked().size === 1 ? ' person' : ' people') : 'Start the group' + (picked().size ? ' (' + (picked().size + 1) + ')' : '') }}</button>
        </div>
      }
    </ng-template>
  `,
  styles: `
    :host {
      --c-bg: #f4f6fa; --c-surface: #fff; --c-surface-2: #f8fafc; --c-border: #e3e8ef; --c-text: #0f1b2d; --c-muted: #64748b;
      --c-brand: #1d4ed8; --c-brand-soft: #e8efff; --c-online: #16a34a;
      font-size: 14px; color: var(--c-text);
    }
    button { font: inherit; cursor: pointer; }
    .launcher { position: fixed; right: 22px; bottom: 22px; z-index: 1000; width: 58px; height: 58px; border-radius: 50%; border: 0;
      background: var(--c-brand); color: #fff; box-shadow: 0 10px 28px rgba(29, 78, 216, .35); display: grid; place-items: center; transition: transform .15s; }
    .launcher:hover { transform: translateY(-2px); }
    .launcher .pi { font-size: 1.45rem; }
    .launch-badge { position: absolute; top: -3px; right: -3px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: #dc2626;
      color: #fff; font-size: .72rem; font-weight: 700; display: grid; place-items: center; border: 2px solid #fff; }

    .chat { position: fixed; right: 22px; bottom: 22px; z-index: 1000; width: 380px; height: min(600px, calc(100dvh - 44px)); display: flex; flex-direction: column;
      background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 16px; overflow: hidden;
      box-shadow: 0 24px 60px rgba(15, 27, 45, .22), 0 4px 16px rgba(15, 27, 45, .08); }
    .chat.max { width: min(1040px, calc(100vw - 44px)); height: min(720px, calc(100dvh - 44px)); }
    .bar { display: flex; align-items: center; gap: 8px; padding: 0 8px 0 14px; height: 44px; background: #0f1b2d; color: #fff; flex: none; }
    .bar .pi-comments { font-size: 1rem; opacity: .85; }
    .bar b { font-size: .92rem; }
    .bar-badge { background: #dc2626; border-radius: 999px; min-width: 20px; height: 20px; padding: 0 6px; font-size: .7rem; font-weight: 700; display: grid; place-items: center; }
    .grow { flex: 1; }
    .bar-btn { width: 32px; height: 32px; border-radius: 8px; border: 0; background: transparent; color: #cbd5e1; display: grid; place-items: center; }
    .bar-btn:hover { background: rgba(255, 255, 255, .12); color: #fff; }
    .banner { background: #fef3c7; color: #92400e; font-size: 12px; padding: 6px 12px; text-align: center; flex: none; }
    .banner.err { background: #fee2e2; color: #991b1b; }
    .body { flex: 1; min-height: 0; display: flex; }
    .body.two { display: grid; grid-template-columns: 330px minmax(0, 1fr); }
    .pane { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--c-surface); }
    .pane--list { border-right: 1px solid var(--c-border); }
    .pane--thread { background: var(--c-bg); }

    .list-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 8px; }
    .list-head h2 { font-size: 18px; margin: 0; font-weight: 700; letter-spacing: -.01em; }
    .icon-btn { width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--c-border); background: var(--c-surface); display: grid; place-items: center; color: var(--c-muted); flex: none; }
    .icon-btn.primary { background: var(--c-brand); border-color: var(--c-brand); color: #fff; }
    .search { margin: 2px 12px 8px; display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 38px; background: var(--c-surface-2);
      border: 1px solid var(--c-border); border-radius: 10px; color: var(--c-muted); flex: none; }
    .search input { border: 0; outline: 0; background: transparent; flex: 1; min-width: 0; font: inherit; color: var(--c-text); }
    .list { list-style: none; margin: 0; padding: 2px 6px 8px; overflow-y: auto; flex: 1; min-height: 0; }
    .list li { border-radius: 12px; }
    .conv { width: 100%; display: flex; gap: 11px; align-items: center; padding: 9px; border: 0; background: transparent; border-radius: 12px; text-align: left; color: inherit; }
    .conv:hover { background: var(--c-surface-2); }
    li.active .conv { background: var(--c-brand-soft); }
    .av-wrap { position: relative; display: inline-flex; flex: none; }
    .dot { position: absolute; right: 0; bottom: 0; width: 11px; height: 11px; border-radius: 50%; background: #cbd5e1; border: 2px solid var(--c-surface); }
    .dot.on { background: var(--c-online); }
    .group-av { width: 44px; height: 44px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-size: 1.1rem; }
    .group-av.sm { width: 38px; height: 38px; font-size: 1rem; }
    .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .row { display: flex; align-items: center; gap: 8px; }
    .title { font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .time { font-size: 12px; color: var(--c-muted); flex: none; }
    .unread .time { color: var(--c-brand); font-weight: 600; }
    .preview { flex: 1; min-width: 0; color: var(--c-muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .preview b { font-weight: 500; color: var(--c-text); }
    .unread .preview { color: var(--c-text); }
    .badge { background: var(--c-brand); color: #fff; border-radius: 999px; min-width: 20px; height: 20px; padding: 0 6px; font-size: 11px; font-weight: 600; display: grid; place-items: center; flex: none; }
    .typing-text { color: var(--c-brand) !important; font-style: normal; }
    .muted { color: var(--c-muted); }
    .empty { color: var(--c-muted); text-align: center; padding: 24px 12px; }
    .skeleton { display: flex; gap: 11px; padding: 9px; }
    .skeleton span { width: 44px; height: 44px; border-radius: 50%; background: var(--c-surface-2); }
    .skeleton div { flex: 1; display: flex; flex-direction: column; gap: 6px; justify-content: center; }
    .skeleton i { display: block; height: 10px; border-radius: 6px; background: var(--c-surface-2); width: 70%; }
    .skeleton i + i { width: 45%; }

    .head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; min-height: 58px; background: var(--c-surface); border-bottom: 1px solid var(--c-border); flex: none; }
    .back { border: 0; background: none; color: var(--c-brand); padding: 4px; margin-left: -4px; display: grid; place-items: center; }
    .back .pi { font-size: 1.05rem; }
    .who { flex: 1; min-width: 0; }
    .who .title { font-size: 15px; display: block; }
    .sub { font-size: 12px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .scroller { flex: 1; overflow-y: auto; min-height: 0; background: var(--c-bg); }
    .msgs { max-width: 880px; margin: 0 auto; padding: 12px 14px 8px; display: flex; flex-direction: column; }
    .day { display: flex; justify-content: center; margin: 12px 0 6px; }
    .day span { font-size: 11px; font-weight: 600; color: var(--c-muted); background: var(--c-surface); border: 1px solid var(--c-border); padding: 3px 10px; border-radius: 999px; }
    .line { display: flex; align-items: flex-end; gap: 8px; margin-top: 2px; }
    .line.first { margin-top: 9px; }
    .line.mine { justify-content: flex-end; }
    .av-slot { width: 28px; flex: none; }
    .bubble { max-width: min(560px, 80%); background: var(--c-surface); border: 1px solid var(--c-border); padding: 7px 11px 6px; border-radius: 16px;
      line-height: 1.45; box-shadow: 0 1px 1px rgba(15, 27, 45, .03); overflow-wrap: anywhere; }
    .line:not(.mine).first .bubble { border-top-left-radius: 6px; }
    .mine .bubble { background: var(--c-brand); color: #fff; border-color: var(--c-brand); }
    .mine.first .bubble { border-top-right-radius: 6px; }
    .bubble.sending { opacity: .7; }
    .name { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
    .text { white-space: pre-wrap; }
    .stamp { float: right; display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; margin: 6px 0 -2px 10px; color: var(--c-muted); }
    .mine .stamp { color: rgba(255, 255, 255, .78); }
    .stamp .pi { font-size: 10px; }
    .ticks.read { color: #bfdbfe; }
    .no-msgs { text-align: center; color: var(--c-muted); margin: 40px 0; }
    .typing { display: flex; gap: 4px; padding: 11px 13px; }
    .typing span { width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; animation: blink 1.2s infinite; }
    .typing span:nth-child(2) { animation-delay: .2s; }
    .typing span:nth-child(3) { animation-delay: .4s; }
    @keyframes blink { 0%, 60%, 100% { opacity: .3; } 30% { opacity: 1; } }
    .composer { display: flex; align-items: flex-end; gap: 8px; padding: 9px 12px 10px; background: var(--c-surface); border-top: 1px solid var(--c-border);
      padding-bottom: max(10px, env(safe-area-inset-bottom)); flex: none; }
    textarea { flex: 1; resize: none; border: 1px solid var(--c-border); background: var(--c-surface-2); border-radius: 12px; padding: 9px 12px; max-height: 120px;
      line-height: 1.4; outline: none; font: inherit; color: var(--c-text); }
    textarea:focus { border-color: var(--c-brand); background: var(--c-surface); }
    .send { width: 40px; height: 40px; border-radius: 12px; border: 0; background: var(--c-brand); color: #fff; display: grid; place-items: center; flex: none; }
    .send:disabled { background: #c7d2fe; cursor: default; }

    .placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; color: var(--c-muted); }
    .ph-icon { width: 80px; height: 80px; border-radius: 24px; background: var(--c-brand-soft); color: var(--c-brand); display: grid; place-items: center; margin-bottom: 14px; }
    .ph-icon .pi { font-size: 2rem; }
    .placeholder h2 { color: var(--c-text); font-size: 18px; margin: 0 0 6px; }
    .placeholder p { margin: 0; max-width: 300px; line-height: 1.5; }

    .seg { display: flex; gap: 4px; margin: 10px 12px 8px; padding: 3px; background: var(--c-surface-2); border: 1px solid var(--c-border); border-radius: 10px; flex: none; }
    .seg button { flex: 1; border: 0; background: transparent; border-radius: 8px; padding: 7px; color: var(--c-muted); display: inline-flex; gap: 6px; justify-content: center; align-items: center; }
    .seg button.on { background: var(--c-surface); color: var(--c-text); font-weight: 600; box-shadow: 0 1px 3px rgba(15, 27, 45, .1); }
    .check { color: var(--c-brand); font-size: 1.1rem; }
    .foot { padding: 10px 12px; border-top: 1px solid var(--c-border); flex: none; }
    .primary-btn { width: 100%; height: 40px; border-radius: 10px; border: 0; background: var(--c-brand); color: #fff; font-weight: 600; }
    .primary-btn:disabled { background: #c7d2fe; cursor: default; }

    /* phones: the chat takes the whole screen; the launcher sits clear of the bottom edge */
    @media (max-width: 760px) {
      .launcher { right: 16px; bottom: 16px; width: 54px; height: 54px; }
      .chat, .chat.max { inset: 0; right: 0; bottom: 0; width: 100vw; height: 100dvh; border-radius: 0; border: 0; }
      .only-wide { display: none; }
      .bubble { max-width: 84%; }
    }
  `,
})
export class TeamChat implements OnInit, OnDestroy, AfterViewChecked {
  protected readonly store = inject(ChatStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly mode = signal<Mode>(readMode());
  protected readonly view = signal<View>('list');
  protected readonly query = signal('');
  protected readonly draft = signal('');
  private readonly wide = signal(typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches);
  protected readonly twoPane = computed(() => this.mode() === 'max' && this.wide());
  protected readonly meId = computed(() => this.auth.user()?.id ?? 0);

  protected readonly shownChats = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.store.conversations().filter((c) => !q || c.title.toLowerCase().includes(q) || c.members.some((m) => m.name.toLowerCase().includes(q)));
  });
  protected readonly subtitle = computed(() => {
    const c = this.store.active();
    if (!c) return '';
    const typing = this.store.activeTyping();
    if (typing.length) return `${typing.join(', ')} typing…`;
    if (c.type === 'DIRECT') {
      const o = this.other(c);
      return [o && this.isOnline(o.id) ? 'Online' : 'Offline', o?.designation].filter(Boolean).join(' · ');
    }
    const online = c.members.filter((m) => m.id !== this.meId() && this.isOnline(m.id)).length;
    return `${c.members.length} members · ${online} online`;
  });
  protected readonly rows = computed<Row[]>(() => {
    const me = this.meId();
    const list = this.store.activeMessages();
    const group = this.store.active()?.type === 'GROUP';
    return list.map((msg, i) => {
      const prev = list[i - 1];
      const next = list[i + 1];
      const day = dayLabel(msg.createdAt);
      const newDay = !prev || dayLabel(prev.createdAt) !== day;
      const first = newDay || prev.senderId !== msg.senderId;
      const lastInRun = !next || next.senderId !== msg.senderId || dayLabel(next.createdAt) !== day;
      const mine = msg.senderId === me;
      return { msg, mine, day: newDay ? day : undefined, first, showName: !mine && first && group, showAvatar: !mine && lastInRun };
    });
  });

  // new chat
  protected readonly pick = signal<Pick>('PERSON');
  protected readonly people = signal<ChatPerson[]>([]);
  protected readonly peopleLoading = signal(false);
  protected readonly peopleQuery = signal('');
  protected readonly picked = signal<Set<number>>(new Set());
  protected readonly groupName = signal('');
  protected readonly newError = signal('');
  protected readonly busy = signal(false);
  protected readonly shownPeople = computed(() => {
    const q = this.peopleQuery().trim().toLowerCase();
    const inGroup = this.pick() === 'ADD' ? new Set(this.store.active()?.members.map((m) => m.id) ?? []) : new Set<number>();
    return this.people().filter((p) => !inGroup.has(p.id) && (!q || [p.name, p.designation, p.brandCode].some((v) => v?.toLowerCase().includes(q))));
  });

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');
  private stick = true;
  private lastCount = -1;
  private media?: MediaQueryList;
  private readonly onMedia = (e: MediaQueryListEvent) => this.wide.set(e.matches);

  constructor() {
    // the window open = polls faster and reads what it shows
    effect(() => {
      const open = this.mode() !== 'closed';
      untracked(() => {
        this.store.visible.set(open);
        if (open) {
          this.store.pollSoon();
          this.store.markActiveRead();
        }
      });
    });
    // a new chat opened: start at the bottom
    effect(() => {
      this.store.activeId();
      this.stick = true;
      this.lastCount = -1;
    });
  }

  ngOnInit(): void {
    this.store.start();
    if (typeof window !== 'undefined') {
      this.media = window.matchMedia('(min-width: 900px)');
      this.media.addEventListener('change', this.onMedia);
    }
  }

  ngOnDestroy(): void {
    this.store.stop();
    this.media?.removeEventListener('change', this.onMedia);
  }

  ngAfterViewChecked(): void {
    const el = this.scroller()?.nativeElement;
    const count = this.store.activeMessages().length + this.store.activeTyping().length;
    if (el && count !== this.lastCount && this.stick) el.scrollTop = el.scrollHeight;
    if (el) this.lastCount = count;
  }

  protected setMode(m: Mode): void {
    this.mode.set(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* not remembered */
    }
  }

  protected openChat(id: number): void {
    this.store.open(id);
    this.view.set('thread');
    this.draft.set('');
    setTimeout(() => this.box()?.nativeElement.focus(), 0);
  }

  protected backToList(): void {
    this.view.set('list');
    this.store.open(null);
  }

  protected onScroll(): void {
    const el = this.scroller()!.nativeElement;
    this.stick = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 20) {
      const before = el.scrollHeight;
      this.store.loadOlder();
      // keep the reader's place when older messages come in above
      setTimeout(() => (el.scrollTop += el.scrollHeight - before), 300);
    }
  }

  protected onInput(v: string): void {
    this.draft.set(v);
    const box = this.box()?.nativeElement;
    if (box) {
      box.style.height = 'auto';
      box.style.height = Math.min(box.scrollHeight, 120) + 'px';
    }
    if (v.trim()) this.store.typed();
  }

  protected onEnter(e: KeyboardEvent): void {
    if (e.shiftKey) return;
    e.preventDefault();
    this.submit();
  }

  protected submit(): void {
    const text = this.draft();
    if (!text.trim()) return;
    const u = this.auth.user();
    this.store.send(text, { id: u?.id ?? 0, name: u?.name ?? 'Me' });
    this.draft.set('');
    this.stick = true;
    const box = this.box()?.nativeElement;
    if (box) box.style.height = 'auto';
  }

  // ---- new chat / add people ----

  protected startNew(p: Pick): void {
    this.pick.set(p);
    this.picked.set(new Set());
    this.groupName.set('');
    this.peopleQuery.set('');
    this.newError.set('');
    this.view.set('new');
    this.peopleLoading.set(true);
    this.store.people().subscribe({
      next: (list) => {
        this.people.set(list);
        this.peopleLoading.set(false);
      },
      error: (e) => {
        this.peopleLoading.set(false);
        this.newError.set(apiProblem(e).message);
      },
    });
  }

  protected cancelNew(): void {
    this.view.set(this.pick() === 'ADD' && this.store.active() ? 'thread' : 'list');
  }

  protected choose(p: ChatPerson): void {
    if (this.pick() === 'PERSON') {
      this.busy.set(true);
      this.store.direct(p.id).subscribe({
        next: (c) => this.opened(c),
        error: (e) => this.failed(e),
      });
      return;
    }
    this.picked.update((s) => {
      const n = new Set(s);
      if (n.has(p.id)) n.delete(p.id);
      else n.add(p.id);
      return n;
    });
  }

  protected makeGroup(): void {
    const ids = [...this.picked()];
    this.busy.set(true);
    const c = this.store.active();
    const call = this.pick() === 'ADD' && c ? this.store.addMembers(c.id, ids) : this.store.group(this.groupName().trim(), ids);
    call.subscribe({
      next: (conv) => {
        if (this.pick() === 'ADD') this.toast.add({ severity: 'success', summary: 'Added', detail: `${ids.length} added to ${conv.title}` });
        this.opened(conv);
      },
      error: (e) => this.failed(e),
    });
  }

  private opened(c: Conversation): void {
    this.busy.set(false);
    this.store.upsert(c);
    this.openChat(c.id);
  }

  private failed(e: unknown): void {
    this.busy.set(false);
    this.newError.set(apiProblem(e).message);
  }

  protected leave(c: Conversation): void {
    this.confirm.confirm({
      header: 'Leave the group', message: `Leave “${c.title}”? You will no longer see its messages.`, icon: 'pi pi-sign-out',
      acceptLabel: 'Leave', rejectLabel: 'Stay', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.store.leave(c.id).subscribe({
        next: () => {
          this.store.remove(c.id);
          this.view.set('list');
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not left', detail: apiProblem(e).message }),
      }),
    });
  }

  // ---- helpers ----

  protected other(c: Conversation): ChatPerson | null {
    return c.members.find((m) => m.id !== this.meId()) ?? null;
  }

  protected isOnline(id: number): boolean {
    return this.store.online().has(id);
  }

  protected typingIn(id: number): string[] {
    return this.store.typing()[String(id)] ?? [];
  }

  protected photoOf(id: number): string | null {
    return this.store.active()?.members.find((m) => m.id === id)?.photoUpdatedAt ?? null;
  }

  protected color(key: number): string {
    let h = 0;
    for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  protected readonly present = (v: string | null) => !!v;
  protected firstName(n: string): string {
    return n.split(' ')[0];
  }

  protected clock(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  protected listTime(iso: string): string {
    const d = new Date(iso);
    const days = Math.floor((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
    if (days === 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function readMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    // a phone opens on the button, not over the page
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches) return 'closed';
    return m === 'open' || m === 'max' ? m : 'closed';
  } catch {
    return 'closed';
  }
}
