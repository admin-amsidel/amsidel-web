/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { starColour } from './stars';

/**
 * A rating input in half stars (0.5 to 5): the left half of a star gives .5, the right half the whole star.
 * Hovering previews the value; arrow keys move by half a star; the value shows next to the stars.
 * Works with ngModel.
 */
@Component({
  selector: 'app-star-input',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StarInput), multi: true }],
  template: `
    <span class="stars" role="slider" tabindex="0" [attr.aria-label]="ariaLabel()" aria-valuemin="0.5" aria-valuemax="5"
          [attr.aria-valuenow]="value()" [attr.aria-valuetext]="value() ? value() + ' out of 5' : 'Not rated'"
          [attr.aria-disabled]="disabled()" [class.disabled]="disabled()" [style.--c]="colour()"
          (mousemove)="hover($event)" (mouseleave)="preview.set(null)" (click)="pick($event)" (keydown)="key($event)" (blur)="touched()">
      <span class="row back">★★★★★</span>
      <span class="row fill" [style.width.%]="(shown() / 5) * 100">★★★★★</span>
    </span>
    <b class="num" [style.color]="shown() ? colour() : null">{{ shown() ? shown().toFixed(1) : '–' }}</b>
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 10px; }
    .stars { position: relative; display: inline-block; font-size: 1.7rem; line-height: 1; letter-spacing: 2px; cursor: pointer;
      user-select: none; border-radius: 4px; outline-offset: 3px; }
    .stars:focus-visible { outline: 2px solid var(--brass); }
    .stars.disabled { cursor: default; opacity: .6; }
    .row { white-space: nowrap; }
    .back { color: #dfe6ee; }
    .fill { position: absolute; left: 0; top: 0; overflow: hidden; color: var(--c); pointer-events: none; }
    .num { min-width: 2.2em; font-variant-numeric: tabular-nums; font-size: .95rem; }
  `,
})
export class StarInput implements ControlValueAccessor {
  readonly ariaLabel = input('Rating');

  protected readonly value = signal<number | null>(null);
  protected readonly preview = signal<number | null>(null);
  protected readonly disabled = signal(false);
  protected readonly shown = computed(() => this.preview() ?? this.value() ?? 0);
  protected readonly colour = computed(() => starColour(this.shown()));

  private onChange: (v: number | null) => void = () => undefined;
  protected touched: () => void = () => undefined;

  writeValue(v: number | string | null): void {
    const n = v === null || v === undefined || v === '' ? null : Number(v);
    this.value.set(n && n > 0 ? n : null);
  }

  registerOnChange(fn: (v: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.touched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected hover(e: MouseEvent): void {
    if (!this.disabled()) this.preview.set(this.at(e));
  }

  protected pick(e: MouseEvent): void {
    if (!this.disabled()) this.set(this.at(e));
  }

  protected key(e: KeyboardEvent): void {
    if (this.disabled()) return;
    const v = this.value() ?? 0;
    const next = { ArrowRight: v + 0.5, ArrowUp: v + 0.5, ArrowLeft: v - 0.5, ArrowDown: v - 0.5, Home: 0.5, End: 5 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    this.set(Math.min(5, Math.max(0.5, next)));
  }

  /** Half stars from where the pointer is over the five stars. */
  private at(e: MouseEvent): number {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - box.left, 0), box.width);
    return Math.min(5, Math.max(0.5, Math.ceil((x / box.width) * 10) / 2));
  }

  private set(v: number): void {
    this.value.set(v);
    this.preview.set(null);
    this.onChange(v);
  }
}
