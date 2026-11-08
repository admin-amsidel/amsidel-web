/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { AuthService } from '../auth.service';
import { bytesText, StorageService, StorageSummary } from '../pages/storage.service';
import { zoneDateTime } from '../portal-time';

/** The Overview's view of storage, loading on its own: how full the database is and what takes the space. */
@Component({
  selector: 'app-storage-card',
  imports: [RouterLink, SkeletonModule],
  template: `
    <section class="p-card card">
      <div class="head">
        <h2><i class="pi pi-database" aria-hidden="true"></i> Storage</h2>
        @if (auth.can('STORAGE_USAGE')) { <a routerLink="/portal/admin/storage">Manage files <i class="pi pi-arrow-right" aria-hidden="true"></i></a> }
      </div>
      @if (s(); as v) {
        @if (v.database?.available) {
          <div class="line"><b>{{ size(v.database!.usedBytes) }}</b> of {{ size(v.database!.maxBytes) }} used ({{ v.database!.percent }}%)</div>
          <div class="meter" [class.warn]="v.database!.percent >= 70" [class.bad]="v.database!.percent >= 90" role="img"
               [attr.aria-label]="'Database ' + v.database!.percent + ' percent full'"><span [style.width.%]="v.database!.percent"></span></div>
        }
        <div class="facts">
          <span><b>{{ v.files }}</b> files, {{ size(v.bytes) }}</span>
          <span><b>{{ v.filesThisMonth }}</b> added this month, {{ size(v.bytesThisMonth) }}</span>
          @if (v.byCategory.length) { <span>Largest: <b>{{ v.byCategory[0].label }}</b>, {{ size(v.byCategory[0].bytes) }}</span> }
        </div>
        <small class="updated">Updated {{ when(v.updatedAt) }}@if (v.nextUpdateAt) { · next {{ when(v.nextUpdateAt) }} }</small>
      } @else if (failed()) {
        <p class="muted">Could not load the figures. <button type="button" class="retry" (click)="load()">Retry</button></p>
      } @else {
        <div role="status" aria-label="Loading storage"><p-skeleton height="12px" styleClass="sk" /><p-skeleton width="70%" /></div>
      }
    </section>
  `,
  styles: `
    .updated { display: block; margin-top: 6px; font-size: .76rem; color: var(--muted); }
    .card { margin-bottom: 16px; }
    .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .head h2 { margin: 0 0 6px; font-size: 1.05rem; }
    .head a { font-size: .86rem; font-weight: 600; color: var(--brand-deep); text-decoration: none; white-space: nowrap; }
    .line { font-size: .9rem; }
    .meter { height: 10px; border-radius: 5px; background: var(--line); overflow: hidden; margin: 6px 0 10px; }
    .meter span { display: block; height: 100%; background: var(--brass); }
    .meter.warn span { background: #d98a1e; }
    .meter.bad span { background: #c93c3c; }
    .facts { display: flex; gap: 6px 22px; flex-wrap: wrap; font-size: .86rem; color: var(--muted); }
    .facts b { color: var(--pine); }
    .retry { background: none; border: 0; padding: 0; color: var(--brand-deep); cursor: pointer; font: inherit; }
    :host ::ng-deep .sk { margin-bottom: 8px; }
  `,
})
export class StorageCard implements OnInit {
  /** 9 Nov, 8:00 AM, in the person's time zone. */
  protected when(at: string): string {
    return zoneDateTime(at, this.auth.zone(), false) ?? "";
  }

  private readonly api = inject(StorageService);
  protected readonly auth = inject(AuthService);
  protected readonly size = bytesText;
  protected readonly s = signal<StorageSummary | null>(null);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.api.summary(false, true).subscribe({ next: (v) => this.s.set(v), error: () => this.failed.set(true) });
  }
}
