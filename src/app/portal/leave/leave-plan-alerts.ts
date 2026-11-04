/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../auth.service';
import { silent } from '../busy';
import { LeavePlanAlert, shortDate } from './leave.models';
import { LeaveService } from './leave.service';

/**
 * For those who manage leave plans: a brand's plan ending within 10 days with no next plan, or a brand with no plan.
 * Shown on the home page and in Leave settings until the next plan is added.
 */
@Component({
  selector: 'app-leave-plan-alerts',
  imports: [MessageModule, RouterLink],
  template: `
    @for (a of alerts(); track a.brandId) {
      <p-message severity="warn" styleClass="page-message">
        <span><b>{{ a.brandCode }} · {{ a.brandName }}:</b>
          @if (a.validUntil) {
            the leave plan ends on {{ date(a.validUntil) }}{{ a.daysLeft === 0 ? ' (today)' : ', in ' + a.daysLeft + (a.daysLeft === 1 ? ' day' : ' days') }}. Add the next plan.
          } @else {
            no leave plan is in force, so its people cannot apply for leave. Add one.
          }
          @if (link()) { <a routerLink="/portal/leave/settings">Leave settings</a> }
        </span>
      </p-message>
    }
  `,
})
export class LeavePlanAlerts implements OnInit {
  private readonly leave = inject(LeaveService);
  private readonly auth = inject(AuthService);

  /** Show the way to Leave settings (not when already there). */
  readonly link = input(true);
  protected readonly date = (iso: string) => shortDate(iso, true);
  protected readonly alerts = signal<LeavePlanAlert[]>([]);

  ngOnInit(): void {
    if (!this.auth.can('LEAVE_SETTINGS')) return;
    this.leave.planAlerts(silent()).subscribe({ next: (list) => this.alerts.set(list), error: () => undefined });
  }
}
