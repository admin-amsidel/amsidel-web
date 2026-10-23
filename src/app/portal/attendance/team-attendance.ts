import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { TouchDatePicker } from '../touch-datepicker';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Avatar } from '../avatar';
import { apiProblem } from '../portal.models';
import { AttendanceEntries } from './attendance-entries';
import { AttendancePhoto } from './attendance-photo';
import {
  AttendanceDay, AttendanceDayRow, AttendanceDaySummary, FLAG_LABELS, IST, isoDay, LocationFlag, MODE_LABELS, TeamMember, worked,
} from './attendance.models';
import { AttendanceService } from './attendance.service';

type Show = 'ALL' | 'IN' | 'OUT' | 'FLAGGED';

/**
 * Team attendance for managers, admins and owners: everyone below them (or in their scope) on one day, checked
 * in or not, or one person's days in a month. One row per person and day (first in, last out, time worked); it
 * opens into the day's entries (each field visit with its place, times, locations, note and photo).
 */
@Component({
  selector: 'app-team-attendance',
  imports: [
    FormsModule, DatePipe, Avatar, AttendanceEntries, AttendancePhoto, ButtonModule, DatePickerModule, TouchDatePicker, MessageModule, SelectModule,
    SelectButtonModule, TableModule, TagModule,
  ],
  templateUrl: './team-attendance.html',
  styleUrl: './attendance.scss',
})
export class TeamAttendance implements OnInit {
  private readonly service = inject(AttendanceService);

  protected readonly IST = IST;
  protected readonly modeLabels: Record<string, string> = MODE_LABELS;
  protected readonly worked = worked;
  protected readonly maxDate = new Date();

  protected readonly view = signal<'DAY' | 'PERSON'>('DAY');
  protected readonly viewOptions = [
    { label: 'By day', value: 'DAY', icon: 'pi pi-calendar' },
    { label: 'By employee', value: 'PERSON', icon: 'pi pi-user' },
  ];
  protected readonly error = signal('');

  // by day
  protected readonly date = signal(new Date());
  protected readonly day = signal<AttendanceDay | null>(null);
  protected readonly dayLoading = signal(false);
  protected readonly show = signal<Show>('ALL');
  protected readonly dayCounts = computed(() => {
    const people = this.day()?.people ?? [];
    const days = people.map((p) => p.day).filter((d): d is AttendanceDaySummary => !!d);
    return {
      total: people.length,
      in: days.length,
      out: people.length - days.length,
      flagged: days.filter((d) => d.flags.length).length,
      office: days.filter((d) => d.modes.includes('OFFICE')).length,
      wfh: days.filter((d) => d.modes.includes('WFH')).length,
      field: days.filter((d) => d.modes.includes('FIELD')).length,
      visits: days.reduce((n, d) => n + d.entries.filter((e) => e.workMode === 'FIELD').length, 0),
    };
  });
  protected readonly showOptions = computed(() => {
    const c = this.dayCounts();
    return [
      { label: `All ${c.total}`, value: 'ALL' },
      { label: `Checked in ${c.in}`, value: 'IN' },
      { label: `Not in ${c.out}`, value: 'OUT' },
      { label: `Flagged ${c.flagged}`, value: 'FLAGGED' },
    ];
  });
  protected readonly rows = computed(() => {
    const show = this.show();
    return (this.day()?.people ?? []).filter((p) =>
      show === 'ALL' ? true : show === 'IN' ? !!p.day : show === 'OUT' ? !p.day : !!p.day?.flags.length,
    );
  });

  // by employee
  protected readonly team = signal<TeamMember[]>([]);
  protected readonly personId = signal<number | null>(null);
  protected readonly month = signal(new Date());
  protected readonly days = signal<AttendanceDaySummary[]>([]);
  protected readonly daysLoading = signal(false);
  protected readonly teamOptions = computed(() => this.team().map((m) => ({ value: m.id, label: `${m.name} · ${m.empNumber}` })));
  protected readonly monthTotals = computed(() => {
    const d = this.days();
    return {
      days: d.length,
      minutes: d.reduce((sum, x) => sum + x.workedMinutes, 0),
      visits: d.reduce((n, x) => n + x.entries.filter((e) => e.workMode === 'FIELD').length, 0),
      flagged: d.filter((x) => x.flags.length).length,
    };
  });

  ngOnInit(): void {
    this.loadDay();
    this.service.team().subscribe({ next: (t) => this.team.set(t), error: () => undefined });
  }

  protected setDate(d: Date | null): void {
    if (!d) return;
    this.date.set(d);
    this.loadDay();
  }

  protected setPerson(id: number | null): void {
    this.personId.set(id);
    this.loadDays();
  }

  protected setMonth(d: Date | null): void {
    if (!d) return;
    this.month.set(d);
    this.loadDays();
  }

  /** From the day view: open that person's month. */
  protected openPerson(row: AttendanceDayRow): void {
    this.view.set('PERSON');
    this.month.set(this.date());
    this.setPerson(row.employeeId);
  }

  /** "At Kumar residence" or "Working" while an entry is open. */
  protected openLabel(d: AttendanceDaySummary): string {
    const open = d.entries.find((e) => !e.checkOut);
    return open?.workMode === 'FIELD' ? `At ${open.place ?? 'a visit'}` : 'Still working';
  }

  protected flagLabel(f: LocationFlag): string {
    return FLAG_LABELS[f];
  }

  private loadDay(): void {
    this.dayLoading.set(true);
    this.error.set('');
    this.service.day(isoDay(this.date())).subscribe({
      next: (d) => {
        this.day.set(d);
        this.dayLoading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.dayLoading.set(false);
      },
    });
  }

  private loadDays(): void {
    const id = this.personId();
    if (!id) return this.days.set([]);
    const m = this.month();
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    const today = new Date();
    this.daysLoading.set(true);
    this.error.set('');
    this.service.employeeDays(id, isoDay(first), isoDay(last > today ? today : last)).subscribe({
      next: (d) => {
        this.days.set(d);
        this.daysLoading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.daysLoading.set(false);
      },
    });
  }
}
