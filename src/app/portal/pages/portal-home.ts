/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { NewsBoard } from '../news-board';
import { MenuNode } from '../portal.models';

interface Shortcut {
  label: string;
  icon: string;
  link: string;
}

/**
 * After signing in, for everyone: the news and announcements (with today's birthdays), then the Company Portal's
 * parts. The Employee portal (profile, attendance, leave, work log, payroll…) and, for people with product menus,
 * the Product portal (products and stock, suppliers, customers, quotations, invoices, reports), each with its pages
 * as shortcuts.
 */
@Component({
  selector: 'app-portal-home',
  imports: [RouterLink, NewsBoard],
  template: `
    <div class="p-head">
      <div>
        <h1>Welcome{{ firstName() ? ', ' + firstName() : '' }}</h1>
        <p>{{ hasProducts() ? 'Choose where to work. You can switch at any time from the top bar.' : 'The latest news, and your pages.' }}</p>
      </div>
    </div>
    <app-news-board />
    <div class="parts" [class.single]="!hasProducts()">
      <a class="part" routerLink="/portal/profile">
        <span class="part__icon"><i class="pi pi-users" aria-hidden="true"></i></span>
        <span class="part__kicker">Employee portal</span>
        <b>People &amp; HR</b>
        <span class="part__text">Your profile, attendance, leave, work log, performance and pay; your team and payroll.</span>
        <span class="part__go">Open employee portal <i class="pi pi-arrow-right" aria-hidden="true"></i></span>
      </a>
      @if (hasProducts()) {
      <a class="part part--products" [routerLink]="productStart()">
        <span class="part__icon"><i class="pi pi-box" aria-hidden="true"></i></span>
        <span class="part__kicker">Product portal</span>
        <b>Products &amp; sales</b>
        <span class="part__text">Products, stock and prices; suppliers and purchases; customers, quotations, invoices, payments and reports.</span>
        <span class="part__go">Open product portal <i class="pi pi-arrow-right" aria-hidden="true"></i></span>
      </a>
      }
    </div>
    <div class="shortcuts" [class.single]="!hasProducts()">
      <section class="p-card">
        <h2>Employee portal</h2>
        <nav class="links" aria-label="Employee portal pages">
          @for (s of employeeLinks(); track s.link) {
            <a [routerLink]="s.link"><i [class]="'pi ' + s.icon" aria-hidden="true"></i>{{ s.label }}</a>
          }
        </nav>
      </section>
      @if (hasProducts()) {
      <section class="p-card">
        <h2>Product portal</h2>
        <nav class="links" aria-label="Product portal pages">
          @for (s of productLinks(); track s.link) {
            <a [routerLink]="s.link"><i [class]="'pi ' + s.icon" aria-hidden="true"></i>{{ s.label }}</a>
          }
        </nav>
      </section>
      }
    </div>
  `,
  styles: `
    .parts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
    .part {
      display: grid; gap: 8px; align-content: start; padding: 26px; border-radius: 14px; text-decoration: none; color: var(--ink);
      background: #fff; border: 1px solid var(--line); box-shadow: 0 6px 24px rgba(23, 59, 99, .07);
      transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; position: relative; overflow: hidden;
    }
    .part::after { content: ''; position: absolute; inset: 0 0 auto; height: 4px; background: linear-gradient(90deg, #2f80d6, #7db8f0); }
    .part--products::after { background: linear-gradient(90deg, #1d5fa3, #2f80d6); }
    .part:hover { transform: translateY(-2px); border-color: #b9d3ef; box-shadow: 0 10px 30px rgba(23, 59, 99, .12); }
    .part:focus-visible { outline: 3px solid var(--brass); outline-offset: 2px; }
    .part__icon { width: 48px; height: 48px; border-radius: 12px; display: grid; place-items: center; background: var(--accent-soft);
      color: var(--brass-dark); font-size: 1.3rem; margin-bottom: 6px; }
    .part__kicker { font-size: .72rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
    .part b { font-size: 1.35rem; font-weight: 600; }
    .part__text { color: var(--muted); line-height: 1.55; }
    .part__go { margin-top: 10px; color: var(--brass-dark); font-weight: 600; display: inline-flex; align-items: center; gap: 8px; }
    .shortcuts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 20px; }
    .shortcuts .p-card { margin-top: 0; }
    .links { display: flex; flex-wrap: wrap; gap: 8px; }
    .links a { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line);
      color: var(--ink); text-decoration: none; font-size: .88rem; background: #fff; }
    .links a:hover { background: var(--accent-softer); border-color: #b9d3ef; color: var(--brass-dark); }
    .links i { color: var(--brass-dark); font-size: .9rem; }
    .parts.single, .shortcuts.single { grid-template-columns: 1fr; }
    @media (max-width: 760px) { .parts, .shortcuts { grid-template-columns: 1fr; } .part { padding: 20px; } }
  `,
})
export class PortalHome {
  private readonly auth = inject(AuthService);

  protected readonly firstName = computed(() => this.auth.user()?.name?.split(' ')[0] ?? '');
  private readonly pages = computed<{ product: boolean; s: Shortcut }[]>(() =>
    (this.auth.access()?.menus ?? []).flatMap((m: MenuNode) =>
      (m.children.length ? m.children : [m])
        .filter((c) => !!c.path)
        .map((c) => ({ product: c.path!.startsWith('/portal/products'), s: { label: c.name, icon: c.icon ?? 'pi-circle', link: c.path! } })),
    ),
  );
  protected readonly productStart = computed(() => this.pages().find((p) => p.product)?.s.link ?? '/portal/products');
  protected readonly employeeLinks = computed(() => [
    { label: 'My profile', icon: 'pi-user', link: '/portal/profile' },
    ...this.pages().filter((p) => !p.product).map((p) => p.s),
  ]);
  protected readonly productLinks = computed(() => this.pages().filter((p) => p.product).map((p) => p.s));
  protected readonly hasProducts = computed(() => this.productLinks().length > 0);
}
