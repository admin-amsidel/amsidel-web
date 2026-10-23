import { Component, computed, inject, Injectable, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { Observable, of, shareReplay, tap } from 'rxjs';
import { BrandRef } from './trade.models';
import { TradeService } from './trade.service';

const KEY = 'amsidel.products.brand';

/**
 * The brand the product portal shows: one brand, or all of mine (null). People of one brand only ever have theirs;
 * owners pick, and the choice is remembered on this device.
 */
@Injectable({ providedIn: 'root' })
export class TradeBrand {
  private readonly trade = inject(TradeService);
  readonly brands = signal<BrandRef[]>([]);
  readonly selected = signal<number | null>(read());
  private loading: Observable<BrandRef[]> | null = null;

  /** One brand chosen, or the only one I have. */
  readonly brandId = computed(() => this.selected() ?? (this.brands().length === 1 ? this.brands()[0].id : null));
  readonly many = computed(() => this.brands().length > 1);

  load(): Observable<BrandRef[]> {
    if (this.brands().length) return of(this.brands());
    this.loading ??= this.trade.brands().pipe(
      tap((list) => {
        this.brands.set(list);
        // a remembered brand I no longer have: back to all
        if (this.selected() && !list.some((b) => b.id === this.selected())) this.select(null);
      }),
      shareReplay(1),
    );
    return this.loading;
  }

  select(id: number | null): void {
    this.selected.set(id);
    try {
      if (id) localStorage.setItem(KEY, String(id));
      else localStorage.removeItem(KEY);
    } catch {
      /* not remembered */
    }
  }

  code(id: number | null): string {
    return this.brands().find((b) => b.id === id)?.code ?? '';
  }
}

function read(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** The brand chooser in a page's header; hidden for people of one brand. */
@Component({
  selector: 'app-brand-pick',
  imports: [FormsModule, SelectModule],
  template: `
    @if (brand.many()) {
      <p-select [options]="options()" optionLabel="label" optionValue="value" ariaLabel="Brand" styleClass="brand-pick"
                [ngModel]="brand.selected()" (ngModelChange)="pick($event)" />
    }
  `,
  styles: `:host ::ng-deep .brand-pick { min-width: 200px; }`,
})
export class BrandPick {
  protected readonly brand = inject(TradeBrand);
  readonly changed = output<number | null>();
  protected readonly options = computed(() => [
    { label: 'All brands', value: null },
    ...this.brand.brands().map((b) => ({ label: `${b.name} (${b.code})`, value: b.id })),
  ]);

  constructor() {
    this.brand.load().subscribe({ error: () => undefined });
  }

  protected pick(id: number | null): void {
    this.brand.select(id);
    this.changed.emit(id);
  }
}
