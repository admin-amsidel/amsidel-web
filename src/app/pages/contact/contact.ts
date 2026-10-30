/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE, telHref, whatsappHref } from '../../data/site.config';
import { QuoteForm } from '../../shared/quote-form';

@Component({
  selector: 'app-contact',
  imports: [RouterLink, QuoteForm],
  template: `
    <section class="page-banner" style="background-image: url('images/hero/hero-4.webp')">
      <div class="container">
        <ol class="crumbs">
          <li><a routerLink="/doors-windows">Home</a></li>
          <li>Contact</li>
        </ol>
        <h1>Contact Us</h1>
        <p>Book a free site visit, ask for a quotation or just talk through your options.</p>
      </div>
    </section>

    <section class="section">
      <div class="container contact">
        <div class="info">
          <p class="kicker">Get in touch</p>
          <h2>We'd love to hear about your project</h2>
          <ul class="cards">
            <li>
              <span class="ic" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
              </span>
              <div>
                <strong>Email</strong>
                <span>{{ site.email }}</span>
                <a [href]="'mailto:' + site.altEmail">{{ site.altEmail }}</a>
              </div>
            </li>
            @if (site.phone) {
              <li>
                <span class="ic" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
                </span>
                <div><strong>Phone</strong><a [href]="tel">{{ site.phone }}</a></div>
              </li>
            }
            @if (wa) {
              <li>
                <span class="ic" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M4 20l1.3-4A8 8 0 1 1 8 19Z" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
                </span>
                <div><strong>WhatsApp</strong><a [href]="wa" target="_blank" rel="noopener">Chat with us</a></div>
              </li>
            }
            @if (site.address) {
              <li>
                <span class="ic" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" fill="none" stroke="currentColor" stroke-width="1.8" /><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
                </span>
                <div><strong>Showroom</strong><span>{{ site.address }}</span></div>
              </li>
            }
            <li>
              <span class="ic" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
              </span>
              <div><strong>Hours</strong><span>{{ site.hours }}</span></div>
            </li>
            <li>
              <span class="ic" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
              </span>
              <div><strong>Website</strong><span>{{ site.website }}</span></div>
            </li>
          </ul>
        </div>

        <div class="form-card">
          <h2 id="quote">Request a free quote</h2>
          <p>Share a few details and our team will get back to you within one working day.</p>
          <app-quote-form />
        </div>
      </div>
    </section>
  `,
  styles: `
    .contact { display: grid; grid-template-columns: 1fr 1.25fr; gap: 64px; align-items: start; }
    .info h2 { margin-bottom: 28px; }
    .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
    .cards li { display: flex; gap: 16px; align-items: center; padding: 18px 20px; border: 1px solid var(--line); border-radius: 8px; }
    .cards div { display: grid; min-width: 0; }
    .cards strong { font-size: .75rem; letter-spacing: .16em; text-transform: uppercase; color: var(--brass-dark); }
    .cards a, .cards span:not(.ic) { overflow-wrap: anywhere; text-decoration: none; font-weight: 500; }
    .cards a:hover { color: var(--brass-dark); }
    .ic { flex: none; display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%; background: var(--chip); border: 1px solid var(--chip-line); color: var(--chip-gold); }
    .ic svg { width: 22px; height: 22px; }
    .form-card { background: var(--soft); border-radius: 10px; padding: 40px 36px; border: 1px solid var(--line); }
    .form-card > p { color: var(--muted); margin: 10px 0 28px; }
    @media (max-width: 860px) { .contact { grid-template-columns: 1fr; gap: 40px; } }
    @media (max-width: 560px) { .form-card { padding: 28px 20px; } }
  `,
})
export class Contact {
  protected readonly site = SITE;
  protected readonly tel = SITE.phone ? telHref(SITE.phone) : '';
  protected readonly wa = SITE.whatsapp && SITE.whatsappActive ? whatsappHref('Hello Amsidel, I would like a quote.') : '';
}
