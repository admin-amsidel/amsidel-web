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
 * parts. The Employee portal (profile, attendance, leave, work log, payroll…), for people with product menus the
 * Product portal (products and stock, suppliers, quotations, invoices, reports), and for people with the Customers
 * menu the Customer portal, each with its pages as shortcuts.
 */
@Component({
  selector: 'app-portal-home',
  imports: [RouterLink, NewsBoard],
  template: `
    <div class="p-head">
      <div>
        <h1>Welcome{{ firstName() ? ', ' + firstName() : '' }}</h1>
        <p>{{ partCount() > 1 ? 'Choose where to work. You can switch at any time from the top bar.' : 'The latest news, and your pages.' }}</p>
      </div>
    </div>
    <app-news-board />
    <div class="parts" [class.single]="partCount() === 1" [class.triple]="partCount() === 3">
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
        <span class="part__text">Products, stock and prices; suppliers and purchases; quotations, invoices, payments and reports.</span>
        <span class="part__go">Open product portal <i class="pi pi-arrow-right" aria-hidden="true"></i></span>
      </a>
      }
      @if (hasCustomers()) {
      <a class="part part--customers" [routerLink]="customerStart()">
        <span class="part__icon"><i class="pi pi-address-book" aria-hidden="true"></i></span>
        <span class="part__kicker">Customer portal</span>
        <b>Customers</b>
        <span class="part__text">Customer details: view, add, change and delete customers, with their bills and what they owe.</span>
        <span class="part__go">Open customer portal <i class="pi pi-arrow-right" aria-hidden="true"></i></span>
      </a>
      }
    </div>
    <div class="shortcuts" [class.single]="partCount() === 1" [class.triple]="partCount() === 3">
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
      @if (hasCustomers()) {
      <section class="p-card">
        <h2>Customer portal</h2>
        <nav class="links" aria-label="Customer portal pages">
          @for (s of customerLinks(); track s.link) {
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
    .part--customers::after { background: linear-gradient(90deg, #173b63, #1d5fa3); }
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
    .parts.triple, .shortcuts.triple { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    @media (max-width: 1100px) { .parts.triple, .shortcuts.triple { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) {
      .parts, .parts.triple, .shortcuts, .shortcuts.triple { grid-template-columns: 1fr; gap: 10px; }
      .shortcuts { margin-top: 14px; }
      /* phones: each part one slim row (icon, name, arrow); the description is for wider screens */
      .part { grid-template-columns: auto minmax(0, 1fr) auto; grid-template-rows: auto auto; align-items: center; column-gap: 12px; row-gap: 0;
        padding: 12px 14px; border-radius: 12px; }
      .part__icon { grid-row: 1 / 3; width: 40px; height: 40px; margin: 0; font-size: 1.1rem; }
      .part__kicker { grid-column: 2; font-size: .64rem; }
      .part b { grid-column: 2; font-size: 1.05rem; }
      .part__text { display: none; }
      .part__go { grid-column: 3; grid-row: 1 / 3; margin: 0; font-size: 0; gap: 0; }
      .part__go i { font-size: 1rem; }
      .links a { padding: 6px 10px; font-size: .82rem; }
    }
  `,
})
export class PortalHome {
  private readonly auth = inject(AuthService);

  protected readonly firstName = computed(() => this.auth.user()?.name?.split(' ')[0] ?? '');
  private readonly pages = computed<{ part: Part; s: Shortcut }[]>(() =>
    (this.auth.access()?.menus ?? []).flatMap((m: MenuNode) =>
      (m.children.some((c) => !!c.path) ? m.children : [m])
        .filter((c) => !!c.path)
        .map((c) => ({ part: partOf(c.path!), s: { label: c.name, icon: c.icon ?? 'pi-circle', link: c.path! } })),
    ),
  );
  protected readonly employeeLinks = computed(() => [
    { label: 'My profile', icon: 'pi-user', link: '/portal/profile' },
    ...this.links('EMPLOYEE'),
  ]);
  protected readonly productLinks = computed(() => this.links('PRODUCT'));
  protected readonly customerLinks = computed(() => this.links('CUSTOMER'));
  protected readonly productStart = computed(() => this.productLinks()[0]?.link ?? '/portal/products');
  protected readonly customerStart = computed(() => this.customerLinks()[0]?.link ?? '/portal/customers');
  protected readonly hasProducts = computed(() => this.productLinks().length > 0);
  protected readonly hasCustomers = computed(() => this.customerLinks().length > 0);
  /** How many portals I have (the employee portal always). */
  protected readonly partCount = computed(() => 1 + (this.hasProducts() ? 1 : 0) + (this.hasCustomers() ? 1 : 0));

  private links(part: Part): Shortcut[] {
    return this.pages().filter((p) => p.part === part).map((p) => p.s);
  }
}

type Part = 'EMPLOYEE' | 'PRODUCT' | 'CUSTOMER';

function partOf(path: string): Part {
  return path.startsWith('/portal/products') ? 'PRODUCT' : path.startsWith('/portal/customers') ? 'CUSTOMER' : 'EMPLOYEE';
}
