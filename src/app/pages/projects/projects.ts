import { Component, HostListener, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Inspiration gallery with a simple keyboard-accessible lightbox. */
@Component({
  selector: 'app-projects',
  imports: [RouterLink],
  template: `
    <section class="page-banner" style="background-image: url('images/hero/hero-3.webp')">
      <div class="container">
        <ol class="crumbs">
          <li><a routerLink="/doors-windows">Home</a></li>
          <li>Projects</li>
        </ol>
        <h1>Projects &amp; Inspiration</h1>
        <p>Ideas for entrances, living spaces and bedrooms. Tap any image to view it larger.</p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="masonry">
          @for (img of images; track img; let i = $index) {
            <button type="button" class="tile" [attr.aria-label]="'Open image ' + (i + 1)" (click)="open(i)">
              <img [src]="img" alt="" loading="lazy" />
            </button>
          }
        </div>
      </div>
    </section>

    @if (openIndex() !== null) {
      <div class="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer" (click)="close()">
        <img [src]="images[openIndex()!]" alt="" (click)="$event.stopPropagation()" />
        <button type="button" class="lb-btn lb-close" aria-label="Close" (click)="close()">×</button>
        <button type="button" class="lb-btn lb-prev" aria-label="Previous image" (click)="step(-1, $event)">‹</button>
        <button type="button" class="lb-btn lb-next" aria-label="Next image" (click)="step(1, $event)">›</button>
        <span class="lb-count">{{ openIndex()! + 1 }} / {{ images.length }}</span>
      </div>
    }
  `,
  styles: `
    .masonry { columns: 3 280px; column-gap: 16px; }
    .tile { display: block; width: 100%; margin: 0 0 16px; padding: 0; border: 0; border-radius: 8px; overflow: hidden; cursor: zoom-in; break-inside: avoid; background: var(--soft); }
    .tile img { width: 100%; height: auto; transition: transform .5s; }
    .tile:hover img { transform: scale(1.04); }
    .lightbox { position: fixed; inset: 0; z-index: 60; background: rgba(16,16,18,.92); display: grid; place-items: center; padding: 60px 70px; }
    .lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; }
    .lb-btn { position: absolute; width: 48px; height: 48px; border-radius: 50%; border: 1px solid rgba(255,255,255,.4); background: rgba(0,0,0,.3); color: #fff; font-size: 1.8rem; line-height: 1; cursor: pointer; }
    .lb-btn:hover { border-color: #fff; }
    .lb-close { top: 16px; right: 16px; }
    .lb-prev { left: 14px; top: 50%; transform: translateY(-50%); }
    .lb-next { right: 14px; top: 50%; transform: translateY(-50%); }
    .lb-count { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); color: #c4c4c8; font-size: .85rem; }
    @media (max-width: 560px) { .lightbox { padding: 70px 12px; } .lb-prev, .lb-next { top: auto; bottom: 8px; transform: none; } }
  `,
})
export class Projects {
  protected readonly images = Array.from(
    { length: 15 },
    (_, i) => `images/gallery/gallery-${String(i + 1).padStart(2, '0')}.webp`,
  );
  protected readonly openIndex = signal<number | null>(null);

  protected open(i: number): void {
    this.openIndex.set(i);
  }

  protected close(): void {
    this.openIndex.set(null);
  }

  protected step(d: number, e?: Event): void {
    e?.stopPropagation();
    const i = this.openIndex();
    if (i === null) return;
    this.openIndex.set((i + d + this.images.length) % this.images.length);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    if (this.openIndex() === null) return;
    if (e.key === 'Escape') this.close();
    if (e.key === 'ArrowRight') this.step(1);
    if (e.key === 'ArrowLeft') this.step(-1);
  }
}
