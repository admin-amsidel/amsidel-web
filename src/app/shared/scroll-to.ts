import { Directive, input } from '@angular/core';

/**
 * In-page anchor link. A plain href="#id" resolves against <base href="/"> and
 * navigates to the site root, so this scrolls to the element on the current page instead.
 *
 *   <a appScrollTo="quote">Ask for a quote</a>
 */
@Directive({
  selector: 'a[appScrollTo]',
  host: {
    '[attr.href]': "'#' + appScrollTo()",
    '(click)': 'scroll($event)',
  },
})
export class ScrollTo {
  readonly appScrollTo = input.required<string>();

  protected scroll(event: MouseEvent): void {
    const target = document.getElementById(this.appScrollTo());
    if (!target) return;
    event.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    // move keyboard focus along with the scroll
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}
