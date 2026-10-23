import { Directive, inject } from '@angular/core';
import { DatePicker } from 'primeng/datepicker';

/**
 * On phones and tablets every date field opens only the calendar: no keyboard. On iPhones the keyboard popping up
 * over the calendar shrinks the screen and pushes the page out of line. Typing dates still works with a mouse and
 * keyboard. Import it next to DatePickerModule; it applies to every p-datepicker of that component.
 */
@Directive({ selector: 'p-datepicker' })
export class TouchDatePicker {
  constructor() {
    const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    if (touch) inject(DatePicker).readonlyInput = true;
  }
}
