/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component } from '@angular/core';
import { SITE } from '../data/site.config';

/** Product brochure download band: cover thumbnail, short pitch, download and view-online buttons. */
@Component({
  selector: 'app-brochure-cta',
  template: `
    <div class="brochure">
      <a class="brochure__cover" [href]="b.url" target="_blank" rel="noopener" aria-label="Open the product brochure">
        <img [src]="b.cover" alt="Cover of the Amsidel Doors & Windows product brochure" width="636" height="900" loading="lazy" />
      </a>
      <div class="brochure__copy">
        <p class="kicker">Product brochure</p>
        <h2>Every range, in one brochure</h2>
        <p>
          All ten product families with designs, model codes and where each one works best. Save it to your phone or
          share it with your architect or builder.
        </p>
        <div class="brochure__actions">
          <a class="btn btn--gold" [href]="b.url" [attr.download]="b.file">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16" /></svg>
            Download brochure
          </a>
          <a class="btn btn--outline" [href]="b.url" target="_blank" rel="noopener">View online</a>
        </div>
        <p class="brochure__meta">PDF · {{ b.pages }} pages · {{ b.size }}</p>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .brochure {
      display: grid; grid-template-columns: 240px 1fr; gap: 48px; align-items: center;
      padding: 36px 40px; background: var(--soft); border: 1px solid var(--line); border-radius: 10px;
    }
    .brochure__cover { display: block; transition: transform .25s; }
    .brochure__cover:hover { transform: translateY(-4px); }
    .brochure__cover img { width: 100%; height: auto; border-radius: 4px; box-shadow: 0 18px 40px rgba(30, 30, 33, .22); }
    .brochure__copy h2 { font-size: clamp(1.6rem, 3.4vw, 2.2rem); }
    .brochure__copy > p:not(.kicker):not(.brochure__meta) { color: var(--muted); margin: 14px 0 0; max-width: 54ch; }
    .brochure__actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 26px; }
    .brochure__meta { margin: 14px 0 0; font-size: .8rem; color: var(--muted); letter-spacing: .04em; }
    @media (max-width: 720px) {
      .brochure { grid-template-columns: 1fr; gap: 28px; padding: 28px 22px; text-align: center; }
      .brochure__cover { width: min(200px, 60%); margin-inline: auto; }
      .brochure__copy > p { margin-inline: auto; }
      .brochure__actions { justify-content: center; }
      .brochure__actions .btn { flex: 1 1 100%; }
    }
  `,
})
export class BrochureCta {
  protected readonly b = SITE.brochure;
}
