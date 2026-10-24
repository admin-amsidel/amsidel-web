import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CATEGORIES, PRODUCTS, productsIn } from '../../data/products';
import { BrochureCta } from '../../shared/brochure-cta';
import { ProductCard } from '../../shared/product-card';
import { SiteNews } from '../../shared/site-news';

/** How long each hero image is shown, in milliseconds. */
const SLIDE_MS = 5000;

interface Slide {
  image: string;
  kicker: string;
  title: string;
  text: string;
  link: string;
}

@Component({
  selector: 'app-store-home',
  imports: [BrochureCta, RouterLink, ProductCard, SiteNews],
  templateUrl: './store-home.html',
  styleUrl: './store-home.scss',
})
export class StoreHome {
  protected readonly categories = CATEGORIES;

  /* Range showcase: numbered list on the left, live preview of the selected family on the right */
  protected readonly rangeGroups = [
    { label: 'Doors & Windows', items: CATEGORIES.filter((c) => c.group === 'doors-windows') },
    { label: 'Doors', items: CATEGORIES.filter((c) => c.group === 'doors') },
  ];
  protected readonly selected = signal(CATEGORIES[0].slug);
  protected readonly selectedCat = computed(() => CATEGORIES.find((c) => c.slug === this.selected())!);
  protected readonly selectedProducts = computed(() => productsIn(this.selected()).slice(0, 4));

  protected countOf(slug: string): number {
    return productsIn(slug).length;
  }

  protected indexOf(slug: string): string {
    return String(CATEGORIES.findIndex((c) => c.slug === slug) + 1).padStart(2, '0');
  }

  /** Hover previews a family on devices with a real pointer; touch devices use tap. */
  protected preview(slug: string): void {
    if (window.matchMedia('(hover: hover)').matches) this.selected.set(slug);
  }

  protected readonly slides: Slide[] = [
    {
      image: 'images/hero/hero-1.webp',
      kicker: 'Amsidel Doors & Windows',
      title: 'Open your home to light, not to noise',
      text: 'Sliding and casement systems in uPVC and aluminium, measured, made and fitted for your openings.',
      link: '/doors-windows/category/aluminium',
    },
    {
      image: 'images/hero/hero-2.webp',
      kicker: 'Aluminium systems',
      title: 'Slim frames. Wide views.',
      text: 'Large glass sliders and folding doors that bring the garden into the living room.',
      link: '/doors-windows/category/aluminium',
    },
    {
      image: 'images/hero/hero-3.webp',
      kicker: 'Steel doors',
      title: 'A main door that feels as strong as it looks',
      text: 'Galvanised steel with warm wood-grain finishes and multi-point locking.',
      link: '/doors-windows/category/steel',
    },
    {
      image: 'images/hero/hero-4.webp',
      kicker: 'uPVC windows',
      title: 'Sealed against dust, rain and heat',
      text: 'Low-maintenance uPVC that never needs painting and stays quiet for years.',
      link: '/doors-windows/category/upvc',
    },
  ];

  protected readonly current = signal(0);
  private paused = false;

  protected readonly tabs = [
    { slug: 'all', label: 'All' },
    ...CATEGORIES.slice(0, 6).map((c) => ({ slug: c.slug, label: c.short })),
  ];
  protected readonly tab = signal('all');
  protected readonly featured = computed(() => {
    const t = this.tab();
    if (t !== 'all') return PRODUCTS.filter((p) => p.category === t).slice(0, 8);
    // one or two from each category for the "All" view
    return CATEGORIES.flatMap((c) => PRODUCTS.filter((p) => p.category === c.slug).slice(0, 1)).slice(0, 8);
  });

  protected readonly reasons = [
    { icon: 'measure', title: 'Measured on site', text: 'We visit, measure every opening and recommend the right system before you pay.' },
    { icon: 'frame', title: 'Made to measure', text: 'Frames are cut and assembled to your exact sizes, not adapted from stock.' },
    { icon: 'tools', title: 'Trained installers', text: 'Our own fitting team installs, seals and finishes, then cleans up after.' },
    { icon: 'quote', title: 'Clear quotations', text: 'Itemised prices for frames, glass, hardware and fitting. No surprises later.' },
    { icon: 'lock', title: 'Quality hardware', text: 'Locks, rollers and hinges chosen to match the weight and use of each door.' },
    { icon: 'support', title: 'After-sales care', text: 'One call to us for adjustments or service, long after installation.' },
  ];

  protected readonly steps = [
    { n: '01', title: 'Consult', text: 'Share your plan or photos. We suggest materials and styles that suit your space and budget.' },
    { n: '02', title: 'Measure', text: 'A free site visit to take precise measurements and check the openings.' },
    { n: '03', title: 'Make', text: 'Your doors and windows are fabricated to size with the finish and glass you choose.' },
    { n: '04', title: 'Install', text: 'Fitted, sealed and tested by our team, with a walkthrough before we hand over.' },
  ];

  protected readonly inspiration = [1, 3, 4, 5, 10, 11].map((n) => `images/gallery/gallery-${String(n).padStart(2, '0')}.webp`);

  constructor() {
    // Each slide stays up for SLIDE_MS; the timer restarts whenever the slide changes,
    // so a manual dot/arrow click also gets a full interval.
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      this.current();
      clearTimeout(timer);
      timer = setTimeout(() => this.advance(), SLIDE_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  private advance(): void {
    if (this.paused || document.hidden) {
      // try again shortly instead of waiting a whole interval after the pointer leaves
      setTimeout(() => this.advance(), 500);
      return;
    }
    this.next();
  }

  protected next(): void {
    this.current.update((i) => (i + 1) % this.slides.length);
  }

  protected prev(): void {
    this.current.update((i) => (i - 1 + this.slides.length) % this.slides.length);
  }

  protected go(i: number): void {
    this.current.set(i);
  }

  protected pause(p: boolean): void {
    this.paused = p;
  }
}
