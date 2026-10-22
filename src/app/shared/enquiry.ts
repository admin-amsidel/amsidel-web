import { API_BASE } from '../portal/portal.config';

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
  /** Hidden form field: people leave it empty, bots fill it in. */
  honey?: string;
}

/** Why an enquiry did not go: 'busy' = too many from this visitor just now; 'failed' = anything else. */
export class EnquiryError extends Error {
  constructor(readonly reason: 'busy' | 'failed') {
    super(reason);
  }
}

/**
 * The backend answers as soon as it has checked the enquiry (the mail goes out in the background), so this only
 * runs long when the backend was asleep (free hosting wakes up in up to about a minute).
 */
const TIMEOUT_MS = 90000;
/** After this long the forms say the server is waking up and to keep the page open. */
export const SLOW_AFTER_MS = 6000;
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

/** Emails the enquiry to the team as a designed mail, through the backend (Brevo). Throws EnquiryError. */
export async function sendEnquiry(enquiry: Enquiry): Promise<void> {
  const { honey, ...rest } = enquiry;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/public/enquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...rest, email: rest.email?.trim() || undefined, page: window.location.href, website: honey }),
      signal: abort.signal,
    });
  } catch {
    throw new EnquiryError('failed');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new EnquiryError('busy');
  if (!res.ok) throw new EnquiryError('failed');
}
