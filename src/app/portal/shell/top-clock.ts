/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { AuthService } from '../auth.service';

/**
 * Today's date and the time in the person's time zone (their brand's, else India's), whatever the device's own clock
 * says, beside the account menu. It moves on each second, and at once when a hidden tab comes back, as browsers hold back
 * timers in hidden tabs.
 */
@Component({
  selector: 'app-top-clock',
  template: `
    <time [attr.datetime]="iso()">
      <b>{{ time() }} <span class="zone">{{ zoneName() }}</span></b>
      <small>{{ date() }}</small>
    </time>
  `,
  styles: `
    :host { display: block; flex: none; }
    time { display: grid; justify-items: end; line-height: 1.2; white-space: nowrap; }
    b { font-size: .88rem; font-weight: 600; font-variant-numeric: tabular-nums; }
    .zone { font-size: .72rem; font-weight: 600; color: var(--muted); }
    small { font-size: .75rem; color: var(--muted); }
    @media (max-width: 1024px) {
      :host(.dr-clock) time { justify-items: start; }
    }
  `,
})
export class TopClock {
  private readonly auth = inject(AuthService);
  private readonly now = signal(Date.now());

  /** Made once per zone: making one is far slower than using it, and this runs every second. */
  private readonly formats = computed(() => {
    const timeZone = this.auth.zone();
    return {
      time: new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
      date: new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      zone: new Intl.DateTimeFormat('en-IN', { timeZone, timeZoneName: 'short' }),
    };
  });
  protected readonly time = computed(() => this.formats().time.format(this.now()));
  protected readonly date = computed(() => this.formats().date.format(this.now()));
  protected readonly zoneName = computed(() => this.formats().zone.formatToParts(this.now()).find((p) => p.type === 'timeZoneName')?.value ?? '');
  protected readonly iso = computed(() => new Date(this.now()).toISOString());

  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    const refresh = () => {
      clearTimeout(this.timer);
      const at = Date.now();
      this.now.set(at);
      this.timer = setTimeout(refresh, 1000 - (at % 1000));
    };
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    refresh();
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }
}
