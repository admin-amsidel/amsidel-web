import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AuthService } from '../auth.service';
import { AccessSubject, MenuAccessEntry, MenuAccessService } from '../menu-access.service';
import { apiProblem, Employee, MenuNode, ROLE_LABELS, UserType } from '../portal.models';
import { UserTypesDialog } from './user-types-dialog';
import { StaffService } from '../staff.service';

const HINTS: Record<string, string> = {
  OWNER: 'Always every menu', ADMIN: 'Runs a brand or the group', MANAGER: 'Leads a team', EMPLOYEE: 'Everyone else',
};

const BUILT_IN_SUBJECTS: Subject[] = (['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'] as const).map((r) => ({
  type: 'ROLE' as const, key: r, label: ROLE_LABELS[r], hint: HINTS[r], locked: r === 'OWNER',
}));

/** The user types as subjects: built-in first, then the added ones with their level. */
function typeSubjects(types: UserType[]): Subject[] {
  return types.map((t) => ({
    type: 'ROLE' as const, key: t.code, label: t.name, locked: t.baseRole === 'OWNER',
    hint: t.builtIn ? HINTS[t.code] ?? '' : `${ROLE_LABELS[t.baseRole]} level · ${t.employees} ${t.employees === 1 ? 'person' : 'people'}${t.active ? '' : ' · switched off'}`,
  }));
}

interface Subject {
  type: AccessSubject;
  key: string;
  label: string;
  hint: string;
  /** Owners always have every menu. */
  locked?: boolean;
}

const ALL = '*';

/**
 * Menu access: which menus each user type, designation and specific person may open, by checkpoint number.
 * Ticking a menu gives all its sub-menus; "Every menu" gives "*". A person with menus of their own gets only
 * those; anyone else gets their user type's menus plus their designation's. Saving needs the Owner or Admin user
 * type (the backend checks it too).
 */
@Component({
  selector: 'app-menu-access',
  imports: [FormsModule, ButtonModule, CheckboxModule, MessageModule, SelectModule, ToggleSwitchModule, UserTypesDialog],
  template: `
    <div class="p-head">
      <div>
        <h1>Menu access</h1>
        <p>Choose a user type, a designation or a person, then tick the menus they may open. A person set up here gets
          only their own menus; everyone else gets the menus of their user type plus those of their designation.</p>
      </div>
    </div>

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    @if (!canSave()) {
      <p-message severity="info" styleClass="page-message">You can look at menu access; changing it needs the Owner or Admin user type.</p-message>
    }

    <div class="ma">
      <section class="p-card who">
        <div class="h2row"><h2>User types</h2>
          @if (canSave()) { <p-button label="Manage" ariaLabel="Manage user types" icon="pi pi-cog" size="small" [text]="true" (onClick)="typesDialog().show()" /> }</div>
        <div class="list">
          @for (s of roleSubjects(); track s.key) {
            <button type="button" class="subj" [class.on]="isSelected(s)" (click)="select(s)">
              <span><b>{{ s.label }}</b><small>{{ s.hint }}</small></span>
              <em [class.all]="summary(s) === 'All menus'">{{ summary(s) }}</em>
            </button>
          }
        </div>
        <h2 class="mt">Designations</h2>
        <div class="list">
          @for (s of designationSubjects(); track s.key) {
            <button type="button" class="subj" [class.on]="isSelected(s)" (click)="select(s)">
              <span><b>{{ s.label }}</b><small>{{ s.hint }}</small></span>
              <em [class.all]="summary(s) === 'All menus'" [class.none]="summary(s) === 'Nothing extra'">{{ summary(s) }}</em>
            </button>
          }
        </div>
        <h2 class="mt">Specific users</h2>
        <p class="note">Their own menus replace their user type's and designation's.</p>
        <p-select [options]="addOptions()" optionLabel="label" optionValue="value" [filter]="true" filterBy="label"
                  placeholder="Add a person…" filterPlaceholder="Name, user ID or number" styleClass="add" appendTo="body"
                  [ngModel]="null" (ngModelChange)="addUser($event)" [disabled]="!canSave()" ariaLabel="Add a person" />
        <div class="list">
          @for (s of userSubjects(); track s.key) {
            <button type="button" class="subj" [class.on]="isSelected(s)" (click)="select(s)">
              <span><b>{{ s.label }}</b><small>{{ s.hint }}</small></span>
              <em [class.all]="summary(s) === 'All menus'" [class.none]="summary(s) === 'Not set'">{{ summary(s) }}</em>
            </button>
          } @empty {
            <p class="note">Nobody yet.</p>
          }
        </div>
      </section>

      <section class="p-card what">
        @if (selected(); as s) {
          <div class="what__head">
            <div>
              <p class="eyebrow">{{ s.type === 'ROLE' ? 'User type' : s.type === 'DESIGNATION' ? 'Designation' : 'Specific user · ' + s.hint }}</p>
              <h2>{{ s.label }}</h2>
            </div>
            <label class="every" for="ma-all">
              <p-toggleswitch inputId="ma-all" [ngModel]="all()" (ngModelChange)="setAll($event)" [disabled]="readOnly()" />
              Every menu (*)
            </label>
          </div>
          @if (s.locked) {
            <p class="muted">Owners always have every menu, so nobody can lock the company out.</p>
          }
          @if (s.type === 'EMPLOYEE') {
            <p-message severity="info" styleClass="who-note">
              Only the menus ticked here count for {{ s.label }}; their user type and designation are not used. Untick
              everything and save to go back to them.
            </p-message>
          }

          <ul class="tree" [class.dim]="all()">
            @for (m of menus(); track m.code) {
              <li>
                <label class="row top" [for]="'ma-' + m.code">
                  <p-checkbox [inputId]="'ma-' + m.code" [binary]="true" [ngModel]="covers(m)" (ngModelChange)="toggle(m, $event)"
                              [disabled]="readOnly() || all()" />
                  <i [class]="'pi ' + (m.icon ?? 'pi-folder')" aria-hidden="true"></i>
                  <span class="name"><b>{{ m.name }}</b><small>{{ m.description }}</small></span>
                  <code>{{ m.checkpoint }}</code>
                </label>
                @if (m.children.length) {
                  <ul>
                    @for (c of m.children; track c.code) {
                      <li>
                        <label class="row" [for]="'ma-' + c.code">
                          <p-checkbox [inputId]="'ma-' + c.code" [binary]="true" [ngModel]="covers(c, m)" (ngModelChange)="toggle(c, $event)"
                                      [disabled]="readOnly() || all() || has(m)" />
                          <i [class]="'pi ' + (c.icon ?? 'pi-circle')" aria-hidden="true"></i>
                          <span class="name"><b>{{ c.name }}</b><small>{{ c.description }}</small></span>
                          <code>{{ c.checkpoint }}</code>
                        </label>
                      </li>
                    }
                  </ul>
                }
              </li>
            }
          </ul>

          <div class="p-actions">
            <p-button label="Save" icon="pi pi-check" [disabled]="readOnly() || !dirty()" [loading]="saving()" (onClick)="save()" />
            <p-button label="Undo changes" [text]="true" [disabled]="!dirty()" (onClick)="reset()" />
            <small class="muted">Saved as: {{ draftList().length ? draftList().join(', ') : 'nothing' }}</small>
          </div>
        } @else {
          <p class="p-empty">Choose a user type or a designation.</p>
        }
      </section>
    </div>
  
    <app-user-types-dialog (changed)="reloadTypes()" />
  `,
  styles: `
    .h2row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .h2row h2 { margin: 0; }
    .ma { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: 20px; align-items: start; }
    .ma > .p-card { margin-top: 0; }
    .who h2 { font-size: 1rem; margin-bottom: 8px; }
    .who h2.mt { margin-top: 18px; }
    .note { margin: -4px 0 8px; font-size: .78rem; color: var(--muted); }
    :host ::ng-deep .add { width: 100%; margin-bottom: 6px; }
    :host ::ng-deep .who-note { margin-bottom: 10px; }
    .list { display: grid; gap: 4px; }
    .subj {
      display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 9px 12px;
      border: 1px solid transparent; border-radius: 8px; background: none; cursor: pointer; font: inherit; color: inherit; text-align: left;
    }
    .subj:hover { background: var(--soft); }
    .subj.on { background: var(--accent-soft); border-color: var(--accent-line); }
    .subj span { display: grid; line-height: 1.25; min-width: 0; }
    .subj small { color: var(--muted); font-size: .76rem; }
    .subj em { font-style: normal; font-size: .75rem; white-space: nowrap; color: var(--brass-dark); font-weight: 600; }
    .subj em.all { color: #1f7a35; }
    .subj em.none { color: var(--muted); font-weight: 500; }
    .what__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .what__head h2 { margin: 0; }
    .eyebrow { margin: 0; font-size: .7rem; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .every { display: flex; align-items: center; gap: 10px; font-weight: 600; cursor: pointer; }
    .tree, .tree ul { list-style: none; margin: 0; padding: 0; }
    .tree > li { border-top: 1px solid var(--line); padding: 6px 0; }
    .tree ul { margin-left: 34px; border-left: 1px solid var(--line); padding-left: 10px; }
    .tree.dim { opacity: .55; }
    .row { display: flex; align-items: center; gap: 10px; padding: 6px 4px; cursor: pointer; }
    .row > i { color: var(--brass-dark); width: 18px; text-align: center; }
    .row .name { display: grid; line-height: 1.25; flex: 1; min-width: 0; }
    .row .name small { color: var(--muted); font-size: .76rem; }
    .row code { font-size: .75rem; background: var(--soft); border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; color: var(--ink); }
    .row.top .name b { font-size: .95rem; }
    .muted { color: var(--muted); }
    @media (max-width: 900px) { .ma { grid-template-columns: 1fr; } }
  `,
})
export class MenuAccessPage implements OnInit {
  private readonly service = inject(MenuAccessService);
  private readonly staff = inject(StaffService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly menus = signal<MenuNode[]>([]);
  private readonly entries = signal<Map<string, string[]>>(new Map());
  protected readonly designationSubjects = signal<Subject[]>([]);
  protected readonly userSubjects = signal<Subject[]>([]);
  private readonly people = signal<Employee[]>([]);
  /** People not in the list yet (owners always have every menu). */
  protected readonly addOptions = computed(() => {
    const listed = new Set(this.userSubjects().map((s) => s.key));
    return this.people()
      .filter((e) => e.active && e.role !== 'OWNER' && !listed.has(String(e.id)))
      .map((e) => ({ value: e.id, label: `${e.name} · ${e.userId} · ${e.empNumber}` }));
  });
  protected readonly roleSubjects = signal<Subject[]>(BUILT_IN_SUBJECTS);
  protected readonly typesDialog = viewChild.required(UserTypesDialog);
  protected readonly error = signal('');
  protected readonly selected = signal<Subject | null>(null);
  /** The ticked checkpoints of the selected subject, not yet saved. */
  protected readonly draft = signal<Set<string>>(new Set());
  protected readonly saving = signal(false);

  protected readonly canSave = computed(() => this.auth.isAdmin());
  protected readonly readOnly = computed(() => !this.canSave() || !!this.selected()?.locked);
  protected readonly all = computed(() => this.draft().has(ALL));
  protected readonly draftList = computed(() => [...this.draft()].sort());
  private readonly savedList = computed(() => {
    const s = this.selected();
    return s ? [...this.saved(s)].sort() : [];
  });
  protected readonly dirty = computed(() => this.draftList().join(',') !== this.savedList().join(','));

  ngOnInit(): void {
    forkJoin({
      menus: this.service.menus(),
      entries: this.service.entries(),
      designations: this.staff.designations(),
      people: this.staff.employees(),
      types: this.staff.userTypes(),
    }).subscribe({
      next: ({ menus, entries, designations, people, types }) => {
        this.roleSubjects.set(typeSubjects(types));
        this.menus.set(menus);
        this.setEntries(entries);
        this.people.set(people);
        this.userSubjects.set(
          entries.filter((e) => e.subjectType === 'EMPLOYEE').map((e) => personSubject(e.subjectKey, e.label ?? e.subjectKey)),
        );
        this.designationSubjects.set(
          designations.map((d) => ({ type: 'DESIGNATION' as const, key: String(d.id), label: d.name, hint: d.levelCode ? `Level ${d.levelCode}` : 'Designation' })),
        );
        this.select(this.roleSubjects()[1]);
      },
      error: (err) => this.error.set(apiProblem(err).message),
    });
  }

  /** After the user types changed: the list again (a deleted one that was chosen is let go). */
  protected reloadTypes(): void {
    this.staff.userTypes().subscribe({
      next: (types) => {
        this.roleSubjects.set(typeSubjects(types));
        const sel = this.selected();
        if (sel?.type === 'ROLE' && !types.some((t) => t.code === sel.key)) this.select(this.roleSubjects()[1]);
      },
    });
  }

  protected isSelected(s: Subject): boolean {
    const sel = this.selected();
    return !!sel && sel.type === s.type && sel.key === s.key;
  }

  protected select(s: Subject): void {
    if (this.isSelected(s)) return;
    const go = () => {
      this.selected.set(s);
      this.draft.set(new Set(this.saved(s)));
    };
    if (!this.dirty()) return go();
    this.confirm.confirm({
      header: 'Unsaved changes',
      message: `Leave ${this.selected()?.label} without saving?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Leave without saving',
      rejectLabel: 'Stay',
      rejectButtonProps: { outlined: true },
      accept: go,
    });
  }

  /** A person picked from "Add a person…": listed (not saved yet) and opened. */
  protected addUser(id: number | null): void {
    const e = this.people().find((p) => p.id === id);
    if (!e) return;
    const subject = personSubject(String(e.id), `${e.name} · ${e.userId} · ${e.empNumber}`);
    this.userSubjects.update((list) => [...list, subject]);
    this.select(subject);
  }

  /** "All menus", "5 menus", "Nothing extra" (designations add to the user type) or "Not set" (a person). */
  protected summary(s: Subject): string {
    const list = this.saved(s);
    if (list.includes(ALL)) return 'All menus';
    const pages = this.pagesOf(list);
    if (!pages) return s.type === 'DESIGNATION' ? 'Nothing extra' : s.type === 'EMPLOYEE' ? 'Not set' : 'None';
    return `${pages} ${pages === 1 ? 'menu' : 'menus'}`;
  }

  /** Ticked: given directly, through its parent menu, or by "*". */
  protected covers(m: MenuNode, parent?: MenuNode): boolean {
    return this.all() || this.has(m) || (!!parent && this.has(parent));
  }

  protected has(m: MenuNode): boolean {
    return this.draft().has(String(m.checkpoint));
  }

  protected toggle(m: MenuNode, on: boolean): void {
    this.draft.update((d) => {
      const next = new Set(d);
      if (on) {
        next.add(String(m.checkpoint));
        // the parent's checkpoint covers its sub-menus
        m.children.forEach((c) => next.delete(String(c.checkpoint)));
      } else {
        next.delete(String(m.checkpoint));
      }
      return next;
    });
  }

  protected setAll(on: boolean): void {
    this.draft.set(on ? new Set([ALL]) : new Set());
  }

  protected reset(): void {
    const s = this.selected();
    if (s) this.draft.set(new Set(this.saved(s)));
  }

  protected save(): void {
    const s = this.selected();
    if (!s) return;
    this.saving.set(true);
    this.service.save(s.type, s.key, this.draftList()).subscribe({
      next: (entry) => {
        this.saving.set(false);
        this.entries.update((map) => new Map(map).set(keyOf(entry.subjectType, entry.subjectKey), entry.checkpoints));
        this.draft.set(new Set(entry.checkpoints));
        this.toast.add({ severity: 'success', summary: 'Menu access saved', detail: `${s.label}: ${this.summary(s)}` });
        // my own menus may have changed
        this.auth.reloadAccess().subscribe();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiProblem(err).message });
      },
    });
  }

  private saved(s: Subject): string[] {
    if (s.locked) return [ALL];
    return this.entries().get(keyOf(s.type, s.key)) ?? [];
  }

  private setEntries(list: MenuAccessEntry[]): void {
    this.entries.set(new Map(list.map((e) => [keyOf(e.subjectType, e.subjectKey), e.checkpoints])));
  }

  /** How many pages (menus with an address) these checkpoints open. */
  private pagesOf(checkpoints: string[]): number {
    const given = new Set(checkpoints);
    let n = 0;
    for (const m of this.menus()) {
      const whole = given.has(String(m.checkpoint));
      if (m.path && whole) n++;
      for (const c of m.children) if (c.path && (whole || given.has(String(c.checkpoint)))) n++;
    }
    return n;
  }
}

function keyOf(type: AccessSubject, key: string): string {
  return `${type}:${key}`;
}

/** From "Name · user ID · number": the name as the title, the rest below it. */
function personSubject(key: string, label: string): Subject {
  const [name, ...rest] = label.split(' · ');
  return { type: 'EMPLOYEE', key, label: name, hint: rest.join(' · ') };
}
