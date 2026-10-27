import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked, ViewEncapsulation } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DrawerModule } from 'primeng/drawer';
import { Menu, MenuModule } from 'primeng/menu';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../auth.service';
import { BusyService } from '../busy';
import { Avatar } from '../avatar';
import { TeamChat } from '../chat/team-chat';
import { PortalStyles } from '../portal-styles';
import { ROLE_LABELS } from '../portal.models';

interface NavLink {
  kind: 'link';
  label: string;
  icon: string;
  link: string;
  /** Active only on this exact address (not on the pages below it). */
  exact?: boolean;
}

interface NavGroup {
  kind: 'group';
  key: string;
  label: string;
  icon: string;
  children: NavLink[];
}

type NavEntry = NavLink | NavGroup;

const SIDEBAR_KEY = 'amsidel.portal.sidebar';
const PRODUCTS = '/portal/products';

function isProduct(path: string): boolean {
  return path === PRODUCTS || path.startsWith(PRODUCTS + '/');
}

/**
 * Frame around every portal page: a top bar (brand, account menu) and a left sidebar with menus and
 * sub-menus (Leave, Work log, Employees) that shows labels or shrinks to icons; on phones and tablets the same
 * menu slides out from the ☰ button. Also hosts the PrimeNG toast and confirm dialog every page uses.
 * Styles are not encapsulated so the shared portal styles (portal.scss) reach every page; they load only with
 * the portal, never on the public site.
 */
@Component({
  selector: 'app-portal-shell',
  imports: [
    RouterOutlet, RouterLink, NgTemplateOutlet, Avatar, ButtonModule, DrawerModule, MenuModule, ToastModule, TooltipModule,
    ConfirmDialogModule, PortalStyles, TeamChat,
  ],
  encapsulation: ViewEncapsulation.None,
  template: `
    <app-portal-styles />
    <header class="p-top">
      @if (auth.user()) {
        <p-button styleClass="p-burger" icon="pi pi-bars" [text]="true" [rounded]="true" ariaLabel="Open menu"
                  (onClick)="drawerOpen.set(true)" />
        <p-button styleClass="p-collapse" [icon]="collapsed() ? 'pi pi-angle-double-right' : 'pi pi-angle-double-left'"
                  [text]="true" [rounded]="true" [ariaLabel]="collapsed() ? 'Expand menu' : 'Shrink menu'"
                  [pTooltip]="collapsed() ? 'Expand menu' : 'Shrink menu'" tooltipPosition="bottom"
                  (onClick)="toggleCollapsed()" />
      }
      <a class="p-mark" routerLink="/portal/home">
        <img src="brand/amsidel-mark.png" alt="" width="60" height="28" />
        <span>Company Portal</span>
      </a>
      @if (productStart(); as start) {
        <nav class="p-switch" aria-label="Portal section">
          <a routerLink="/portal/profile" [class.on]="section() === 'EMPLOYEE'" [attr.aria-current]="section() === 'EMPLOYEE' ? 'page' : null">
            <i class="pi pi-users" aria-hidden="true"></i><span>Employee portal</span></a>
          <a [routerLink]="start" [class.on]="section() === 'PRODUCT'" [attr.aria-current]="section() === 'PRODUCT' ? 'page' : null">
            <i class="pi pi-box" aria-hidden="true"></i><span>Product portal</span></a>
        </nav>
      }
      @if (auth.user(); as me) {
        <!-- photo and name open the account menu: My profile, Change PIN, Sign out -->
        <button type="button" class="p-me" aria-haspopup="menu" [attr.aria-label]="'Account menu for ' + me.name"
                (click)="accountMenu.toggle($event)">
          <app-avatar [name]="me.name" [employeeId]="me.id" [photoVersion]="me.photoUpdatedAt" [photoPath]="me.photoPath" [size]="34" />
          <span class="p-me__text">
            <b>{{ me.name }}</b>
            <small>{{ me.designationName ?? me.userTypeName ?? roleLabels[me.role] }}{{ me.brandCode ? ' · ' + me.brandCode : '' }}</small>
          </span>
          <i class="pi pi-angle-down p-me__caret" aria-hidden="true"></i>
        </button>
        <p-menu #accountMenu [model]="accountItems" [popup]="true" appendTo="body" styleClass="p-popup-menu" />
      }
    </header>

    <div class="p-layout">
      @if (auth.user()) {
        <aside class="p-side" [class.mini]="collapsed()" aria-label="Portal menu">
          <ng-container *ngTemplateOutlet="tree; context: { mini: collapsed(), drawer: false }" />
        </aside>
      }
      <main class="p-main" [attr.aria-busy]="busy.active()">
        @if (denied(); as message) {
          <section class="p-card denied" role="alert">
            <i class="pi pi-lock" aria-hidden="true"></i>
            <h1>No permission granted</h1>
            <p>{{ message }}</p>
            <div class="p-actions">
              <p-button label="Try again" icon="pi pi-refresh" [outlined]="true" (onClick)="retryAccess()" />
              <p-button label="Sign out" icon="pi pi-sign-out" severity="secondary" (onClick)="auth.logout()" />
            </div>
          </section>
        } @else {
          <router-outlet />
        }
      </main>
    </div>

    @if (auth.user(); as me) {
      <p-drawer appendTo="body" [visible]="drawerOpen()" (visibleChange)="drawerOpen.set($event)" position="left" styleClass="p-menu-drawer"
                [modal]="true" [blockScroll]="true">
        <ng-template #header>
          <div class="dr-me">
            <app-avatar [name]="me.name" [employeeId]="me.id" [photoVersion]="me.photoUpdatedAt" [photoPath]="me.photoPath" [size]="44" />
            <span>
              <b>{{ me.name }}</b>
              <small>{{ me.designationName ?? me.userTypeName ?? roleLabels[me.role] }}{{ me.brandCode ? ' · ' + me.brandCode : '' }}</small>
            </span>
          </div>
        </ng-template>
        <ng-container *ngTemplateOutlet="tree; context: { mini: false, drawer: true }" />
        <ng-template #footer>
          <div class="dr-foot">
            <p-button label="Change PIN" icon="pi pi-key" [text]="true" severity="secondary" routerLink="/portal/change-pin"
                      (onClick)="drawerOpen.set(false)" />
            <p-button label="Sign out" icon="pi pi-sign-out" [outlined]="true" severity="secondary"
                      (onClick)="drawerOpen.set(false); auth.logout()" />
          </div>
        </ng-template>
      </p-drawer>
    }

    <!-- the menu: links, and groups with sub-menus; with icons only, a group opens its pages in a pop-up -->
    <ng-template #tree let-mini="mini" let-drawer="drawer">
      @if (drawer && productStart(); as start) {
        <div class="dr-switch" role="group" aria-label="Portal section">
          <a routerLink="/portal/profile" [class.on]="section() === 'EMPLOYEE'" (click)="drawerOpen.set(false)">
            <i class="pi pi-users" aria-hidden="true"></i> Employee</a>
          <a [routerLink]="start" [class.on]="section() === 'PRODUCT'" (click)="drawerOpen.set(false)">
            <i class="pi pi-box" aria-hidden="true"></i> Products</a>
        </div>
      }
      @if (!mini && productStart()) {
        <p class="nav__section">{{ section() === 'PRODUCT' ? 'Product portal' : 'Employee portal' }}</p>
      }
      <nav class="nav" [class.nav--mini]="mini">
        @for (entry of nav(); track entry.label) {
          @if (entry.kind === 'link') {
            <a class="nav__item" [routerLink]="entry.link" [class.is-active]="isActive(entry)"
               [attr.aria-current]="isActive(entry) ? 'page' : null" [pTooltip]="mini ? entry.label : ''" tooltipPosition="right"
               (click)="drawer && drawerOpen.set(false)">
              <i [class]="'pi ' + entry.icon" aria-hidden="true"></i><span class="nav__label">{{ entry.label }}</span>
            </a>
          } @else if (mini) {
            <button type="button" class="nav__item" [class.is-active]="groupActive(entry)" [pTooltip]="entry.label"
                    tooltipPosition="right" [attr.aria-label]="entry.label" aria-haspopup="menu"
                    (click)="openGroupMenu($event, entry, groupMenu)">
              <i [class]="'pi ' + entry.icon" aria-hidden="true"></i>
            </button>
          } @else {
            <button type="button" class="nav__item nav__group" [class.has-active]="groupActive(entry)"
                    [attr.aria-expanded]="isOpen(entry)" (click)="toggleGroup(entry)">
              <i [class]="'pi ' + entry.icon" aria-hidden="true"></i><span class="nav__label">{{ entry.label }}</span>
              <i class="pi pi-chevron-down nav__chev" [class.open]="isOpen(entry)" aria-hidden="true"></i>
            </button>
            @if (isOpen(entry)) {
              <div class="nav__sub">
                @for (child of entry.children; track child.link) {
                  <a class="nav__item nav__child" [routerLink]="child.link" [class.is-active]="isActive(child)"
                     [attr.aria-current]="isActive(child) ? 'page' : null" (click)="drawer && drawerOpen.set(false)">
                    <i [class]="'pi ' + child.icon" aria-hidden="true"></i><span class="nav__label">{{ child.label }}</span>
                  </a>
                }
              </div>
            }
          }
        }
      </nav>
    </ng-template>
    <p-menu #groupMenu [model]="groupItems()" [popup]="true" appendTo="body" styleClass="p-popup-menu" />

    <!-- team chat: the chat button and window, for people given the Team chat checkpoint -->
    @if (auth.can('CHAT')) { <app-team-chat /> }

    <p-toast position="top-right" [breakpoints]="{ '760px': { width: 'calc(100vw - 24px)', right: '12px', left: '12px' } }" />
    <p-confirmdialog [style]="{ width: '440px' }" [breakpoints]="{ '760px': 'calc(100vw - 24px)' }" />
  `,
  styles: `
    /* soft blue waves on the left and right corners, white in the middle */
    app-portal-shell { display: block; min-height: 100dvh; position: relative; isolation: isolate; background: var(--soft); }
    /* a layer pinned to the screen (a fixed background does not work on iPhones), behind everything */
    app-portal-shell::before {
      content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
      background:
        radial-gradient(60% 55% at 0% 0%, #d6e9fb 0 38%, transparent 38.5%),
        radial-gradient(85% 75% at 0% 0%, #e7f2fd 0 48%, transparent 48.5%),
        radial-gradient(55% 60% at 100% 0%, #d9eafc 0 34%, transparent 34.5%),
        radial-gradient(80% 85% at 100% 0%, #eaf4fe 0 46%, transparent 46.5%),
        linear-gradient(180deg, #f7fbff 0%, var(--soft) 100%);
    }

    /* top bar: white, blue underline */
    .p-top {
      position: sticky; top: 0; z-index: 30; height: 60px; padding: 0 16px 0 12px;
      display: flex; align-items: center; gap: 8px; color: var(--ink);
      background: rgba(255,255,255,.92); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--line); box-shadow: 0 2px 12px rgba(23,59,99,.06);
    }
    .p-top::after {
      content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px;
      background: linear-gradient(90deg, var(--brass), #7db8f0 60%, transparent);
    }
    .p-top .p-burger, .p-top .p-collapse { color: var(--pine); }
    .p-top .p-burger:hover, .p-top .p-collapse:hover { background: var(--accent-soft); color: var(--brass-dark); }
    .p-top .p-burger { display: none; }
    .p-mark { display: flex; align-items: center; gap: 12px; color: var(--pine); text-decoration: none; margin-right: auto; padding-left: 4px; }
    .p-mark:has(+ .p-switch) { margin-right: 0; }
    /* Employee portal | Product portal */
    .p-switch { display: flex; gap: 4px; margin: 0 auto 0 22px; padding: 3px; border-radius: 10px; background: var(--accent-softer); border: 1px solid var(--line); }
    .p-switch a { display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px; border-radius: 8px; color: var(--muted);
      text-decoration: none; font: 600 .82rem/1 var(--body); white-space: nowrap; }
    .p-switch a:hover { color: var(--brass-dark); }
    .p-switch a.on { background: #fff; color: var(--brass-dark); box-shadow: 0 1px 4px rgba(23,59,99,.12); }
    .p-switch a:focus-visible { outline: 2px solid var(--brass); outline-offset: 1px; }
    .p-switch i { font-size: .85rem; }
    .nav__section { margin: 0 0 8px; padding: 0 12px; font-size: .68rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
    .dr-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 3px; margin-bottom: 14px; border-radius: 10px;
      background: var(--accent-softer); border: 1px solid var(--line); }
    .dr-switch a { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 6px; border-radius: 8px;
      color: var(--muted); text-decoration: none; font-weight: 600; font-size: .86rem; }
    .dr-switch a.on { background: #fff; color: var(--brass-dark); box-shadow: 0 1px 4px rgba(23,59,99,.12); }
    .p-mark img { height: 24px; width: auto; }
    .p-mark span { font-family: var(--body); font-weight: 600; font-size: .95rem; letter-spacing: .16em; text-transform: uppercase; white-space: nowrap; }
    .p-me {
      display: flex; align-items: center; gap: 10px; color: inherit; cursor: pointer; text-align: left;
      background: none; border: 0; padding: 4px 8px 4px 4px; border-radius: 40px; font: inherit;
    }
    .p-me:hover { background: var(--accent-soft); }
    .p-me__text { display: grid; line-height: 1.2; }
    .p-me__text b { font-size: .88rem; font-weight: 600; }
    .p-me__text small { font-size: .75rem; color: var(--muted); }
    .p-me__caret { font-size: .8rem; color: var(--muted); }
    .p-popup-menu { min-width: 210px; }

    /* sidebar beside the page */
    .p-layout { display: flex; align-items: flex-start; }
    .p-layout > .p-main { flex: 1 1 auto; min-width: 0; }

    .denied { max-width: 560px; margin: 40px auto; text-align: center; display: grid; justify-items: center; gap: 6px; }
    .denied > i { font-size: 2rem; color: var(--brass-dark); }
    .denied p { color: var(--muted); margin: 0; }
    .denied .p-actions { justify-content: center; }
    .p-side {
      position: sticky; top: 60px; flex: none; width: 252px; height: calc(100dvh - 60px); overflow-y: auto;
      padding: 14px 10px; background: rgba(255,255,255,.88); border-right: 1px solid var(--line); transition: width .2s ease;
    }
    .p-side.mini { width: 68px; }

    /* the menu */
    .nav { display: grid; gap: 2px; }
    .nav__item {
      display: flex; align-items: center; gap: 12px; width: 100%; min-height: 42px; padding: 9px 12px;
      border: 0; border-radius: 8px; background: none; cursor: pointer; position: relative;
      font: 500 .92rem/1.2 var(--body); color: var(--ink); text-decoration: none; text-align: left;
    }
    .nav__item > .pi:first-child { width: 20px; text-align: center; color: var(--brass-dark); font-size: 1rem; flex: none; }
    .nav__item:hover { background: var(--accent-softer); }
    .nav__item:focus-visible { outline: 2px solid var(--brass); outline-offset: -2px; }
    .nav__item.is-active { background: var(--accent-soft); color: var(--brass-dark); font-weight: 600; }
    .nav__item.is-active::before {
      content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px; border-radius: 3px; background: var(--brass);
    }
    .nav__group.has-active { font-weight: 600; }
    .nav__label { flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nav__chev { font-size: .72rem; color: var(--muted); transition: transform .2s; }
    .nav__chev.open { transform: rotate(180deg); }
    .nav__sub { display: grid; gap: 2px; margin: 2px 0 6px 21px; padding-left: 10px; border-left: 1px solid var(--line); }
    .nav__child { min-height: 38px; padding: 8px 10px; font-size: .88rem; }
    .nav__child > .pi:first-child { font-size: .88rem; }
    .nav--mini .nav__item { justify-content: center; padding: 10px 0; }
    .nav--mini .nav__label { display: none; }

    /* drawer (phones, tablets) */
    .p-menu-drawer { width: min(300px, 86vw); }
    .dr-me { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .dr-me span { display: grid; line-height: 1.25; min-width: 0; }
    .dr-me b { font-size: .95rem; }
    .dr-me small { font-size: .78rem; color: var(--muted); }
    .dr-foot { display: flex; justify-content: space-between; gap: 8px; }

    @media (max-width: 1024px) {
      .p-side, .p-top .p-collapse { display: none; }
      .p-top .p-burger { display: inline-flex; }
      .p-top { padding: 0 10px 0 6px; }
      .p-me__text, .p-me__caret { display: none; }
      .p-mark span { font-size: .92rem; letter-spacing: .1em; }
      .p-switch { display: none; }
      .p-mark:has(+ .p-switch) { margin-right: auto; }
    }
    /* small phones (iPhone SE, Galaxy S9+): keep "Company Portal" clear of the photo */
    @media (max-width: 380px) {
      .p-mark { gap: 8px; }
      .p-mark span { font-size: .8rem; letter-spacing: .06em; }
    }
    @media (max-width: 340px) {
      .p-mark span { display: none; }
    }
  `,
})
export class PortalShell {
  protected readonly auth = inject(AuthService);
  protected readonly busy = inject(BusyService);
  private readonly router = inject(Router);
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly drawerOpen = signal(false);
  protected readonly collapsed = signal(readCollapsed());
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  private readonly openGroups = signal<ReadonlySet<string>>(new Set());
  protected readonly groupItems = signal<MenuItem[]>([]);

  protected readonly accountItems: MenuItem[] = [
    { label: 'My profile', icon: 'pi pi-user', routerLink: '/portal/profile' },
    { label: 'Change PIN', icon: 'pi pi-key', routerLink: '/portal/change-pin' },
    { separator: true },
    { label: 'Sign out', icon: 'pi pi-sign-out', command: () => this.auth.logout() },
  ];

  /** Nothing was given to this person: say so (except on Change PIN, which a new account must reach). */
  protected readonly denied = computed(() =>
    this.url().startsWith('/portal/change-pin')
      ? null
      : this.auth.accessDenied()?.replace(/^No permission granted\.?\s*/, '') || (this.auth.accessDenied() ? 'Ask your admin to give you access.' : null),
  );

  protected retryAccess(): void {
    this.auth.reloadAccess().subscribe();
  }

  /** The product portal is everything under /portal/products; the rest is the employee portal. */
  protected readonly section = computed<'EMPLOYEE' | 'PRODUCT'>(() =>
    this.url().startsWith(PRODUCTS + '/') || this.url().split(/[?#]/)[0] === PRODUCTS ? 'PRODUCT' : 'EMPLOYEE',
  );
  /** Where the product portal opens (its first page I may see); null = none of its menus are mine. */
  protected readonly productStart = computed(() => {
    const paths = (this.auth.access()?.menus ?? []).flatMap((m) => [m.path, ...m.children.map((c) => c.path)]);
    return paths.find((p): p is string => !!p && isProduct(p)) ?? null;
  });

  /**
   * The menus this person may open in the current section, from menu access (the menus table, in its order); a
   * group with a single page shows as a plain link. My profile is always there in the employee portal.
   */
  protected readonly nav = computed<NavEntry[]>(() => {
    const me = this.auth.user();
    if (!me) return [];
    if (me.mustChangePassword) return [link('Change PIN', 'pi-key', '/portal/change-pin')];
    if (this.auth.accessDenied()) return [];
    const products = this.section() === 'PRODUCT';
    const menus = (this.auth.access()?.menus ?? []).filter(
      (m) => [m.path, ...m.children.map((c) => c.path)].some((p) => !!p && isProduct(p)) === products,
    );
    // a link is "exact" when another page lives below its address (My leave /portal/leave vs /portal/leave/approvals)
    const paths = menus.flatMap((m) => [m.path, ...m.children.map((c) => c.path)]).filter((x): x is string => !!x);
    const exact = (path: string) => paths.some((other) => other.startsWith(path + '/'));
    const entries: NavEntry[] = products ? [] : [link('My profile', 'pi-user', '/portal/profile')];
    for (const m of menus) {
      if (m.children.length) {
        const children = m.children.filter((c) => c.path).map((c) => link(c.name, c.icon ?? 'pi-circle', c.path!, exact(c.path!)));
        if (children.length) entries.push(group(m.code, m.name, m.icon ?? 'pi-folder', children));
      } else if (m.path) {
        entries.push(link(m.name, m.icon ?? 'pi-circle', m.path, exact(m.path)));
      }
    }
    return entries.map((e) => (e.kind === 'group' && e.children.length === 1 ? { ...e.children[0], label: e.label, icon: e.icon } : e));
  });

  constructor() {
    // my menus: loaded once per sign-in (and again after a new PIN, which signs in afresh)
    effect(() => {
      if (this.auth.user() && !this.auth.access() && !this.auth.accessDenied()) {
        untracked(() => this.auth.ensureAccess().subscribe());
      }
    });
    // the group holding the current page opens by itself
    effect(() => {
      const current = this.nav().find((e): e is NavGroup => e.kind === 'group' && this.groupActive(e));
      if (current && !this.openGroups().has(current.key)) {
        this.openGroups.update((s) => new Set(s).add(current.key));
      }
    });
  }

  protected isActive(item: NavLink): boolean {
    const path = this.url().split(/[?#]/)[0];
    return item.exact ? path === item.link : path === item.link || path.startsWith(item.link + '/');
  }

  protected groupActive(g: NavGroup): boolean {
    return g.children.some((c) => this.isActive(c));
  }

  protected isOpen(g: NavGroup): boolean {
    return this.openGroups().has(g.key);
  }

  protected toggleGroup(g: NavGroup): void {
    this.openGroups.update((s) => {
      const next = new Set(s);
      if (next.has(g.key)) next.delete(g.key);
      else next.add(g.key);
      return next;
    });
  }

  protected openGroupMenu(event: Event, g: NavGroup, menu: Menu): void {
    this.groupItems.set([
      { label: g.label, items: g.children.map((c) => ({ label: c.label, icon: 'pi ' + c.icon, routerLink: c.link })) },
    ]);
    menu.toggle(event);
  }

  protected toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
    try {
      localStorage.setItem(SIDEBAR_KEY, this.collapsed() ? 'mini' : 'full');
    } catch {
      // storage blocked: the choice lasts until the page is reloaded
    }
  }
}

function link(label: string, icon: string, path: string, exact = false): NavLink {
  return { kind: 'link', label, icon, link: path, exact };
}

function group(key: string, label: string, icon: string, children: NavLink[]): NavGroup {
  return { kind: 'group', key, label, icon, children };
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'mini';
  } catch {
    return false;
  }
}
