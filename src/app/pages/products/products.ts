import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CATEGORIES, PRODUCTS } from '../../data/products';
import { ProductCard } from '../../shared/product-card';

/** All products, filterable by category via the `?type=` query parameter. */
@Component({
  selector: 'app-products',
  imports: [RouterLink, ProductCard],
  template: `
    <section class="page-banner" style="background-image: url('images/hero/hero-2.webp')">
      <div class="container">
        <ol class="crumbs">
          <li><a routerLink="/doors-windows">Home</a></li>
          <li>Products</li>
        </ol>
        <h1>Our Products</h1>
        <p>{{ total }} designs across ten product families. Every one can be made to your sizes and finish.</p>
      </div>
    </section>

    <section class="section">
      <div class="container layout">
        <aside class="filters" aria-label="Product categories">
          <p class="kicker">Categories</p>
          <ul>
            <li>
              <a routerLink="." [queryParams]="{}" [class.is-active]="!type()">
                All products <span>{{ total }}</span>
              </a>
            </li>
            @for (c of categories; track c.slug) {
              <li>
                <a routerLink="." [queryParams]="{ type: c.slug }" [class.is-active]="type() === c.slug">
                  {{ c.name }} <span>{{ count(c.slug) }}</span>
                </a>
              </li>
            }
          </ul>
        </aside>

        <div>
          <div class="results-head">
            <p>
              Showing <strong>{{ list().length }}</strong>
              {{ list().length === 1 ? 'design' : 'designs' }}
              @if (active(); as c) { in <strong>{{ c.name }}</strong> }
            </p>
            @if (active(); as c) {
              <a class="more" [routerLink]="['/doors-windows/category', c.slug]">About {{ c.short }} →</a>
            }
          </div>
          <div class="grid">
            @for (p of list(); track p.slug) {
              <app-product-card [product]="p" />
            }
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 260px 1fr; gap: 48px; align-items: start; }
    .filters { position: sticky; top: calc(var(--header-h) + 24px); }
    .filters ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
    .filters a {
      display: flex; justify-content: space-between; gap: 12px; padding: 12px 4px;
      border-bottom: 1px solid var(--line); text-decoration: none; font-weight: 500; transition: color .2s, padding .2s;
    }
    .filters a span { color: var(--muted); font-size: .85rem; }
    .filters a:hover { color: var(--brass-dark); padding-left: 8px; }
    .filters a.is-active { color: var(--brass-dark); font-weight: 700; padding-left: 8px; }
    .results-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: center; margin-bottom: 24px; }
    .results-head p { margin: 0; color: var(--muted); }
    .more { color: var(--brass-dark); font-weight: 600; text-decoration: none; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    @media (max-width: 1080px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 860px) {
      .layout { grid-template-columns: 1fr; gap: 28px; }
      .filters { position: static; }
      .filters ul { display: flex; gap: 8px; overflow-x: auto; border: 0; padding-bottom: 6px; }
      .filters li { flex: none; }
      .filters a { border: 1px solid var(--line); border-radius: 40px; padding: 8px 16px; white-space: nowrap; }
      .filters a:hover, .filters a.is-active { padding-left: 16px; border-color: var(--brass); }
    }
    @media (max-width: 560px) { .grid { gap: 14px; } }
  `,
})
export class Products {
  /** Bound from the `?type=` query parameter. */
  readonly type = input<string>();

  protected readonly categories = CATEGORIES;
  protected readonly total = PRODUCTS.length;
  protected readonly active = computed(() => CATEGORIES.find((c) => c.slug === this.type()));
  protected readonly list = computed(() => {
    const t = this.active()?.slug;
    return t ? PRODUCTS.filter((p) => p.category === t) : PRODUCTS;
  });

  protected count(slug: string): number {
    return PRODUCTS.filter((p) => p.category === slug).length;
  }
}
