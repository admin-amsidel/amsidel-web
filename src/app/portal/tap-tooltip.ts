/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DestroyRef, Directive, inject } from '@angular/core';
import { Tooltip } from 'primeng/tooltip';

/** How long a tapped tooltip stays up on a phone. */
const SHOWN_MS = 2500;

/**
 * Phones have no hover: a tap shows the element's pTooltip for a moment instead. With a mouse it does nothing, the
 * tooltip shows on hover as usual. Use next to pTooltip: <span pTooltip="Anu Thomas" tapTooltip>.
 */
@Directive({ selector: '[pTooltip][tapTooltip]', host: { '(click)': 'tap()' } })
export class TapTooltip {
  private readonly tooltip = inject(Tooltip);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected tap(): void {
    if (typeof matchMedia === 'undefined' || !matchMedia('(hover: none)').matches) return;
    clearTimeout(this.timer);
    // PrimeNG hides its tooltip on touch end and again on click; show it once its own handlers have run
    this.timer = setTimeout(() => {
      this.tooltip.deactivate();
      this.tooltip.activate();
      this.timer = setTimeout(() => this.tooltip.deactivate(), SHOWN_MS);
    });
  }
}
