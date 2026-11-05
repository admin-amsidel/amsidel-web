/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, input, signal, Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { SkeletonModule } from 'primeng/skeleton';

/** What the page needs to know about a part to draw its loader. */
export interface PartState {
  readonly loading: Signal<boolean>;
  readonly failed: Signal<boolean>;
  readonly loaded: Signal<boolean>;
  readonly has: Signal<boolean>;
  retry(): void;
}

/**
 * One section's data on the Overview page, loaded on its own. While it loads again the old figures stay on screen; a
 * slower answer to an older question is dropped.
 */
export class Part<T> implements PartState {
  readonly value = signal<T | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);
  /** It has answered at least once. */
  readonly loaded = signal(false);
  readonly has = computed(() => this.value() !== null);

  private asked = 0;
  private source: (() => Observable<T>) | null = null;

  load(source: () => Observable<T>): void {
    this.source = source;
    const asked = ++this.asked;
    this.loading.set(true);
    this.failed.set(false);
    source().subscribe({
      next: (v) => {
        if (asked !== this.asked) return;
        this.value.set(v ?? null);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: () => {
        if (asked !== this.asked) return;
        this.loaded.set(true);
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  retry(): void {
    if (this.source) this.load(this.source);
  }
}

/**
 * Stands in for a section's figures until they come: a small placeholder the shape of the tile or card, or a Retry that
 * touches only this section if they could not be read.
 */
@Component({
  selector: 'app-part-loader',
  imports: [SkeletonModule],
  template: `
    @if (part().failed()) {
      <div class="fail" role="alert">
        <i class="pi pi-exclamation-circle" aria-hidden="true"></i>
        <span>Could not load{{ label() ? ' ' + label() : '' }}.</span>
        <button type="button" (click)="part().retry()">Retry</button>
      </div>
    } @else {
      <div class="wait" role="status" [attr.aria-label]="'Loading ' + label()">
        @switch (kind()) {
          @case ('tile') {
            <p-skeleton shape="circle" size="var(--gauge, 72px)" />
            <p-skeleton width="70%" height="14px" />
            <p-skeleton width="90%" height="11px" />
          }
          @case ('chart') {
            <div class="bars" aria-hidden="true">
              @for (h of bars; track $index) { <p-skeleton [height]="h + '%'" width="100%" /> }
            </div>
          }
          @default {
            @for (w of lines(); track $index) { <p-skeleton [width]="w + '%'" height="13px" /> }
          }
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; width: 100%; }
    .wait { display: grid; gap: 9px; }
    .bars { display: flex; align-items: flex-end; gap: 10px; height: 150px; }
    .bars p-skeleton { flex: 1 1 0; display: flex; align-items: flex-end; height: 100%; }
    .fail { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 0; font-size: .8rem; color: var(--muted); }
    .fail i { color: #b3261e; }
    .fail button { padding: 0; border: 0; background: none; color: var(--brass-dark); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
    .fail button:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
  `,
})
export class PartLoader {
  readonly part = input.required<PartState>();
  readonly kind = input<'tile' | 'chart' | 'lines'>('lines');
  readonly label = input('');
  readonly rows = input(3);
  protected readonly bars = [62, 80, 45, 70, 30, 18, 12];
  protected readonly lines = computed(() => Array.from({ length: this.rows() }, (_, i) => [100, 82, 92, 70][i % 4]));
}
