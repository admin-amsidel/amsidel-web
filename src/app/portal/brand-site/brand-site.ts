/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, input, linkedSignal, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { API_BASE } from '../portal.config';
import { Brand, brandLogoUrl } from '../portal.models';
import { BRAND_SITES, BrandSiteContent } from './brand-sites';

/**
 * A brand's page, like a small website, on the portal's home page: logo and name, pictures, about, vision and mission,
 * values, what it offers, who it works for, projects and contact details. The words and pictures come from BRAND_SITES,
 * the logo and business details from the Brands page. A section with nothing to say does not show.
 */
@Component({
  selector: 'app-brand-site',
  imports: [DialogModule],
  template: `
    <article class="site" [attr.aria-label]="brand().name">
      <header class="hero" [class.plain]="!c().hero" [style.background-image]="c().hero ? 'url(' + c().hero + ')' : null">
        <div class="hero-in">
          <span class="logo">
            @if (logo(); as src) {
              <img [src]="src" [alt]="brand().name + ' logo'" (error)="logoFailed.set(true)" />
            } @else {
              <b aria-hidden="true">{{ brand().code }}</b>
            }
          </span>
          <div class="names">
            <h2>{{ brand().name }}</h2>
            @if (c().tagline) { <p class="tagline">{{ c().tagline }}</p> } @else if (brand().category) { <p class="tagline">{{ brand().category }}</p> }
          </div>
        </div>
      </header>

      @if (c().about; as a) {
        <section class="sec split" [class.solo]="!a.picture">
          <div>
            <p class="kicker">Who we are</p>
            <h3>{{ a.title }}</h3>
            @for (p of a.paragraphs; track p) { <p class="txt">{{ p }}</p> }
          </div>
          @if (a.picture; as pic) { <img class="side-pic" [src]="pic.src" [alt]="pic.alt" loading="lazy" /> }
        </section>
      }

      @if (c().vision || c().mission) {
        <section class="sec soft vm">
          @if (c().vision; as v) { <div class="vm-card"><p class="kicker">Our vision</p><h3>{{ v.title }}</h3><p class="txt">{{ v.text }}</p></div> }
          @if (c().mission; as m) { <div class="vm-card"><p class="kicker">Our mission</p><h3>{{ m.title }}</h3><p class="txt">{{ m.text }}</p></div> }
        </section>
      }

      @if (c().values?.length) {
        <section class="sec">
          <p class="kicker">What we stand for</p>
          <div class="values">
            @for (v of c().values; track v.title) { <div class="value"><b>{{ v.title }}</b><p class="txt">{{ v.text }}</p></div> }
          </div>
        </section>
      }

      @if (c().offerings?.length) {
        <section class="sec soft">
          <p class="kicker">What we offer</p>
          <ul class="offers">
            @for (o of c().offerings; track o.src) {
              <li><img [src]="o.src" [alt]="o.alt" loading="lazy" />@if (o.label) { <span>{{ o.label }}</span> }</li>
            }
          </ul>
        </section>
      }

      @if (c().clientTypes || c().clients?.length) {
        <section class="sec">
          <p class="kicker">Our clients</p>
          @if (c().clients?.length) {
            <ul class="names-list">@for (n of c().clients; track n) { <li>{{ n }}</li> }</ul>
          }
          @if (c().clientTypes; as t) {
            <div class="split" [class.solo]="!t.picture">
              <div>
                <h3>{{ t.title }}</h3>
                @if (t.intro) { <p class="txt">{{ t.intro }}</p> }
                <ul class="types">
                  @for (x of t.types; track x.title) { <li><b>{{ x.title }}</b><span class="txt">{{ x.text }}</span></li> }
                </ul>
              </div>
              @if (t.picture; as pic) { <img class="side-pic" [src]="pic.src" [alt]="pic.alt" loading="lazy" /> }
            </div>
          }
        </section>
      }

      @if (c().projects; as p) {
        <section class="sec soft">
          <p class="kicker">Projects</p>
          <h3>{{ p.title }}</h3>
          @if (p.intro) { <p class="txt">{{ p.intro }}</p> }
          <div class="gallery">
            @for (g of p.pictures; track g.src; let i = $index) {
              <button type="button" [attr.aria-label]="'See larger: ' + g.alt" (click)="viewing.set(i)"><img [src]="g.src" [alt]="g.alt" loading="lazy" /></button>
            }
          </div>
        </section>
      }

      <section class="sec contact">
        <p class="kicker">Contact us</p>
        @if (hasContact()) {
          <ul class="ways">
            @if (address(); as v) { <li><i class="pi pi-map-marker" aria-hidden="true"></i><span>{{ v }}</span></li> }
            @if (phone(); as v) { <li><i class="pi pi-phone" aria-hidden="true"></i><a [href]="'tel:' + tel(v)">{{ v }}</a></li> }
            @if (email(); as v) { <li><i class="pi pi-envelope" aria-hidden="true"></i><span>{{ v }}</span></li> }
            @if (c().contact?.altEmail; as v) { <li><i class="pi pi-envelope" aria-hidden="true"></i><a [href]="'mailto:' + v">{{ v }}</a></li> }
            @if (c().contact?.website; as v) { <li><i class="pi pi-globe" aria-hidden="true"></i><a [href]="'https://' + v" target="_blank" rel="noopener">{{ v }}</a></li> }
            @if (c().contact?.hours; as v) { <li><i class="pi pi-clock" aria-hidden="true"></i><span>{{ v }}</span></li> }
          </ul>
        } @else {
          <p class="txt">Contact details for this brand have not been added yet.</p>
        }
        @if (c().publicLink; as link) {
          <a class="visit" [href]="link" target="_blank" rel="noopener">Visit the public website <i class="pi pi-external-link" aria-hidden="true"></i></a>
        }
      </section>

      @if (empty()) {
        <p class="soon"><i class="pi pi-info-circle" aria-hidden="true"></i> This brand's page is still being written: its pictures, vision, clients and projects will appear here.</p>
      }
    </article>

    <p-dialog [visible]="viewing() !== null" (visibleChange)="!$event && viewing.set(null)" [modal]="true" [draggable]="false" [dismissableMask]="true" appendTo="body"
              [header]="(c().projects?.title ?? '') + ' · ' + ((viewing() ?? 0) + 1) + ' of ' + (c().projects?.pictures?.length ?? 0)"
              [style]="{ width: '860px' }" [breakpoints]="{ '900px': 'calc(100vw - 16px)' }">
      @if (viewedPicture(); as v) {
        <div class="viewer" tabindex="-1" (keydown.arrowLeft)="step(-1)" (keydown.arrowRight)="step(1)">
          <img [src]="v.src" [alt]="v.alt" />
          <button type="button" class="vb prev" aria-label="Previous picture" (click)="step(-1)"><i class="pi pi-chevron-left" aria-hidden="true"></i></button>
          <button type="button" class="vb next" aria-label="Next picture" (click)="step(1)"><i class="pi pi-chevron-right" aria-hidden="true"></i></button>
        </div>
      }
    </p-dialog>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .site { container-type: inline-size; background: #fff; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; box-shadow: var(--shadow); }
    .hero { position: relative; min-height: 260px; display: flex; align-items: flex-end; background-size: cover; background-position: center; }
    .hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(23, 59, 99, .12) 20%, rgba(14, 33, 56, .84) 100%); }
    .hero.plain { min-height: 150px; background: linear-gradient(120deg, var(--dark), var(--brass-dark)); }
    .hero.plain::before { display: none; }
    .hero-in { position: relative; display: flex; align-items: center; gap: 16px; padding: 22px 24px; min-width: 0; }
    .logo { flex: none; display: grid; place-items: center; width: 84px; height: 84px; padding: 8px; border-radius: 14px; background: #fff; box-shadow: 0 4px 16px rgba(0, 0, 0, .2); }
    .logo img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    .logo b { font-size: 1.4rem; color: var(--brass-dark); letter-spacing: .04em; }
    .names { min-width: 0; color: #fff; }
    .names h2 { margin: 0; font-size: clamp(1.35rem, 3.4cqw, 2rem); line-height: 1.2; color: #fff; overflow-wrap: anywhere; }
    .tagline { margin: 4px 0 0; color: #e7f0fa; font-size: .95rem; }
    .sec { padding: 26px 24px; border-top: 1px solid var(--line); }
    .hero + .sec { border-top: 0; }
    .soft { background: var(--accent-softer); }
    .kicker { margin: 0 0 6px; font-size: .72rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--brass-dark); }
    h3 { margin: 0 0 8px; font-size: 1.2rem; line-height: 1.3; color: var(--ink); }
    .txt { margin: 0 0 8px; color: var(--muted); font-size: .9rem; line-height: 1.6; }
    .split { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 22px; align-items: center; }
    .split.solo { grid-template-columns: minmax(0, 1fr); }
    .side-pic { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; display: block; }
    .vm { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
    .vm-card { padding: 18px; border: 1px solid var(--line); border-top: 3px solid var(--brass); border-radius: 10px; background: #fff; }
    .vm-card .txt { margin: 0; }
    .values { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-top: 6px; }
    .value { padding: 14px; border: 1px solid var(--line); border-radius: 10px; }
    .value b { display: block; margin-bottom: 4px; font-size: .94rem; }
    .value .txt { margin: 0; font-size: .84rem; line-height: 1.5; }
    .offers { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
    .offers li { position: relative; aspect-ratio: 4 / 3; border-radius: 10px; overflow: hidden; background: var(--accent-soft); }
    .offers img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .offers span { position: absolute; inset: auto 0 0; padding: 18px 10px 7px; color: #fff; font-size: .84rem; font-weight: 600; background: linear-gradient(180deg, transparent, rgba(10, 25, 45, .82)); }
    .names-list { list-style: none; margin: 8px 0 16px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .names-list li { padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; font-size: .86rem; font-weight: 600; }
    .types { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 10px; }
    .types li { display: grid; gap: 1px; font-size: .9rem; }
    .types .txt { margin: 0; font-size: .85rem; line-height: 1.5; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; margin-top: 10px; }
    .gallery button { padding: 0; border: 0; border-radius: 8px; overflow: hidden; aspect-ratio: 1; cursor: zoom-in; background: var(--accent-soft); }
    .gallery button:focus-visible { outline: 3px solid var(--brass); outline-offset: 2px; }
    .gallery img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .35s ease; }
    .gallery button:hover img { transform: scale(1.05); }
    .ways { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px 18px; font-size: .9rem; }
    .ways li { display: flex; gap: 10px; align-items: baseline; min-width: 0; overflow-wrap: anywhere; }
    .ways i { color: var(--brass-dark); }
    .ways a, .visit { color: var(--brass-dark); }
    .visit { display: inline-flex; gap: 8px; align-items: center; margin-top: 14px; font-weight: 600; font-size: .9rem; text-decoration: none; }
    .visit:hover { text-decoration: underline; }
    .soon { display: flex; gap: 10px; margin: 0; padding: 14px 24px; border-top: 1px solid var(--line); background: var(--accent-softer); color: var(--muted); font-size: .86rem; }
    .soon i { margin-top: 3px; color: var(--brass-dark); }
    .viewer { position: relative; display: grid; place-items: center; outline: none; }
    .viewer img { max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px; display: block; }
    .vb { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid #d4d4d8; border-radius: 50%; background: rgba(255, 255, 255, .92); color: var(--ink); cursor: pointer; }
    .vb.prev { left: 8px; }
    .vb.next { right: 8px; }
    @container (max-width: 560px) {
      .split { grid-template-columns: minmax(0, 1fr); }
      .side-pic { aspect-ratio: 16 / 10; }
      .hero { min-height: 210px; }
      .hero.plain { min-height: 130px; }
      .hero-in, .sec, .soon { padding-left: 16px; padding-right: 16px; }
      .logo { width: 64px; height: 64px; }
    }
    @media (prefers-reduced-motion: reduce) { .gallery img { transition: none; } }
  `,
})
export class BrandSite {
  readonly brand = input.required<Brand>();

  protected readonly c = computed<BrandSiteContent>(() => BRAND_SITES[this.brand().code] ?? {});
  protected readonly logoFailed = linkedSignal({ source: this.brand, computation: () => false });
  protected readonly logo = computed(() => {
    const uploaded = this.logoFailed() ? null : brandLogoUrl(this.brand().id, this.brand().logoUpdatedAt, API_BASE);
    return uploaded ?? this.c().logo ?? null;
  });
  protected readonly address = computed(() => this.brand().address || null);
  protected readonly phone = computed(() => this.brand().contactNumber || this.c().contact?.phone || null);
  protected readonly email = computed(() => this.brand().email || this.c().contact?.email || null);
  protected readonly hasContact = computed(() => !!(this.address() || this.phone() || this.email() || this.c().contact));
  /** Nothing but the Brands page's details yet. */
  protected readonly empty = computed(() => !BRAND_SITES[this.brand().code]);

  protected readonly viewing = signal<number | null>(null);
  protected readonly viewedPicture = computed(() => {
    const i = this.viewing();
    return i === null ? null : (this.c().projects?.pictures[i] ?? null);
  });

  protected tel(phone: string): string {
    return phone.replace(/[^\d+]/g, '');
  }

  protected step(by: number): void {
    const n = this.c().projects?.pictures.length ?? 0;
    const i = this.viewing();
    if (n && i !== null) this.viewing.set((i + by + n) % n);
  }
}
