import { SITE } from '../data/site.config';

/**
 * Emails a form to SITE.enquiryEmail through FormSubmit (https://formsubmit.co), which needs no backend
 * or API key. The very first submission triggers an activation email to that inbox; messages are
 * delivered once the link in it has been clicked. Throws when the message was not accepted.
 */
export async function sendViaFormSubmit(
  fields: Record<string, string>,
  opts: { subject: string; honey: string; replyTo?: string },
): Promise<void> {
  const res = await fetch(`https://formsubmit.co/ajax/${SITE.enquiryEmail}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      ...fields,
      Page: window.location.href,
      // FormSubmit options
      _subject: opts.subject,
      _template: 'table',
      _captcha: 'false',
      // honeypot: bots fill it in and FormSubmit then drops the message
      _honey: opts.honey,
      ...(opts.replyTo ? { _replyto: opts.replyTo } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: string | boolean };
  if (!res.ok || String(data.success) !== 'true') throw new Error('FormSubmit rejected the request');
}
