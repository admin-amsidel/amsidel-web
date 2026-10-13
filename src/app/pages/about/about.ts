import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE } from '../../data/site.config';

@Component({
  selector: 'app-about',
  imports: [RouterLink],
  template: `
    <section class="page-banner" style="background-image: url('images/hero/hero-1.webp')">
      <div class="container">
        <ol class="crumbs">
          <li><a routerLink="/doors-windows">Home</a></li>
          <li>About</li>
        </ol>
        <h1>About Amsidel</h1>
        <p>A new name in doors and windows, built on old-fashioned care.</p>
      </div>
    </section>

    <section class="section">
      <div class="container split">
        <div>
          <p class="kicker">Who we are</p>
          <h2>One team for every door and window in your building</h2>
          <p>
            Amsidel Doors &amp; Windows is the building-products brand of {{ site.company }}. We started with a simple
            observation: most homeowners deal with three or four different suppliers for their windows, main door,
            internal doors and bathroom doors, and none of them talk to each other.
          </p>
          <p>
            We bring uPVC, aluminium, WPC and steel systems together with a complete range of safety, ABS, membrane,
            laminated, skin and fibre doors. One survey, one quotation, one installation team, and one number to call
            afterwards.
          </p>
        </div>
        <img src="images/gallery/gallery-06.webp" alt="Bay window seat with large casement windows" width="640" height="640" loading="lazy" />
      </div>
    </section>

    <section class="section section--soft">
      <div class="container">
        <div class="vm">
          <div class="vm__card">
            <p class="kicker">Our Vision</p>
            <h3>Spaces people are proud to live and work in</h3>
            <p>To be the most trusted name for doors and windows in the homes and buildings we serve: designed with care, built to last and backed by honest service.</p>
          </div>
          <div class="vm__card">
            <p class="kicker">Our Mission</p>
            <h3>Get every opening right, first time</h3>
            <p>Advise honestly, measure precisely, supply quality materials and install them properly, then stay available long after handover.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head">
          <p class="kicker">What We Stand For</p>
          <h2>Our values</h2>
          <span class="title-rule"></span>
        </div>
        <div class="values">
          @for (v of values; track v.title) {
            <div class="value">
              <h3>{{ v.title }}</h3>
              <p>{{ v.text }}</p>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="section section--soft">
      <div class="container split split--rev">
        <img src="images/gallery/gallery-11.webp" alt="Black-framed glazed doors on a house front" width="640" height="640" loading="lazy" />
        <div>
          <p class="kicker">Who we work with</p>
          <h2>Homeowners, architects and builders</h2>
          <p>
            Whether it's a single bedroom door or every opening in an apartment project, we tailor the products, the
            schedule and the paperwork to the job.
          </p>
          <ul class="who">
            <li><strong>Homeowners</strong> — guidance on materials, styles and budgets for new homes and renovations.</li>
            <li><strong>Architects &amp; interior designers</strong> — samples, finishes and technical details to match your specification.</li>
            <li><strong>Builders &amp; developers</strong> — bulk supply and phased installation that fits your site schedule.</li>
            <li><strong>Dealers</strong> — we're building a dealer network; get in touch to partner with us.</li>
          </ul>
          <a class="btn btn--gold" routerLink="/doors-windows/contact">Talk to us</a>
        </div>
      </div>
    </section>
  `,
  styles: `
    .split { display: grid; grid-template-columns: 1.1fr 1fr; gap: 64px; align-items: center; }
    .split--rev { grid-template-columns: 1fr 1.1fr; }
    .split img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; }
    .split h2 { margin-bottom: 18px; }
    .split p { color: var(--muted); }
    .vm { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .vm__card { background: var(--bg); border: 1px solid var(--line); border-top: 3px solid var(--brass); border-radius: 8px; padding: 36px 32px; }
    .vm__card h3 { font-size: 1.6rem; }
    .vm__card p:last-child { color: var(--muted); margin-bottom: 0; }
    .values { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
    .value { padding: 28px 24px; border: 1px solid var(--line); border-radius: 8px; }
    .value h3 { font-size: 1.3rem; margin-bottom: 8px; }
    .value p { margin: 0; color: var(--muted); font-size: .95rem; }
    .who { padding-left: 20px; display: grid; gap: 10px; margin: 20px 0 28px; color: var(--muted); }
    .who strong { color: var(--ink); }
    .who li::marker { color: var(--brass); }
    @media (max-width: 860px) {
      .split, .split--rev, .vm { grid-template-columns: 1fr; gap: 32px; }
      .split--rev img { order: 2; }
      .values { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 560px) { .values { grid-template-columns: 1fr; } }
  `,
})
export class About {
  protected readonly site = SITE;
  protected readonly values = [
    { title: 'Craftsmanship', text: 'Attention to detail in every frame, joint and finish.' },
    { title: 'Integrity', text: 'Clear pricing, honest timelines and promises we keep.' },
    { title: 'Customer first', text: 'Service that continues long after the installation.' },
    { title: 'Sustainability', text: 'Energy-efficient, long-life products that waste less.' },
  ];
}
