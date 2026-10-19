import { Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { categoryBySlug, productBySlug, productsIn } from '../../data/products';
import { SITE, whatsappHref } from '../../data/site.config';
import { ProductCard } from '../../shared/product-card';
import { QuoteForm } from '../../shared/quote-form';
import { ScrollTo } from '../../shared/scroll-to';

@Component({
  selector: 'app-product-detail',
  imports: [RouterLink, ProductCard, QuoteForm, ScrollTo],
  template: `
    @if (product(); as p) {
      @let c = category()!;
      <div class="crumb-bar">
        <div class="container">
          <ol class="crumbs crumbs--dark">
            <li><a routerLink="/doors-windows">Home</a></li>
            <li><a routerLink="/doors-windows/products">Products</a></li>
            <li><a [routerLink]="['/doors-windows/category', c.slug]">{{ c.short }}</a></li>
            <li>{{ p.model }}</li>
          </ol>
        </div>
      </div>

      <section class="section detail">
        <div class="container detail__grid">
          <div class="detail__media">
            <img [src]="p.image" [alt]="p.name" width="800" height="1000" />
          </div>
          <div class="detail__info">
            <p class="kicker">{{ c.name }}</p>
            <h1>{{ p.name }}</h1>
            <p class="model">Model code: <strong>{{ p.model }}</strong></p>
            <p class="desc">{{ c.description }}</p>

            <h2 class="sub">Highlights</h2>
            <ul class="hl">
              @for (f of c.features; track f) { <li>{{ f }}</li> }
            </ul>

            <dl class="specs">
              <div><dt>Category</dt><dd>{{ c.name }}</dd></div>
              <div><dt>Sizes</dt><dd>Made to measure</dd></div>
              <div><dt>Finish</dt><dd>As shown, or choose from our shade card</dd></div>
              <div><dt>Ideal for</dt><dd>{{ c.applications.join(', ') }}</dd></div>
            </dl>

            <div class="actions">
              <a class="btn btn--gold" appScrollTo="enquire">Enquire about this design</a>
              @if (wa(); as link) {
                <a class="btn btn--outline" [href]="link" target="_blank" rel="noopener">WhatsApp us</a>
              } @else {
                <a class="btn btn--outline" [href]="mail()">Email us</a>
              }
            </div>
            <p class="note">Product images are representative. Actual colour and grain can vary slightly with finish and lighting.</p>
          </div>
        </div>
      </section>

      <section class="section section--soft">
        <div class="container enquire">
          <div>
            <p class="kicker">Enquiry</p>
            <h2 id="enquire">Interested in {{ p.model }}?</h2>
            <p class="desc">Tell us where it's going and we'll come back with options, a price and a time for a free site visit.</p>
          </div>
          <app-quote-form [interest]="c.name" [productName]="p.name + ' (' + p.model + ')'" />
        </div>
      </section>

      @if (related().length) {
        <section class="section">
          <div class="container">
            <div class="section-head">
              <p class="kicker">You may also like</p>
              <h2>More {{ c.short }} designs</h2>
              <span class="title-rule"></span>
            </div>
            <div class="grid">
              @for (r of related(); track r.slug) {
                <app-product-card [product]="r" />
              }
            </div>
          </div>
        </section>
      }
    }
  `,
  styles: `
    .crumb-bar { background: var(--soft); border-bottom: 1px solid var(--line); }
    .crumbs--dark { margin: 0; padding-block: 16px; color: var(--brass-dark); }
    .crumbs--dark a { color: var(--ink); }
    .crumbs--dark li + li::before { color: var(--muted); }
    .detail__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: start; }
    .detail__media {
      position: sticky; top: calc(var(--header-h) + 24px);
      background: var(--soft); border: 1px solid var(--line); border-radius: 10px; padding: 28px;
    }
    .detail__media img { width: 100%; height: auto; max-height: 72vh; object-fit: contain; margin-inline: auto; }
    h1 { font-size: clamp(2rem, 4vw, 2.8rem); }
    .model { color: var(--muted); margin: 8px 0 0; }
    .desc { color: var(--muted); margin: 18px 0 0; max-width: 60ch; }
    .sub { font-size: 1.3rem; margin: 30px 0 12px; }
    .hl { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
    .hl li::marker { color: var(--brass); }
    .specs { margin: 28px 0 0; border-top: 1px solid var(--line); }
    .specs div { display: grid; grid-template-columns: 130px 1fr; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--line); }
    .specs dt { font-weight: 600; font-size: .9rem; }
    .specs dd { margin: 0; color: var(--muted); }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 30px; }
    .note { font-size: .8rem; color: var(--muted); margin: 18px 0 0; }
    .enquire { display: grid; grid-template-columns: 1fr 1.4fr; gap: 64px; align-items: start; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
    @media (max-width: 1080px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 860px) {
      .detail__grid, .enquire { grid-template-columns: 1fr; gap: 36px; }
      .detail__media { position: static; }
    }
    @media (max-width: 560px) { .grid { gap: 14px; } .specs div { grid-template-columns: 1fr; gap: 2px; } }
  `,
})
export class ProductDetail {
  readonly slug = input.required<string>();

  protected readonly product = computed(() => productBySlug(this.slug()));
  protected readonly category = computed(() => categoryBySlug(this.product()?.category));
  protected readonly related = computed(() => {
    const p = this.product();
    return p ? productsIn(p.category).filter((r) => r.slug !== p.slug).slice(0, 4) : [];
  });
  protected readonly wa = computed(() => {
    const p = this.product();
    return SITE.whatsapp && SITE.whatsappActive && p ? whatsappHref(`Hello Amsidel, I'm interested in ${p.name}.`) : '';
  });
  protected readonly mail = computed(
    () => `mailto:${SITE.altEmail}?subject=${encodeURIComponent('Enquiry – ' + (this.product()?.name ?? ''))}`,
  );

  constructor() {
    const title = inject(Title);
    const router = inject(Router);
    effect(() => {
      const p = this.product();
      if (!p) {
        router.navigate(['/doors-windows/products']);
        return;
      }
      title.setTitle(`${p.name} · Amsidel Doors & Windows`);
    });
  }
}
