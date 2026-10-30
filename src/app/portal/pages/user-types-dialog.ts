/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { apiProblem, Role, ROLE_LABELS, UserType } from '../portal.models';
import { StaffService } from '../staff.service';

/**
 * Owners and admins: the user types (portal access). Add one on an access level (Admin, Manager or Employee), rename
 * it, move it to another level (its people move too), switch it off, or delete one nobody has. The four built-in types
 * stay. Its menus are set on the Menu access page like any user type.
 */
@Component({
  selector: 'app-user-types-dialog',
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, MessageModule, SelectButtonModule, TagModule, ToggleSwitchModule],
  template: `
    <p-dialog header="User types (portal access)" [modal]="true" [visible]="open()" (visibleChange)="open.set($event)" [draggable]="false"
              appendTo="body" [style]="{ width: '680px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }">
      <section class="form" [class.form--edit]="!!editing()">
        <h3>{{ editing() ? 'Change “' + editing()!.name + '”' : 'Add a user type' }}</h3>
        <div class="pf"><label for="ut-name">Name *</label>
          <input pInputText id="ut-name" maxlength="60" placeholder="e.g. Accountant, Site supervisor" [ngModel]="name()" (ngModelChange)="name.set($event)" /></div>
        <div class="pf"><span class="pf-label" id="ut-level">Access level *</span>
          <p-selectbutton [options]="levels" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabelledBy="ut-level"
                          [disabled]="!!editing()?.builtIn" [ngModel]="level()" (ngModelChange)="level.set($event)" />
          <small class="hint">{{ levelHint(level()) }} Its menus are set on this page like any user type.</small></div>
        <div class="pf"><label for="ut-desc">Note</label>
          <input pInputText id="ut-desc" maxlength="200" placeholder="What this type is for (optional)" [ngModel]="desc()" (ngModelChange)="desc.set($event)" /></div>
        @if (error()) { <p-message severity="error" styleClass="msg">{{ error() }}</p-message> }
        <div class="acts">
          @if (editing()) { <p-button label="Cancel" [text]="true" (onClick)="reset()" /> }
          <p-button [label]="editing() ? 'Save' : 'Add'" [icon]="editing() ? 'pi pi-check' : 'pi pi-plus'" [loading]="busy()" (onClick)="save()" />
        </div>
      </section>

      <ul class="list">
        @for (t of types(); track t.id) {
          <li [class.off]="!t.active">
            <span class="name"><b>{{ t.name }}</b>
              <span class="tags">
                <p-tag [value]="levelLabel(t.baseRole) + ' level'" severity="secondary" />
                @if (t.builtIn) { <p-tag value="Built in" severity="info" /> }
                @if (!t.active) { <p-tag value="Switched off" severity="warn" /> }
                <small class="muted">{{ t.employees }} {{ t.employees === 1 ? 'employee' : 'employees' }}</small>
              </span>
              @if (t.description) { <small class="muted block">{{ t.description }}</small> }</span>
            <span class="row-acts">
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" [ariaLabel]="'Change ' + t.name" (onClick)="edit(t)" />
              @if (!t.builtIn) {
                <p-button [icon]="t.active ? 'pi pi-eye-slash' : 'pi pi-eye'" [text]="true" [rounded]="true" [title]="t.active ? 'Switch off' : 'Switch on'"
                          [ariaLabel]="(t.active ? 'Switch off ' : 'Switch on ') + t.name" (onClick)="toggle(t)" />
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger" [disabled]="t.employees > 0"
                          [title]="t.employees > 0 ? 'In use: give its people another type first' : 'Delete'" [ariaLabel]="'Delete ' + t.name" (onClick)="remove(t)" />
              }
            </span>
          </li>
        }
      </ul>
      <p class="muted note">A user type with employees cannot be deleted: give them another type first, or switch it off so it is not given to new people.</p>
    </p-dialog>
  `,
  styles: `
    h3 { margin: 0 0 4px; font-size: 1rem; }
    .form { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: #fafafa; margin-bottom: 16px; }
    .form--edit { border-color: #9ca3af; background: #fff; }
    .pf { display: grid; gap: 6px; }
    .pf input { width: 100%; }
    .acts { display: flex; justify-content: flex-end; gap: 8px; }
    :host ::ng-deep .msg { margin: 0; }
    .list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    .list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; }
    .list li + li { border-top: 1px solid var(--line); }
    .list li.off .name b { color: var(--muted); }
    .name { min-width: 0; display: grid; gap: 4px; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .row-acts { display: flex; flex: none; }
    .muted { color: var(--muted); font-size: .8rem; }
    .block { display: block; }
    .note { margin: 12px 0 0; }
  `,
})
export class UserTypesDialog {
  private readonly staff = inject(StaffService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  /** Added, changed or deleted: the page reloads its user types. */
  readonly changed = output<void>();

  protected readonly open = signal(false);
  protected readonly types = signal<UserType[]>([]);
  protected readonly editing = signal<UserType | null>(null);
  protected readonly name = signal('');
  protected readonly level = signal<Role>('EMPLOYEE');
  protected readonly desc = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly levels = (['ADMIN', 'MANAGER', 'EMPLOYEE'] as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  show(): void {
    this.reset();
    this.load();
    this.open.set(true);
  }

  private load(): void {
    this.staff.userTypes().subscribe({ next: (t) => this.types.set(t), error: (e) => this.error.set(apiProblem(e).message) });
  }

  protected levelLabel(r: Role): string {
    return ROLE_LABELS[r];
  }

  protected levelHint(r: Role): string {
    return r === 'ADMIN' ? 'Admin level: manages people and settings of their brand (or every brand).'
      : r === 'MANAGER' ? 'Manager level: leads a team, approves its leave.'
        : r === 'OWNER' ? 'Owner: every menu, every brand.' : 'Employee level: their own records and the menus given.';
  }

  protected reset(): void {
    this.editing.set(null);
    this.name.set('');
    this.level.set('EMPLOYEE');
    this.desc.set('');
    this.error.set('');
  }

  protected edit(t: UserType): void {
    this.editing.set(t);
    this.name.set(t.name);
    this.level.set(t.baseRole);
    this.desc.set(t.description ?? '');
    this.error.set('');
  }

  protected save(): void {
    const name = this.name().trim();
    if (!name) return this.error.set('Give the name.');
    const t = this.editing();
    const go = () => {
      this.busy.set(true);
      this.staff.saveUserType({ name, baseRole: this.level(), description: this.desc().trim() || null, active: t ? t.active : true }, t?.id).subscribe({
        next: (saved) => {
          this.busy.set(false);
          this.toast.add({ severity: 'success', summary: t ? 'User type saved' : 'User type added', detail: `${saved.name} · ${ROLE_LABELS[saved.baseRole]} level` });
          this.reset();
          this.load();
          this.changed.emit();
        },
        error: (e) => {
          this.busy.set(false);
          this.error.set(apiProblem(e).message);
        },
      });
    };
    if (t && !t.builtIn && t.baseRole !== this.level() && t.employees > 0) {
      this.confirm.confirm({
        header: 'Change the access level', icon: 'pi pi-exclamation-triangle',
        message: `${t.employees} ${t.employees === 1 ? 'employee has' : 'employees have'} “${t.name}”: they move to the ${ROLE_LABELS[this.level()]} level too.`,
        acceptLabel: 'Change', rejectLabel: 'Keep', rejectButtonProps: { outlined: true }, accept: go,
      });
      return;
    }
    go();
  }

  protected toggle(t: UserType): void {
    this.staff.saveUserType({ name: t.name, baseRole: t.baseRole, description: t.description, active: !t.active }, t.id).subscribe({
      next: (saved) => {
        this.toast.add({ severity: 'success', summary: saved.active ? 'Switched on' : 'Switched off',
          detail: saved.active ? `${saved.name} can be given again.` : `${saved.name} stays with its people but is not given to new ones.` });
        this.load();
        this.changed.emit();
      },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Not changed', detail: apiProblem(e).message }),
    });
  }

  protected remove(t: UserType): void {
    this.confirm.confirm({
      header: 'Delete user type', message: `Delete “${t.name}” and its menu access? Nobody has it.`, icon: 'pi pi-trash',
      acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.staff.deleteUserType(t.id).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'User type deleted', detail: t.name });
          if (this.editing()?.id === t.id) this.reset();
          this.load();
          this.changed.emit();
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message }),
      }),
    });
  }
}
