import { DatePipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicNews, SiteNewsService } from './site-news.service';

/**
 * Offers as wide banners: the offer's picture behind the heading, the details, how long it runs and a button to ask
 * for it (the quote form). Without a picture, a dark banner with a large % mark.
 */
@Component({
  selector: 'app-offer-banners',
  imports: [DatePipe, RouterLink],
  template: `
    <div class="offers">
      @for (o of offers(); track o.id) {
        <article class="offer" [class.offer--plain]="!src(o)" [style.background-image]="src(o) ? 'url(' + src(o) + ')' : null">
          @if (!src(o)) { <span class="offer__mark" aria-hidden="true">%</span> }
          <div class="offer__body">
            <span class="offer__tag">{{ o.brandName ? 'Offer · ' + o.brandName : 'Limited offer' }}</span>
            <h3>{{ o.title }}</h3>
            @if (o.body) { <p>{{ o.body }}</p> }
            <div class="offer__foot">
              <a class="btn btn--gold" routerLink="/doors-windows/contact" fragment="quote">Claim this offer</a>
              @if (o.endDate) { <span class="offer__till">Valid till {{ o.endDate | date: 'd MMMM y' }}</span> }
            </div>
          </div>
        </article>
      }
    </div>
  `,
  styles: `
    .offers { display: grid; gap: 24px; }
    .offer { position: relative; isolation: isolate; overflow: hidden; border-radius: var(--radius); min-height: clamp(280px, 30vw, 400px);
      display: flex; align-items: center; background: center / cover no-repeat var(--dark); color: #fff; box-shadow: var(--shadow); }
    .offer::before { content: ''; position: absolute; inset: 0; z-index: -1;
      background: linear-gradient(90deg, rgba(22, 22, 24, .88) 0%, rgba(22, 22, 24, .6) 45%, rgba(22, 22, 24, .1) 100%); }
    .offer--plain { background: linear-gradient(120deg, var(--chip), #f7f7f8); color: var(--ink); border: 1px solid var(--chip-line); box-shadow: none; }
    .offer--plain::before { display: none; }
    .offer--plain h3 { color: var(--ink); }
    .offer--plain p { color: var(--muted); }
    .offer--plain .offer__mark { color: var(--brass); opacity: .18; }
    .offer--plain .offer__till { color: var(--chip-gold); }
    .offer__mark { position: absolute; right: 6%; top: 50%; transform: translateY(-50%); z-index: -1; font-family: var(--display);
      font-size: clamp(9rem, 22vw, 16rem); line-height: 1; color: var(--gold-hi); opacity: .22; }
    .offer__body { padding: clamp(24px, 4vw, 48px); max-width: 640px; display: flex; flex-direction: column; gap: 12px; }
    .offer__tag { align-self: flex-start; font-size: .74rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase;
      color: var(--chip-gold); background: var(--chip); padding: 6px 12px; border-radius: 999px; }
    h3 { margin: 0; font-family: var(--display); font-weight: 400; font-size: clamp(1.6rem, 3.2vw, 2.5rem); line-height: 1.2; color: #fff; }
    p { margin: 0; line-height: 1.6; color: rgba(255, 255, 255, .88); white-space: pre-line;
      display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
    .offer__foot { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-top: 6px; }
    .offer__till { color: var(--gold-hi); font-weight: 600; font-size: .9rem; }
    @media (max-width: 720px) {
      .offer { align-items: flex-end; min-height: 380px; }
      .offer::before { background: linear-gradient(0deg, rgba(22, 22, 24, .92) 0%, rgba(22, 22, 24, .65) 55%, rgba(22, 22, 24, .15) 100%); }
      .offer__mark { top: 22%; }
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
