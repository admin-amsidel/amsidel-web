import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { API_BASE } from '../portal/portal.config';

/** A news item the company portal made public (For: Public or All) and that is showing today. */
export interface PublicNews {
  id: number;
  title: string;
  body: string | null;
  category: string;
  brandCode: string | null;
  brandName: string | null;
  startDate: string;
  endDate: string | null;
  imageUpdatedAt: string | null;
}

/**
 * The website's news from the company portal, loaded once per visit: the offers (Discount news) for the header
 * button, the Offers page and the home page, and the other public news. Empty when there is none or the server
 * cannot be reached, so the website never waits on it.
 */
@Injectable({ providedIn: 'root' })
export class SiteNewsService {
  private readonly http = inject(HttpClient);
  private loaded = false;

  readonly all = signal<PublicNews[]>([]);
  readonly ready = signal(false);
  /** Discounts: the website's offers. */
  readonly offers = computed(() => this.all().filter((n) => n.category === 'DISCOUNT'));
  /** Everything else that is public. */
  readonly news = computed(() => this.all().filter((n) => n.category !== 'DISCOUNT'));

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.http.get<PublicNews[]>(`${API_BASE}/api/public/news`).subscribe({
      next: (n) => {
        this.all.set(n);
        this.ready.set(true);
      },
      error: () => this.ready.set(true),
    });
  }

  image(n: PublicNews): string | null {
    return n.imageUpdatedAt ? `${API_BASE}/api/public/news/${n.id}/image?v=${encodeURIComponent(n.imageUpdatedAt)}` : null;
  }
}
