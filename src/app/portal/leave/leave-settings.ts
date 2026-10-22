import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { apiProblem } from '../portal.models';
import { HolidayEditor } from './holiday-editor';
import { ALLOCATION_LABELS, LeaveAllocation, LeaveType } from './leave.models';
import { LeaveService, LeaveTypeBody } from './leave.service';

/** One editable row of the leave types table; id is missing for a new type. */
interface TypeDraft extends LeaveTypeBody {
  id?: number;
  dirty: boolean;
  saving: boolean;
  error: string;
}

/** Leave types with their yearly allowances, the office holiday list and the restricted holiday list. */
@Component({
  selector: 'app-leave-settings',
  imports: [
    FormsModule, ButtonModule, CheckboxModule, HolidayEditor, InputNumberModule, InputTextModule, MessageModule,
    SelectModule, TableModule,
  ],
  templateUrl: './leave-settings.html',
  styleUrl: './leave.scss',
})
export class LeaveSettings implements OnInit {
  private readonly leave = inject(LeaveService);
  private readonly toast = inject(MessageService);

  protected readonly allocationOptions = (Object.keys(ALLOCATION_LABELS) as LeaveAllocation[]).map((a) => ({
    value: a,
    label: ALLOCATION_LABELS[a],
  }));

  protected readonly drafts = signal<TypeDraft[]>([]);
  protected readonly typesError = signal('');

  ngOnInit(): void {
    this.leave.types().subscribe({
      next: (types) => this.drafts.set(types.map(toDraft)),
      error: (err) => this.typesError.set(apiProblem(err).message),
    });
  }

  protected touch(row: TypeDraft): void {
    row.dirty = true;
    row.error = '';
    if (row.restrictedDatesOnly) row.halfDayAllowed = false;
  }

  protected addType(): void {
    const order = Math.max(0, ...this.drafts().map((d) => d.sortOrder)) + 1;
    this.drafts.update((list) => [
      ...list,
      {
        code: '', name: '', allocation: 'ANNUAL', annualQuota: 0, halfDayAllowed: true, restrictedDatesOnly: false,
        active: true, sortOrder: order, dirty: true, saving: false, error: '',
      },
    ]);
  }

  protected save(row: TypeDraft): void {
    if (!row.code.trim() || !row.name.trim()) {
      row.error = 'Give a code and a name.';
      return;
    }
    row.saving = true;
    const { id, dirty, saving, error, ...body } = row;
    const annualQuota = body.allocation === 'ANNUAL' ? Number(body.annualQuota ?? 0) : null;
    this.leave.saveType({ ...body, annualQuota }, id).subscribe({
      next: (saved) => {
        this.drafts.update((list) => list.map((d) => (d === row ? toDraft(saved) : d)));
        this.toast.add({ severity: 'success', summary: 'Saved', detail: `${saved.name} (${saved.code})` });
      },
      error: (err) => {
        const p = apiProblem(err);
        this.drafts.update((list) =>
          list.map((d) => (d === row ? { ...d, saving: false, error: Object.values(p.fields)[0] ?? p.message } : d)),
        );
      },
    });
  }
}

function toDraft(t: LeaveType): TypeDraft {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    allocation: t.allocation,
    annualQuota: t.annualQuota,
    halfDayAllowed: t.halfDayAllowed,
    restrictedDatesOnly: t.restrictedDatesOnly,
    active: t.active,
    sortOrder: t.sortOrder,
    dirty: false,
    saving: false,
    error: '',
  };
}
