/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OfferBanners } from '../../shared/offer-banners';
import { SiteNewsService } from '../../shared/site-news.service';

/** Doors & Windows > Offers: every discount the company portal has made public and that runs today, as banners. */
@Component({
  selector: 'app-offers',
  imports: [RouterLink, OfferBanners],
  template: `
    <section class="page-banner offers-banner" style="background-image: url('images/hero/hero-2.webp')">
      <div class="container">
        <ol class="crumbs">
          <li><a routerLink="/doors-windows">Home</a></li>
          <li>Offers</li>
        </ol>
        <h1>Offers</h1>
        <p>Our current discounts on doors and windows. Ask for a quote to claim one, or book a free site visit.</p>
      </div>
    </section>

    <section class="section offers-section">
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
    /* phones: a short banner, so the first poster is in view straight away */
    @media (max-width: 720px) {
      .offers-banner { min-height: 0; }
      .offers-banner .container { padding-block: 28px 22px; }
      .offers-banner p { font-size: .92rem; }
      .offers-section { padding-block: 20px 48px; }
    }
  `,
})
export class Offers implements OnInit {
  protected readonly site = inject(SiteNewsService);

  ngOnInit(): void {
    this.site.load();
  }
}
