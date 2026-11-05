/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { AuthService } from '../auth.service';
import { Avatar } from '../avatar';
import { LeavePlanAlerts } from '../leave/leave-plan-alerts';
import { rupeesRound } from '../payroll/payroll.models';
import { CHART, Column, Columns, Gauge, Part as BarPart, SplitBar } from './charts';
import {
  BrandRow, DashAttendance, DashboardService, DashHours, DashLeave, DashMail, DashPay, DashProfile, DashSummary, DashTasks, LeaveRow, Meeting, Period,
  TeamAttendance, TeamMember, TeamPay, TeamPeople, TeamProfile, TeamSummary, timeLabel,
} from './dashboard.service';
import { MeetingCalendar } from './meeting-calendar';
import { Part, PartLoader, PartState } from './part';

type Mode = 'me' | 'team';

const STATUS: Record<NonNullable<TeamMember['status']>, { label: string; icon: string }> = {
  CHECKED_IN: { label: 'Checked in', icon: 'pi pi-check-circle' },
  NOT_IN: { label: 'Not in yet', icon: 'pi pi-clock' },
  ON_LEAVE: { label: 'On leave', icon: 'pi pi-calendar-minus' },
  OFF: { label: 'Day off', icon: 'pi pi-minus-circle' },
};

/** The menu behind each part, in each view: without it the part is not asked for or drawn. */
const TICKS = {
  me: { hours: 'WORKLOG_MY', attendance: 'ATT_CHECKIN', leave: 'LEAVE_MY', tasks: 'WORKLOG_MY', pay: 'MY_PAY' },
  team: { hours: 'WORKLOG_MY', attendance: 'ATT_TEAM', leave: 'LEAVE_APPROVALS', tasks: 'WORKLOG_MY', pay: 'TEAM_PAY' },
} as const;
type Ticked = keyof typeof TICKS.me;

/**
 * The Overview, the first page of the employee portal: how my day, week and year are going, from the same numbers as the
 * pages behind them, with my meetings on a calendar. Each section loads on its own with a small loader of its own: the
 * page's loader waits only for the first quick answer, so nobody waits for the slowest figure to see the others, and
 * adding a meeting refreshes only the meetings. People with someone below them can switch to Team: the same parts added
 * up for those people in their brand, then person by person. Owners can also take one brand, or compare the brands.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    DatePipe, FormsModule, RouterLink, InputTextModule, MessageModule, SelectModule, SelectButtonModule, SkeletonModule, TableModule,
    Avatar, Columns, Gauge, SplitBar, LeavePlanAlerts, MeetingCalendar, PartLoader,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Hello{{ firstName() ? ', ' + firstName() : '' }}</h1>
        <p class="sub">{{ me.summary.value()?.today ?? null | date: 'EEEE, d MMMM y' }}{{ subtitle() ? ' · ' + subtitle() : '' }}</p>
      </div>
      @if (me.summary.value()?.hasTeam) {
        <div class="head-actions switch">
          @if (mode() === 'team' && brandOptions().length > 1) {
            <p-select class="brand-pick" [options]="brandOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All brands"
                      ariaLabel="Show one brand" appendTo="body" [ngModel]="brandId()" (ngModelChange)="setBrand($event ?? null)" />
          }
          <p-selectbutton class="mode" [options]="modes" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Show my figures or my team's"
                          [ngModel]="mode()" (ngModelChange)="setMode($event)" />
        </div>
      }
    </div>
    <app-leave-plan-alerts />

    @if (mode() === 'me' && me.summary.failed()) {
      <p-message severity="error" styleClass="page-message">Today's details could not be loaded. The sections below load on their own.</p-message>
    }
    @if (mode() === 'team' && tm.summary.value()?.people === 0) {
      <p-message severity="info" styleClass="page-message">{{ brandId() === null ? 'Nobody reports to you, directly or through someone else, yet.' : 'Nobody in this brand is in your team.' }}</p-message>
    }

    @let s = parts();
    <div class="dash">
      <div class="main">
        <div class="tiles">
          @if (visible('hours')) {
            <section class="p-card tile" [class.refreshing]="s.hours.loading() && s.hours.has()">
              @if (hours(); as h) {
                <app-gauge [percent]="pct(h.today, h.dailyTarget)" [text]="hoursShort(h.today)" [label]="'Hours worked today: ' + hoursText(h.today)" />
                <div class="t-text"><h2>Hours today</h2>
                  <small>{{ h.dailyTarget ? 'of ' + hoursText(h.dailyTarget) + ' expected' : 'in your work log' }}</small></div>
              } @else { <app-part-loader [part]="s.hours" kind="tile" label="hours today" /> }
            </section>
          }
          @if (visible('attendance')) {
            <section class="p-card tile" [class.refreshing]="s.attendance.loading() && s.attendance.has()">
              @if (attendance(); as a) {
                <app-gauge [percent]="a.percent ?? 0" [text]="a.percent === null ? '–' : a.percent + '%'" [label]="'Attendance today: ' + (a.percent === null ? 'nobody expected' : a.percent + '%')" />
                <div class="t-text"><h2>Attendance today</h2><small>{{ a.note }}</small></div>
              } @else { <app-part-loader [part]="s.attendance" kind="tile" label="attendance" /> }
            </section>
          }
          @if (mode() === 'me') {
            <a class="p-card tile link" routerLink="/portal/profile" [class.refreshing]="s.profile.loading() && s.profile.has()">
              @if (profile(); as p) {
                <app-gauge [percent]="p.percent" [text]="p.percent + '%'" [label]="'Profile ' + p.percent + '% complete'" />
                <div class="t-text"><h2>My profile</h2><small>{{ p.note }}</small></div>
              } @else { <app-part-loader [part]="s.profile" kind="tile" label="profile" /> }
            </a>
          } @else {
            <section class="p-card tile" [class.refreshing]="s.profile.loading() && s.profile.has()">
              @if (profile(); as p) {
                <app-gauge [percent]="p.percent" [text]="p.percent + '%'" [label]="'Profiles ' + p.percent + '% complete on average'" />
                <div class="t-text"><h2>Profiles</h2><small>{{ p.note }}</small></div>
              } @else { <app-part-loader [part]="s.profile" kind="tile" label="profiles" /> }
            </section>
          }
          <button type="button" class="p-card tile link num" [class.refreshing]="s.meetings.loading() && s.meetings.has()" (click)="calendar()?.showToday()">
            @if (meetingsToday(); as list) {
              <b class="big">{{ list.length }}</b>
              <div class="t-text"><h2>Meetings today</h2><small>{{ nextMeeting() }}</small></div>
            } @else { <app-part-loader [part]="s.meetings" kind="tile" label="meetings" /> }
          </button>
        </div>

        @if (showByBrand()) {
          <section class="p-card" [class.refreshing]="tm.people.loading() && tm.people.has()">
            <div class="c-head"><h2>By brand</h2><span class="sum">Choose a brand to see only its figures</span></div>
            @if (tm.people.value(); as t) {
              <p-table [value]="t.byBrand" dataKey="id" styleClass="p-stack" [tableStyle]="{ 'min-width': '640px' }">
                <ng-template #header>
                  <tr>
                    <th>Brand</th><th class="n">People</th>
                    @if (teamCan.attendance()) { <th class="n">Checked in</th> }
                    @if (teamCan.hours()) { <th class="n">Hours today</th><th class="n">Tasks done / pending</th> }
                    @if (teamCan.leave()) { <th class="n">Leave taken / left</th> }
                    <th class="n">Profiles</th>
                    @if (teamCan.pay()) { <th class="n">Salary received</th> }
                  </tr>
                </ng-template>
                <ng-template #body let-b>
                  <tr>
                    <td data-label="Brand" class="stack-full"><button type="button" class="linkish" (click)="setBrand(b.id)">{{ b.name }}</button></td>
                    <td data-label="People" class="n">{{ b.people }}</td>
                    @if (teamCan.attendance()) { <td data-label="Checked in" class="n">{{ b.checkedIn }} of {{ b.expected }}</td> }
                    @if (teamCan.hours()) {
                      <td data-label="Hours today" class="n">{{ days(b.hoursToday) }}</td>
                      <td data-label="Tasks done / pending" class="n">{{ b.tasksCompleted }} / {{ b.tasksPending }}</td>
                    }
                    @if (teamCan.leave()) { <td data-label="Leave taken / left" class="n">{{ days(b.leaveTaken) }} / {{ days(b.leaveRemaining) }}</td> }
                    <td data-label="Profiles" class="n">{{ b.profilePercent }}%</td>
                    @if (teamCan.pay()) { <td data-label="Salary received" class="n">
                      @if (tm.pay.value(); as pay) { {{ money(pay.receivedByBrand[b.id] ?? 0) }} } @else if (tm.pay.failed()) { – } @else { <p-skeleton width="64px" height="13px" styleClass="cell-wait" /> }
                    </td> }
                  </tr>
                </ng-template>
              </p-table>
            } @else { <app-part-loader [part]="tm.people" label="brands" [rows]="3" /> }
          </section>
        }

        <div class="row wide-first">
          @if (visible('hours')) {
            <section class="p-card" [class.refreshing]="s.hours.loading() && s.hours.has()">
              @if (hours(); as h) {
                <div class="c-head"><h2>Hours this week</h2><span class="sum"><b>{{ hoursText(h.week) }}</b>{{ h.weeklyTarget ? ' of ' + hoursText(h.weeklyTarget) : '' }}</span></div>
                <app-columns class="week-chart" label="Hours logged each day this week" [data]="weekColumns()" [target]="h.dailyTarget" [targetLabel]="h.dailyTarget ? 'Daily ' + hoursText(h.dailyTarget) : ''" />
              } @else {
                <div class="c-head"><h2>Hours this week</h2></div>
                <app-part-loader [part]="s.hours" kind="chart" label="hours this week" />
              }
            </section>
          }
          @if (visible('attendance')) {
            <section class="p-card" [class.refreshing]="s.attendance.loading() && s.attendance.has()">
              <div class="c-head"><h2>Working days</h2></div>
              @if (attendance(); as a) {
                <div class="period">
                  <div class="per-top"><span>This week</span><span><b>{{ a.week.attended }}</b> of {{ a.week.days }} {{ a.daysWord }}</span></div>
                  <app-split-bar [parts]="periodParts(a.week)" />
                </div>
                <div class="period">
                  <div class="per-top"><span>This month</span><span><b>{{ a.month.attended }}</b> of {{ a.month.days }} {{ a.daysWord }}</span></div>
                  <app-split-bar [parts]="periodParts(a.month)" />
                </div>
                @if (mode() === 'team') { <small class="muted block">One person's working day is one person-day.</small> }
              } @else { <app-part-loader [part]="s.attendance" label="working days" [rows]="4" /> }
            </section>
          }
        </div>

        <div class="row wide-first">
          @if (visible('leave')) {
            <section class="p-card" [class.refreshing]="s.leave.loading() && s.leave.has()">
              <div class="c-head"><h2>Leave</h2>
                @if (leave()?.planFrom) { <span class="sum">{{ leave()!.planFrom | date: 'd MMM y' }} – {{ leave()!.planUntil | date: 'd MMM y' }}</span> }</div>
              @if (leave(); as l) {
                @if (l.types.length) {
                  <div class="stats">
                    <div><b>{{ days(l.remaining) }}</b><small>Remaining</small></div>
                    <div><b>{{ days(l.taken) }}</b><small>Already taken</small></div>
                    <div><b>{{ days(l.pending) }}</b><small>Waiting for approval</small></div>
                  </div>
                  <ul class="types">
                    @for (t of leaveTypes(); track t.code) {
                      <li>
                        <span class="t-name">{{ t.name }}</span>
                        @if (t.entitled !== null) {
                          <app-split-bar [parts]="leaveParts(t)" [legend]="false" />
                          <span class="t-nums"><b>{{ days(t.available ?? 0) }}</b> left of {{ days(t.entitled) }}</span>
                        } @else {
                          <span class="no-limit">No fixed limit</span>
                          <span class="t-nums"><b>{{ days(t.used) }}</b> taken</span>
                        }
                      </li>
                    }
                  </ul>
                  <ul class="key" aria-hidden="true">
                    <li><i [style.background]="colors.done"></i>Taken</li>
                    <li><i [style.background]="colors.waiting"></i>Waiting</li>
                    <li><i [style.background]="colors.rest"></i>Remaining</li>
                  </ul>
                } @else {
                  <p class="none">{{ mode() === 'me' ? 'No leave plan is in force for you yet.' : 'No leave plan is in force for your team yet.' }}</p>
                }
              } @else { <app-part-loader [part]="s.leave" label="leave" [rows]="5" /> }
            </section>
          }
          @if (visible('tasks')) {
            <section class="p-card" [class.refreshing]="s.tasks.loading() && s.tasks.has()">
              <div class="c-head"><h2>Tasks</h2></div>
              @if (tasks(); as t) {
                @if (t.completed + t.pending) {
                  <app-split-bar [parts]="taskParts()" />
                  @if (t.pendingTasks.length) {
                    <ul class="tasks">
                      @for (p of t.pendingTasks; track p.id) { <li><span class="code">{{ p.code }}</span><span class="t-title">{{ p.title }}</span></li> }
                    </ul>
                    @if (mode() === 'me' && t.pending > t.pendingTasks.length) { <small class="muted">and {{ t.pending - t.pendingTasks.length }} more</small> }
                  }
                  @if (mode() === 'team') { <small class="muted block">Counted per person: a task shared by two counts twice.</small> }
                } @else {
                  <p class="none">{{ mode() === 'me' ? 'No tasks assigned to you yet.' : 'No tasks assigned to your team yet.' }}</p>
                }
              } @else { <app-part-loader [part]="s.tasks" label="tasks" [rows]="4" /> }
            </section>
          }
        </div>

        @if (visible('pay')) {
          <section class="p-card" [class.refreshing]="s.pay.loading() && s.pay.has()">
            <div class="c-head"><h2>Salary</h2>@if (pay(); as p) { <span class="sum">{{ p.fyLabel }}</span> }</div>
            @if (pay(); as p) {
              @if (p.salarySet) {
                <div class="pay">
                  <div class="pay-nums">
                    <div class="stats two">
                      <div><b>{{ money(p.received) }}</b><small>Received ({{ mode() === 'me' ? p.monthsPaid + ' of ' + p.monthsInYear + ' months' : p.monthsPaid + (p.monthsPaid === 1 ? ' payslip' : ' payslips') }})</small></div>
                      <div><b>{{ money(p.remaining) }}</b><small>Still to come</small></div>
                    </div>
                    <app-split-bar [parts]="payParts()" [legend]="false" />
                    <small class="muted">Take-home pay. Received counts payslips published to {{ mode() === 'me' ? 'you' : 'them' }}.</small>
                  </div>
                  <app-columns class="pay-chart" label="Take-home pay received each month" [data]="payColumns()" />
                </div>
              } @else {
                <p class="none">{{ mode() === 'me' ? 'Your salary for this year is not set up yet.' : 'No salaries are set up for this year yet.' }}</p>
              }
            } @else { <app-part-loader [part]="s.pay" label="salary" [rows]="3" /> }
          </section>
        }

        @if (showMail()) {
          <section class="p-card" [class.refreshing]="s.mail.loading() && s.mail.has()">
            <div class="c-head"><h2>Emails today</h2></div>
            @if (mail(); as list) {
              <div class="mails">
                @for (m of list; track m.kind) {
                  <div class="mail">
                    <div class="per-top"><span>{{ m.kind }} <small class="muted">· {{ m.scope }}</small></span>
                      <span><b>{{ m.sentToday }}</b> sent{{ m.left !== null ? ' · ' : '' }}@if (m.left !== null) {<b>{{ m.left }}</b> left}</span></div>
                    @if (m.limit !== null) {
                      <app-split-bar [parts]="mailParts(m.sentToday, m.left ?? 0)" [legend]="false" />
                      <small class="muted">Daily limit {{ m.limit }}, shared by everyone sending for {{ m.scope === 'All brands' ? 'these brands' : 'this brand' }}.</small>
                    } @else {
                      <small class="muted">No daily limit set.</small>
                    }
                  </div>
                }
              </div>
            } @else { <app-part-loader [part]="s.mail" label="emails" [rows]="2" /> }
          </section>
        }
      </div>

      <aside class="side" aria-label="My meetings">
        <app-meeting-calendar [team]="mode() === 'team'" [brandId]="brandId()" (changed)="meetingChanged()" />
      </aside>
    </div>

    @if (mode() === 'team' && tm.summary.value()?.people !== 0) {
      <section class="p-card people" [class.refreshing]="tm.people.loading() && tm.people.has()">
        <div class="c-head"><h2>Team members</h2>@if (tm.summary.value(); as t) { <span class="sum">{{ t.people }} {{ t.people === 1 ? 'person' : 'people' }}</span> }</div>
        @if (tm.people.value(); as t) {
          @if (t.members.length > 8) {
            <input pInputText type="search" class="find" placeholder="Find by name, designation or brand" aria-label="Find a team member"
                   [ngModel]="query()" (ngModelChange)="query.set($event)" />
          }
          <p-table [value]="members()" dataKey="id" styleClass="p-stack" [tableStyle]="{ 'min-width': '640px' }" [paginator]="members().length > 25" [rows]="25">
            <ng-template #header>
              <tr>
                <th>Person</th>
                @if (teamCan.attendance()) { <th>Today</th> }
                @if (teamCan.hours()) { <th class="n">Hours today</th><th class="n">Tasks done / pending</th> }
                @if (teamCan.leave()) { <th class="n">Leave taken / left</th> }
                <th class="n">Profile</th>
                @if (teamCan.pay()) { <th class="n">Salary received</th> }
              </tr>
            </ng-template>
            <ng-template #body let-m>
              <tr>
                <td data-label="Person" class="stack-full">
                  <span class="who">
                    <app-avatar [name]="m.name" [employeeId]="m.id" [photoVersion]="m.photoUpdatedAt" [photoPath]="m.photoPath" [size]="32" />
                    <span class="who-text"><b>{{ m.name }}</b><small>{{ whatOf(m) }}</small></span>
                  </span>
                </td>
                @if (teamCan.attendance()) {
                  <td data-label="Today"><span class="status" [class.in]="m.status === 'CHECKED_IN'"><i [class]="statusOf(m).icon" aria-hidden="true"></i> {{ statusOf(m).label }}</span></td>
                }
                @if (teamCan.hours()) {
                  <td data-label="Hours today" class="n">{{ days(m.hoursToday) }}</td>
                  <td data-label="Tasks done / pending" class="n">{{ m.tasksCompleted }} / {{ m.tasksPending }}</td>
                }
                @if (teamCan.leave()) { <td data-label="Leave taken / left" class="n">{{ days(m.leaveTaken) }} / {{ days(m.leaveRemaining) }}</td> }
                <td data-label="Profile" class="n">{{ m.profilePercent }}%</td>
                @if (teamCan.pay()) { <td data-label="Salary received" class="n">
                  @if (tm.pay.value(); as pay) { {{ money(pay.receivedByMember[m.id] ?? 0) }} } @else if (tm.pay.failed()) { – } @else { <p-skeleton width="64px" height="13px" styleClass="cell-wait" /> }
                </td> }
              </tr>
            </ng-template>
            <ng-template #emptymessage>
              <tr><td colspan="7" class="p-empty">Nobody matches.</td></tr>
            </ng-template>
          </p-table>
        } @else { <app-part-loader [part]="tm.people" label="team members" [rows]="4" /> }
      </section>
    }
  `,
  styles: `
    .switch { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .brand-pick { min-width: 200px; }
    /* figures being read again: they stay on screen, slightly faded, with a small ring in the corner */
    .refreshing { position: relative; }
    .refreshing > * { opacity: .6; transition: opacity .15s ease; }
    .refreshing::after { content: ''; position: absolute; top: 10px; right: 10px; width: 13px; height: 13px; border: 2px solid var(--accent-soft); border-top-color: var(--brass-dark);
      border-radius: 50%; animation: part-spin .8s linear infinite; }
    @keyframes part-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .refreshing::after { animation-duration: 2.4s; } }
    :host ::ng-deep .cell-wait { display: inline-block; vertical-align: middle; }
    .sub { min-height: 1.5em; }
    .block { display: block; margin-top: 8px; }
    .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    th { white-space: normal !important; letter-spacing: .04em !important; vertical-align: bottom; }
    .people { margin: 0 0 20px; }
    th.n, td.n { padding-left: 8px !important; padding-right: 8px !important; }
    .find { width: min(100%, 340px); margin-bottom: 10px; }
    .linkish { padding: 0; border: 0; background: none; cursor: pointer; font: 600 .9rem var(--body); color: var(--brass-dark); text-align: left; text-decoration: underline; }
    .linkish:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
    .who { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
    .who-text { display: grid; min-width: 0; }
    .who-text b { font-weight: 600; font-size: .88rem; }
    .status { display: inline-flex; align-items: center; gap: 6px; font-size: .82rem; color: var(--muted); white-space: nowrap; }
    .status.in { color: #1f7a42; font-weight: 600; }
    .dash { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; margin-bottom: 20px; }
    .main { display: grid; gap: 16px; min-width: 0; }
    .main .p-card { margin: 0; min-width: 0; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: 16px; }
    .tile { --gauge: 72px; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 16px; text-decoration: none; color: inherit; text-align: left; font: inherit; width: 100%; }
    .tile.link { cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; }
    .tile.link:hover { border-color: var(--accent-line); box-shadow: 0 6px 20px rgba(23, 59, 99, .1); }
    .tile.link:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
    .t-text { display: grid; gap: 3px; min-width: 0; }
    .tile h2 { font-size: .92rem; margin: 0; font-weight: 600; }
    small { font-size: .76rem; color: var(--muted); line-height: 1.35; }
    .big { display: flex; align-items: center; min-height: 72px; font-size: 2.6rem; font-weight: 700; line-height: 1; color: var(--ink); }
    .row { display: grid; gap: 16px; }
    .wide-first { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
    .wide-first > :only-child { grid-column: 1 / -1; }
    .c-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .c-head h2 { font-size: 1.05rem; margin: 0; }
    .sum { font-size: .8rem; color: var(--muted); }
    .sum b { color: var(--ink); }
    .period + .period { margin-top: 18px; }
    .per-top { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 7px; font-size: .85rem; flex-wrap: wrap; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .stats.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .stats > div { display: grid; gap: 2px; align-content: start; }
    .stats b { font-size: 1.45rem; line-height: 1.15; font-weight: 700; overflow-wrap: anywhere; }
    .types { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .types li { display: grid; grid-template-columns: minmax(0, 130px) minmax(0, 1fr) auto; gap: 10px; align-items: center; font-size: .83rem; }
    .t-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .t-nums { color: var(--muted); font-size: .78rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .t-nums b { color: var(--ink); }
    .no-limit { font-size: .76rem; color: var(--muted); }
    .key { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .76rem; color: var(--muted); }
    .key li { display: inline-flex; align-items: center; gap: 6px; }
    .key i { width: 10px; height: 10px; border-radius: 3px; }
    .tasks { list-style: none; margin: 12px 0 4px; padding: 0; display: grid; gap: 6px; }
    .tasks li { display: flex; align-items: center; gap: 8px; font-size: .83rem; min-width: 0; }
    .code { flex: none; font-size: .7rem; font-weight: 700; color: var(--brass-dark); background: var(--accent-soft); border-radius: 6px; padding: 2px 6px; }
    .t-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .pay { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 24px; align-items: end; }
    .pay-nums { display: grid; gap: 8px; }
    .pay-nums .stats { margin-bottom: 6px; }
    .pay-chart { --plot: 96px; min-width: 0; }
    .week-chart { --plot: 170px; display: block; }
    .mails { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px 24px; }
    .mail { display: grid; gap: 2px; }
    .mail small { margin-top: 5px; }
    .none { margin: 6px 0; color: var(--muted); font-size: .88rem; }
    @media (max-width: 1240px) {
      .dash { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 760px) {
      .wide-first, .pay { grid-template-columns: minmax(0, 1fr); }
      .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .tile { --gauge: 60px; padding: 12px; gap: 8px; }
      .big { font-size: 2rem; min-height: 60px; }
      .types li { grid-template-columns: minmax(0, 1fr) auto; }
      .types app-split-bar, .types .no-limit { grid-column: 1 / -1; grid-row: 2; }
    }
  `,
})
export class Dashboard implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly service = inject(DashboardService);

  protected readonly calendar = viewChild(MeetingCalendar);
  protected readonly colors = CHART;
  protected readonly money = (v: number) => rupeesRound(v);

  protected readonly modes = [{ label: 'Me', value: 'me' as Mode }, { label: 'Team', value: 'team' as Mode }];
  protected readonly mode = signal<Mode>('me');
  protected readonly brandId = signal<number | null>(null);
  protected readonly query = signal('');
  protected readonly firstName = computed(() => this.auth.user()?.name?.split(' ')[0] ?? '');

  /** Each section's data, mine and my team's. */
  protected readonly me = {
    summary: new Part<DashSummary>(), hours: new Part<DashHours>(), attendance: new Part<DashAttendance>(), leave: new Part<DashLeave>(),
    tasks: new Part<DashTasks>(), pay: new Part<DashPay>(), mail: new Part<DashMail[]>(), profile: new Part<DashProfile>(), meetings: new Part<Meeting[]>(),
  };
  protected readonly tm = {
    summary: new Part<TeamSummary>(), hours: new Part<DashHours>(), attendance: new Part<TeamAttendance>(), leave: new Part<DashLeave>(),
    tasks: new Part<DashTasks>(), pay: new Part<TeamPay>(), mail: new Part<DashMail[]>(), profile: new Part<TeamProfile>(), meetings: new Part<Meeting[]>(),
    people: new Part<TeamPeople>(),
  };
  /** The loaders of the view on screen. */
  protected readonly parts = computed<Record<Ticked | 'mail' | 'profile' | 'meetings', PartState>>(() => (this.mode() === 'me' ? this.me : this.tm));

  /** The team's sections this person has the menu for. */
  protected readonly teamCan = {
    hours: computed(() => this.auth.can(TICKS.team.hours)),
    attendance: computed(() => this.auth.can(TICKS.team.attendance)),
    leave: computed(() => this.auth.can(TICKS.team.leave)),
    pay: computed(() => this.auth.can(TICKS.team.pay)),
  };

  protected readonly hours = computed(() => (this.mode() === 'me' ? this.me.hours.value() : this.tm.hours.value()));
  protected readonly leave = computed(() => (this.mode() === 'me' ? this.me.leave.value() : this.tm.leave.value()));
  protected readonly tasks = computed(() => (this.mode() === 'me' ? this.me.tasks.value() : this.tm.tasks.value()));
  protected readonly pay = computed(() => (this.mode() === 'me' ? this.me.pay.value() : (this.tm.pay.value()?.pay ?? null)));
  protected readonly mail = computed(() => (this.mode() === 'me' ? this.me.mail.value() : this.tm.mail.value()));
  protected readonly meetingsToday = computed(() => (this.mode() === 'me' ? this.me.meetings.value() : this.tm.meetings.value()));

  protected readonly attendance = computed<{ percent: number | null; note: string; week: Period; month: Period; daysWord: string } | null>(() => {
    if (this.mode() === 'team') {
      const a = this.tm.attendance.value();
      return a && {
        percent: a.percent, week: a.week, month: a.month, daysWord: 'person-days',
        note: a.expected ? `${a.checkedIn} of ${a.expected} checked in${a.notExpected ? ` · ${a.notExpected} off or on leave` : ''}` : 'Nobody expected today',
      };
    }
    const a = this.me.attendance.value();
    if (!a) return null;
    const note = a.checkedIn ? `Checked in at ${timeOf(a.firstIn!)} · ${durationText(a.minutesToday)} so far` : !a.working ? 'No hours expected today' : 'Not checked in yet';
    return { percent: a.percent, week: a.week, month: a.month, daysWord: 'days', note };
  });

  protected readonly profile = computed<{ percent: number; note: string } | null>(() => {
    if (this.mode() === 'team') {
      const t = this.tm.profile.value();
      return t && { percent: t.percent, note: `${t.complete} of ${t.people} complete · average shown` };
    }
    const p = this.me.profile.value();
    return p && { percent: p.percent, note: p.percent === 100 ? 'Everything is on file' : `${p.total - p.done} of ${p.total} items missing` };
  });

  protected readonly showMail = computed(() => {
    const part = this.mode() === 'me' ? this.me.mail : this.tm.mail;
    return this.auth.can('STAFF_MAIL') || this.auth.can('PROD_MAIL') ? !part.loaded() || part.failed() || !!part.value()?.length : false;
  });

  protected readonly showByBrand = computed(() => {
    const canSplit = this.tm.summary.value()?.canSplit;
    const people = this.tm.people;
    return this.mode() === 'team' && !!canSplit && this.brandId() === null && (!people.value() || people.value()!.byBrand.length > 0);
  });

  protected readonly brandOptions = computed(() => {
    const t = this.tm.summary.value();
    return t?.canSplit ? t.brands.map((b) => ({ value: b.id, label: b.code ? `${b.name} (${b.code})` : b.name })) : [];
  });

  protected readonly members = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.tm.people.value()?.members ?? [];
    return q ? all.filter((m) => [m.name, m.designationName, m.brandCode].some((x) => x?.toLowerCase().includes(q))) : all;
  });

  protected readonly subtitle = computed(() => {
    if (this.mode() === 'me') return this.dayNote();
    const t = this.tm.summary.value();
    if (!t) return 'Team';
    const brand = t.brandId === null ? null : t.brands.find((b) => b.id === t.brandId)?.name;
    return `Team of ${t.people}${brand ? ` in ${brand}` : ''}`;
  });

  private readonly dayNote = computed(() => {
    const day = this.me.summary.value()?.day;
    if (!day) return '';
    switch (day.kind) {
      case 'WEEKLY_OFF': return 'Weekly off';
      case 'HOLIDAY': return `Holiday: ${day.label}`;
      case 'LEAVE': return `On leave: ${day.label}`;
      default: return day.halfDayLeave ? `Half day leave: ${day.label}` : '';
    }
  });

  protected readonly nextMeeting = computed(() => {
    const list = this.meetingsToday() ?? [];
    if (!list.length) return 'Nothing today';
    const now = new Date();
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const next = list.find((m) => m.startTime.slice(0, 5) >= clock);
    return next ? `Next at ${timeLabel(next.startTime)}: ${next.title}` : 'All done for today';
  });

  /** A type with nothing in it for me (no days, nothing taken) is left out. */
  protected readonly leaveTypes = computed(() =>
    (this.leave()?.types ?? []).filter((t) => t.used > 0 || t.pending > 0 || (t.entitled ?? 0) > 0),
  );

  protected readonly weekColumns = computed<Column[]>(() => {
    const today = this.me.summary.value()?.today ?? this.tm.summary.value()?.today;
    return (this.hours()?.days ?? []).map((x) => {
      const date = new Date(`${x.date}T00:00:00`);
      const name = date.toLocaleDateString('en-IN', { weekday: 'short' });
      const isToday = x.date === today;
      return {
        key: x.date, label: name, value: x.hours, accent: isToday, print: isToday && x.hours > 0 ? hoursShort(x.hours) : undefined,
        tip: `${name} ${date.getDate()}: ${x.hours ? hoursLong(x.hours) : x.off ? 'day off' : 'nothing logged'}`,
      };
    });
  });

  protected readonly payColumns = computed<Column[]>(() =>
    (this.pay()?.months ?? []).map((m) => ({
      key: m.label, label: m.label.slice(0, 1), value: m.net ?? 0, accent: m.net !== null,
      tip: `${m.label}: ${m.net !== null ? rupeesRound(m.net) : 'no payslip'}`,
    })),
  );

  protected readonly payParts = computed<BarPart[]>(() => {
    const p = this.pay();
    return [
      { label: 'Received', value: p?.received ?? 0, text: rupeesRound(p?.received ?? 0), color: CHART.done },
      { label: 'Still to come', value: p?.remaining ?? 0, text: rupeesRound(p?.remaining ?? 0), color: CHART.rest },
    ];
  });

  protected readonly taskParts = computed<BarPart[]>(() => {
    const t = this.tasks();
    return [
      { label: 'Completed', value: t?.completed ?? 0, text: String(t?.completed ?? 0), color: CHART.done },
      { label: 'Pending', value: t?.pending ?? 0, text: String(t?.pending ?? 0), color: CHART.waiting },
    ];
  });

  ngOnInit(): void {
    const { me, service } = this;
    me.summary.load(() => service.summary());
    if (this.auth.can(TICKS.me.hours)) me.hours.load(() => service.hours());
    if (this.auth.can(TICKS.me.attendance)) me.attendance.load(() => service.attendance());
    if (this.auth.can(TICKS.me.leave)) me.leave.load(() => service.leave());
    if (this.auth.can(TICKS.me.tasks)) me.tasks.load(() => service.tasks());
    if (this.auth.can(TICKS.me.pay)) me.pay.load(() => service.pay());
    if (this.auth.can('STAFF_MAIL') || this.auth.can('PROD_MAIL')) me.mail.load(() => service.mail());
    me.profile.load(() => service.profile());
    me.meetings.load(() => service.meetingsToday());
  }

  /** A section shows when the person has its menu; if the server says otherwise after all, it goes. */
  protected visible(part: Ticked): boolean {
    const mode = this.mode();
    const state = this.parts()[part];
    if (!this.auth.can(TICKS[mode][part])) return false;
    if (part === 'pay' && mode === 'team') return !state.loaded() || state.failed() || !!this.tm.pay.value()?.pay;
    return !state.loaded() || state.failed() || state.has();
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    if (mode === 'team') this.loadTeam();
  }

  protected setBrand(id: number | null): void {
    this.brandId.set(id);
    this.query.set('');
    // the figures of the last brand are not this brand's: the salary cells wait again
    this.tm.pay.value.set(null);
    this.loadTeam();
  }

  /** Every section of the Team view, each on its own. */
  private loadTeam(): void {
    const brand = this.brandId();
    const { tm, service } = this;
    const ask = <T>(part: Part<T>, name: string) => part.load(() => service.team<T>(name, brand));
    ask(tm.summary, 'summary');
    if (this.teamCan.hours()) {
      ask(tm.hours, 'hours');
      ask(tm.tasks, 'tasks');
    }
    if (this.teamCan.attendance()) ask(tm.attendance, 'attendance');
    if (this.teamCan.leave()) ask(tm.leave, 'leave');
    if (this.teamCan.pay()) ask(tm.pay, 'pay');
    if (this.auth.can('STAFF_MAIL') || this.auth.can('PROD_MAIL')) ask(tm.mail, 'mail');
    ask(tm.profile, 'profile');
    ask(tm.meetings, 'meetings-today');
    ask(tm.people, 'people');
  }

  /** A meeting was added, changed or deleted: only the meetings are read again. The calendar reads its own. */
  protected meetingChanged(): void {
    this.me.meetings.retry();
    if (this.mode() === 'team') this.tm.meetings.retry();
  }

  protected whatOf(m: TeamMember): string {
    return [m.designationName, m.brandCode].filter(Boolean).join(' · ');
  }

  protected statusOf(m: TeamMember): { label: string; icon: string } {
    return STATUS[m.status ?? 'OFF'];
  }

  protected pct(value: number, of: number | null): number {
    return of ? (value / of) * 100 : value > 0 ? 100 : 0;
  }

  protected hoursText(h: number): string {
    return hoursLong(h);
  }

  protected hoursShort(h: number): string {
    return hoursShort(h);
  }

  protected days(n: number): string {
    return String(+Number(n).toFixed(1));
  }

  protected periodParts(p: Period): BarPart[] {
    const rest = Math.max(0, p.days - p.attended - p.leave);
    const parts: BarPart[] = [{ label: 'Attended', value: p.attended, text: this.days(p.attended), color: CHART.done }];
    if (p.leave > 0) parts.push({ label: 'On leave', value: p.leave, text: this.days(p.leave), color: CHART.waiting });
    parts.push({ label: 'Other days', value: rest, text: this.days(rest), color: CHART.rest });
    return parts;
  }

  protected leaveParts(t: LeaveRow): BarPart[] {
    return [
      { label: 'Taken', value: t.used, text: this.days(t.used), color: CHART.done },
      { label: 'Waiting', value: t.pending, text: this.days(t.pending), color: CHART.waiting },
      { label: 'Remaining', value: t.available ?? 0, text: this.days(t.available ?? 0), color: CHART.rest },
    ];
  }

  protected mailParts(sent: number, left: number): BarPart[] {
    return [
      { label: 'Sent', value: sent, text: String(sent), color: CHART.done },
      { label: 'Left', value: left, text: String(left), color: CHART.rest },
    ];
  }
}

function hoursShort(h: number): string {
  return `${+Number(h).toFixed(1)}h`;
}

function hoursLong(h: number): string {
  const n = +Number(h).toFixed(2);
  return `${n} ${n === 1 ? 'hour' : 'hours'}`;
}

function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

function timeOf(instant: string): string {
  return new Date(instant).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
