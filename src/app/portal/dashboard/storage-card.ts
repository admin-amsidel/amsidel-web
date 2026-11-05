/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { bytesText, StorageService, StorageSummary } from '../pages/storage.service';

/** The Overview's view of storage, loading on its own: how full the database is and what takes the space. */
@Component({
  selector: 'app-storage-card',
  imports: [RouterLink, SkeletonModule],
  template: `
    <section class="p-card card">
      <div class="head">
        <h2><i class="pi pi-database" aria-hidden="true"></i> Storage</h2>
        <a routerLink="/portal/admin/storage">Manage files <i class="pi pi-arrow-right" aria-hidden="true"></i></a>
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
      } @else if (failed()) {
        <p class="muted">Could not load the figures. <button type="button" class="retry" (click)="load()">Retry</button></p>
      } @else {
        <div role="status" aria-label="Loading storage"><p-skeleton height="12px" styleClass="sk" /><p-skeleton width="70%" /></div>
      }
    </section>
  `,
  styles: `
    .card { margin-bottom: 16px; }
    .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .head h2 { margin: 0 0 6px; font-size: 1.05rem; }
    .head a { font-size: .86rem; font-weight: 600; color: #1d5fa3; text-decoration: none; white-space: nowrap; }
    .line { font-size: .9rem; }
    .meter { height: 10px; border-radius: 5px; background: var(--line); overflow: hidden; margin: 6px 0 10px; }
    .meter span { display: block; height: 100%; background: #2f6fe0; }
    .meter.warn span { background: #d98a1e; }
    .meter.bad span { background: #c93c3c; }
    .facts { display: flex; gap: 6px 22px; flex-wrap: wrap; font-size: .86rem; color: var(--muted); }
    .facts b { color: var(--pine); }
    .retry { background: none; border: 0; padding: 0; color: #1d5fa3; cursor: pointer; font: inherit; }
    :host ::ng-deep .sk { margin-bottom: 8px; }
  `,
})
export class StorageCard implements OnInit {
  private readonly api = inject(StorageService);
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
