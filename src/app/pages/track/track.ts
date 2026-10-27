import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { ImageModule } from 'primeng/image';
import { TagModule } from 'primeng/tag';
import { TimelineModule } from 'primeng/timeline';
import { API_BASE } from '../../portal/portal.config';

type Stage = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

interface PublicUpdate { id: number; status: Stage; title: string; description: string | null; happenedAt: string; photoIds: number[] }

interface PublicStatus {
  brandName: string; brandId: number; brandLogoUpdatedAt: string | null; brandPhone: string | null; brandEmail: string | null;
  projectCode: string; projectName: string; customerName: string; status: Stage; startDate: string | null; endDate: string | null;
  updates: PublicUpdate[];
}

const STAGES: Record<Stage, { label: string; icon: string; severity: 'secondary' | 'info' | 'success' | 'danger' }> = {
  QUEUED: { label: 'Queued', icon: 'pi pi-clock', severity: 'secondary' },
  IN_PROGRESS: { label: 'In progress', icon: 'pi pi-cog', severity: 'info' },
  COMPLETED: { label: 'Completed', icon: 'pi pi-check', severity: 'success' },
  CANCELLED: { label: 'Cancelled', icon: 'pi pi-times', severity: 'danger' },
};
const ROAD: Stage[] = ['QUEUED', 'IN_PROGRESS', 'COMPLETED'];

/** PrimeIcons for this page (the public site does not load them). */
@Component({
  selector: 'app-track-icons',
  template: '',
  styleUrls: ['../../portal/portal-icons.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class TrackIcons {}

/**
 * A customer's project status page (/track/{project code}/{secret}): no sign-in, and no way into the portal. The
 * stages as a road (queued, in progress, completed), then every update, newest first, with its date, time and photos.
 */
@Component({
  selector: 'app-track',
  imports: [DatePipe, ImageModule, TagModule, TimelineModule, TrackIcons],
  template: `
    <app-track-icons />
    <main class="track">
      @if (status(); as s) {
        <header class="hero">
          <div class="brand">
            @if (logo(); as l) { <img [src]="l" [alt]="s.brandName" class="logo" /> }
            <span><b>{{ s.brandName }}</b><small>Project progress</small></span>
          </div>
          <h1>{{ s.projectName }}</h1>
          <p class="sub">{{ s.projectCode }} · for {{ s.customerName }}
            @if (s.startDate) { · started {{ s.startDate | date: 'd MMM y' }} }
            @if (s.endDate) { · planned to finish {{ s.endDate | date: 'd MMM y' }} }</p>

          @if (s.status === 'CANCELLED') {
            <p-tag value="Cancelled" severity="danger" icon="pi pi-times" styleClass="state" />
          } @else {
            <ol class="road" aria-label="Stages">
              @for (st of road; track st; let i = $index) {
                <li [class.done]="reached(st, s.status)" [class.now]="st === s.status" [attr.aria-current]="st === s.status ? 'step' : null">
                  <span class="dot"><i [class]="stage(st).icon" aria-hidden="true"></i></span>
                  <span class="road-label">{{ stage(st).label }}</span>
                </li>
              }
            </ol>
          }
        </header>

        <section class="updates" aria-label="Updates">
          <h2>Updates <small>{{ s.updates.length }}</small></h2>
          @if (s.updates.length) {
            <p-timeline [value]="s.updates" [align]="wide() ? 'alternate' : 'left'" styleClass="tl">
              <ng-template #marker let-u>
                <span class="mark" [class]="'mark mark--' + u.status.toLowerCase()"><i [class]="stage(u.status).icon" aria-hidden="true"></i></span>
              </ng-template>
              <ng-template #opposite let-u>
                <span class="when"><b>{{ u.happenedAt | date: 'EEEE, d MMMM y' }}</b><small>{{ u.happenedAt | date: 'h:mm a' }}</small></span>
              </ng-template>
              <ng-template #content let-u>
                <article class="card">
                  <div class="card__head">
                    <p-tag [value]="stage(u.status).label" [severity]="stage(u.status).severity" />
                    <span class="when-sm">{{ u.happenedAt | date: 'd MMM y, h:mm a' }}</span>
                  </div>
                  <h3>{{ u.title }}</h3>
                  @if (u.description) { <p>{{ u.description }}</p> }
                  @if (u.photoIds.length) {
                    <div class="photos" [class.one]="u.photoIds.length === 1">
                      @for (id of u.photoIds; track id) {
                        <p-image [src]="photo(id)" [alt]="u.title" [preview]="true" imageClass="ph" appendTo="body" />
                      }
                    </div>
                  }
                </article>
              </ng-template>
            </p-timeline>
          } @else {
            <p class="none">No updates yet. They will show here as the work goes on.</p>
          }
        </section>

        <footer class="foot">
          <span>Questions about your project? Contact {{ s.brandName }}
            @if (s.brandPhone) { · <a [href]="'tel:' + s.brandPhone">{{ s.brandPhone }}</a> }
            @if (s.brandEmail) { · <a [href]="'mailto:' + s.brandEmail">{{ s.brandEmail }}</a> }</span>
          <small>This page is only for following your project; it does not open any account.</small>
        </footer>
      } @else if (error()) {
        <div class="gone"><i class="pi pi-link" aria-hidden="true"></i><h1>This link does not work</h1><p>{{ error() }}</p></div>
      } @else {
        <p class="loading">Loading your project…</p>
      }
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: linear-gradient(180deg, #f1f5fb 0, #f8fafc 320px, #f8fafc 100%); color: #0f1b2d;
      font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
    .track { max-width: 1040px; margin: 0 auto; padding: 28px 20px 40px; }
    .hero { background: #fff; border: 1px solid #e3e8ef; border-radius: 20px; padding: 26px 28px 24px; box-shadow: 0 10px 30px rgba(15, 27, 45, .06); }
    .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .logo { height: 40px; width: auto; }
    .brand span { display: grid; }
    .brand small { color: #64748b; font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; }
    h1, h2, h3 { font-family: inherit; }
    h1 { margin: 0 0 6px; font-weight: 700; font-size: clamp(1.5rem, 3.2vw, 2.1rem); letter-spacing: -.01em; }
    .sub { margin: 0 0 22px; color: #64748b; }
    .road { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); position: relative; }
    .road::before { content: ''; position: absolute; top: 19px; left: 16.6%; right: 16.6%; height: 4px; background: #e2e8f0; border-radius: 2px; }
    .road li { display: grid; justify-items: center; gap: 8px; position: relative; text-align: center; }
    .road li + li::before { content: ''; position: absolute; top: 19px; right: 50%; width: 100%; height: 4px; background: transparent; border-radius: 2px; z-index: 0; }
    .road li.done + li.done::before { background: #1d5fa3; }
    .dot { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: #e2e8f0; color: #64748b; position: relative; z-index: 1;
      border: 4px solid #fff; }
    .done .dot { background: #1d5fa3; color: #fff; }
    .now .dot { box-shadow: 0 0 0 6px rgba(29, 95, 163, .18); }
    .road li:last-child.done .dot { background: #1f7a45; }
    .road-label { font-size: .88rem; color: #64748b; font-weight: 600; }
    .done .road-label { color: #0f1b2d; }
    :host ::ng-deep .state { font-size: .95rem; padding: 6px 14px; }
    .updates { margin-top: 26px; }
    .updates h2 { font-size: 1.2rem; margin: 0 0 16px; display: flex; gap: 8px; align-items: baseline; }
    .updates h2 small { color: #64748b; font-weight: 500; font-size: .9rem; }
    .mark { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: #fff; box-shadow: 0 0 0 5px #f8fafc, 0 3px 10px rgba(0, 0, 0, .15); }
    .mark--queued { background: #64748b; }
    .mark--in_progress { background: #1d5fa3; }
    .mark--completed { background: #1f7a45; }
    .mark--cancelled { background: #b3261e; }
    .when { display: grid; padding: 8px 6px 0; }
    :host ::ng-deep .tl .p-timeline-event-opposite { padding: 0 14px; }
    :host ::ng-deep .tl .p-timeline-event-content { padding-left: 14px; padding-right: 14px; }
    .when small { color: #64748b; }
    :host ::ng-deep .tl .p-timeline-event-content { padding-bottom: 26px; }
    .card { background: #fff; border: 1px solid #e3e8ef; border-radius: 16px; padding: 16px 18px; display: grid; gap: 10px; text-align: left;
      box-shadow: 0 6px 20px rgba(15, 27, 45, .05); }
    .card__head { display: flex; align-items: center; gap: 10px; }
    .when-sm { display: none; color: #64748b; font-size: .82rem; }
    .card h3 { margin: 0; font-size: 1.08rem; }
    .card p { margin: 0; line-height: 1.6; white-space: pre-line; color: #334155; }
    .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
    .photos.one { grid-template-columns: minmax(0, 1fr); }
    :host ::ng-deep .ph { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 10px; display: block; cursor: zoom-in; }
    .none, .loading { color: #64748b; text-align: center; padding: 30px 0; }
    .foot { margin-top: 30px; padding-top: 18px; border-top: 1px solid #e3e8ef; display: grid; gap: 4px; color: #475569; font-size: .9rem; text-align: center; }
    .foot a { color: #1d5fa3; }
    .foot small { color: #94a3b8; }
    .gone { text-align: center; padding: 80px 16px; color: #64748b; }
    .gone .pi { font-size: 2.2rem; }
    .gone h1 { color: #0f1b2d; font-size: 1.5rem; margin: 12px 0 6px; }
    @media (max-width: 760px) {
      .track { padding: 16px 12px 30px; }
      .hero { padding: 18px 16px; border-radius: 16px; }
      .dot { width: 36px; height: 36px; }
      .road::before, .road li + li::before { top: 16px; }
      :host ::ng-deep .tl .p-timeline-event-opposite { display: none; }
      .when-sm { display: inline; }
      .photos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
})
export class Track implements OnInit {
  private readonly http = inject(HttpClient);

  /** Route parameters (bound by withComponentInputBinding). */
  readonly code = input.required<string>();
  readonly token = input.required<string>();

  protected readonly status = signal<PublicStatus | null>(null);
  protected readonly error = signal('');
  protected readonly road = ROAD;
  protected readonly wide = signal(typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches);
  private readonly base = computed(() => `${API_BASE}/api/public/project-status/${encodeURIComponent(this.code())}/${encodeURIComponent(this.token())}`);
  protected readonly logo = computed(() => {
    const s = this.status();
    return s?.brandLogoUpdatedAt ? `${API_BASE}/api/brands/${s.brandId}/logo?v=${encodeURIComponent(s.brandLogoUpdatedAt)}` : null;
  });

  ngOnInit(): void {
    this.http.get<PublicStatus>(this.base()).subscribe({
      next: (s) => {
        this.status.set(s);
        document.title = `${s.projectName} · ${s.brandName}`;
      },
      error: () => this.error.set('It may have been replaced or switched off. Please ask us for a new link.'),
    });
  }

  protected stage(s: Stage) {
    return STAGES[s];
  }

  protected reached(st: Stage, now: Stage): boolean {
    return ROAD.indexOf(st) <= ROAD.indexOf(now);
  }

  protected photo(id: number): string {
    return `${this.base()}/photos/${id}`;
  }
}
