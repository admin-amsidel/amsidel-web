import { Component, computed, input } from '@angular/core';

/**
 * A rating out of 5 as coloured stars (partly filled for half stars and averages such as 3.6): red at 1, amber around 3,
 * green at 5. Empty shows "Not rated".
 */
@Component({
  selector: 'app-stars',
  template: `
    @if (value() !== null && value() !== undefined) {
      <span class="stars" [style.--c]="colour()" [attr.aria-label]="label()" role="img">
        <span class="row back">★★★★★</span>
        <span class="row fill" [style.width.%]="(value()! / 5) * 100">★★★★★</span>
      </span>
      @if (showValue()) { <b class="num" [style.color]="colour()">{{ text() }}</b> }
    } @else {
      <span class="none">{{ empty() }}</span>
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 6px; vertical-align: middle; }
    .stars { position: relative; display: inline-block; font-size: var(--size, 1.05rem); line-height: 1; letter-spacing: 1px; }
    .row { white-space: nowrap; }
    .back { color: #e5e0d6; }
    .fill { position: absolute; left: 0; top: 0; overflow: hidden; color: var(--c); }
    .num { font-size: .85rem; font-variant-numeric: tabular-nums; }
    .none { font-size: .8rem; color: var(--muted); }
  `,
})
export class Stars {
  readonly value = input<number | null | undefined>(null);
  readonly showValue = input(true);
  readonly decimals = input(1);
  readonly empty = input('Not rated');

  protected readonly colour = computed(() => starColour(this.value() ?? 0));
  protected readonly label = computed(() => `${this.text()} out of 5`);
  /** 4 → "4" (decimals 0) or "4.0"; a half star always shows: 4.5. */
  protected readonly text = computed(() => {
    const v = Number(this.value() ?? 0);
    return Number.isInteger(v) ? v.toFixed(this.decimals()) : v.toFixed(1);
  });
}

/** Red (1) → amber (3) → green (5). */
export function starColour(v: number): string {
  if (v >= 4.5) return '#1f8f4e';
  if (v >= 3.5) return '#5aa13a';
  if (v >= 2.5) return '#d4a017';
  if (v >= 1.5) return '#e07b24';
  return '#d64545';
}
