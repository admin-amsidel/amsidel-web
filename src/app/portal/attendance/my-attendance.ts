import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ExportExcel } from '../export-excel';
import { apiProblem } from '../portal.models';
import { AttendanceEntries } from './attendance-entries';
import {
  AttendanceDaySummary, AttendanceToday, FLAG_LABELS, IST, LocationFlag, MODE_LABELS, WORK_MODES, WorkMode, worked,
} from './attendance.models';
import { AttendanceService } from './attendance.service';
import { captureFrame, currentFix, deviceInfo, locationPermission, startCamera, stopCamera } from './capture';

/**
 * My attendance: check in with a live camera photo, the work mode (Office, Work from home, Field) and the current
 * location, then close the entry ("End work today", or "Close visit" for a field visit, with an optional note).
 * Field days can have several visits, each checked in and closed on its own; an office or home day has one entry.
 * Below, my last 30 days, one row per day that opens into its entries. The server sets all times.
 */
@Component({
  selector: 'app-my-attendance',
  imports: [
    ExportExcel, FormsModule, DatePipe, AttendanceEntries, ButtonModule, InputTextModule, MessageModule, SelectButtonModule, TableModule,
    TagModule, TextareaModule,
  ],
  templateUrl: './my-attendance.html',
  styleUrl: './attendance.scss',
})
export class MyAttendance implements OnInit {
  private readonly service = inject(AttendanceService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly IST = IST;
  protected readonly modeLabels: Record<string, string> = MODE_LABELS;
  protected readonly worked = worked;

  protected readonly today = signal<AttendanceToday | null>(null);
  protected readonly day = computed(() => this.today()?.day ?? null);
  /** The entry still open (working, or at a visit). */
  protected readonly openEntry = computed(() => this.day()?.entries.find((e) => !e.checkOut) ?? null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly history = signal<AttendanceDaySummary[]>([]);

  // starting an entry: the day's first, or another field visit
  protected readonly startingVisit = signal(false);
  protected readonly showStart = computed(() => !this.loading() && (!this.day() || (this.startingVisit() && !this.openEntry())));
  protected readonly modes = WORK_MODES;
  protected readonly mode = signal<WorkMode | null>(null);
  protected readonly place = signal('');
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private stream: MediaStream | null = null;
  protected readonly cameraOn = signal(false);
  protected readonly cameraBusy = signal(false);
  protected readonly cameraError = signal('');
  protected readonly facing = signal<'user' | 'environment'>('user');
  protected readonly photo = signal<Blob | null>(null);
  protected readonly photoUrl = signal<string | null>(null);
  protected readonly location = signal<PermissionState | null>(null);
  protected readonly busy = signal(false);
  protected readonly step = signal('');
  protected readonly formError = signal('');

  // closing the open entry
  protected readonly note = signal('');

  /** Refreshed every half minute while an entry is open. */
  private readonly now = signal(Date.now());
  protected readonly openFor = computed(() => {
    const e = this.openEntry();
    return e ? Math.max(0, Math.floor((this.now() - Date.parse(e.checkIn.at)) / 60000)) : 0;
  });
  /** Closed entries plus the open one so far. */
  protected readonly dayTotal = computed(() => (this.day()?.workedMinutes ?? 0) + this.openFor());

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 30000);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.closeCamera();
      this.revokePhoto();
    });
  }

  ngOnInit(): void {
    this.load();
    locationPermission().then((s) => this.location.set(s));
  }

  protected flagLabel(f: LocationFlag): string {
    return FLAG_LABELS[f];
  }

  /** Another field visit after the day's entries are closed. */
  protected startVisit(): void {
    this.startingVisit.set(true);
    this.mode.set('FIELD');
    this.place.set('');
    this.formError.set('');
  }

  protected cancelVisit(): void {
    this.startingVisit.set(false);
    this.closeCamera();
    this.revokePhoto();
    this.photo.set(null);
  }

  protected async openCamera(): Promise<void> {
    const video = this.video()?.nativeElement;
    if (!video) return;
    this.cameraError.set('');
    this.cameraBusy.set(true);
    this.closeCamera();
    try {
      this.stream = await startCamera(video, this.facing());
      this.cameraOn.set(true);
    } catch (e) {
      this.cameraError.set((e as Error).message);
    } finally {
      this.cameraBusy.set(false);
    }
  }

  protected switchCamera(): void {
    this.facing.update((f) => (f === 'user' ? 'environment' : 'user'));
    this.openCamera();
  }

  protected async capture(): Promise<void> {
    const video = this.video()?.nativeElement;
    if (!video) return;
    try {
      const blob = await captureFrame(video);
      this.revokePhoto();
      this.photo.set(blob);
      this.photoUrl.set(URL.createObjectURL(blob));
      this.closeCamera();
    } catch (e) {
      this.cameraError.set((e as Error).message);
    }
  }

  protected retake(): void {
    this.revokePhoto();
    this.photo.set(null);
    queueMicrotask(() => this.openCamera());
  }

  protected async checkIn(): Promise<void> {
    this.formError.set('');
    const mode = this.mode();
    const photo = this.photo();
    const place = this.place().trim();
    if (!mode) return this.formError.set('Choose where you are working today.');
    if (mode === 'FIELD' && !place) return this.formError.set('Enter the place or client you are visiting.');
    if (!photo) return this.formError.set('Take your photo first.');
    this.busy.set(true);
    this.step.set('Getting your location…');
    const fix = await currentFix();
    this.step.set('Checking in…');
    this.service.checkIn({ workMode: mode, place: mode === 'FIELD' ? place : null, photo, fix, device: deviceInfo() }).subscribe({
      next: (r) => {
        this.done();
        this.startingVisit.set(false);
        this.revokePhoto();
        this.photo.set(null);
        this.place.set('');
        this.mode.set(null);
        this.note.set('');
        this.toast.add({
          severity: r.checkIn.flags.length ? 'warn' : 'success',
          summary: r.entryNo > 1 ? `Visit started (entry ${r.entryNo})` : 'Checked in',
          detail: r.checkIn.flags.includes('LOCATION_MISSING') ? 'Without location: your manager will see it flagged.'
            : r.checkIn.flags.includes('LOW_ACCURACY') ? 'Your location was not precise: it is flagged for your manager.'
              : r.place ? `At ${r.place}` : `${MODE_LABELS[r.workMode]} · have a good day!`,
        });
        this.load();
      },
      error: (err) => {
        this.done();
        const p = apiProblem(err);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
        if (err?.status === 409) this.load();
      },
    });
  }

  /** Closes the open entry: the current field visit, or the whole day. */
  protected close(): void {
    const open = this.openEntry();
    if (!open) return;
    const visit = open.workMode === 'FIELD';
    this.confirm.confirm({
      header: visit ? 'Close visit' : 'End work today',
      message: visit
        ? `Close your visit${open.place ? ' to ' + open.place : ''} now? You can start another field visit afterwards.`
        : 'Record the end of your working day now? You can only add field visits after this.',
      icon: visit ? 'pi pi-flag' : 'pi pi-sign-out',
      acceptLabel: visit ? 'Close visit' : 'End work',
      rejectLabel: 'Not yet',
      rejectButtonProps: { outlined: true },
      accept: async () => {
        this.busy.set(true);
        this.step.set('Getting your location…');
        const fix = await currentFix();
        this.step.set('Saving…');
        this.service.checkOut(fix, this.note()).subscribe({
          next: (r) => {
            this.done();
            this.note.set('');
            this.toast.add({
              severity: 'success',
              summary: visit ? 'Visit closed' : 'Work ended',
              detail: `${r.place ?? MODE_LABELS[r.workMode]} · ${worked(r.workedMinutes)}`,
            });
            this.load();
          },
          error: (err) => {
            this.done();
            this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiProblem(err).message });
            this.load();
          },
        });
      },
    });
  }

  private done(): void {
    this.busy.set(false);
    this.step.set('');
  }

  private load(): void {
    this.error.set('');
    this.service.today().subscribe({
      next: (t) => {
        this.today.set(t);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
    this.service.mine().subscribe({ next: (h) => this.history.set(h), error: () => undefined });
  }

  private closeCamera(): void {
    stopCamera(this.stream);
    this.stream = null;
    this.cameraOn.set(false);
  }

  private revokePhoto(): void {
    const url = this.photoUrl();
    if (url) URL.revokeObjectURL(url);
    this.photoUrl.set(null);
  }
}
