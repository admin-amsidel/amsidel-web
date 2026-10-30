/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicNews, SiteNewsService } from './site-news.service';

/**
 * Offers: the poster shown whole (tap to open it full size), with the heading, details, how long it runs and a button to
 * ask for it (the quote form) beside it, or below it on phones. Without a poster, a large % mark.
 */
@Component({
  selector: 'app-offer-banners',
  imports: [DatePipe, RouterLink],
  template: `
    <div class="offers">
      @for (o of offers(); track o.id) {
        <article class="offer" [class.offer--plain]="!src(o)">
          @if (src(o); as img) {
            <a class="offer__poster" [href]="img" target="_blank" rel="noopener" [attr.aria-label]="'Open the poster of ' + o.title + ' in full'">
              <img [src]="img" [alt]="o.title" loading="lazy" decoding="async" />
            </a>
          } @else {
            <div class="offer__poster offer__poster--none" aria-hidden="true"><span class="offer__mark">%</span></div>
          }
          <div class="offer__body">
            <span class="offer__tag">{{ o.brandName ? 'Offer · ' + o.brandName : 'Limited offer' }}</span>
            <h3>{{ o.title }}</h3>
            @if (o.body) { <p>{{ o.body }}</p> }
            @if (o.endDate) { <span class="offer__till">Valid till {{ o.endDate | date: 'd MMMM y' }}</span> }
            <a class="btn btn--gold offer__cta" routerLink="/doors-windows/contact" fragment="quote">Claim this offer</a>
          </div>
        </article>
      }
    </div>
  `,
  styles: `
    .offers { display: grid; gap: 28px; }
    /* the poster is shown whole (never cropped or darkened): 70% poster, 30% details; stacked on phones */
    .offer { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 3fr); overflow: hidden; border-radius: var(--radius);
      background: #fff; border: 1px solid var(--chip-line); box-shadow: var(--shadow); }
    .offer__poster { display: grid; place-items: center; background: #f3f3f4; min-height: 260px; }
    .offer__poster img { display: block; width: 100%; height: auto; max-height: 560px; object-fit: contain; }
    .offer__poster--none { background: linear-gradient(120deg, var(--chip), #f7f7f8); }
    .offer__mark { font-family: var(--display); font-size: clamp(7rem, 16vw, 12rem); line-height: 1; color: var(--brass); opacity: .25; }
    .offer__body { padding: clamp(20px, 3vw, 36px); display: flex; flex-direction: column; justify-content: center; gap: 12px; min-width: 0; }
    .offer__tag { align-self: flex-start; font-size: .72rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
      color: var(--chip-gold); background: var(--chip); padding: 6px 12px; border-radius: 999px; }
    h3 { margin: 0; font-family: var(--display); font-weight: 400; font-size: clamp(1.4rem, 2.2vw, 2rem); line-height: 1.2; color: var(--ink); }
    p { margin: 0; line-height: 1.6; color: var(--muted); white-space: pre-line; overflow-wrap: anywhere; }
    .offer__till { color: var(--chip-gold); font-weight: 600; font-size: .9rem; }
    .offer__cta { align-self: flex-start; margin-top: 4px; }
    @media (max-width: 900px) {
      .offer { grid-template-columns: minmax(0, 1fr); }
      .offer__poster { min-height: 0; }
      .offer__poster img { max-height: none; }
      .offer__poster--none { min-height: 160px; }
      .offer__body { padding: 18px 16px 20px; gap: 10px; }
      .offer__cta { align-self: stretch; text-align: center; }
    }
  `,
})
export class OfferBanners {
  private readonly site = inject(SiteNewsService);
  readonly offers = input.required<PublicNews[]>();

  protected src(o: PublicNews): string | null {
    return this.site.image(o);
  }
}
