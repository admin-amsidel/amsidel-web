import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { CATEGORIES } from '../../data/products';
import { SITE, telHref, whatsappHref } from '../../data/site.config';
import { ScrollTo } from '../../shared/scroll-to';

/** Header, footer and floating actions shared by every Doors & Windows page. */
@Component({
  selector: 'app-store-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ScrollTo],
  templateUrl: './store-shell.html',
  styleUrl: './store-shell.scss',
})
export class StoreShell {
  protected readonly site = SITE;
  protected readonly year = new Date().getFullYear();
  protected readonly systems = CATEGORIES.filter((c) => c.group === 'doors-windows');
  protected readonly doors = CATEGORIES.filter((c) => c.group === 'doors');
  protected readonly tel = SITE.phone ? telHref(SITE.phone) : '';
  protected readonly wa = SITE.whatsapp ? whatsappHref('Hello Amsidel, I would like a quote.') : '';

  protected readonly scrolled = signal(false);
  protected readonly drawerOpen = signal(false);
  protected readonly productsOpen = signal(false);

  constructor() {
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
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
    this.drawerOpen.update((v) => !v);
  }

  protected toggleProducts(): void {
    this.productsOpen.update((v) => !v);
  }
}
