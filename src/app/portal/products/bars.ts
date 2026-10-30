/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, input } from '@angular/core';
import { rupeesRound } from '../payroll/payroll.models';

export interface Bar {
  label: string;
  value: number;
  /** Small text under the label (e.g. 3 bills · 40 pieces). */
  sub?: string;
}

/** A ranked list as horizontal bars (largest first), each with its share of the total. Plain CSS, no chart library. */
@Component({
  selector: 'app-bars',
  template: `
    @if (rows().length) {
      <ol class="bars" [attr.aria-label]="label()">
        @for (r of rows(); track r.label) {
          <li>
            <div class="top"><span class="name" [title]="r.label">{{ r.label }}</span><b>{{ money(r.value) }}</b></div>
            <div class="track"><span class="fill" [style.width.%]="r.width" [style.background]="color()"></span></div>
            <small class="muted">{{ r.share }}% of {{ money(total()) }}{{ r.sub ? ' · ' + r.sub : '' }}</small>
          </li>
        }
      </ol>
      @if (more()) { <p class="muted more">and {{ more() }} more</p> }
    } @else {
      <p class="p-empty">{{ empty() }}</p>
    }
  `,
  styles: `
    .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
    .top { display: flex; justify-content: space-between; gap: 12px; font-size: .88rem; }
    .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .top b { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .track { height: 8px; border-radius: 6px; background: #e8f0f9; margin: 5px 0 3px; overflow: hidden; }
    .fill { display: block; height: 100%; border-radius: 6px; min-width: 3px; transition: width .4s ease; }
    small { font-size: .74rem; }
    .more { margin: 10px 0 0; font-size: .8rem; }
  `,
})
export class Bars {
  readonly data = input<Bar[]>([]);
  readonly label = input('Chart');
  readonly color = input('#2f80d6');
  readonly limit = input(10);
  readonly empty = input('Nothing in this period.');
  protected readonly money = rupeesRound;

  protected readonly total = computed(() => this.data().reduce((s, b) => s + Math.max(0, b.value), 0));
  protected readonly rows = computed(() => {
    const sorted = [...this.data()].filter((b) => b.value > 0).sort((a, b) => b.value - a.value).slice(0, this.limit());
    const max = sorted[0]?.value || 1;
    const total = this.total() || 1;
    return sorted.map((b) => ({ ...b, width: (b.value / max) * 100, share: Math.round((b.value / total) * 1000) / 10 }));
  });
  protected readonly more = computed(() => Math.max(0, this.data().filter((b) => b.value > 0).length - this.limit()));
}
