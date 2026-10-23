import { computed, Directive, input } from '@angular/core';

/**
 * Colours a p-progressbar by its value (colours in portal.scss): under 50% yellow, from 50% light green, 100% green.
 * Import it next to ProgressBarModule; it applies to every p-progressbar of that component.
 */
@Directive({
  selector: 'p-progressbar',
  host: { '[class.tone-low]': 'tone() === "low"', '[class.tone-mid]': 'tone() === "mid"', '[class.tone-done]': 'tone() === "done"' },
})
export class ProgressTone {
  readonly value = input<number | null | undefined>(0);

  protected readonly tone = computed(() => {
    const v = Number(this.value() ?? 0);
    return v >= 100 ? 'done' : v >= 50 ? 'mid' : 'low';
  });
}
