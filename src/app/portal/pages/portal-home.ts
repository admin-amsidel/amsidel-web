/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../auth.service';
import { BrandSite } from '../brand-site/brand-site';
import { BRAND_SITES } from '../brand-site/brand-sites';
import { LeavePlanAlerts } from '../leave/leave-plan-alerts';
import { NewsBoard } from '../news-board';
import { apiProblem, Brand, MenuNode } from '../portal.models';
import { StaffService } from '../staff.service';

interface Shortcut {
  label: string;
  icon: string;
  link: string;
}

/**
 * After signing in, for everyone: on the left the page of the person's brand, like a small website; on the right the news
 * in a small sliding block and the Quick links button, which lists the pages this person may open. People without a brand
 * of their own (owners, group admins) choose which brand's page to see.
 */
@Component({
  selector: 'app-portal-home',
  imports: [FormsModule, RouterLink, DialogModule, InputTextModule, MessageModule, SelectModule, BrandSite, NewsBoard, LeavePlanAlerts],
  template: `
    <div class="p-head">
      <div>
        <h1>Welcome{{ firstName() ? ', ' + firstName() : '' }}</h1>
      </div>
      @if (canChoose() && brandOptions().length > 1) {
        <div class="head-actions">
          <p-select class="brand-pick" [options]="brandOptions()" optionLabel="label" optionValue="value" ariaLabel="Choose whose page to see" appendTo="body"
                    [ngModel]="brand()?.id" (ngModelChange)="chosenId.set($event)" />
        </div>
      }
    </div>
    <app-leave-plan-alerts />

    <div class="home">
      <div class="left">
        @if (brand(); as b) {
          <app-brand-site [brand]="b" />
        } @else if (error()) {
          <p-message severity="error" styleClass="page-message">{{ error() }}</p-message>
        } @else if (loaded()) {
          <section class="p-card none">No brand has been set up yet.</section>
        }
      </div>

      <aside class="right" aria-label="News and quick links">
        <app-news-board />
        <button type="button" class="quick" aria-haspopup="dialog" (click)="openQuick()">
          <span class="quick__icon"><i class="pi pi-link" aria-hidden="true"></i></span>
          <span class="quick__text"><b>Quick links</b><small>{{ allLinks().length }} {{ allLinks().length === 1 ? 'page' : 'pages' }} you can open</small></span>
          <i class="pi pi-chevron-right quick__go" aria-hidden="true"></i>
        </button>
      </aside>
    </div>

    <p-dialog header="Quick links" [visible]="quickOpen()" (visibleChange)="quickOpen.set($event)" [modal]="true" [draggable]="false" [dismissableMask]="true" appendTo="body"
              [style]="{ width: '760px' }" [breakpoints]="{ '800px': 'calc(100vw - 16px)' }">
      @if (allLinks().length > 10) {
        <input pInputText type="search" class="find" placeholder="Find a page" aria-label="Find a page" [ngModel]="query()" (ngModelChange)="query.set($event)" />
      }
      @for (g of groups(); track g.title) {
        <section class="group">
          <h3>{{ g.title }}</h3>
          <nav class="links" [attr.aria-label]="g.title + ' pages'">
            @for (s of g.links; track s.link) {
              <a [routerLink]="s.link" (click)="quickOpen.set(false)"><i [class]="'pi ' + s.icon" aria-hidden="true"></i><span>{{ s.label }}</span></a>
            }
          </nav>
        </section>
      } @empty {
        <p class="none">No page matches.</p>
      }
    </p-dialog>
  `,
  styles: `
    .home { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
    .left { min-width: 0; }
    .right { position: sticky; top: 76px; display: grid; gap: 14px; min-width: 0; }
    .brand-pick { min-width: 260px; }
    .none { color: var(--muted); }
    .quick { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: #fff; box-shadow: var(--shadow);
      color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; }
    .quick:hover { border-color: var(--accent-line); box-shadow: 0 10px 28px rgba(23, 59, 99, .14); }
    .quick:focus-visible { outline: 3px solid var(--brass); outline-offset: 2px; }
    .quick__icon { flex: none; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 11px; background: var(--accent-soft); color: var(--brass-dark); font-size: 1.05rem; }
    .quick__text { flex: 1 1 auto; display: grid; gap: 1px; min-width: 0; }
    .quick__text b { font-size: .98rem; font-weight: 600; }
    .quick__text small { font-size: .78rem; color: var(--muted); }
    .quick__go { color: var(--brass-dark); font-size: .85rem; }
    .find { width: 100%; margin-bottom: 14px; }
    .group + .group { margin-top: 18px; }
    .group h3 { margin: 0 0 8px; font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
    .links { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
    .links a { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 9px; background: #fff;
      color: var(--ink); text-decoration: none; font-size: .88rem; }
    .links a:hover { background: var(--accent-softer); border-color: var(--accent-line); color: var(--brass-dark); }
    .links a:focus-visible { outline: 2px solid var(--brass); outline-offset: 1px; }
    .links i { flex: none; width: 18px; text-align: center; color: var(--brass-dark); font-size: .92rem; }
    /* one column: news and quick links first, the brand's long page after them */
    @media (max-width: 1100px) {
      .home { grid-template-columns: minmax(0, 1fr); gap: 14px; }
      .right { position: static; order: -1; }
      .brand-pick { width: 100%; }
    }
  `,
})
export class PortalHome implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly staff = inject(StaffService);

  protected readonly firstName = computed(() => this.auth.user()?.name?.split(' ')[0] ?? '');

  private readonly brands = signal<Brand[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly chosenId = signal<number | null>(null);
  /** Owners and people without a brand of their own choose whose page to see. */
  protected readonly canChoose = computed(() => {
    const me = this.auth.user();
    return !!me && (me.role === 'OWNER' || me.brandId === null);
  });
  protected readonly brandOptions = computed(() =>
    this.brands().filter((b) => b.active).map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` })),
  );
  /** My brand; for those who choose, their choice, else the first with a page written. */
  protected readonly brand = computed<Brand | null>(() => {
    const all = this.brands();
    const mine = this.auth.user()?.brandId;
    const wanted = this.canChoose() ? (this.chosenId() ?? mine) : mine;
    const active = all.filter((b) => b.active);
    return all.find((b) => b.id === wanted) ?? (this.canChoose() ? (active.find((b) => BRAND_SITES[b.code]) ?? active[0] ?? null) : null);
  });

  protected readonly quickOpen = signal(false);
  protected readonly query = signal('');
  private readonly pages = computed<{ part: Part; s: Shortcut }[]>(() =>
    (this.auth.access()?.menus ?? []).flatMap((m: MenuNode) =>
      (m.children.some((c) => !!c.path) ? m.children : [m])
        .filter((c) => !!c.path)
        .map((c) => ({ part: partOf(c.path!), s: { label: c.name, icon: c.icon ?? 'pi-circle', link: c.path! } })),
    ),
  );
  /** Overview and My profile are everyone's; the rest follows menu access. */
  protected readonly allLinks = computed<{ part: Part; s: Shortcut }[]>(() => [
    { part: 'EMPLOYEE', s: { label: 'Overview', icon: 'pi-th-large', link: '/portal/dashboard' } },
    { part: 'EMPLOYEE', s: { label: 'My profile', icon: 'pi-user', link: '/portal/profile' } },
    ...this.pages(),
  ]);
  protected readonly groups = computed(() => {
    const q = this.query().trim().toLowerCase();
    return PARTS.map(([part, title]) => ({
      title,
      links: this.allLinks().filter((p) => p.part === part && (!q || p.s.label.toLowerCase().includes(q))).map((p) => p.s),
    })).filter((g) => g.links.length);
  });

  ngOnInit(): void {
    this.staff.brands().subscribe({
      next: (b) => {
        this.brands.set(b);
        this.loaded.set(true);
      },
      error: (e) => {
        this.loaded.set(true);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected openQuick(): void {
    this.query.set('');
    this.quickOpen.set(true);
  }
}

type Part = 'EMPLOYEE' | 'PRODUCT' | 'CUSTOMER';

const PARTS: [Part, string][] = [['EMPLOYEE', 'Employee portal'], ['PRODUCT', 'Product portal'], ['CUSTOMER', 'Customer portal']];

function partOf(path: string): Part {
  return path.startsWith('/portal/products') ? 'PRODUCT' : path.startsWith('/portal/customers') ? 'CUSTOMER' : 'EMPLOYEE';
}
