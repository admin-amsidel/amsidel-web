/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { AfterViewInit, Component, ElementRef, input, OnDestroy, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import jsQR from 'jsqr';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

/**
 * Reads QR codes with the camera (the back one on phones), or from a USB scanner / typed text plus Enter. Emits each
 * read once: the same code is read again only after it has been out of view for a moment, so showing a label twice
 * counts twice but holding it in front of the camera does not.
 */
@Component({
  selector: 'app-qr-scanner',
  imports: [FormsModule, ButtonModule, InputTextModule],
  template: `
    <div class="scan" [class.hit]="hit()">
      <video #video playsinline muted [hidden]="!on()" aria-label="Camera"></video>
      @if (on()) {
        <span class="frame" aria-hidden="true"></span>
        <p-button icon="pi pi-stop" [rounded]="true" severity="secondary" size="small" styleClass="stop" ariaLabel="Stop the camera" (onClick)="stop()" />
      } @else {
        <div class="off">
          <i class="pi pi-qrcode" aria-hidden="true"></i>
          <p>{{ error() || 'Point the camera at an item\\'s QR label.' }}</p>
          <p-button label="Start camera" icon="pi pi-camera" [loading]="starting()" (onClick)="start()" />
        </div>
      }
    </div>
    <input pInputText class="typed" placeholder="Or use a USB scanner / paste the label text, then Enter" aria-label="Label text"
           [(ngModel)]="typed" (keydown.enter)="submitTyped()" />
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .scan { position: relative; aspect-ratio: 4 / 3; max-height: 320px; width: 100%; border-radius: 12px; overflow: hidden; background: #111;
      display: grid; place-items: center; outline: 3px solid transparent; transition: outline-color .15s; }
    .scan.hit { outline-color: #22c55e; }
    video { width: 100%; height: 100%; object-fit: cover; }
    .frame { position: absolute; inset: 18% 26%; border: 3px solid rgba(255, 255, 255, .85); border-radius: 14px; box-shadow: 0 0 0 999px rgba(0, 0, 0, .25); }
    :host ::ng-deep .stop { position: absolute; right: 10px; bottom: 10px; }
    .off { display: grid; justify-items: center; gap: 8px; color: #e5e7eb; text-align: center; padding: 16px; }
    .off i { font-size: 2.4rem; }
    .off p { margin: 0; font-size: .9rem; }
    .typed { width: 100%; }
  `,
})
export class QrScanner implements AfterViewInit, OnDestroy {
  /** Start the camera as soon as it shows. */
  readonly autoStart = input(true);
  readonly scanned = output<string>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  protected readonly on = signal(false);
  protected readonly starting = signal(false);
  protected readonly error = signal('');
  protected readonly hit = signal(false);
  protected typed = '';

  private stream: MediaStream | null = null;
  private canvas = document.createElement('canvas');
  private frame = 0;
  private lastTry = 0;
  private lastText = '';
  private lastSeen = 0;
  private audio: AudioContext | null = null;

  ngAfterViewInit(): void {
    if (this.autoStart()) void this.start();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  async start(): Promise<void> {
    if (this.on()) return;
    this.error.set('');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('This browser cannot use the camera here. Use a USB scanner or type the label below.');
      return;
    }
    this.starting.set(true);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      const v = this.video().nativeElement;
      v.srcObject = this.stream;
      await v.play();
      this.on.set(true);
      this.frame = requestAnimationFrame(() => this.tick());
    } catch {
      this.error.set('The camera could not start: allow the camera for this site, or use a USB scanner below.');
      this.stop();
    } finally {
      this.starting.set(false);
    }
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.on.set(false);
  }

  protected submitTyped(): void {
    const text = this.typed.trim();
    this.typed = '';
    if (text) this.found(text, true);
  }

  /** About eight looks a second at a scaled-down frame. */
  private tick(): void {
    if (!this.on()) return;
    const v = this.video().nativeElement;
    const now = performance.now();
    if (v.readyState >= 2 && now - this.lastTry > 120) {
      this.lastTry = now;
      const scale = Math.min(1, 720 / (v.videoWidth || 720));
      const w = Math.round((v.videoWidth || 640) * scale);
      const h = Math.round((v.videoHeight || 480) * scale);
      this.canvas.width = w;
      this.canvas.height = h;
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(v, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
        if (code?.data) this.found(code.data, false);
      }
    }
    this.frame = requestAnimationFrame(() => this.tick());
  }

  /** Once per showing: the same text again only after it was out of view for 1.2 s (typed text always counts). */
  private found(text: string, typed: boolean): void {
    const now = performance.now();
    const again = text === this.lastText && now - this.lastSeen < 1200;
    this.lastText = text;
    this.lastSeen = now;
    if (again && !typed) return;
    this.scanned.emit(text);
    this.hit.set(true);
    setTimeout(() => this.hit.set(false), 350);
    this.beep();
  }

  private beep(): void {
    try {
      this.audio ??= new AudioContext();
      const o = this.audio.createOscillator();
      const g = this.audio.createGain();
      o.frequency.value = 1100;
      g.gain.value = 0.08;
      o.connect(g).connect(this.audio.destination);
      o.start();
      o.stop(this.audio.currentTime + 0.08);
    } catch {
      // no sound: the green flash is enough
    }
  }
}
