import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { apiProblem } from '../portal.models';
import { CATEGORY_HINTS, MoneyType } from './accounts.models';
import { AccountsService, MoneyTypes } from './accounts.service';

/**
 * Owners and admins: the income and expense categories. Add one, rename it, mark it as funding (investment, loans: in
 * the bank tally, not the profit), switch it off (kept for old entries, not offered any more) or delete one never used.
 * A category in use stays income or expense; the discount (invoice write-offs) keeps everything but its name.
 */
@Component({
  selector: 'app-category-dialog',
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, MessageModule, SelectButtonModule, TagModule, ToggleSwitchModule],
  template: `
    <p-dialog header="Income & expense categories" [modal]="true" [visible]="open()" (visibleChange)="open.set($event)" [draggable]="false"
              appendTo="body" [style]="{ width: '720px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }">
      <section class="form" [class.form--edit]="!!editing()">
        <h3>{{ editing() ? 'Change “' + editing()!.label + '”' : 'Add a category' }}</h3>
        <div class="row">
          <div class="pf grow"><label for="ct-name">Name *</label>
            <input pInputText id="ct-name" maxlength="80" placeholder="e.g. Office supplies" [ngModel]="label()" (ngModelChange)="label.set($event)" (keyup.enter)="save()" /></div>
          <div class="pf"><span class="pf-label" id="ct-side">Money</span>
            <p-selectbutton [options]="sides" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabelledBy="ct-side"
                            [disabled]="!!editing() && (editing()!.used || editing()!.locked)" [ngModel]="income()" (ngModelChange)="income.set($event)" /></div>
        </div>
        <label class="check" for="ct-fund"><p-toggleswitch inputId="ct-fund" [disabled]="!!editing()?.locked" [ngModel]="funding()" (ngModelChange)="funding.set($event)" />
          <span>Funding: investment, a loan or its repayment <small class="muted block">In the bank tally, not in the profit and loss</small></span></label>
        @if (editing()?.used && !editing()?.locked) { <small class="muted block">In use by entries, so it stays {{ editing()!.income ? 'income' : 'an expense' }}.</small> }
        @if (editing()?.locked) { <small class="muted block">Used for invoice write-offs: only the name can change.</small> }
        @if (error()) { <p-message severity="error" styleClass="msg">{{ error() }}</p-message> }
        <div class="acts">
          @if (editing()) { <p-button label="Cancel" [text]="true" (onClick)="reset()" /> }
          <p-button [label]="editing() ? 'Save' : 'Add'" [icon]="editing() ? 'pi pi-check' : 'pi pi-plus'" [loading]="busy()" (onClick)="save()" />
        </div>
      </section>

      @for (g of groups(); track g.title) {
        <h3 class="group">{{ g.title }} <small class="muted">{{ g.items.length }}</small></h3>
        <ul class="list">
          @for (t of g.items; track t.code) {
            <li [class.off]="!t.active">
              <span class="name"><b>{{ t.label }}</b>
                <small class="muted block">{{ hint(t) }}</small>
                <span class="tags">
                  @if (t.funding) { <p-tag value="Funding · not profit" severity="info" /> }
                  @if (!t.active) { <p-tag value="Switched off" severity="secondary" /> }
                  @if (t.used) { <p-tag value="In use" severity="contrast" /> }
                </span></span>
              <span class="row-acts">
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" [ariaLabel]="'Change ' + t.label" (onClick)="edit(t)" />
                @if (!t.locked) {
                  <p-button [icon]="t.active ? 'pi pi-eye-slash' : 'pi pi-eye'" [text]="true" [rounded]="true"
                            [ariaLabel]="(t.active ? 'Switch off ' : 'Switch on ') + t.label" [title]="t.active ? 'Switch off' : 'Switch on'" (onClick)="toggle(t)" />
                }
                @if (!t.used && !t.locked) {
                  <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger" [ariaLabel]="'Delete ' + t.label" (onClick)="remove(t)" />
                }
              </span>
            </li>
          }
        </ul>
      }
    </p-dialog>
  `,
  styles: `
    h3 { margin: 0 0 10px; font-size: 1rem; }
    .form { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: #fafafa; margin-bottom: 18px; }
    .form--edit { border-color: #9ca3af; background: #fff; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; }
    .pf { display: grid; gap: 6px; min-width: 0; }
    .grow { flex: 1 1 260px; }
    .grow input { width: 100%; }
    .check { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; font-size: .9rem; }
    .acts { display: flex; justify-content: flex-end; gap: 8px; }
    :host ::ng-deep .msg { margin: 0; }
    .group { margin-top: 6px; display: flex; gap: 8px; align-items: baseline; }
    .list { list-style: none; margin: 0 0 16px; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    .list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; }
    .list li + li { border-top: 1px solid var(--line); }
    .list li.off .name b { color: var(--muted); text-decoration: line-through; }
    .name { min-width: 0; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
    .tags:empty { display: none; }
    .row-acts { display: flex; flex: none; }
    .block { display: block; }
    @media (max-width: 760px) {
      .form { padding: 12px; }
      .row > .pf:not(.grow) { flex: 1 1 100%; }
      .list li { padding: 8px 10px; }
    }
  `,
})
export class CategoryDialog {
  private readonly accounts = inject(AccountsService);
  private readonly types = inject(MoneyTypes);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  /** Something changed: the page reloads its lists. */
  readonly changed = output<void>();

  protected readonly open = signal(false);
  protected readonly editing = signal<MoneyType | null>(null);
  protected readonly label = signal('');
  protected readonly income = signal(false);
  protected readonly funding = signal(false);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly sides = [{ label: 'Expense (out)', value: false }, { label: 'Income (in)', value: true }];
  protected readonly groups = computed(() => [
    { title: 'Income', items: this.types.list().filter((t) => t.income) },
    { title: 'Expenses', items: this.types.list().filter((t) => !t.income) },
  ]);

  show(): void {
    this.reset();
    this.types.load(true);
    this.open.set(true);
  }

  protected hint(t: MoneyType): string {
    return CATEGORY_HINTS[t.code] ?? (t.updatedByName ? 'Added by ' + t.updatedByName : 'Added in the portal');
  }

  protected reset(): void {
    this.editing.set(null);
    this.label.set('');
    this.income.set(false);
    this.funding.set(false);
    this.error.set('');
  }

  protected edit(t: MoneyType): void {
    this.editing.set(t);
    this.label.set(t.label);
    this.income.set(t.income);
    this.funding.set(t.funding);
    this.error.set('');
  }

  protected save(): void {
    const label = this.label().trim();
    if (!label) return this.error.set('Give the name.');
    const t = this.editing();
    this.busy.set(true);
    this.accounts.saveCategory(t?.code ?? null, { label, income: this.income(), funding: this.funding(), active: t ? t.active : true }).subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.toast.add({ severity: 'success', summary: t ? 'Category saved' : 'Category added', detail: `${saved.label} (${saved.income ? 'income' : 'expense'})` });
        this.reset();
        this.reload();
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected toggle(t: MoneyType): void {
    this.accounts.saveCategory(t.code, { label: t.label, active: !t.active }).subscribe({
      next: (saved) => {
        this.toast.add({ severity: 'success', summary: saved.active ? 'Switched on' : 'Switched off',
          detail: saved.active ? `${saved.label} is offered again.` : `${saved.label} is kept for old entries but not offered for new ones.` });
        if (this.editing()?.code === t.code) this.reset();
        this.reload();
      },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Not changed', detail: apiProblem(e).message }),
    });
  }

  protected remove(t: MoneyType): void {
    this.confirm.confirm({
      header: 'Delete category', message: `Delete “${t.label}”? No entry uses it.`, icon: 'pi pi-trash',
      acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.accounts.deleteCategory(t.code).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Category deleted', detail: t.label });
          if (this.editing()?.code === t.code) this.reset();
          this.reload();
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message }),
      }),
    });
  }

  private reload(): void {
    this.types.refresh().subscribe({ next: () => this.changed.emit(), error: () => undefined });
  }
}
