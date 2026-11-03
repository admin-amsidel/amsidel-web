/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../auth.service';
import { OrgNode, PeopleService } from '../people.service';
import { apiProblem, Brand } from '../portal.models';
import { StaffService } from '../staff.service';
import { OrgTree } from './org-tree';
import { forestToTree } from './org-tree-build';

/** The Brand picker's value for the group-level people (no brand). */
const GROUP_LEVEL = -1;

/**
 * One brand's reporting structure, most senior at the top. Owners and group admins pick the brand; everyone else
 * sees their own brand (and, unless an admin, only their own hierarchy). "Hierarchy of" narrows the chart to one
 * person: their line up to the top and everyone below them.
 */
@Component({
  selector: 'app-org-chart-page',
  imports: [FormsModule, OrgTree, MessageModule, SelectModule],
  template: `
    <div class="p-head">
      <div>
        <h1>Org chart</h1>
        <p>Who reports to whom{{ brandName() ? ' in ' + brandName() : '' }}{{ shown().length ? ' · ' + shown().length + ' people' : '' }}.
          Click a person to open their record.</p>
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    @for (loop of chart().loops; track loop.name) {
      <p-message severity="warn" styleClass="page-message">
        {{ loop.name }} reports to {{ loop.reportsTo }}, but {{ loop.reportsTo }} is below {{ loop.name }}, so the line goes round
        in a circle. {{ loop.name }} is shown at the top here; correct "Reports to" on their page.
      </p-message>
    }
    <section class="p-card">
      <div class="filters">
        @if (canPickBrand()) {
          <div class="pf">
            <label for="oc-brand">Brand</label>
            <p-select inputId="oc-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" appendTo="body"
                      [ngModel]="brandId()" (ngModelChange)="pickBrand($event)" />
          </div>
        }
        <div class="pf">
          <label for="oc-person">Hierarchy of</label>
          <p-select inputId="oc-person" [options]="personOptions()" optionLabel="label" optionValue="value" [filter]="true"
                    filterBy="label" [showClear]="true" placeholder="Everyone shown" appendTo="body"
                    [ngModel]="personId()" (ngModelChange)="personId.set($event ?? null)" />
        </div>
      </div>
      @if (loading()) {
        <p class="p-loading">Loading the org chart…</p>
      } @else {
        <app-org-tree [root]="chart().root" [linkable]="true" [collapsible]="true" [showBrand]="groupLevel()"
                      emptyText="Nobody has a reporting line here yet. Set 'Reports to' on each employee's page."
                      (open)="openPerson($event)" />
      }
    </section>
    <p class="note">Only people of this brand are shown; someone whose manager is in another brand sits at the top. Fold a
      branch with the arrow under a box. Zoom with − / +, Fit, or by pinching on a phone.</p>
  `,
  styles: `
    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 280px)); gap: 16px; margin-bottom: 16px; }
    .filters p-select { width: 100%; }
    .note { margin: 14px 4px 0; font-size: .84rem; color: var(--muted); }
    @media (max-width: 760px) { .filters { grid-template-columns: 1fr; gap: 10px; margin-bottom: 12px; } }
  `,
})
export class OrgChartPage implements OnInit {
  private readonly peopleService = inject(PeopleService);
  private readonly staff = inject(StaffService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly people = signal<OrgNode[]>([]);
  protected readonly brands = signal<Brand[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly brandId = signal<number | null>(null);
  protected readonly personId = signal<number | null>(null);
  protected readonly groupLevel = computed(() => this.canPickBrand() && this.brandId() === GROUP_LEVEL);

  /** Owners and group admins choose the brand; anyone else always sees their own. */
  protected readonly canPickBrand = computed(() => {
    const me = this.auth.user();
    return me?.role === 'OWNER' || me?.brandId == null;
  });

  protected readonly brandOptions = computed(() => [
    ...[...this.brands()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({ value: b.id, label: `${b.name}${b.active ? '' : ' (inactive)'}` })),
    { value: GROUP_LEVEL, label: 'Group (no brand)' },
  ]);

  protected readonly brandName = computed(() => {
    const id = this.brandId();
    if (!this.canPickBrand()) return this.auth.user()?.brandName ?? '';
    return id === GROUP_LEVEL ? 'the group' : (this.brands().find((b) => b.id === id)?.name ?? '');
  });

  protected readonly personOptions = computed(() =>
    [...this.people()].sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.id, label: `${p.name} · ${p.empNumber}` })),
  );

  /** Everyone loaded, or the chosen person's line up to the top and everyone below them. */
  protected readonly shown = computed(() => {
    const all = this.people();
    const id = this.personId();
    if (id == null || !all.some((p) => p.id === id)) return all;
    const byId = new Map(all.map((p) => [p.id, p]));
    const keep = new Set<number>();
    for (let p = byId.get(id); p && !keep.has(p.id); p = p.reportsToId != null ? byId.get(p.reportsToId) : undefined) keep.add(p.id);
    const todo = [id];
    while (todo.length) {
      const boss = todo.pop()!;
      for (const p of all) {
        if (p.reportsToId === boss && !keep.has(p.id)) {
          keep.add(p.id);
          todo.push(p.id);
        }
      }
    }
    return all.filter((p) => keep.has(p.id));
  });
  protected readonly chart = computed(() => forestToTree(this.shown()));

  ngOnInit(): void {
    if (!this.canPickBrand()) {
      this.load();
      return;
    }
    this.staff.brands().subscribe({
      next: (brands) => {
        this.brands.set(brands);
        // my own brand, else the first one A-Z
        this.brandId.set(this.auth.user()?.brandId ?? this.brandOptions()[0].value);
        this.load();
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }

  protected pickBrand(id: number): void {
    this.brandId.set(id);
    this.personId.set(null);
    this.load();
  }

  protected openPerson(p: OrgNode): void {
    this.router.navigate(['/portal/employees', p.id]);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    const id = this.brandId();
    this.peopleService.orgChart(this.canPickBrand() && id !== GROUP_LEVEL ? id : null).subscribe({
      next: (list) => {
        this.people.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }
}
