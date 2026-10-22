import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../auth.service';
import { ReportingLine } from '../org-chart/reporting-line';
import { PhotoEditor } from '../photo-editor';
import { designationLabel, ROLE_LABELS } from '../portal.models';

/**
 * The signed-in person's own record: details are read only (admins edit them), the photo is theirs to change,
 * and the reporting line below the details shows where they sit, from the top down to them.
 */
@Component({
  selector: 'app-profile',
  imports: [PhotoEditor, DatePipe, TagModule, ReportingLine],
  template: `
    @if (auth.user(); as me) {
      <section class="p-card hero">
        <app-photo-editor class="stacked" [employee]="me" [size]="112" />
        <div>
          <p class="kicker">{{ me.brandName ?? 'Amsidel Group' }}</p>
          <h1>{{ me.name }}</h1>
          @if (me.designationName) { <p class="title">{{ me.designationName }} · Level {{ me.levelCode }}</p> }
          <p class="tags">
            <p-tag [value]="roleLabels[me.role]" />
            <p-tag [value]="me.empNumber" severity="secondary" />
          </p>
        </div>
      </section>

      <section class="p-card">
        <h2>My details</h2>
        <dl class="p-grid">
          @for (row of rows(); track row.label) {
            <div [class.span-all]="row.wide">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value || '—' }}</dd>
            </div>
          }
        </dl>
        <p class="hint">Something wrong or out of date? Ask your admin to update it.</p>
        @if (me.lastLoginAt) {
          <p class="hint">Last sign-in: {{ me.lastLoginAt | date: 'd MMM y, h:mm a' }}</p>
        }
      </section>

      <section class="p-card">
        <h2>My reporting line</h2>
        <app-reporting-line />
      </section>
    }
  `,
  styles: `
    .hero { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
    @media (max-width: 560px) { .hero { flex-direction: column; text-align: center; } .tags { justify-content: center; } }
    .hero h1 { font-size: clamp(1.7rem, 4vw, 2.4rem); }
    .title { margin: 6px 0 0; font-size: 1.02rem; color: var(--pine); font-weight: 500; }
    .tags { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 0; }
    dl { margin: 0; }
    dt { font-size: .75rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    dd { margin: 4px 0 0; font-size: 1rem; overflow-wrap: anywhere; }
    .hint { margin: 22px 0 0; font-size: .85rem; color: var(--muted); }
    .hint + .hint { margin-top: 4px; }
  `,
})
export class Profile implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly rows = computed(() => {
    const me = this.auth.user();
    if (!me) return [];
    return [
      { label: 'Designation', value: me.designationName ? designationLabel(me) : '' },
      { label: 'Reports to', value: me.reportsToName },
      { label: 'User ID', value: me.userId },
      { label: 'Employee number', value: me.empNumber },
      { label: 'Joined', value: formatDate(me.joinedDate) },
      { label: 'Date of birth', value: formatDate(me.dob) },
      { label: 'Blood group', value: me.bloodGroup },
      { label: 'Phone', value: me.phone },
      { label: 'Emergency contact', value: me.emergencyContact },
      { label: 'Company email', value: me.companyEmail },
      { label: 'Personal email', value: me.personalEmail },
      { label: 'Address', value: me.address, wide: true },
    ];
  });

  ngOnInit(): void {
    // pick up changes an admin made since this person signed in
    this.auth.refresh().subscribe({ error: () => undefined });
  }
}

/** "1995-05-20" -> "20 May 1995", without time-zone shifts. */
function formatDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
