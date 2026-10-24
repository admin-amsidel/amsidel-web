import { DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OfferBanners } from './offer-banners';
import { PublicNews, SiteNewsService } from './site-news.service';

const LABELS: Record<string, string> = {
  ANNOUNCEMENT: 'News', IMPORTANT: 'Important', PROMOTION: 'Promotion', DISCOUNT: 'Offer', BIRTHDAY: 'Greetings', EVENT: 'Event', OTHER: 'News',
};

/**
 * The home page's offers and news from the company portal (only what is Public or All, and showing today): the
 * discounts as banners (all of them on the Offers page), the other news as cards. Nothing when there are none.
 */
@Component({
  selector: 'app-site-news',
  imports: [DatePipe, RouterLink, OfferBanners],
  template: `
    @if (site.offers().length) {
      <section class="section offers-home" aria-labelledby="site-offers-title">
        <div class="container">
          <div class="section-head">
            <p class="kicker">Offers</p>
            <h2 id="site-offers-title">Current offers</h2>
            <span class="title-rule"></span>
          </div>
          <app-offer-banners [offers]="site.offers().slice(0, 2)" />
          @if (site.offers().length > 2) {
            <div class="more"><a class="btn btn--outline" routerLink="/doors-windows/offers">See all {{ site.offers().length }} offers</a></div>
          }
        </div>
      </section>
    }
    @if (site.news().length) {
      <section class="section news" aria-labelledby="site-news-title">
        <div class="container">
          <div class="section-head">
            <p class="kicker">What's new</p>
            <h2 id="site-news-title">News</h2>
            <span class="title-rule"></span>
          </div>
          <div class="news__grid">
            @for (n of site.news(); track n.id) {
              <article class="news__card">
                <div class="news__pic">
                  @if (site.image(n); as src) {
                    <img [src]="src" [alt]="n.title" loading="lazy" />
                  } @else {
                    <span class="news__mark">{{ label(n) }}</span>
                  }
                </div>
                <div class="news__text">
                  <span class="news__tag">{{ label(n) }}</span>
                  <h3>{{ n.title }}</h3>
                  @if (n.body) { <p>{{ n.body }}</p> }
                  @if (n.endDate) { <small>Till {{ n.endDate | date: 'd MMMM y' }}</small> }
                </div>
              </article>
            }
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    .more { text-align: center; margin-top: 28px; }
    .news__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 380px)); justify-content: center; gap: 24px; }
    @media (max-width: 420px) { .news__grid { grid-template-columns: 1fr; } }
    .news__card { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; display: flex; flex-direction: column;
      box-shadow: var(--shadow); }
    .news__pic { aspect-ratio: 16 / 9; background: linear-gradient(135deg, var(--dark), var(--pine)); display: grid; place-items: center; overflow: hidden; }
    .news__pic img { width: 100%; height: 100%; object-fit: cover; }
    .news__mark { font-family: var(--display); color: var(--gold-hi); font-size: 1.8rem; letter-spacing: .04em; }
    .news__text { padding: 20px 22px 24px; display: flex; flex-direction: column; gap: 8px; }
    .news__tag { align-self: flex-start; font-size: .72rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--brass-dark); }
    .news__text h3 { margin: 0; font-family: var(--display); font-weight: 400; font-size: 1.35rem; line-height: 1.3; }
    .news__text p { margin: 0; color: var(--muted); line-height: 1.6; white-space: pre-line;
      display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
    .news__text small { color: var(--brass-dark); font-weight: 600; }
  `,
})
export class SiteNews implements OnInit {
  protected readonly site = inject(SiteNewsService);

  ngOnInit(): void {
    this.site.load();
  }

  protected label(n: PublicNews): string {
    return LABELS[n.category] ?? 'News';
  }
}
