import { API_BASE } from '../portal/portal.config';
import { sendViaFormSubmit } from './form-submit';

/** An enquiry as the backend lays it out in its mail (see EnquiryService in amsidel-backend). */
export interface Enquiry {
  kind: 'QUOTE' | 'SITE_VISIT' | 'CHAT';
  /** What it is about, shown as the mail's heading (e.g. the product, or the visit date and place). */
  headline?: string;
  name: string;
  phone: string;
  email?: string;
  /** Label and value rows, in order. */
  details: { label: string; value: string }[];
  message?: string;
  transcript?: { visitor: boolean; text: string }[];
}

/**
 * The backend can sleep when idle (free hosting) and handing the mail to the mail server takes a few seconds more;
 * after this long the form gives up on it and sends through FormSubmit.
 */
const BACKEND_TIMEOUT_MS = 40000;
let warmed = false;

/**
 * Wakes the backend when a form opens, so it is ready by the time the visitor presses Send.
 * Fire and forget; does nothing on a second call.
 */
export function warmUpEnquiries(): void {
  if (warmed || typeof window === 'undefined') return;
  warmed = true;
  // the answer is not read, so no CORS needed: the request alone wakes the server
  fetch(`${API_BASE}/actuator/health`, { mode: 'no-cors' }).catch(() => undefined);
}

/**
 * Emails the enquiry: as a designed mail through the backend, or, when the backend cannot send it (asleep too long,
 * mail not set up, down), through FormSubmit as before. Throws only when both fail.
 * `fallback` is the FormSubmit version: the same rows as a plain table.
 */
export async function sendEnquiry(
  enquiry: Enquiry,
  fallback: { fields: Record<string, string>; subject: string; honey: string; replyTo?: string },
): Promise<void> {
  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), BACKEND_TIMEOUT_MS);
    const res = await fetch(`${API_BASE}/api/public/enquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        ...enquiry,
        email: enquiry.email?.trim() || undefined,
        page: window.location.href,
        website: fallback.honey,
      }),
      signal: abort.signal,
    }).finally(() => clearTimeout(timer));
    if (res.ok) return;
  } catch {
    // network error or timeout: send it the other way
  }
  await sendViaFormSubmit(fallback.fields, { subject: fallback.subject, honey: fallback.honey, replyTo: fallback.replyTo });
}
