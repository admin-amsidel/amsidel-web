import { Component, inject } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';

/** How long the loader stays up on every page change (and at least this long on first load). */
const LOADER_MIN_MS = 300;

/** "/doors-windows/contact?x=1#quote" -> "/doors-windows/contact" */
const pathOf = (url: string) => url.split(/[?#]/)[0];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  /** The logo loader in index.html: shown while the app starts and on every page change. */
  private readonly loader = document.getElementById('app-loader');
  private readonly router = inject(Router);
  private shownAt = 0; // the loader is visible from page load
  private hideTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    if (!this.loader) return;
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) {
        // links to a section of the page already open (e.g. #quote) don't count as a page change
        if (this.router.navigated && pathOf(e.url) === pathOf(this.router.url)) return;
        // the destination decides the style: casement window for Doors & Windows, ring for the group page
        this.loader!.classList.toggle('is-dw', /^\/doors-windows(\/|$)/.test(pathOf(e.url)));
        this.showLoader();
      } else if (e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError) {
        this.hideLoader();
      }
    });
  }

  private showLoader(): void {
    clearTimeout(this.hideTimer);
    if (!this.loader!.classList.contains('is-hidden')) return;
    this.loader!.classList.remove('is-hidden');
    // start the window (or ring) from the beginning each time, so it always opens rather than appearing mid-close
    this.loader!.getAnimations({ subtree: true }).forEach((a) => (a.currentTime = 0));
    this.shownAt = performance.now();
  }

  private hideLoader(): void {
    if (this.loader!.classList.contains('is-hidden')) return;
    clearTimeout(this.hideTimer);
    const wait = Math.max(0, LOADER_MIN_MS - (performance.now() - this.shownAt));
    this.hideTimer = setTimeout(() => this.loader!.classList.add('is-hidden'), wait);
  }
}
