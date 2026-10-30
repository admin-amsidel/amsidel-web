/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { PrimeTemplate, TreeNode } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { OrganizationChartModule } from 'primeng/organizationchart';
import { Avatar } from '../avatar';
import { OrgNode } from '../people.service';
import { OrgBox } from './org-tree-build';

/** Zoom limits and step (1 = actual size). */
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.6;
const STEP = 0.1;

/**
 * Draws a reporting tree with PrimeNG OrganizationChart; photos where people have them, initials otherwise.
 * Zoom: the − / + buttons, Fit (the whole width on screen), or pinching with two fingers on a phone. A chart wider
 * than the screen opens fitted, so phones see all of it at once; tap the percentage for actual size again.
 */
@Component({
  selector: 'app-org-tree',
  imports: [OrganizationChartModule, PrimeTemplate, Avatar, ButtonModule, TooltipModule],
  template: `
    @if (value().length) {
      <div class="zoombar" role="toolbar" aria-label="Zoom the chart">
        <p-button icon="pi pi-search-minus" [text]="true" [rounded]="true" size="small" ariaLabel="Zoom out"
                  pTooltip="Zoom out" tooltipPosition="bottom" [disabled]="zoom() <= MIN" (onClick)="zoomBy(-STEP)" />
        <button type="button" class="pct" [attr.aria-label]="'Zoom ' + percent() + '%, tap for actual size'"
                title="Actual size" (click)="setZoom(1)">{{ percent() }}%</button>
        <p-button icon="pi pi-search-plus" [text]="true" [rounded]="true" size="small" ariaLabel="Zoom in"
                  pTooltip="Zoom in" tooltipPosition="bottom" [disabled]="zoom() >= MAX" (onClick)="zoomBy(STEP)" />
        <p-button label="Fit" icon="pi pi-arrows-h" [text]="true" size="small" ariaLabel="Fit the whole chart on screen"
                  (onClick)="fit()" />
      </div>
      <div #scroller class="scroller" (touchstart)="pinchStart($event)" (touchmove)="pinchMove($event)" (touchend)="pinchEnd()">
        <div #zoomer class="zoomer" [style.zoom]="zoom()">
        <p-organization-chart [value]="value()" [collapsible]="collapsible()">
          <ng-template let-node pTemplate="person">
            <button type="button" class="box" [class.box--me]="node.data.person.id === highlightId()"
                    [class.box--link]="linkable()" [disabled]="!linkable()" (click)="open.emit(node.data.person)">
              <app-avatar [name]="node.data.person.name" [employeeId]="node.data.person.id"
                          [photoVersion]="node.data.person.photoUpdatedAt" [photoPath]="node.data.person.photoPath" [size]="48" />
              <b>{{ node.data.person.name }}</b>
              <small class="empno">{{ node.data.person.empNumber }}</small>
              @if (node.data.person.designationName) {
                <span class="title">{{ node.data.person.designationName }}</span>
                <span class="lvl">L{{ node.data.person.levelCode }}</span>
              } @else {
                <span class="title muted">No designation</span>
              }
              @if (node.data.via) { <small class="via">reports to {{ node.data.via }}</small> }
              @if (showBrand() && node.data.person.brandCode) { <small>{{ node.data.person.brandCode }}</small> }
            </button>
          </ng-template>
          <ng-template let-node pTemplate="group">
            <div class="box box--group">
              <img src="brand/amsidel-mark.png" alt="" width="60" height="28" />
              <b>Amsidel Group</b>
            </div>
          </ng-template>
        </p-organization-chart>
        </div>
      </div>
    } @else {
      <p class="p-empty">{{ emptyText() }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .scroller { overflow-x: auto; padding: 4px 0 12px; touch-action: pan-x pan-y; }
    .zoombar { display: flex; align-items: center; justify-content: flex-end; gap: 2px; margin: -6px 0 6px; }
    .pct { min-width: 52px; padding: 4px 6px; border: 1px solid var(--line); border-radius: 14px; background: var(--bg);
      font: inherit; font-size: .78rem; font-variant-numeric: tabular-nums; color: var(--ink); cursor: pointer; }
    .pct:hover { border-color: var(--brass); }
    :host ::ng-deep .p-organizationchart { margin: 0 auto; width: max-content; min-width: 100%; }
    :host ::ng-deep .p-organizationchart-node { padding: 0; border: 0; background: transparent; }
    :host ::ng-deep .p-organizationchart-node-content { padding: 0; border: 0; background: transparent; }
    :host ::ng-deep .p-organizationchart-connector-down,
    :host ::ng-deep .p-organizationchart-connector-left,
    :host ::ng-deep .p-organizationchart-connector-right { border-color: var(--brass); }
    :host ::ng-deep .p-organizationchart-connector-down { background: var(--brass); }
    .box {
      display: grid; justify-items: center; gap: 4px; width: 176px; padding: 14px 10px 12px;
      background: var(--bg); border: 1px solid var(--line); border-top: 3px solid var(--brass); border-radius: 10px;
      font: inherit; color: var(--ink); text-align: center;
    }
    .box b { font-size: .9rem; line-height: 1.25; }
    .box .title { font-size: .78rem; color: var(--pine); line-height: 1.25; }
    .box small { font-size: .68rem; letter-spacing: .12em; color: var(--muted); }
    .box small.empno { margin-top: -3px; letter-spacing: .08em; font-variant-numeric: tabular-nums; }
    .box small.via { letter-spacing: 0; font-size: .72rem; color: var(--brass-dark); }
    .box--link { cursor: pointer; transition: border-color .2s, box-shadow .2s; }
    .box--link:hover { border-color: var(--brass); box-shadow: 0 6px 16px rgba(23,59,99,.12); }
    .box:disabled { cursor: default; }
    .box--me { border: 2px solid var(--brass); border-top-width: 3px; background: var(--accent-softer); box-shadow: 0 6px 18px rgba(47,128,214,.22); }
    .box--group { border-top-color: var(--brass); background: var(--dark); color: #fff; }
    .box--group img { height: 22px; width: auto; filter: brightness(0) invert(1); }
    /* phones: narrower boxes, so more of the line fits before scrolling sideways */
    @media (max-width: 760px) {
      .box { width: 136px; padding: 10px 6px 9px; }
      .box b { font-size: .82rem; }
      .box .title { font-size: .72rem; }
    }
  `,
})
export class OrgTree {
  readonly root = input<TreeNode<OrgBox> | null>(null);
  /** The person whose line this is, drawn in gold. */
  readonly highlightId = input<number | null>(null);
  /** Boxes can be clicked (opens that person). */
  readonly linkable = input(false);
  readonly collapsible = input(false);
  readonly showBrand = input(false);
  readonly emptyText = input('Nobody to show yet.');
  readonly open = output<OrgNode>();

  protected readonly value = computed(() => {
    const root = this.root();
    return root ? [root] : [];
  });

  protected readonly MIN = MIN_ZOOM;
  protected readonly MAX = MAX_ZOOM;
  protected readonly STEP = STEP;
  protected readonly zoom = signal(1);
  protected readonly percent = computed(() => Math.round(this.zoom() * 100));
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly zoomer = viewChild<ElementRef<HTMLElement>>('zoomer');
  private pinch: { distance: number; zoom: number } | null = null;

  constructor() {
    // a new chart: open it fitted when it is wider than the screen (phones), else at actual size
    effect(() => {
      if (!this.value().length || !this.scroller()) return;
      this.zoom.set(1);
      setTimeout(() => {
        const natural = this.naturalWidth();
        const room = this.room();
        if (natural && room && natural > room) this.zoom.set(clamp(room / natural, MIN_ZOOM, 1));
      });
    });
  }

  protected zoomBy(step: number): void {
    this.setZoom(Math.round((this.zoom() + step) * 10) / 10);
  }

  /** Changes the zoom and keeps the middle of what is on screen in the middle. */
  protected setZoom(next: number): void {
    const z = clamp(next, MIN_ZOOM, MAX_ZOOM);
    const el = this.scroller()?.nativeElement;
    if (!el || z === this.zoom()) {
      this.zoom.set(z);
      return;
    }
    const middle = (el.scrollLeft + el.clientWidth / 2) / (el.scrollWidth || 1);
    this.zoom.set(z);
    requestAnimationFrame(() => (el.scrollLeft = middle * el.scrollWidth - el.clientWidth / 2));
  }

  /** The whole width on screen (never larger than actual size). */
  protected fit(): void {
    const natural = this.naturalWidth();
    const room = this.room();
    if (natural && room) this.setZoom(clamp(room / natural, MIN_ZOOM, 1));
  }

  protected pinchStart(e: TouchEvent): void {
    if (e.touches.length === 2) this.pinch = { distance: distance(e.touches), zoom: this.zoom() };
  }

  protected pinchMove(e: TouchEvent): void {
    if (!this.pinch || e.touches.length !== 2) return;
    const z = clamp(this.pinch.zoom * (distance(e.touches) / this.pinch.distance), MIN_ZOOM, MAX_ZOOM);
    this.zoom.set(Math.round(z * 100) / 100);
  }

  protected pinchEnd(): void {
    this.pinch = null;
  }

  /** Width of the chart at actual size. */
  private naturalWidth(): number {
    const chart = this.zoomer()?.nativeElement.querySelector<HTMLElement>('.p-organizationchart-table, table');
    return chart ? chart.getBoundingClientRect().width / this.zoom() : 0;
  }

  private room(): number {
    const el = this.scroller()?.nativeElement;
    return el ? el.clientWidth - 8 : 0;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function distance(t: TouchList): number {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
}
