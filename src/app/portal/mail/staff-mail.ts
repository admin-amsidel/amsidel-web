import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, from, map, mergeMap, of, Subscription, tap } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { ProgressBarModule } from 'primeng/progressbar';
import { ProgressTone } from '../progress-tone';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { Avatar } from '../avatar';
import { apiProblem, Employee } from '../portal.models';
import { StaffService } from '../staff.service';
import { MailBody, MailRecipient, MailService, MailSetup, PictureAlign, PictureSize, STAFF_MAIL_API, TRADE_MAIL_API } from './mail.service';

/** Email delivery; 'off' when this send is WhatsApp only. */
type Delivery = 'queued' | 'sending' | 'sent' | 'failed' | 'off';
/** WhatsApp: the message waits for a tap ('ready'), was opened in WhatsApp, or cannot go (no usable phone). */
type WhatsApp = 'ready' | 'opened' | 'nophone' | 'off';
export type Channel = 'EMAIL' | 'WHATSAPP' | 'BOTH';

/** Staff mail goes to employees; customer and supplier mail (Product portal) to customers and suppliers. */
type Audience = 'STAFF' | 'TRADE';

/** Someone who can get the mail: an employee, a customer or a supplier. */
interface Person {
  /** Unique in the list (suppliers are negative, so they never clash with customers). */
  key: number;
  id: number;
  kind: 'EMPLOYEE' | 'CUSTOMER' | 'SUPPLIER';
  name: string;
  /** Employee number, customer or supplier code. */
  code: string;
  email: string | null;
  phone: string | null;
  brandId: number | null;
  photoPath: string | null;
  photoUpdatedAt: string | null;
}

interface Row {
  /** Person.key */
  id: number;
  personId: number;
  kind: Person['kind'];
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

/** Everything about the message except who gets it. */
type Draft = Omit<MailBody, 'employeeId' | 'party' | 'partyId'>;

/** A file added to the mail: uploading, ready (with its id on the server) or failed. */
interface Upload {
  key: number;
  name: string;
  size: number;
  state: 'uploading' | 'ready' | 'failed';
  error: string;
  fileId: string | null;
}

/** A picture inside the message, at [[image n]] in the text. */
interface Picture extends Upload {
  /** Shown in the preview (a local object URL). */
  thumb: string;
  caption: string;
  align: PictureAlign;
  /** How big in the mail. */
  width: PictureSize;
}

/** One piece of the preview: text, or a picture where [[image n]] is. */
type PreviewPart = { kind: 'text'; text: string } | { kind: 'pic'; pic: Picture };

const NAME = '{name}';
/** **bold** in a line; a "# " line is a heading (the server reads the text the same way). */
const BOLD = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g;
const HEADING = /^#{1,3}\s+(.+)$/;
const MARKER = /\[\[image (\d{1,2})]]/g;
const MB = 1024 * 1024;
/** Same limits as the server (MailFileStore). */
const MAX_FILE = 10 * MB;
const MAX_TOTAL = 14 * MB;
const MAX_FILES = 10;
const ATTACH_TYPES = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
/** Pictures mail apps show inside the message everywhere. */
const PICTURE_TYPES = ['jpg', 'jpeg', 'png', 'gif'];
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
/** Mails in flight at once: quick for 100 people, gentle on the mail server. */
const PARALLEL = 3;

/**
 * Staff mail, and the Product portal's customer and supplier mail (the same page; route data audience = 'TRADE'):
 * one message written once and sent to each chosen employee (or customer, or supplier) as their own personal mail
 * ("Dear Anu," or "Dear All,") at their office address. While it sends, every person's mail shows queued,
 * sending, sent or failed (with the reason); failed ones can be sent again. Nothing is kept after leaving the page.
 * WhatsApp (free, from the sender's own WhatsApp): each person's message opens in WhatsApp ready to send with one
 * tap, through WhatsApp's click-to-chat link; the page cannot see whether it was then sent, so it shows "Opened".
 * Email can also carry CC/BCC (copied on every person's mail), attachments (pictures, PDF, Word) and pictures with a
 * caption inside the text; files are uploaded once, as they are added, and every mail refers to them.
 */
@Component({
  selector: 'app-staff-mail',
  imports: [
    FormsModule, DatePipe, Avatar, ButtonModule, InputTextModule, MessageModule, MultiSelectModule, ProgressBarModule, ProgressTone,
    SelectModule, SelectButtonModule, TableModule, TagModule, TextareaModule,
  ],
  templateUrl: './staff-mail.html',
  styleUrl: './staff-mail.scss',
})
export class StaffMail implements OnInit {
  private readonly mail = inject(MailService);
  private readonly staff = inject(StaffService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  /** Who this page mails, and the API it uses. */
  protected readonly audience: Audience = inject(ActivatedRoute).snapshot.data['audience'] === 'TRADE' ? 'TRADE' : 'STAFF';
  protected readonly trade = this.audience === 'TRADE';
  private readonly api = this.trade ? TRADE_MAIL_API : STAFF_MAIL_API;
  /** The words that differ between the two. */
  protected readonly t = this.trade
    ? {
      title: 'Customer & supplier mail', intro: 'Write once; each customer or supplier gets it personally, by email, WhatsApp or both.',
      person: 'customer or supplier', people: 'Customers / suppliers', theirName: "customer's or supplier's name", loading: 'Loading customers and suppliers…',
      emailCol: 'Email', noEmail: 'without an email', noEmailAll: 'None of them has an email on record.', who: 'Customer / supplier',
      confirm: 'Send customer & supplier mail', placeholder: 'e.g. Your quotation for the villa windows', pick: 'Choose customers or suppliers',
      search: 'Search by name, code or email', chosen: '{0} chosen', bodyHint: 'What they should know: an offer, a quotation, an order, a reminder…',
    }
    : {
      title: 'Staff mail', intro: 'Write once; each employee gets it personally, by office email, WhatsApp or both.',
      person: 'employee', people: 'People', theirName: "employee's name", loading: 'Loading employees…',
      emailCol: 'Office email', noEmail: 'without an office email', noEmailAll: 'None of these people has an office email on record.', who: 'Employee',
      confirm: 'Send staff mail', placeholder: 'e.g. New client: Kumar residence', pick: 'Choose people',
      search: 'Search by name or number', chosen: '{0} people', bodyHint: 'What everyone should know: a new process, a new client, a reminder…',
    };

  protected readonly setup = signal<MailSetup | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  // who
  protected readonly employees = signal<Person[]>([]);
  protected readonly brands = signal<{ id: number; name: string }[]>([]);
  protected readonly brandId = signal<number | null>(null);
  protected readonly mode = signal<'ALL' | 'CUSTOMERS' | 'SUPPLIERS' | 'PICK'>(this.trade ? 'CUSTOMERS' : 'ALL');
  protected readonly picked = signal<number[]>([]);
  protected readonly modeOptions = this.trade
    ? [
      { label: 'All customers', value: 'CUSTOMERS' },
      { label: 'All suppliers', value: 'SUPPLIERS' },
      { label: 'Choose', value: 'PICK' },
    ]
    : [
      { label: 'All employees', value: 'ALL' },
      { label: 'Choose people', value: 'PICK' },
    ];
  protected readonly brandOptions = computed(() => [
    { value: null, label: 'All brands' },
    ...this.brands().map((b) => ({ value: b.id, label: b.name })),
  ]);
  protected readonly peopleOptions = computed(() =>
    this.employees().map((e) => ({
      value: e.key,
      label: `${this.trade ? (e.kind === 'CUSTOMER' ? 'Customer' : 'Supplier') + ' · ' : ''}${e.code} · ${e.name}`
        + (e.email ? (this.trade ? ' · ' + e.email : '') : this.trade ? ' (no email)' : ' (no office email)'),
    })),
  );
  protected readonly recipients = computed(() => {
    if (this.mode() === 'PICK') {
      const ids = new Set(this.picked());
      return this.employees().filter((e) => ids.has(e.key));
    }
    const brand = this.brandId();
    const kind = this.mode() === 'CUSTOMERS' ? 'CUSTOMER' : this.mode() === 'SUPPLIERS' ? 'SUPPLIER' : 'EMPLOYEE';
    return this.employees().filter((e) => e.kind === kind && (brand === null || e.brandId === brand));
  });
  protected readonly noEmail = computed(() => this.recipients().filter((e) => !e.email).length);
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
  /** The sign-off at the end; what is saved on the server, and the standard one. */
  protected readonly signature = signal('');
  protected readonly signatureSaved = signal<string | null>(null);
  protected readonly signatureStandard = signal('');
  protected readonly signatureBusy = signal(false);
  protected readonly alignOptions = [
    { label: 'Left', value: 'LEFT', icon: 'pi pi-align-left' },
    { label: 'Centre', value: 'CENTER', icon: 'pi pi-align-center' },
    { label: 'Right', value: 'RIGHT', icon: 'pi pi-align-right' },
  ];
  protected readonly sizeOptions = [
    { label: 'Small', value: 'SMALL' },
    { label: 'Medium', value: 'MEDIUM' },
    { label: 'Full width', value: 'LARGE' },
  ];
  protected readonly rich = richHtml;

  // copies and files (email only)
  protected readonly showCopies = signal(false);
  protected readonly ccText = signal('');
  protected readonly bccText = signal('');
  protected readonly cc = computed(() => addresses(this.ccText()));
  protected readonly bcc = computed(() => addresses(this.bccText()));
  protected readonly badAddresses = computed(() => [...this.cc(), ...this.bcc()].filter((a) => !EMAIL.test(a)));
  /** The office address the server copies on every mail (shown, cannot be taken off). */
  protected readonly alwaysCc = computed(() => this.setup()?.alwaysCc?.trim() ?? '');
  protected readonly attachments = signal<Upload[]>([]);
  protected readonly pictures = signal<Picture[]>([]);
  protected readonly attachAccept = ATTACH_TYPES.map((t) => '.' + t).join(',');
  protected readonly pictureAccept = PICTURE_TYPES.map((t) => '.' + t).join(',');
  protected readonly totalSize = computed(() =>
    [...this.attachments(), ...this.pictures()].filter((u) => u.state !== 'failed').reduce((s, u) => s + u.size, 0),
  );
  protected readonly uploading = computed(() => [...this.attachments(), ...this.pictures()].some((u) => u.state === 'uploading'));
  private nextKey = 1;

  /** How the mail reads for the first person who will get it. */
  protected readonly preview = computed(() => {
    const name = (this.recipients().find((e) => e.email) ?? this.recipients()[0])?.name ?? (this.trade ? 'Varghese Villa' : 'Anu Thomas');
    const fill = (s: string) => s.split(NAME).join(name);
    const greeting = this.greetingMode() === 'NAME' ? name : fill(this.greetingText().trim() || 'All');
    return {
      name,
      subject: fill(this.subject().trim()) || '(no subject)',
      greeting,
      body: fill(this.body().trim()) || 'Your message…',
      signature: fill(this.signature().trim()),
    };
  });
  /** The message with each [[image n]] shown as its picture; pictures not placed come after the text. */
  protected readonly previewParts = computed<PreviewPart[]>(() => {
    const pics = this.pictures();
    const parts: PreviewPart[] = [];
    const placed = new Set<number>();
    const text = this.preview().body;
    let last = 0;
    for (const m of text.matchAll(MARKER)) {
      const n = Number(m[1]);
      parts.push({ kind: 'text', text: text.slice(last, m.index).replace(/^\n|\n$/g, '') });
      if (pics[n - 1]) {
        parts.push({ kind: 'pic', pic: pics[n - 1] });
        placed.add(n);
      }
      last = m.index + m[0].length;
    }
    parts.push({ kind: 'text', text: text.slice(last).replace(/^\n/, '') });
    pics.forEach((p, i) => { if (!placed.has(i + 1)) parts.push({ kind: 'pic', pic: p }); });
    return parts.filter((p) => p.kind === 'pic' || p.text.trim());
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
    inject(DestroyRef).onDestroy(() => {
      this.run?.unsubscribe();
      this.pictures().forEach((p) => URL.revokeObjectURL(p.thumb));
    });
  }

  ngOnInit(): void {
    this.mail.setup(this.api).subscribe({ next: (s) => this.setup.set(s), error: () => undefined });
    this.mail.signature(this.api).subscribe({ next: (s) => this.fillSignature(s), error: () => undefined });
    const failed = (err: unknown) => {
      this.error.set(apiProblem(err).message);
      this.loading.set(false);
    };
    if (this.trade) {
      this.mail.recipients().subscribe({
        next: (r) => {
          this.brands.set(r.brands);
          this.employees.set([...r.customers, ...r.suppliers].map(fromParty));
          this.loading.set(false);
        },
        error: failed,
      });
      return;
    }
    this.staff.brands().subscribe({ next: (b) => this.brands.set(b), error: () => undefined });
    this.staff.employees().subscribe({
      next: (list) => {
        this.employees.set(list.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name)).map(fromEmployee));
        this.loading.set(false);
      },
      error: failed,
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

  /** Wraps the selected words in **…** (or takes the marks off again); with nothing selected, adds **bold text**. */
  protected bold(field: HTMLTextAreaElement): void {
    const value = this.body();
    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? value.length;
    const picked = value.slice(start, end);
    const wrapped = value.slice(Math.max(0, start - 2), start) === '**' && value.slice(end, end + 2) === '**';
    let next: string;
    let from: number;
    let to: number;
    if (wrapped) {
      next = value.slice(0, start - 2) + picked + value.slice(end + 2);
      from = start - 2;
      to = end - 2;
    } else {
      // leave spaces around the selection outside the stars
      const word = picked.trim() || 'bold text';
      const lead = picked.length - picked.trimStart().length;
      const s = start + (picked.trim() ? lead : 0);
      const e = picked.trim() ? s + word.length : end;
      next = value.slice(0, s) + '**' + word + '**' + value.slice(e);
      from = s + 2;
      to = from + word.length;
    }
    this.body.set(next);
    queueMicrotask(() => {
      field.focus();
      field.setSelectionRange(from, to);
    });
  }

  /** Makes the line the cursor is on a heading ("# " at its start), or a plain line again. */
  protected heading(field: HTMLTextAreaElement): void {
    const value = this.body();
    const pos = field.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
    const lineEnd = value.indexOf('\n', pos) === -1 ? value.length : value.indexOf('\n', pos);
    const line = value.slice(lineStart, lineEnd);
    const mark = /^#{1,3}\s+/.exec(line);
    const nextLine = mark ? line.slice(mark[0].length) : '# ' + (line.trim() || 'Heading');
    this.body.set(value.slice(0, lineStart) + nextLine + value.slice(lineEnd));
    queueMicrotask(() => {
      field.focus();
      const cursor = lineStart + nextLine.length;
      field.setSelectionRange(cursor, cursor);
    });
  }

  protected saveSignature(): void {
    const text = this.signature().trim();
    this.signatureBusy.set(true);
    this.mail.saveSignature(text, this.api).subscribe({
      next: (s) => {
        this.signatureBusy.set(false);
        this.fillSignature(s);
        this.toast.add({ severity: 'success', summary: s.saved ? 'Signature saved' : 'Back to the standard signature' });
      },
      error: (err) => {
        this.signatureBusy.set(false);
        this.toast.add({ severity: 'error', summary: 'Signature not saved', detail: apiProblem(err).message });
      },
    });
  }

  private fillSignature(s: { signature: string; standard: string }): void {
    this.signature.set(s.signature);
    this.signatureSaved.set(s.signature);
    this.signatureStandard.set(s.standard);
  }

  /** Uploads the chosen files as attachments. */
  protected addAttachments(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      if (this.attachments().length + this.pictures().length >= MAX_FILES * 2 || this.attachments().length >= MAX_FILES) {
        this.toast.add({ severity: 'warn', summary: 'Too many files', detail: `At most ${MAX_FILES} attachments.` });
        break;
      }
      const problem = this.check(file, ATTACH_TYPES, 'Attach pictures, PDF or Word files only.');
      if (problem) {
        this.toast.add({ severity: 'warn', summary: file.name, detail: problem });
        continue;
      }
      const u: Upload = { key: this.nextKey++, name: file.name, size: file.size, state: 'uploading', error: '', fileId: null };
      this.attachments.update((list) => [...list, u]);
      this.upload(file, u.key, this.attachments);
    }
  }

  protected removeAttachment(u: Upload): void {
    this.attachments.update((list) => list.filter((x) => x.key !== u.key));
    if (u.fileId) this.mail.remove(u.fileId, this.api).subscribe({ error: () => undefined });
  }

  /** Uploads a picture and puts [[image n]] on its own line where the cursor is in the message. */
  protected addPicture(input: HTMLInputElement, field: HTMLTextAreaElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (this.pictures().length >= MAX_FILES) {
      this.toast.add({ severity: 'warn', summary: 'Too many pictures', detail: `At most ${MAX_FILES} pictures in the message.` });
      return;
    }
    const problem = this.check(file, PICTURE_TYPES, 'Pictures inside the message must be JPG, PNG or GIF.');
    if (problem) {
      this.toast.add({ severity: 'warn', summary: file.name, detail: problem });
      return;
    }
    const p: Picture = {
      key: this.nextKey++, name: file.name, size: file.size, state: 'uploading', error: '', fileId: null,
      thumb: URL.createObjectURL(file), caption: '', align: 'CENTER', width: 'LARGE',
    };
    this.pictures.update((list) => [...list, p]);
    const marker = `[[image ${this.pictures().length}]]`;
    const value = this.body();
    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const insert = (before && !before.endsWith('\n') ? '\n' : '') + marker + (after.startsWith('\n') ? '' : '\n');
    this.body.set(before + insert + after);
    queueMicrotask(() => {
      field.focus();
      field.setSelectionRange(start + insert.length, start + insert.length);
    });
    this.upload(file, p.key, this.pictures);
  }

  /** Removes the picture and its [[image n]]; the pictures after it move up one number. */
  protected removePicture(p: Picture): void {
    const n = this.pictures().findIndex((x) => x.key === p.key) + 1;
    if (!n) return;
    const body = this.body()
      .replace(new RegExp(`\\[\\[image ${n}]]\\n?`, 'g'), '')
      .replace(MARKER, (m, k) => (Number(k) > n ? `[[image ${Number(k) - 1}]]` : m));
    this.body.set(body);
    this.pictures.update((list) => list.filter((x) => x.key !== p.key));
    URL.revokeObjectURL(p.thumb);
    if (p.fileId) this.mail.remove(p.fileId, this.api).subscribe({ error: () => undefined });
  }

  protected setCaption(p: Picture, caption: string): void {
    this.pictures.update((list) => list.map((x) => (x.key === p.key ? { ...x, caption } : x)));
  }

  /** Where the picture sits in the mail (left, centre, right) and how big it is. */
  protected setLayout(p: Picture, change: Partial<Pick<Picture, 'align' | 'width'>>): void {
    this.pictures.update((list) => list.map((x) => (x.key === p.key ? { ...x, ...change } : x)));
  }

  protected size(bytes: number): string {
    return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  protected fileIcon(name: string): string {
    const ext = extension(name);
    if (ext === 'pdf') return 'pi pi-file-pdf';
    if (ext === 'doc' || ext === 'docx') return 'pi pi-file-word';
    return 'pi pi-image';
  }

  private check(file: File, types: string[], wrongType: string): string | null {
    if (!types.includes(extension(file.name))) return wrongType;
    if (file.size > MAX_FILE) return `${this.size(file.size)}: each file must be 10 MB or smaller.`;
    if (this.totalSize() + file.size > MAX_TOTAL) return 'Attachments and pictures together must be 14 MB or smaller.';
    return null;
  }

  private upload(file: File, key: number, list: typeof this.attachments | typeof this.pictures): void {
    const patch = (change: Partial<Upload>) =>
      (list as typeof this.attachments).update((items) => items.map((x) => (x.key === key ? { ...x, ...change } : x)));
    this.mail.upload(file, this.api).subscribe({
      next: (f) => {
        // removed while it was uploading: drop it on the server too
        if (!(list as typeof this.attachments)().some((x) => x.key === key)) {
          this.mail.remove(f.id, this.api).subscribe({ error: () => undefined });
          return;
        }
        patch({ state: 'ready', fileId: f.id, size: f.size });
      },
      error: (err) => patch({ state: 'failed', error: apiProblem(err).message }),
    });
  }

  protected send(): void {
    this.formError.set('');
    const people = this.recipients();
    if (!this.subject().trim()) return this.formError.set('Write a subject.');
    if (!this.body().trim()) return this.formError.set('Write the message.');
    if (this.byEmail()) {
      if (this.badAddresses().length) return this.formError.set(`Check the CC/BCC addresses: ${this.badAddresses().join(', ')}`);
      if (this.cc().length > 10 || this.bcc().length > 10) return this.formError.set('At most 10 CC and 10 BCC addresses.');
      if (this.uploading()) return this.formError.set('Wait for the files to finish uploading.');
      if ([...this.attachments(), ...this.pictures()].some((u) => u.state === 'failed')) {
        return this.formError.set('Remove the files that could not be uploaded, or add them again.');
      }
    }
    if (this.greetingMode() === 'CUSTOM' && !this.greetingText().trim()) return this.formError.set('Write the words after "Dear", e.g. All.');
    if (!this.signature().trim()) return this.formError.set('Write a signature, or press "Use standard".');
    if (!people.length) return this.formError.set(this.mode() === 'PICK' ? `Choose at least one ${this.t.person}.` : 'Nobody to send to.');
    const channel = this.channel();
    const byEmail = this.byEmail();
    const byWhatsApp = this.byWhatsApp();
    const mails = byEmail ? people.length - this.noEmail() : 0;
    const chats = byWhatsApp ? people.length - this.noPhone() : 0;
    if (!mails && !chats) {
      return this.formError.set(
        channel === 'EMAIL' ? this.t.noEmailAll
          : channel === 'WHATSAPP' ? 'None of them has a phone number on record.'
            : 'None of them has an email or a phone number on record.',
      );
    }

    const draft: Draft = {
      subject: this.subject().trim(),
      greeting: this.greetingMode() === 'NAME' ? '' : this.greetingText().trim(),
      body: this.body().trim(),
      cc: this.cc(),
      bcc: this.bcc(),
      attachments: this.attachments().map((u) => u.fileId!),
      images: this.pictures().map((p) => ({ fileId: p.fileId!, caption: p.caption.trim(), align: p.align, size: p.width })),
      signature: this.signature().trim(),
    };
    const begin = () => {
      this.draft = draft;
      this.sentVia.set(channel);
      this.show.set('ALL');
      this.rows.set(people.map((e) => toRow(e, byEmail, byWhatsApp, draft)));
      if (byEmail) this.start(this.rows().filter((r) => r.status === 'queued'));
    };
    // WhatsApp alone sends nothing by itself (each message is opened with a tap), so it needs no confirmation
    if (!byEmail) return begin();

    const skipped = this.noEmail() ? ` (${this.noEmail()} ${this.t.noEmail} will be skipped)` : '';
    const copies = draft.cc.length + draft.bcc.length;
    const copied = copies
      ? ` Each one is also copied to ${copies} CC/BCC ${copies === 1 ? 'address' : 'addresses'} (${mails * copies} copies in all).`
      : '';
    const office = this.alwaysCc() ? ` The office (${this.alwaysCc()}) gets a copy of each.` : '';
    this.confirm.confirm({
      header: byWhatsApp ? 'Send email and WhatsApp' : this.t.confirm,
      message:
        `Send ${mails} separate ${mails === 1 ? 'mail' : 'mails'}, each addressed to the person${skipped}?${copied}${office}` +
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
              mergeMap(() => this.mail.send(
                r.kind === 'EMPLOYEE' ? { employeeId: r.personId, ...draft } : { party: r.kind, partyId: r.personId, ...draft },
                this.api,
              )),
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

function fromEmployee(e: Employee): Person {
  return {
    key: e.id, id: e.id, kind: 'EMPLOYEE', name: e.name, code: e.empNumber, email: e.companyEmail?.trim() || null, phone: e.phone,
    brandId: e.brandId, photoPath: e.photoPath, photoUpdatedAt: e.photoUpdatedAt,
  };
}

function fromParty(p: MailRecipient): Person {
  return {
    key: p.party === 'SUPPLIER' ? -p.id : p.id, id: p.id, kind: p.party, name: p.name, code: p.code, email: p.email?.trim() || null,
    phone: p.phone, brandId: p.brandId, photoPath: null, photoUpdatedAt: null,
  };
}

function toRow(e: Person, byEmail: boolean, byWhatsApp: boolean, draft: Draft): Row {
  const email = e.email;
  const wa = whatsappNumber(e.phone);
  return {
    id: e.key, personId: e.id, kind: e.kind, name: e.name, empNumber: e.code, email, photoPath: e.photoPath, photoUpdatedAt: e.photoUpdatedAt,
    status: !byEmail ? 'off' : email ? 'queued' : 'failed',
    note: byEmail && !email ? (e.kind === 'EMPLOYEE' ? 'No office email on record' : 'No email on record') : '',
    at: null,
    wa,
    waState: !byWhatsApp ? 'off' : wa ? 'ready' : 'nophone',
    waLink: byWhatsApp && wa ? `https://wa.me/${wa}?text=${encodeURIComponent(whatsappText(e.name, draft))}` : null,
  };
}

/** The same message as the mail, as WhatsApp text: the subject in bold on top, then the letter and the signature. */
function whatsappText(name: string, draft: Draft): string {
  const fill = (s: string) => s.split(NAME).join(name);
  const greeting = draft.greeting ? fill(draft.greeting) : name;
  // pictures and attachments go by email only
  const body = fill(draft.body).replace(/\[\[image \d{1,2}]]\n?/g, '').trim();
  return `*${fill(draft.subject)}*\n\nDear ${greeting},\n\n${whatsappMarks(body)}\n\n${whatsappMarks(fill(draft.signature))}`;
}

/** WhatsApp's own bold: **words** -> *words*, a "# " heading -> a bold line. */
function whatsappMarks(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const h = HEADING.exec(line);
      return h ? `*${h[1].replace(/\*\*/g, '').trim()}*` : line.replace(BOLD, '*$1*');
    })
    .join('\n');
}

/** The text as the mail shows it, for the preview: escaped, **bold** in bold, "# " lines as headings. */
function richHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let out = '';
  let block = true;
  for (const line of text.split('\n')) {
    const h = HEADING.exec(line);
    if (h) {
      out += `<div class="rt-h">${esc(h[1]).replace(BOLD, '$1')}</div>`;
      block = true;
      continue;
    }
    out += (block ? '' : '<br>') + esc(line).replace(BOLD, '<b>$1</b>');
    block = false;
  }
  return out;
}

/** "a@x.com, b@x.com; c@x.com" -> each address, trimmed, without repeats. */
function addresses(text: string): string[] {
  const seen = new Set<string>();
  return text.split(/[\s,;]+/).filter((a) => a && !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase()));
}

function extension(name: string): string {
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
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
