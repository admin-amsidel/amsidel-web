/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { apiProblem } from '../portal.models';
import { BrandMailLimits, MailService, STAFF_MAIL_API, TRADE_MAIL_API } from './mail.service';
import { ExcelTable } from '../excel-export';

/** A brand's row, with the numbers being typed. */
interface Row extends BrandMailLimits {
  pickDraft: number | null;
  dailyDraft: number | null;
  ccDraft: string;
  headerDraft: string;
  footerDraft: string;
}

/**
 * The Email config screens (staff email; route data audience = 'TRADE': customer & supplier email): each brand's limits
 * (people in one send, emails a day), how many emails went today, and the office address copied on every mail.
 * Owners and group admins see every brand (for staff email also the group-level people); anyone else with the tick
 * only their own brand. Each kind of mail has its own limits, count and office copy. A brand's own Brevo account is
 * one per brand, for both kinds of mail, so either screen sets it up; the SMTP key is typed here but never comes back.
 */
@Component({
  selector: 'app-staff-mail-config',
  imports: [ExcelTable, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, MessageModule, TableModule],
  template: `
    <div class="p-head">
      <div>
        <h1>{{ trade ? 'Customer & supplier email config' : 'Staff email config' }}</h1>
        <p>For each brand: how many people can be emailed in one send and in a day, and the office address copied on every
          mail. An email counts for the brand of the {{ trade ? 'customer or supplier' : 'person' }} who gets it, whoever sends it. The count starts again each day.</p>
      </div>
    </div>

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <p-table [appExcel]="trade ? 'Customer and supplier email limits' : 'Staff email limits'" [value]="rows()" [loading]="loading()" styleClass="p-stack" [tableStyle]="{ 'min-width': '1100px' }">
        <ng-template #header>
          <tr><th>Brand</th><th>People in one send</th><th>Emails a day</th><th>Office copy (CC)</th><th class="num">Sent today</th><th class="num">Left today</th><th></th></tr>
        </ng-template>
        <ng-template #body let-r>
          <tr>
            <td class="stack-full">
              <span class="brand">
                @if (r.brandCode) { <span class="code">{{ r.brandCode }}</span> }
                <b>{{ r.brandName }}</b>
              </span>
            </td>
            <td data-label="People in one send">
              <p-inputnumber [(ngModel)]="r.pickDraft" [min]="1" [max]="500" inputStyleClass="num-in"
                             [ariaLabel]="'People in one send, ' + r.brandName" />
            </td>
            <td data-label="Emails a day">
              <p-inputnumber [(ngModel)]="r.dailyDraft" [min]="0" [max]="100000" placeholder="No limit" inputStyleClass="num-in"
                             [ariaLabel]="'Emails a day, ' + r.brandName" />
            </td>
            <td data-label="Office copy (CC)" class="stack-full">
              <input pInputText type="email" maxlength="254" class="cc" [(ngModel)]="r.ccDraft" [placeholder]="r.ccOverride ? defaultCc() : r.alwaysCc"
                     [attr.aria-label]="'Office copy, ' + r.brandName" />
            </td>
            <td class="num" data-label="Sent today"><b>{{ r.sentToday }}</b></td>
            <td class="num" data-label="Left today" [class.none]="r.leftToday === 0">{{ r.leftToday ?? 'No limit' }}</td>
            <td class="stack-end act">
              <p-button label="Save" size="small" [outlined]="true" [loading]="busy() === r.brandId + ''"
                        [disabled]="!changed(r)" [ariaLabel]="'Save limits of ' + r.brandName" (onClick)="save(r)" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="7" class="p-empty">No brand to set limits for.</td></tr>
        </ng-template>
      </p-table>
      <p class="note">Leave "Emails a day" empty for no limit; 0 stops this mail for the brand. The daily limit applies to
        everyone, owners too. Only emails that went out are counted. WhatsApp messages go from the sender's own WhatsApp
        and are not counted. Every mail is copied to the brand's office address; leave it empty to use the default{{ defaultCc() ? ' (' + defaultCc() + ')' : '' }}.</p>
    </section>

    <section class="p-card brevo">
      <h2>Mail header and footer</h2>
      <p class="intro">The line at the top and the line at the bottom of every {{ trade ? 'customer and supplier' : 'staff' }} mail, for each brand. Leave
        one empty to use the default shown in it.</p>
      <p-table appExcel="Mail header and footer" [value]="rows()" [loading]="loading()" styleClass="p-stack" [tableStyle]="{ 'min-width': '860px' }">
        <ng-template #header>
          <tr><th>Brand</th><th>Header</th><th>Footer</th><th></th></tr>
        </ng-template>
        <ng-template #body let-r>
          <tr>
            <td class="stack-full">
              <span class="brand">
                @if (r.brandCode) { <span class="code">{{ r.brandCode }}</span> }
                <b>{{ r.brandName }}</b>
              </span>
            </td>
            <td data-label="Header" class="stack-full">
              <input pInputText class="line" maxlength="60" [(ngModel)]="r.headerDraft" [placeholder]="r.defaultHeader"
                     [attr.aria-label]="'Mail header, ' + r.brandName" />
            </td>
            <td data-label="Footer" class="stack-full">
              <input pInputText class="line" maxlength="200" [(ngModel)]="r.footerDraft" [placeholder]="r.defaultFooter"
                     [attr.aria-label]="'Mail footer, ' + r.brandName" />
            </td>
            <td class="stack-end act">
              <p-button label="Save" size="small" [outlined]="true" [loading]="busyLook() === r.brandId + ''"
                        [disabled]="!lookChanged(r)" [ariaLabel]="'Save the mail header and footer of ' + r.brandName" (onClick)="saveLook(r)" />
            </td>
          </tr>
        </ng-template>
      </p-table>
    </section>

    <section class="p-card brevo">
      <h2>Brevo account</h2>
      <p class="intro">Each brand can send through its own Brevo account, for both staff email and customer &amp; supplier email.
        A brand without one uses the default account{{ defaultFrom() ? ' (' + defaultFrom() + ')' : '' }}.</p>
      <p-table appExcel="Brevo accounts" [value]="rows()" [loading]="loading()" styleClass="p-stack" [tableStyle]="{ 'min-width': '760px' }">
        <ng-template #header>
          <tr><th>Brand</th><th>Sends from</th><th>Brevo login</th><th></th></tr>
        </ng-template>
        <ng-template #body let-r>
          <tr>
            <td class="stack-full">
              <span class="brand">
                @if (r.brandCode) { <span class="code">{{ r.brandCode }}</span> }
                <b>{{ r.brandName }}</b>
              </span>
            </td>
            @if (r.ownAccount) {
              <td data-label="Sends from">{{ r.accountFromName ? r.accountFromName + ' · ' : '' }}{{ r.accountFrom }}</td>
              <td data-label="Brevo login">{{ r.accountLogin }}</td>
            } @else {
              <td data-label="Sends from" class="muted">Default account</td>
              <td data-label="Brevo login" class="muted">—</td>
            }
            <td class="stack-end act">
              <span class="btns">
                <p-button [label]="r.ownAccount ? 'Change' : 'Set up'" size="small" [outlined]="true" [ariaLabel]="'Brevo account of ' + r.brandName" (onClick)="openBrevo(r)" />
                @if (r.ownAccount) {
                  <p-button label="Test" size="small" [text]="true" [loading]="testing() === r.brandId + ''" [ariaLabel]="'Test the Brevo account of ' + r.brandName" (onClick)="testBrevo(r)" />
                  <p-button label="Use default" size="small" [text]="true" severity="secondary" [ariaLabel]="'Use the default account for ' + r.brandName" (onClick)="removeBrevo(r)" />
                }
              </span>
            </td>
          </tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog [header]="'Brevo account · ' + (editing()?.brandName ?? '')" [modal]="true" [visible]="!!editing()" (visibleChange)="!$event && editing.set(null)"
              [style]="{ width: '520px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      @if (editing(); as e) {
        <div class="bform">
          <div class="pf"><label for="b-login">SMTP login *</label>
            <input pInputText id="b-login" maxlength="190" autocomplete="off" spellcheck="false" placeholder="e.g. bf6436001@smtp-brevo.com"
                   [ngModel]="bLogin()" (ngModelChange)="bLogin.set($event)" />
            <small class="hint">In Brevo: SMTP &amp; API, on the SMTP tab.</small></div>
          <div class="pf"><label for="b-key">SMTP key {{ e.ownAccount ? '' : '*' }}</label>
            <input pInputText id="b-key" type="password" maxlength="300" autocomplete="new-password" spellcheck="false"
                   [placeholder]="e.ownAccount ? 'Saved; type to change' : 'From the same page'"
                   [ngModel]="bKey()" (ngModelChange)="bKey.set($event)" />
            <small class="hint">The SMTP key, not an API key. It is saved and never shown again.</small></div>
          <div class="pf"><label for="b-from">Send from address *</label>
            <input pInputText id="b-from" type="email" maxlength="254" autocomplete="off" placeholder="e.g. info@yourbrand.com"
                   [ngModel]="bFrom()" (ngModelChange)="bFrom.set($event)" />
            <small class="hint">It must be a sender or domain verified in Brevo (Senders &amp; Domains), or Brevo refuses the mail.</small></div>
          <div class="pf"><label for="b-name">Send from name</label>
            <input pInputText id="b-name" maxlength="120" autocomplete="off" placeholder="e.g. Amsidel Doors &amp; Windows"
                   [ngModel]="bName()" (ngModelChange)="bName.set($event)" /></div>
        </div>
        @if (bError()) { <p-message severity="error" styleClass="dlg-msg">{{ bError() }}</p-message> }
      }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="editing.set(null)" />
        <p-button label="Save and test" icon="pi pi-check" [loading]="bBusy()" (onClick)="saveBrevo()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .brand { display: inline-flex; align-items: center; gap: 8px; }
    .code { font-size: .76rem; font-weight: 700; color: var(--brass-dark); background: var(--accent-soft); border-radius: 6px; padding: 2px 7px; }
    :host ::ng-deep .num-in { width: 110px; }
    .cc { width: 100%; min-width: 280px; }
    .line { width: 100%; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .none { color: #b91c1c; font-weight: 700; }
    .act { text-align: right; }
    .brevo { margin-top: 20px; }
    .brevo h2 { margin: 0 0 4px; }
    .intro { margin: 0 0 12px; color: var(--muted); font-size: .9rem; }
    .muted { color: var(--muted); }
    .btns { display: inline-flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
    .bform { display: grid; gap: 14px; }
    .bform input { width: 100%; }
    :host ::ng-deep .dlg-msg { margin-top: 12px; }
    .note { margin: 16px 0 0; font-size: .84rem; color: var(--muted); max-width: 80ch; }
    @media (max-width: 760px) {
      .num { text-align: left; }
      :host ::ng-deep .num-in { width: 100%; }
    }
  `,
})
export class StaffMailConfig implements OnInit {
  private readonly mail = inject(MailService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly trade = inject(ActivatedRoute).snapshot.data['audience'] === 'TRADE';
  private readonly api = this.trade ? TRADE_MAIL_API : STAFF_MAIL_API;
  /** The office address when a brand has none of its own. */
  protected readonly defaultCc = signal('');
  /** Where mail comes from when a brand has no Brevo account of its own. */
  protected readonly defaultFrom = signal('');

  protected readonly rows = signal<Row[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  /** The row being saved. */
  protected readonly busy = signal<string | null>(null);

  ngOnInit(): void {
    this.mail.setup(this.api).subscribe({
      next: (s) => {
        this.defaultCc.set(s.alwaysCc ?? '');
        this.defaultFrom.set(s.from ?? '');
      },
      error: () => undefined,
    });
    this.mail.config(this.api).subscribe({
      next: (list) => {
        this.rows.set(list.map(toRow));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }

  protected changed(r: Row): boolean {
    return r.pickDraft !== r.pickLimit || (r.dailyDraft ?? null) !== (r.dailyLimit ?? null) || r.ccDraft.trim() !== (r.ccOverride ?? '');
  }

  protected save(r: Row): void {
    if (!r.pickDraft) return this.fail('Give the number of people in one send.');
    this.error.set('');
    this.busy.set(r.brandId + '');
    this.mail.saveConfig({ brandId: r.brandId, pickLimit: r.pickDraft, dailyLimit: r.dailyDraft ?? null, alwaysCc: r.ccDraft.trim() || null,
      mailHeader: r.mailHeader, mailFooter: r.mailFooter }, this.api).subscribe({
      next: (list) => {
        this.busy.set(null);
        const saved = list.find((x) => x.brandId === r.brandId);
        // only this row: what is being typed in the others stays
        if (saved) this.rows.update((rows) => rows.map((x) => (x.brandId === r.brandId ? { ...toRow(saved), headerDraft: x.headerDraft, footerDraft: x.footerDraft } : x)));
        this.toast.add({ severity: 'success', summary: 'Limits saved', detail: r.brandName });
      },
      error: (err) => {
        this.busy.set(null);
        const p = apiProblem(err);
        this.fail(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  // ---- the mail's header and footer ----

  /** The row whose header and footer are being saved. */
  protected readonly busyLook = signal<string | null>(null);

  protected lookChanged(r: Row): boolean {
    return r.headerDraft.trim() !== (r.mailHeader ?? '') || r.footerDraft.trim() !== (r.mailFooter ?? '');
  }

  /** Only the header and footer: the limits as saved, whatever is being typed above. */
  protected saveLook(r: Row): void {
    this.error.set('');
    this.busyLook.set(r.brandId + '');
    this.mail.saveConfig({ brandId: r.brandId, pickLimit: r.pickLimit, dailyLimit: r.dailyLimit, alwaysCc: r.ccOverride,
      mailHeader: r.headerDraft.trim() || null, mailFooter: r.footerDraft.trim() || null }, this.api).subscribe({
      next: (list) => {
        this.busyLook.set(null);
        const saved = list.find((x) => x.brandId === r.brandId);
        if (saved) {
          this.rows.update((rows) => rows.map((x) => (x.brandId === r.brandId
            ? { ...toRow(saved), pickDraft: x.pickDraft, dailyDraft: x.dailyDraft, ccDraft: x.ccDraft } : x)));
        }
        this.toast.add({ severity: 'success', summary: 'Mail header and footer saved', detail: r.brandName });
      },
      error: (err) => {
        this.busyLook.set(null);
        const p = apiProblem(err);
        this.fail(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  // ---- the brand's own Brevo account ----

  protected readonly editing = signal<Row | null>(null);
  protected readonly bLogin = signal('');
  protected readonly bKey = signal('');
  protected readonly bFrom = signal('');
  protected readonly bName = signal('');
  protected readonly bError = signal('');
  protected readonly bBusy = signal(false);
  /** The row whose account is being tested. */
  protected readonly testing = signal<string | null>(null);

  protected openBrevo(r: Row): void {
    this.bLogin.set(r.accountLogin ?? '');
    this.bKey.set('');
    this.bFrom.set(r.accountFrom ?? '');
    this.bName.set(r.accountFromName ?? (r.brandCode ? r.brandName : ''));
    this.bError.set('');
    this.editing.set(r);
  }

  protected saveBrevo(): void {
    const r = this.editing();
    if (!r) return;
    this.bError.set('');
    if (!this.bLogin().trim() || !this.bFrom().trim()) return this.bError.set('Give the SMTP login and the address to send from.');
    if (!r.ownAccount && !this.bKey().trim()) return this.bError.set('Give the SMTP key.');
    this.bBusy.set(true);
    this.mail.saveBrevo({ brandId: r.brandId, smtpLogin: this.bLogin().trim(), smtpKey: this.bKey().trim(), fromEmail: this.bFrom().trim(), fromName: this.bName().trim() }, this.api).subscribe({
      next: (list) => {
        this.bBusy.set(false);
        this.editing.set(null);
        this.bKey.set('');
        this.merge(list);
        // saved either way; say at once whether Brevo takes it
        this.testBrevo(r);
      },
      error: (err) => {
        this.bBusy.set(false);
        const p = apiProblem(err);
        this.bError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected testBrevo(r: Row): void {
    this.testing.set(r.brandId + '');
    this.mail.testBrevo(r.brandId, this.api).subscribe({
      next: (t) => {
        this.testing.set(null);
        this.toast.add(t.ok
          ? { severity: 'success', summary: 'Brevo account works', detail: `${r.brandName}: ${t.message}` }
          : { severity: 'error', summary: 'Brevo account not working', detail: `${r.brandName}: ${t.message}`, life: 10000 });
      },
      error: (err) => {
        this.testing.set(null);
        this.fail(apiProblem(err).message);
      },
    });
  }

  protected removeBrevo(r: Row): void {
    this.confirm.confirm({
      header: 'Use the default account',
      message: `${r.brandName} will send through the default account, and its Brevo login and key are removed from the portal.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Use default',
      rejectLabel: 'Keep',
      rejectButtonProps: { outlined: true },
      accept: () => this.mail.removeBrevo(r.brandId, this.api).subscribe({
        next: (list) => this.merge(list),
        error: (err) => this.fail(apiProblem(err).message),
      }),
    });
  }

  /** Fresh account details for each row; what is being typed in the limits stays. */
  private merge(list: BrandMailLimits[]): void {
    this.rows.update((rows) => rows.map((x) => {
      const b = list.find((l) => l.brandId === x.brandId);
      return b ? { ...x, ownAccount: b.ownAccount, accountLogin: b.accountLogin, accountFrom: b.accountFrom, accountFromName: b.accountFromName } : x;
    }));
  }

  private fail(message: string): void {
    this.error.set(message);
  }
}

function toRow(b: BrandMailLimits): Row {
  return { ...b, pickDraft: b.pickLimit, dailyDraft: b.dailyLimit, ccDraft: b.ccOverride ?? '', headerDraft: b.mailHeader ?? '', footerDraft: b.mailFooter ?? '' };
}
