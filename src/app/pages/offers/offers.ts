import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OfferBanners } from '../../shared/offer-banners';
import { SiteNewsService } from '../../shared/site-news.service';

/** Doors & Windows > Offers: every discount the company portal has made public and that runs today, as banners. */
@Component({
  selector: 'app-offers',
  imports: [RouterLink, OfferBanners],
  template: `
    <section class="page-banner" style="background-image: url('images/hero/hero-2.webp')">
      <div class="container">
        <ol class="crumbs">
          <li><a routerLink="/doors-windows">Home</a></li>
          <li>Offers</li>
        </ol>
        <h1>Offers</h1>
        <p>Our current discounts on doors and windows. Ask for a quote to claim one, or book a free site visit.</p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        @if (!site.ready()) {
          <p class="none">Loading the offers…</p>
        } @else if (site.offers().length) {
          <app-offer-banners [offers]="site.offers()" />
        } @else {
          <div class="none">
            <h2>No offers running right now</h2>
            <p>New offers are announced here first. Meanwhile, every quote is made to measure for your openings.</p>
            <a class="btn btn--gold" routerLink="/doors-windows/contact" fragment="quote">Get a free quote</a>
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .none { text-align: center; padding: 40px 0; color: var(--muted); display: grid; gap: 12px; justify-items: center; }
    .none h2 { margin: 0; font-family: var(--display); font-weight: 400; color: var(--ink); }
    .none p { margin: 0; max-width: 520px; }
  `,
})
export class Offers implements OnInit {
  protected readonly site = inject(SiteNewsService);

  ngOnInit(): void {
    this.site.load();
  }
}
