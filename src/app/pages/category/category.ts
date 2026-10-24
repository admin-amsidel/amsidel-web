import { Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { CATEGORIES, categoryBySlug, productsIn } from '../../data/products';
import { BrochureCta } from '../../shared/brochure-cta';
import { ProductCard } from '../../shared/product-card';
import { QuoteForm } from '../../shared/quote-form';
import { ScrollTo } from '../../shared/scroll-to';

@Component({
  selector: 'app-category',
  imports: [RouterLink, BrochureCta, ProductCard, QuoteForm, ScrollTo],
  template: `
    @if (category(); as c) {
      <section class="page-banner" [style.background-image]="'url(' + c.banner + ')'">
        <div class="container">
          <ol class="crumbs">
            <li><a routerLink="/doors-windows">Home</a></li>
            <li><a routerLink="/doors-windows/products">Products</a></li>
            <li>{{ c.short }}</li>
          </ol>
          <h1>{{ c.name }}</h1>
          <p>{{ c.tagline }}</p>
        </div>
      </section>

      <section class="section intro">
        <div class="container intro__grid">
          <div>
            <p class="kicker">Overview</p>
            <h2>Why choose {{ c.short }}?</h2>
            <p class="desc">{{ c.description }}</p>
            <div class="apps">
              <span class="apps__label">Ideal for</span>
              @for (a of c.applications; track a) { <span class="pill">{{ a }}</span> }
            </div>
          </div>
          <div class="features">
            <h3>Key features</h3>
            <ul>
              @for (f of c.features; track f) { <li>{{ f }}</li> }
            </ul>
            <a class="btn btn--gold" appScrollTo="quote">Ask for a quote</a>
          </div>
        </div>
      </section>

      <section class="section section--soft">
        <div class="container">
          <div class="section-head">
            <p class="kicker">Designs</p>
            <h2>{{ c.name }} collection</h2>
            <span class="title-rule"></span>
          </div>
          <div class="grid">
            @for (p of products(); track p.slug) {
              <app-product-card [product]="p" />
            }
          </div>
        </div>
      </section>

      <section class="section section--tight-top">
        <div class="container">
          <app-brochure-cta />
        </div>
      </section>

      <section class="section">
        <div class="container quote">
          <div>
            <p class="kicker">Get a Quote</p>
            <h2 id="quote">Price your {{ c.short }} {{ c.group === 'doors' ? 'doors' : 'doors and windows' }}</h2>
            <p class="desc">Send us a few details and we'll call back to arrange a free site visit and measurement.</p>
          </div>
          <app-quote-form [interest]="c.name" />
        </div>
      </section>

      <section class="section section--soft others">
        <div class="container">
          <p class="kicker">Explore more</p>
          <ul>
            @for (o of others(); track o.slug) {
              <li>
                <a [routerLink]="['/doors-windows/category', o.slug]">
                  <img [src]="o.thumb" alt="" width="64" height="64" loading="lazy" />
                  <span>{{ o.name }}</span>
                </a>
              </li>
            }
          </ul>
        </div>
      </section>
    }
  `,
  styles: `
    .intro__grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 64px; align-items: start; }
    .desc { color: var(--muted); margin: 16px 0 0; max-width: 62ch; }
    .apps { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 26px; }
    .apps__label { font-size: .75rem; letter-spacing: .18em; text-transform: uppercase; font-weight: 600; margin-right: 6px; }
    .pill { border: 1px solid var(--line); border-radius: 40px; padding: 6px 14px; font-size: .86rem; }
    .features { background: var(--chip); color: var(--ink); border: 1px solid var(--chip-line); border-radius: 8px; padding: 34px 30px; }
    .features h3 { font-size: 1.4rem; margin-bottom: 14px; }
    .features ul { list-style: none; margin: 0 0 26px; padding: 0; display: grid; gap: 12px; }
    .features li { padding-left: 28px; position: relative; color: var(--ink); }
    .features li::before { content: ''; position: absolute; left: 0; top: 9px; width: 14px; height: 2px; background: var(--gold-hi); }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
    .quote { display: grid; grid-template-columns: 1fr 1.4fr; gap: 64px; align-items: start; }
    .others ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .others a { display: flex; align-items: center; gap: 14px; padding: 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; text-decoration: none; font-weight: 600; }
    .others a:hover { border-color: var(--brass); }
    .others img { width: 52px; height: 64px; border-radius: 6px; object-fit: contain; padding: 4px; background: var(--soft); flex: none; }
    @media (max-width: 1080px) { .grid { grid-template-columns: repeat(3, 1fr); } .others ul { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 860px) {
      .intro__grid, .quote { grid-template-columns: 1fr; gap: 36px; }
      .grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
    }
    @media (max-width: 560px) { .others ul { grid-template-columns: 1fr; } }
  `,
})
export class CategoryPage {
  readonly slug = input.required<string>();

  protected readonly category = computed(() => categoryBySlug(this.slug()));
  protected readonly products = computed(() => productsIn(this.slug()));
  protected readonly others = computed(() => CATEGORIES.filter((c) => c.slug !== this.slug()));

  constructor() {
    const title = inject(Title);
    const router = inject(Router);
    effect(() => {
      const c = this.category();
      if (!c) {
        router.navigate(['/doors-windows/products']);
        return;
      }
      title.setTitle(`${c.name} · Amsidel Doors & Windows`);
    });
  }
}
