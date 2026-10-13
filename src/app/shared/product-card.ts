import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { categoryBySlug, Product } from '../data/products';

@Component({
  selector: 'app-product-card',
  imports: [RouterLink],
  template: `
    <a class="card" [routerLink]="['/doors-windows/product', product().slug]">
      <span class="card__media">
        <img [src]="product().image" [alt]="product().name" loading="lazy" width="400" height="500" />
        <span class="card__view">View details</span>
      </span>
      <span class="card__body">
        <span class="card__cat">{{ category()?.name }}</span>
        <span class="card__name">{{ product().name }}</span>
      </span>
    </a>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .card {
      display: grid; height: 100%; text-decoration: none; background: var(--bg);
      border: 1px solid var(--line); border-radius: 8px; overflow: hidden;
      transition: box-shadow .25s, border-color .25s, transform .25s;
    }
    .card:hover { box-shadow: var(--shadow); border-color: transparent; transform: translateY(-3px); }
    .card__media { position: relative; display: block; aspect-ratio: 4 / 5; background: var(--soft); overflow: hidden; }
    .card__media img { width: 100%; height: 100%; object-fit: contain; padding: 14px; transition: transform .4s; }
    .card:hover .card__media img { transform: scale(1.04); }
    .card__view {
      position: absolute; left: 50%; bottom: 14px; transform: translate(-50%, 10px); opacity: 0;
      background: var(--pine); color: #fff; font-size: .72rem; font-weight: 600; letter-spacing: .14em;
      text-transform: uppercase; padding: 8px 16px; border-radius: 40px; white-space: nowrap;
      transition: opacity .25s, transform .25s;
    }
    .card:hover .card__view, .card:focus-visible .card__view { opacity: 1; transform: translate(-50%, 0); }
    .card__body { display: grid; gap: 2px; padding: 16px 18px 18px; border-top: 1px solid var(--line); }
    .card__cat { font-size: .7rem; letter-spacing: .16em; text-transform: uppercase; color: var(--brass); font-weight: 600; }
    .card__name { font-family: var(--display); font-size: 1.15rem; color: var(--ink); }
  `,
})
export class ProductCard {
  readonly product = input.required<Product>();
  protected readonly category = computed(() => categoryBySlug(this.product().category));
}
