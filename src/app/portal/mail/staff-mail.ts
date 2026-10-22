import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, from, map, mergeMap, of, Subscription, tap } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../auth.service';
import { Avatar } from '../avatar';
import { apiProblem, Brand, Employee } from '../portal.models';
import { StaffService } from '../staff.service';
import { MailService, MailSetup } from './mail.service';

/** Email delivery; 'off' when this send is WhatsApp only. */
type Delivery = 'queued' | 'sending' | 'sent' | 'failed' | 'off';
/** WhatsApp: the message waits for a tap ('ready'), was opened in WhatsApp, or cannot go (no usable phone). */
type WhatsApp = 'ready' | 'opened' | 'nophone' | 'off';
export type Channel = 'EMAIL' | 'WHATSAPP' | 'BOTH';

interface Row {
  id: number;
  name: string;
  empNumber: string;
  email: string | null;
  photoPath: string | null;
  photoUpdatedAt: string | null;
  status: Delivery;
  note: string;
  at: string | null;
  /** WhatsApp number, digits with country code (e.g. 919847012345). */
  wa: string | null;
  waState: WhatsApp;
  /** The person's message, ready in a wa.me link. */
  waLink: string | null;
}

interface Draft {
  subject: string;
  greeting: string;
  body: string;
}

const NAME = '{name}';
/** Mails in flight at once: quick for 100 people, gentle on the mail server. */
const PARALLEL = 3;

/**
 * Staff mail: one message written once and sent to each chosen employee as their own personal mail
 * ("Dear Anu," or "Dear All,") at their office address. While it sends, every person's mail shows queued,
 * sending, sent or failed (with the reason); failed ones can be sent again. Nothing is kept after leaving the page.
 * WhatsApp (free, from the sender's own WhatsApp): each person's message opens in WhatsApp ready to send with one
 * tap, through WhatsApp's click-to-chat link; the page cannot see whether it was then sent, so it shows "Opened".
 */
@Component({
  selector: 'app-staff-mail',
  imports: [
    FormsModule, DatePipe, Avatar, ButtonModule, InputTextModule, MessageModule, MultiSelectModule, ProgressBarModule,
    SelectModule, SelectButtonModule, TableModule, TagModule, TextareaModule,
  ],
  templateUrl: './staff-mail.html',
  styleUrl: './staff-mail.scss',
})
export class StaffMail implements OnInit {
  private readonly mail = inject(MailService);
  private readonly staff = inject(StaffService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly setup = signal<MailSetup | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  // who
  protected readonly employees = signal<Employee[]>([]);
  protected readonly brands = signal<Brand[]>([]);
  protected readonly brandId = signal<number | null>(null);
  protected readonly mode = signal<'ALL' | 'PICK'>('ALL');
  protected readonly picked = signal<number[]>([]);
  protected readonly modeOptions = [
    { label: 'All employees', value: 'ALL' },
    { label: 'Choose people', value: 'PICK' },
  ];
  protected readonly brandOptions = computed(() => [
    { value: null, label: 'All brands' },
    ...this.brands().map((b) => ({ value: b.id, label: b.name })),
  ]);
  protected readonly peopleOptions = computed(() =>
    this.employees().map((e) => ({
      value: e.id,
      label: `${e.empNumber} · ${e.name}${e.companyEmail ? '' : ' (no office email)'}`,
    })),
  );
  protected readonly recipients = computed(() => {
    if (this.mode() === 'PICK') {
      const ids = new Set(this.picked());
      return this.employees().filter((e) => ids.has(e.id));
    }
    const brand = this.brandId();
    return this.employees().filter((e) => brand === null || e.brandId === brand);
  });
  protected readonly noEmail = computed(() => this.recipients().filter((e) => !e.companyEmail).length);
  protected readonly noPhone = computed(() => this.recipients().filter((e) => !whatsappNumber(e.phone)).length);

  // how
  protected readonly channel = signal<Channel>('EMAIL');
  protected readonly channelOptions = [
    { label: 'Email', value: 'EMAIL', icon: 'pi pi-envelope' },
    { label: 'WhatsApp', value: 'WHATSAPP', icon: 'pi pi-whatsapp' },
    { label: 'Both', value: 'BOTH', icon: 'pi pi-clone' },
  ];
  protected readonly byEmail = computed(() => this.channel() !== 'WHATSAPP');
  protected readonly byWhatsApp = computed(() => this.channel() !== 'EMAIL');
  /** Email is needed for this send but the server cannot send mail yet. */
  protected readonly mailBlocked = computed(() => this.byEmail() && this.setup()?.ready === false);
  protected readonly sendLabel = computed(() =>
    this.channel() === 'WHATSAPP' ? 'Prepare WhatsApp' : this.channel() === 'BOTH' ? 'Send email + WhatsApp' : 'Send',
  );

  // what
  protected readonly subject = signal('');
  protected readonly greetingMode = signal<'NAME' | 'CUSTOM'>('NAME');
  protected readonly greetingText = signal('All');
  protected readonly body = signal('');
  protected readonly greetingOptions = [
    { label: 'Their name', value: 'NAME' },
    { label: 'Same for all', value: 'CUSTOM' },
  ];
  protected readonly formError = signal('');

  /** How the mail reads for the first person who will get it. */
  protected readonly preview = computed(() => {
    const name = (this.recipients().find((e) => e.companyEmail) ?? this.recipients()[0])?.name ?? 'Anu Thomas';
    const fill = (s: string) => s.split(NAME).join(name);
    const greeting = this.greetingMode() === 'NAME' ? name : fill(this.greetingText().trim() || 'All');
    return {
      name,
      subject: fill(this.subject().trim()) || '(no subject)',
      greeting,
      body: fill(this.body().trim()) || 'Your message…',
      signedBy: this.auth.user()?.name ?? '',
    };
  });

  // delivery
  protected readonly rows = signal<Row[]>([]);
  /** The channel of the send shown in the delivery list. */
  protected readonly sentVia = signal<Channel>('EMAIL');
  protected readonly running = signal(false);
  protected readonly show = signal<'ALL' | 'SENT' | 'FAILED'>('ALL');
  protected readonly showOptions = computed(() => [
    { label: `All ${this.rows().length}`, value: 'ALL' },
    { label: `Sent ${this.counts().sent}`, value: 'SENT' },
    { label: `Failed ${this.counts().failed}`, value: 'FAILED' },
  ]);
  protected readonly counts = computed(() => {
    const rows = this.rows().filter((r) => r.status !== 'off');
    const sent = rows.filter((r) => r.status === 'sent').length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    return { total: rows.length, sent, failed, done: sent + failed };
  });
  protected readonly progress = computed(() => {
    const c = this.counts();
    return c.total ? Math.round((c.done * 100) / c.total) : 0;
  });
  protected readonly shownRows = computed(() => {
    const show = this.show();
    return this.rows().filter((r) => show === 'ALL' || (show === 'SENT' ? r.status === 'sent' : r.status === 'failed'));
  });
  protected readonly retryable = computed(() => this.rows().filter((r) => r.status === 'failed' && r.email).length);
  protected readonly waCounts = computed(() => {
    const rows = this.rows();
    const opened = rows.filter((r) => r.waState === 'opened').length;
    const ready = rows.filter((r) => r.waState === 'ready').length;
    const nophone = rows.filter((r) => r.waState === 'nophone').length;
    return { opened, ready, nophone, total: opened + ready };
  });

  private draft: Draft | null = null;
  private run: Subscription | null = null;

  constructor() {
    // leaving the page stops what has not gone out yet
    inject(DestroyRef).onDestroy(() => this.run?.unsubscribe());
  }

  ngOnInit(): void {
    this.mail.setup().subscribe({ next: (s) => this.setup.set(s), error: () => undefined });
    this.staff.brands().subscribe({ next: (b) => this.brands.set(b), error: () => undefined });
    this.staff.employees().subscribe({
      next: (list) => {
        this.employees.set(list.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name)));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }

  /** Puts {name} where the cursor is in the subject or the message. */
  protected insertName(field: HTMLInputElement | HTMLTextAreaElement, target: 'subject' | 'body'): void {
    const value = target === 'subject' ? this.subject() : this.body();
    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? value.length;
    const next = value.slice(0, start) + NAME + value.slice(end);
    (target === 'subject' ? this.subject : this.body).set(next);
    queueMicrotask(() => {
      field.focus();
      field.setSelectionRange(start + NAME.length, start + NAME.length);
    });
  }

  protected send(): void {
    this.formError.set('');
    const people = this.recipients();
    if (!this.subject().trim()) return this.formError.set('Write a subject.');
    if (!this.body().trim()) return this.formError.set('Write the message.');
    if (this.greetingMode() === 'CUSTOM' && !this.greetingText().trim()) return this.formError.set('Write the words after "Dear", e.g. All.');
    if (!people.length) return this.formError.set(this.mode() === 'PICK' ? 'Choose at least one person.' : 'Nobody to send to.');
    const channel = this.channel();
    const byEmail = this.byEmail();
    const byWhatsApp = this.byWhatsApp();
    const mails = byEmail ? people.length - this.noEmail() : 0;
    const chats = byWhatsApp ? people.length - this.noPhone() : 0;
    if (!mails && !chats) {
      return this.formError.set(
        channel === 'EMAIL' ? 'None of these people has an office email on record.'
          : channel === 'WHATSAPP' ? 'None of these people has a phone number on record.'
            : 'None of these people has an office email or a phone number on record.',
      );
    }

    const draft: Draft = {
      subject: this.subject().trim(),
      greeting: this.greetingMode() === 'NAME' ? '' : this.greetingText().trim(),
      body: this.body().trim(),
    };
    const begin = () => {
      this.draft = draft;
      this.sentVia.set(channel);
      this.show.set('ALL');
      const me = this.auth.user();
      const sign = { by: me?.name ?? '', company: me?.brandName ?? 'Amsidel Group' };
      this.rows.set(people.map((e) => toRow(e, byEmail, byWhatsApp, draft, sign)));
      if (byEmail) this.start(this.rows().filter((r) => r.status === 'queued'));
    };
    // WhatsApp alone sends nothing by itself (each message is opened with a tap), so it needs no confirmation
    if (!byEmail) return begin();

    const skipped = this.noEmail() ? ` (${this.noEmail()} without an office email will be skipped)` : '';
    this.confirm.confirm({
      header: byWhatsApp ? 'Send email and WhatsApp' : 'Send staff mail',
      message:
        `Send ${mails} separate ${mails === 1 ? 'mail' : 'mails'}, each addressed to the person${skipped}?` +
        (byWhatsApp ? ` Then open each of the ${chats} WhatsApp ${chats === 1 ? 'message' : 'messages'} from the list below.` : ''),
      icon: 'pi pi-send',
      acceptLabel: 'Send',
      rejectLabel: 'Cancel',
      rejectButtonProps: { outlined: true },
      accept: begin,
    });
  }

  /** Marks this person's WhatsApp message as opened (the link itself opens WhatsApp). */
  protected openedWhatsApp(r: Row): void {
    this.patch(r.id, { waState: 'opened' });
  }

  /** Opens the next person's WhatsApp message that has not been opened yet. */
  protected openNextWhatsApp(): void {
    const next = this.rows().find((r) => r.waState === 'ready');
    if (!next?.waLink) return;
    window.open(next.waLink, '_blank', 'noopener');
    this.openedWhatsApp(next);
  }

  protected retryFailed(): void {
    const again = this.rows().filter((r) => r.status === 'failed' && r.email);
    again.forEach((r) => this.patch(r.id, { status: 'queued', note: '', at: null }));
    this.start(again);
  }

  protected stop(): void {
    this.run?.unsubscribe();
    this.run = null;
    this.rows.update((rows) =>
      rows.map((r) => (r.status === 'queued' || r.status === 'sending' ? { ...r, status: 'failed', note: 'Not sent: stopped' } : r)),
    );
    this.running.set(false);
  }

  protected clear(): void {
    this.rows.set([]);
  }

  protected tag(r: Row): { value: string; severity: 'success' | 'danger' | 'info' | 'secondary' } {
    switch (r.status) {
      case 'sent': return { value: 'Sent', severity: 'success' };
      case 'failed': return { value: 'Failed', severity: 'danger' };
      case 'sending': return { value: 'Sending', severity: 'info' };
      default: return { value: 'Queued', severity: 'secondary' };
    }
  }

  private start(queue: Row[]): void {
    const draft = this.draft;
    if (!draft || !queue.length) return;
    this.running.set(true);
    this.run = from(queue)
      .pipe(
        mergeMap(
          (r) =>
            of(r).pipe(
              tap(() => this.patch(r.id, { status: 'sending' })),
              mergeMap(() => this.mail.send({ employeeId: r.id, ...draft })),
              map((res) => ({ id: r.id, status: (res.sent ? 'sent' : 'failed') as Delivery, note: res.error ?? '', at: res.at })),
              catchError((err) => of({ id: r.id, status: 'failed' as Delivery, note: apiProblem(err).message, at: null })),
            ),
          PARALLEL,
        ),
      )
      .subscribe({
        next: (u) => this.patch(u.id, { status: u.status, note: u.note, at: u.at }),
        complete: () => {
          this.running.set(false);
          const c = this.counts();
          this.toast.add({
            severity: c.failed ? 'warn' : 'success',
            summary: c.failed ? 'Sent with problems' : 'All mails sent',
            detail: `${c.sent} sent${c.failed ? `, ${c.failed} failed` : ''}`,
          });
        },
      });
  }

  private patch(id: number, change: Partial<Row>): void {
    this.rows.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...change } : r)));
  }
}

function toRow(e: Employee, byEmail: boolean, byWhatsApp: boolean, draft: Draft, sign: { by: string; company: string }): Row {
  const email = e.companyEmail?.trim() || null;
  const wa = whatsappNumber(e.phone);
  return {
    id: e.id, name: e.name, empNumber: e.empNumber, email, photoPath: e.photoPath, photoUpdatedAt: e.photoUpdatedAt,
    status: !byEmail ? 'off' : email ? 'queued' : 'failed',
    note: byEmail && !email ? 'No office email on record' : '',
    at: null,
    wa,
    waState: !byWhatsApp ? 'off' : wa ? 'ready' : 'nophone',
    waLink: byWhatsApp && wa ? `https://wa.me/${wa}?text=${encodeURIComponent(whatsappText(e.name, draft, sign))}` : null,
  };
}

/** The same message as the mail, as WhatsApp text: the subject in bold on top, then the letter. */
function whatsappText(name: string, draft: Draft, sign: { by: string; company: string }): string {
  const fill = (s: string) => s.split(NAME).join(name);
  const greeting = draft.greeting ? fill(draft.greeting) : name;
  return `*${fill(draft.subject)}*\n\nDear ${greeting},\n\n${fill(draft.body)}\n\nRegards,\n${sign.by}\n${sign.company}`;
}

/**
 * A phone number as WhatsApp wants it: digits with the country code, no "+" or leading 0.
 * Ten-digit numbers are taken as Indian mobiles (+91). Anything too short or too long is not usable.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  let digits = (phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) digits = '91' + digits;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}
