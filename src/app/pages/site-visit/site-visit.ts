/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE } from '../../data/site.config';
import { SiteVisitForm } from '../../shared/site-visit-form';

/** Free site-visit booking: what happens on the visit, plus the request form. */
@Component({
  selector: 'app-site-visit',
  imports: [RouterLink, SiteVisitForm],
  template: `
    <section class="page-banner" style="background-image: url('images/hero/hero-3.webp')">
      <div class="container">
        <ol class="crumbs">
          <li><a routerLink="/doors-windows">Home</a></li>
          <li>Free site visit</li>
        </ol>
        <h1>Book a Free Site Visit</h1>
        <p>Pick a day and time. We'll come over, measure every opening and bring samples to help you choose.</p>
      </div>
    </section>

    <section class="section">
      <div class="container visit">
        <div class="info">
          <p class="kicker">How it works</p>
          <h2>A visit, a measurement, a clear quote</h2>
          <ol class="steps">
            @for (s of steps; track s.title) {
              <li>
                <span class="num" aria-hidden="true">{{ $index + 1 }}</span>
                <div><strong>{{ s.title }}</strong><span>{{ s.text }}</span></div>
              </li>
            }
          </ol>
          <p class="area">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" fill="none" stroke="currentColor" stroke-width="1.8" /><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
            <span>Now serving <strong>{{ areas }}</strong>. More locations coming soon.</span>
          </p>
        </div>

        <div class="form-card">
          <h2 id="visit">Request a site visit</h2>
          <p>Free, with no obligation to buy. Visits {{ site.hours }}.</p>
          <app-site-visit-form />
        </div>
      </div>
    </section>
  `,
  styles: `
    .visit { display: grid; grid-template-columns: 1fr 1.25fr; gap: 64px; align-items: start; }
    .info h2 { margin-bottom: 28px; }
    .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
    .steps li { display: flex; gap: 16px; align-items: flex-start; padding: 18px 20px; border: 1px solid var(--line); border-radius: 8px; }
    .steps div { display: grid; gap: 2px; min-width: 0; }
    .steps strong { font-weight: 600; }
    .steps span:not(.num) { color: var(--muted); font-size: .92rem; }
    .num {
      flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%;
      background: var(--chip); color: var(--chip-gold); border: 1px solid var(--chip-line); font-family: var(--display); font-size: 1.05rem;
    }
    .area { display: flex; gap: 12px; align-items: center; margin: 22px 0 0; padding: 14px 18px; border-radius: 8px; background: var(--soft); color: var(--muted); font-size: .92rem; }
    .area svg { flex: none; width: 22px; height: 22px; color: var(--brass); }
    .area strong { color: var(--ink); }
    .form-card { background: var(--soft); border-radius: 10px; padding: 40px 36px; border: 1px solid var(--line); }
    .form-card > p { color: var(--muted); margin: 10px 0 28px; }
    @media (max-width: 860px) {
      .visit { grid-template-columns: 1fr; gap: 40px; }
      /* on phones the form comes first; the explainer follows */
      .form-card { order: -1; }
    }
    @media (max-width: 560px) { .form-card { padding: 28px 20px; } }
  `,
})
export class SiteVisit {
  protected readonly site = SITE;
  protected readonly areas = SITE.siteVisit.areas.join(', ');
  protected readonly steps = [
    { title: 'Choose a slot', text: 'Tell us the day, time and where the site is.' },
    { title: 'We confirm by phone', text: 'Our team calls you to confirm the visit and the address.' },
    { title: 'Measure and samples', text: 'We measure every opening and show profiles, finishes and glass options.' },
    { title: 'Your quote', text: 'You get a clear, itemised quotation with no obligation to buy.' },
  ];
}
