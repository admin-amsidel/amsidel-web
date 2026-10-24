import { Component, DestroyRef, effect, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { CATEGORIES } from '../../data/products';
import { SITE, telHref } from '../../data/site.config';
import { AmiChat } from '../../shared/ami-chat/ami-chat';
import { ScrollTo } from '../../shared/scroll-to';
import { SiteNewsService } from '../../shared/site-news.service';

/** Header, footer and floating actions shared by every Doors & Windows page. */
@Component({
  selector: 'app-store-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ScrollTo, AmiChat],
  templateUrl: './store-shell.html',
  styleUrl: './store-shell.scss',
  host: { '[style.--nav-top.px]': 'navTop()' },
})
export class StoreShell {
  protected readonly site = SITE;
  protected readonly year = new Date().getFullYear();
  protected readonly systems = CATEGORIES.filter((c) => c.group === 'doors-windows');
  protected readonly doors = CATEGORIES.filter((c) => c.group === 'doors');
  protected readonly tel = SITE.phone ? telHref(SITE.phone) : '';
  /** The offers (and news) the company portal made public. */
  protected readonly news = inject(SiteNewsService);

  protected readonly scrolled = signal(false);
  protected readonly drawerOpen = signal(false);
  protected readonly productsOpen = signal(false);
  /** Set when a menu link is clicked, so the hover-opened products menu closes until the pointer leaves it. */
  protected readonly megaSuppressed = signal(false);
  /** Bottom edge of the header, so the mobile drawer starts right below it (the top bar shifts it until scrolled). */
  protected readonly navTop = signal<number | null>(null);

  private readonly header = viewChild<ElementRef<HTMLElement>>('header');

  constructor() {
    this.news.load();
    // keep the page from scrolling behind the open mobile drawer
    effect(() => {
      document.body.style.overflow = this.drawerOpen() ? 'hidden' : '';
    });
    // leaving the store with the drawer open (e.g. the back gesture to the group page) destroys this shell before
    // the effect can run again, which left the next page unable to scroll; always release the lock here
    inject(DestroyRef).onDestroy(() => (document.body.style.overflow = ''));
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.drawerOpen.set(false);
        this.productsOpen.set(false);
      });
  }

  @HostListener('window:scroll')
  protected onScroll(): void {
    this.scrolled.set(window.scrollY > 40);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.drawerOpen.set(false);
    this.productsOpen.set(false);
  }

  protected toggleDrawer(): void {
    const el = this.header()?.nativeElement;
    if (el) this.navTop.set(Math.round(el.getBoundingClientRect().bottom));
    this.drawerOpen.update((v) => !v);
  }

  /** Any link picked in the menu closes it, including links to the page already open (no NavigationEnd then). */
  protected onNavClick(e: MouseEvent): void {
    const link = (e.target as HTMLElement).closest('a');
    if (!link) return;
    this.drawerOpen.set(false);
    this.productsOpen.set(false);
    this.megaSuppressed.set(true);
    // focus would otherwise stay on the link and keep the menu open via :focus-within
    link.blur();
  }

  protected toggleProducts(): void {
    this.productsOpen.update((v) => !v);
  }
}
