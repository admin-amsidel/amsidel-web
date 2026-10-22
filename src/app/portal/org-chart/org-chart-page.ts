import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageModule } from 'primeng/message';
import { OrgNode, PeopleService } from '../people.service';
import { apiProblem } from '../portal.models';
import { OrgTree } from './org-tree';
import { forestToTree } from './org-tree-build';

/** Owners and admins: the whole reporting structure, most senior at the top. */
@Component({
  selector: 'app-org-chart-page',
  imports: [OrgTree, MessageModule],
  template: `
    <div class="p-head">
      <div>
        <h1>Org chart</h1>
        <p>Who reports to whom{{ people().length ? ' · ' + people().length + ' people' : '' }}. Click a person to open their record.</p>
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
      @if (loading()) {
        <p class="p-loading">Loading the org chart…</p>
      } @else {
        <app-org-tree [root]="chart().root" [linkable]="true" [collapsible]="true" [showBrand]="true"
                      emptyText="Nobody has a reporting line yet. Set 'Reports to' on each employee's page."
                      (open)="openPerson($event)" />
      }
    </section>
    <p class="note">People without a "Reports to" sit at the top. Fold a branch with the arrow under a box.</p>
  `,
  styles: `.note { margin: 14px 4px 0; font-size: .84rem; color: var(--muted); }`,
})
export class OrgChartPage implements OnInit {
  private readonly peopleService = inject(PeopleService);
  private readonly router = inject(Router);

  protected readonly people = signal<OrgNode[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly chart = computed(() => forestToTree(this.people()));

  ngOnInit(): void {
    this.peopleService.orgChart().subscribe({
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

  protected openPerson(p: OrgNode): void {
    this.router.navigate(['/portal/employees', p.id]);
  }
}
