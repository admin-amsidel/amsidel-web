/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */

/**
 * Opens the browser's print dialog for a PDF: loaded into a hidden frame and printed from there, so the page stays as
 * it is. The PDF's own page size (A4, or a 7 / 12 / 15 cm roll) is what the printer gets.
 */
export function printPdf(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      // a browser that cannot print from a frame (some mobiles): open the PDF to print it from there
      window.open(url, '_blank', 'noopener');
    }
    // keep the frame while the print dialog is open; tidy up later
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.appendChild(frame);
}
