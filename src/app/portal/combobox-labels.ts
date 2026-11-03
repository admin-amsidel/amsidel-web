/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */

/** Dropdowns drawn as a span or div (PrimeNG Select), not an input, with an id a label can point at. */
const BOX = '[role="combobox"][id]:not(input):not(textarea)';
/** Marks the aria-labelledby set here (not by the page), so it can be checked again. */
const MARK = 'data-label-linked';

/**
 * Connects every `<label for="x">` to its PrimeNG dropdown, all over the portal. A Select's control is a
 * `<span role="combobox" id="x">`, and `for` can only label form controls, so the dropdown was named by its placeholder
 * or value ("Choose…", "Active") and clicking the label did nothing. Here the label gets an id (if it has none) and the
 * dropdown `aria-labelledby` it, which comes before the value-based aria-label PrimeNG sets, so it is announced as
 * "Type of leave, combo box, Casual Leave"; and clicking the label focuses the dropdown, as it would a native select.
 * A dropdown given its own ariaLabelledBy keeps it. Runs once; dropdowns added later are connected as they appear.
 */
export function connectComboboxLabels(doc: Document): void {
  const connect = (box: Element) => {
    const current = box.getAttribute('aria-labelledby');
    // one set by the page itself stays; one set here is checked again, as its label may have been drawn anew
    if (current && !box.hasAttribute(MARK)) return;
    const label = doc.querySelector(`label[for="${CSS.escape(box.id)}"]`);
    if (!label) return;
    if (!label.id) label.id = `${box.id}__label`;
    if (current === label.id) return;
    box.setAttribute('aria-labelledby', label.id);
    box.setAttribute(MARK, '');
  };
  const scan = () => doc.querySelectorAll(BOX).forEach(connect);

  // pages, dialogs and @if blocks add dropdowns (and their labels) at any time: look again once per batch of changes
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      scan();
    });
  }).observe(doc.body, { childList: true, subtree: true });
  scan();

  doc.addEventListener('click', (event) => {
    const label = (event.target as Element | null)?.closest?.('label[for]');
    if (!label) return;
    const box = doc.getElementById(label.getAttribute('for') ?? '');
    if (box?.matches(BOX)) (box as HTMLElement).focus();
  });
}
