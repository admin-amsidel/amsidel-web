/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { apiProblem } from '../portal.models';
import { TravelClaim, TravelService, TravelStop } from './travel.service';

const W = 640;
const H = 300;
const PAD = 44;
/** Room under the drawing for the scale bar. */
const BOTTOM = 70;

interface Dot { x: number; y: number; s: TravelStop; mark: string; /** The end, drawn beside the start it came back to. */ shared: boolean; }

/**
 * An outline of a GPS trip: its points joined in order, drawn to scale from their coordinates with north up, and a km scale.
 * Not a street map: no roads or places, only where the trip went. Locations changed by hand show their GPS point, dashed.
 */
@Component({
  selector: 'app-travel-route-map',
  template: `
    @if (dots().length) {
      <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" role="img" [attr.aria-label]="summary()" class="map">
        <rect x="0" y="0" [attr.width]="w" [attr.height]="h" rx="10" class="ground" />
        @for (g of grid(); track g) { <line [attr.x1]="g" y1="0" [attr.x2]="g" [attr.y2]="h" class="grid" /> }
        @for (g of gridY(); track g) { <line x1="0" [attr.y1]="g" [attr.x2]="w" [attr.y2]="g" class="grid" /> }
        @for (o of moved(); track o.s.sequence) {
          <line [attr.x1]="o.ox" [attr.y1]="o.oy" [attr.x2]="o.x" [attr.y2]="o.y" class="moved" />
          <circle [attr.cx]="o.ox" [attr.cy]="o.oy" r="5" class="gps"><title>GPS location of {{ o.mark }}</title></circle>
        }
        <polyline [attr.points]="line()" class="path" />
        @for (a of arrows(); track $index) {
          <polygon [attr.points]="a" class="arrow" />
        }
        @for (d of dots(); track d.s.sequence) {
          <g [attr.transform]="'translate(' + d.x + ',' + d.y + ')'">
            <circle r="12" [class]="'pt ' + d.s.kind.toLowerCase()" />
            <text y="4" class="pt-t">{{ d.mark }}</text>
            @if (d.s.label && !d.shared) { <text [attr.y]="-18" class="lbl">{{ short(d.s.label) }}</text> }
          </g>
        }
        <g [attr.transform]="'translate(' + (w - 34) + ',30)'"><path d="M0 -14 L6 4 L0 0 L-6 4 Z" class="north" /><text y="18" class="n-t">N</text></g>
        @if (scale(); as sc) {
          <g [attr.transform]="'translate(' + 16 + ',' + (h - 18) + ')'">
            <line x1="0" y1="0" [attr.x2]="sc.px" y2="0" class="bar" /><line x1="0" y1="-4" x2="0" y2="4" class="bar" /><line [attr.x1]="sc.px" y1="-4" [attr.x2]="sc.px" y2="4" class="bar" />
            <text [attr.x]="sc.px + 6" y="4" class="lbl start">{{ sc.label }}</text>
          </g>
        }
      </svg>
      <p class="note">Outline from the GPS points, north up, roads not shown.@if (backHome()) { Points side by side are at the same place. }@if (moved().length) { Dashed: a location changed by hand, from its GPS point. }@if (farOriginals()) { {{ farOriginals() === 1 ? 'One GPS location' : farOriginals() + ' GPS locations' }} changed by hand {{ farOriginals() === 1 ? 'was' : 'were' }} far from the trip and {{ farOriginals() === 1 ? 'is' : 'are' }} not drawn (see the list). }</p>
    }
  `,
  styles: `
    .map { width: 100%; height: auto; max-width: 100%; display: block; }
    .ground { fill: var(--accent-softer); stroke: var(--line); }
    .grid { stroke: var(--line); stroke-width: 1; opacity: .7; }
    .path { fill: none; stroke: var(--brass); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
    .arrow { fill: var(--brass); }
    .moved { stroke: #b45309; stroke-width: 1.5; stroke-dasharray: 4 3; }
    .gps { fill: #fff; stroke: #b45309; stroke-width: 1.5; stroke-dasharray: 2 2; }
    .pt { stroke: #fff; stroke-width: 2; fill: var(--brass-dark); }
    .pt.start { fill: #1f7a45; } .pt.end { fill: #b3261e; }
    .pt-t { fill: #fff; font-size: 11px; font-weight: 700; text-anchor: middle; }
    .lbl { fill: var(--ink); font-size: 11px; text-anchor: middle; paint-order: stroke; stroke: var(--accent-softer); stroke-width: 3px; }
    .lbl.start { text-anchor: start; }
    .north { fill: var(--muted); } .n-t { fill: var(--muted); font-size: 10px; font-weight: 700; text-anchor: middle; }
    .bar { stroke: var(--ink); stroke-width: 1.5; }
    .note { margin: 6px 0 0; font-size: .78rem; color: var(--muted); }
  `,
})
export class TravelRouteMap {
  readonly stops = input.required<TravelStop[]>();
  protected readonly w = W;
  protected readonly h = H;

  /**
   * A GPS point changed by hand is drawn only when it is near the trip: one far away (a phone that read the wrong place)
   * would shrink the trip to a dot. Near: within twice the trip's size, and at least 5 km.
   */
  private readonly nearOriginals = computed(() => {
    const st = this.stops();
    let size = 0;
    for (const a of st) for (const b of st) size = Math.max(size, kmBetween(a.latitude, a.longitude, b.latitude, b.longitude));
    const limit = Math.max(5, size * 2);
    return new Set(st.filter((s) => s.originalLatitude !== null && kmBetween(s.latitude, s.longitude, s.originalLatitude, s.originalLongitude!) <= limit).map((s) => s.sequence));
  });
  protected readonly farOriginals = computed(() => this.stops().filter((s) => s.originalLatitude !== null && !this.nearOriginals().has(s.sequence)).length);

  /** Degrees to a flat plane (km), scaled to fit with the same scale both ways. */
  private readonly frame = computed(() => {
    const near = this.nearOriginals();
    const pts = this.stops().flatMap((s) => [[s.latitude, s.longitude], ...(near.has(s.sequence) ? [[s.originalLatitude!, s.originalLongitude!]] : [])]);
    if (!pts.length) return null;
    const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const km = (lat: number, lng: number) => [lng * 111.32 * k, lat * 110.57];
    const xy = pts.map((p) => km(p[0], p[1]));
    const minX = Math.min(...xy.map((p) => p[0])), maxX = Math.max(...xy.map((p) => p[0]));
    const minY = Math.min(...xy.map((p) => p[1])), maxY = Math.max(...xy.map((p) => p[1]));
    const spanX = Math.max(maxX - minX, 0.05), spanY = Math.max(maxY - minY, 0.05);
    const s = Math.min((W - 2 * PAD) / spanX, (H - PAD - BOTTOM) / spanY);
    const offX = (W - spanX * s) / 2, offY = BOTTOM + (H - PAD - BOTTOM - spanY * s) / 2;
    const at = (lat: number, lng: number) => { const [x, y] = km(lat, lng); return { x: offX + (x - minX) * s, y: H - (offY + (y - minY) * s) }; };
    return { at, pxPerKm: s };
  });

  protected readonly dots = computed<Dot[]>(() => {
    const f = this.frame();
    if (!f) return [];
    let n = 0;
    const dots: Dot[] = this.stops().map((s) => ({ ...f.at(s.latitude, s.longitude), s, mark: s.kind === 'START' ? 'S' : s.kind === 'END' ? 'E' : String(++n), shared: false }));
    // points at the same place (back at the start, a second visit) sit side by side instead of hiding each other
    for (let i = 1; i < dots.length; i++) {
      const home = { x: dots[i].x, y: dots[i].y };
      const stack = dots.slice(0, i).filter((d) => Math.hypot(d.x - home.x, d.y - home.y) < 22 || (d.shared && Math.abs(d.y - home.y) < 1 && d.x > home.x - 22 && d.x < home.x + 24 * i));
      if (stack.length) {
        dots[i].x = Math.max(...stack.map((d) => d.x)) + 24;
        dots[i].y = stack[0].y;
        dots[i].shared = true;
      }
    }
    return dots;
  });
  protected readonly moved = computed(() => {
    const f = this.frame();
    const near = this.nearOriginals();
    return f ? this.dots().filter((d) => near.has(d.s.sequence)).map((d) => { const o = f.at(d.s.originalLatitude!, d.s.originalLongitude!); return { ...d, ox: o.x, oy: o.y }; }) : [];
  });
  protected readonly backHome = computed(() => this.dots().some((d) => d.shared));
  protected readonly line = computed(() => this.dots().map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' '));
  /** A small arrow halfway along each leg, pointing the way the trip went. */
  protected readonly arrows = computed(() => {
    const d = this.dots();
    const out: string[] = [];
    for (let i = 1; i < d.length; i++) {
      const dx = d[i].x - d[i - 1].x, dy = d[i].y - d[i - 1].y, len = Math.hypot(dx, dy);
      if (len < 40) continue;
      const ux = dx / len, uy = dy / len, mx = d[i - 1].x + dx / 2, my = d[i - 1].y + dy / 2;
      out.push(`${mx + ux * 7},${my + uy * 7} ${mx - ux * 5 - uy * 5},${my - uy * 5 + ux * 5} ${mx - ux * 5 + uy * 5},${my - uy * 5 - ux * 5}`);
    }
    return out;
  });
  protected readonly grid = computed(() => Array.from({ length: 7 }, (_, i) => Math.round(((i + 1) * W) / 8)));
  protected readonly gridY = computed(() => Array.from({ length: 3 }, (_, i) => Math.round(((i + 1) * H) / 4)));
  /** A round distance about a fifth of the width. */
  protected readonly scale = computed(() => {
    const f = this.frame();
    if (!f) return null;
    const target = W / 5 / f.pxPerKm;
    const steps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    const km = steps.find((x) => x >= target) ?? 500;
    return { px: km * f.pxPerKm, label: km < 1 ? `${km * 1000} m` : `${km} km` };
  });
  protected readonly summary = computed(() => 'Trip outline: ' + this.dots().map((d) => `${d.mark}${d.s.label ? ' ' + d.s.label : ''}`).join(', then '));

  protected short(t: string): string { return t.length > 26 ? t.slice(0, 25) + '…' : t; }
}

/**
 * The trip's points as a list with the outline above. With the Change stop locations tick (and while the trip may still
 * change), each point's coordinates can be changed: paste them as "10.12345, 76.30000", e.g. from Google Maps.
 */
@Component({
  selector: 'app-travel-stops',
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule, TravelRouteMap],
  template: `
    <app-travel-route-map [stops]="claim().stops" />
    <ol class="stops">
      @for (s of claim().stops; track s.sequence) {
        <li>
          <div class="line">
            <span><b>{{ s.kind === 'START' ? 'Start' : s.kind === 'END' ? 'End' : 'Stop ' + (s.sequence - 1) }}</b> {{ s.label || '' }}</span>
            @if (claim().canEditStops && editing() !== s.sequence) {
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change the location of ' + (s.label || 'this point')" (onClick)="edit(s)" />
            }
          </div>
          <small class="muted">{{ s.at | date: 'd MMM, h:mm a' }} ·
            <a [href]="'https://www.google.com/maps?q=' + s.latitude + ',' + s.longitude" target="_blank" rel="noopener">{{ s.latitude.toFixed(5) }}, {{ s.longitude.toFixed(5) }}</a>
            @if (s.accuracy) { · ±{{ s.accuracy.toFixed(0) }} m }</small>
          @if (s.originalLatitude !== null) {
            <small class="changed">Changed by {{ s.editedByName }}, {{ s.editedAt | date: 'd MMM, h:mm a' }} · GPS was {{ s.originalLatitude.toFixed(5) }}, {{ s.originalLongitude!.toFixed(5) }}</small>
          }
          @if (editing() === s.sequence) {
            <div class="edit">
              <div class="pf"><label [for]="'st-c-' + s.sequence">Coordinates (latitude, longitude)</label>
                <input pInputText [id]="'st-c-' + s.sequence" placeholder="10.12345, 76.30000" [ngModel]="coords()" (ngModelChange)="coords.set($event)" /></div>
              <div class="pf"><label [for]="'st-l-' + s.sequence">Place</label>
                <input pInputText [id]="'st-l-' + s.sequence" maxlength="200" [ngModel]="label()" (ngModelChange)="label.set($event)" /></div>
              <div class="acts">
                <p-button label="Save" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="save(s)" />
                <p-button label="Cancel" size="small" [text]="true" (onClick)="editing.set(null)" />
              </div>
              @if (error()) { <small class="err">{{ error() }}</small> }
            </div>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    .stops { margin: 10px 0 0; padding-left: 20px; display: grid; gap: 6px; font-size: .9rem; }
    .stops small { display: block; }
    .line { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .muted { color: var(--muted); } .changed { color: #b45309; }
    .edit { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px 12px; margin: 6px 0 4px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; }
    .edit .acts { grid-column: 1 / -1; display: flex; gap: 6px; }
    .edit input { width: 100%; }
    .err { grid-column: 1 / -1; color: #b3261e; }
    @media (max-width: 520px) { .edit { grid-template-columns: 1fr; } }
  `,
})
export class TravelStops {
  private readonly api = inject(TravelService);
  private readonly toast = inject(MessageService);
  readonly claim = input.required<TravelClaim>();
  readonly changed = output<TravelClaim>();
  protected readonly editing = signal<number | null>(null);
  protected readonly coords = signal('');
  protected readonly label = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected edit(s: TravelStop): void {
    this.error.set('');
    this.coords.set(`${s.latitude.toFixed(6)}, ${s.longitude.toFixed(6)}`);
    this.label.set(s.label ?? '');
    this.editing.set(s.sequence);
  }

  protected save(s: TravelStop): void {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(this.coords());
    if (!m) {
      this.error.set('Give the latitude and longitude, e.g. 10.12345, 76.30000');
      return;
    }
    this.busy.set(true);
    this.api.editStop(this.claim().id, s.sequence, { latitude: Number(m[1]), longitude: Number(m[2]), label: this.label() }).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.editing.set(null);
        this.toast.add({ severity: 'success', summary: 'Location changed', detail: c.shortestKm !== null ? `Route now ${c.shortestKm}–${c.longestKm} km` : c.code });
        this.changed.emit(c);
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.error.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }
}

/** Along the earth's surface, in km. */
function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
