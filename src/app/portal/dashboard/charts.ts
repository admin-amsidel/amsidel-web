/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, input } from '@angular/core';

/** The dashboard's chart colours: done or received, waiting, and what is still to come. */
export const CHART = { done: 'var(--brass)', waiting: 'var(--accent2)', rest: 'var(--accent-soft)', soft: 'var(--accent-line)' };

/** A ring showing how far along something is; the number in the middle. */
@Component({
  selector: 'app-gauge',
  template: `
    <svg viewBox="0 0 100 100" role="img" [attr.aria-label]="label()">
      <circle class="track" cx="50" cy="50" r="42" pathLength="100" />
      @if (shown() > 0) {
        <circle class="fill" cx="50" cy="50" r="42" pathLength="100" [attr.stroke-dasharray]="shown() + ' 100'" transform="rotate(-90 50 50)" />
      }
      <text x="50" y="50" text-anchor="middle" dominant-baseline="central">{{ text() }}</text>
    </svg>
  `,
  styles: `
    :host { display: block; width: var(--gauge, 92px); flex: none; }
    svg { display: block; width: 100%; height: auto; }
    circle { fill: none; stroke-width: 9; }
    .track { stroke: ${CHART.rest}; }
    .fill { stroke: ${CHART.done}; stroke-linecap: round; transition: stroke-dasharray .4s ease; }
    text { font: 700 19px var(--body); fill: var(--ink); }
    @media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
  `,
})
export class Gauge {
  /** 0 to 100; more is shown as a full ring. */
  readonly percent = input(0);
  readonly text = input('');
  readonly label = input.required<string>();
  protected readonly shown = computed(() => Math.max(0, Math.min(100, this.percent())));
}

export interface Column {
  key: string;
  label: string;
  value: number;
  /** The value in words, for the tip and for screen readers. */
  tip: string;
  /** The column the chart is about, with its value printed on top. */
  accent?: boolean;
  /** Printed on top of the column. */
  print?: string;
}

/** Columns from one baseline, with an optional target line; every column gives its value when pointed at or focused. */
@Component({
  selector: 'app-columns',
  template: `
    <div class="plot" role="list" [attr.aria-label]="label()">
      @if (targetAt() !== null) {
        <div class="lines"><div class="target" [style.bottom.%]="targetAt()"><span>{{ targetLabel() }}</span></div></div>
      }
      @for (c of data(); track c.key) {
        <div class="col" role="listitem" tabindex="0" [attr.aria-label]="c.tip">
          <span class="tip" aria-hidden="true">{{ c.tip }}</span>
          <div class="bar-area">
            @if (c.print) { <b class="print" [style.bottom.%]="height(c.value)" aria-hidden="true">{{ c.print }}</b> }
            @if (c.value > 0) { <span class="bar" [class.accent]="c.accent" [style.height.%]="height(c.value)"></span> }
          </div>
          <span class="day" [class.on]="c.accent" aria-hidden="true">{{ c.label }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .plot { position: relative; display: flex; gap: 4px; padding-top: 22px; }
    .col { position: relative; flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; border-radius: 6px; outline: none; }
    .col:hover, .col:focus-visible { background: var(--accent-softer); }
    .col:focus-visible { box-shadow: inset 0 0 0 2px var(--brass); }
    .bar-area { position: relative; width: 100%; height: var(--plot, 130px); display: flex; justify-content: center; align-items: flex-end; border-bottom: 1px solid var(--line); }
    .bar { display: block; width: min(24px, 70%); min-height: 3px; border-radius: 4px 4px 0 0; background: ${CHART.soft}; transition: height .4s ease; }
    .bar.accent { background: ${CHART.done}; }
    .print { position: absolute; left: 0; right: 0; margin-bottom: 3px; text-align: center; font-size: .76rem; font-weight: 700; color: var(--ink); white-space: nowrap; }
    .day { margin-top: 6px; font-size: .72rem; color: var(--muted); white-space: nowrap; }
    .day.on { color: var(--ink); font-weight: 700; }
    /* the same box as the bars, so a target of 9 sits where a bar of 9 ends */
    .lines { position: absolute; left: 0; right: 0; top: 22px; height: var(--plot, 130px); pointer-events: none; z-index: 1; }
    .target { position: absolute; left: 0; right: 0; height: 0; border-top: 1px solid var(--muted); }
    .target span { position: absolute; right: 0; bottom: 2px; padding: 0 3px; background: rgba(255,255,255,.85); border-radius: 3px; font-size: .68rem; color: var(--muted); white-space: nowrap; }
    .tip { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); z-index: 3; display: none; padding: 5px 8px; border-radius: 6px; background: var(--dark);
      color: #fff; font-size: .74rem; white-space: nowrap; pointer-events: none; }
    .col:nth-of-type(-n+2) .tip { left: 0; transform: none; }
    .col:last-of-type .tip, .col:nth-last-of-type(2) .tip { left: auto; right: 0; transform: none; }
    .col:hover .tip, .col:focus .tip { display: block; }
    @media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
  `,
})
export class Columns {
  readonly data = input<Column[]>([]);
  readonly label = input.required<string>();
  readonly target = input<number | null>(null);
  readonly targetLabel = input('');

  private readonly top = computed(() => {
    const most = Math.max(0, ...this.data().map((c) => c.value));
    return Math.max(most, this.target() ?? 0) * 1.05 || 1;
  });
  protected readonly targetAt = computed(() => {
    const t = this.target();
    return t ? (t / this.top()) * 100 : null;
  });

  protected height(value: number): number {
    return (value / this.top()) * 100;
  }
}

export interface Part {
  label: string;
  value: number;
  /** The value in words, printed in the legend. */
  text: string;
  color: string;
}

/** One whole split into parts, with the parts named and their values printed underneath. */
@Component({
  selector: 'app-split-bar',
  template: `
    <div class="bar" role="img" [attr.aria-label]="summary()">
      @for (p of drawn(); track p.label) {
        <span [style.flex-grow]="p.value" [style.background]="p.color" [title]="p.label + ': ' + p.text"></span>
      } @empty { <span class="none"></span> }
    </div>
    @if (legend()) {
      <ul class="legend" aria-hidden="true">
        @for (p of parts(); track p.label) {
          <li><i [style.background]="p.color"></i>{{ p.label }} <b>{{ p.text }}</b></li>
        }
      </ul>
    }
  `,
  styles: `
    .bar { display: flex; gap: 2px; height: 10px; }
    .bar span { flex: 1 1 0; min-width: 3px; border-radius: 3px; }
    .bar span:first-child { border-top-left-radius: 5px; border-bottom-left-radius: 5px; }
    .bar span:last-child { border-top-right-radius: 5px; border-bottom-right-radius: 5px; }
    .bar .none { background: ${CHART.rest}; border-radius: 5px; }
    .legend { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .8rem; color: var(--muted); }
    .legend li { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
    .legend i { width: 10px; height: 10px; border-radius: 3px; flex: none; }
    .legend b { color: var(--ink); font-weight: 600; }
  `,
})
export class SplitBar {
  readonly parts = input.required<Part[]>();
  readonly legend = input(true);
  protected readonly drawn = computed(() => this.parts().filter((p) => p.value > 0));
  protected readonly summary = computed(() => this.parts().map((p) => `${p.label} ${p.text}`).join(', '));
}
