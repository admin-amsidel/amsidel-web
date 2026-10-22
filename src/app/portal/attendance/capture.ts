import { APP_VERSION } from '../portal.config';
import { Fix } from './attendance.models';

/** Longest side of the uploaded check-in photo. */
const MAX_SIDE = 1280;
/** Aim for photos under this size. */
const TARGET_BYTES = 300 * 1024;

/**
 * Starts the device camera for a live check-in photo (there is deliberately no file or gallery upload).
 * In a Capacitor app this is where the Camera plugin with source CameraSource.Camera would plug in.
 */
export async function startCamera(video: HTMLVideoElement, facing: 'user' | 'environment'): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('The camera needs the portal to be opened over https.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new Error('Camera access is blocked. Allow the camera for this site in your browser, then try again.');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new Error('No camera was found on this device.');
    }
    if (name === 'NotReadableError') {
      throw new Error('The camera is in use by another app. Close it and try again.');
    }
    throw new Error('The camera could not be started.');
  }
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute('playsinline', '');
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** The current camera frame as a JPEG: at most 1280 px, quality 0.7, made smaller until it is under ~300 KB. */
export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('The camera is not ready yet. Wait a moment and try again.');
  let scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  let quality = 0.7;
  for (let attempt = 0; attempt < 6; attempt++) {
    const blob = await draw(video, Math.round(w * scale), Math.round(h * scale), quality);
    if (blob.size <= TARGET_BYTES || attempt === 5) return blob;
    if (quality > 0.5) quality -= 0.1;
    else scale *= 0.8;
  }
  throw new Error('The photo could not be prepared.');
}

function draw(video: HTMLVideoElement, w: number, h: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The photo could not be prepared.'))), 'image/jpeg', quality),
  );
}

/** A fresh location fix, or null when location is blocked, off or too slow (the check-in is then flagged). */
export function currentFix(timeoutMs = 12000): Promise<Fix | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    ),
  );
}

/** 'granted', 'denied' or 'prompt' when the browser can tell; null otherwise. */
export async function locationPermission(): Promise<PermissionState | null> {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    return null;
  }
}

/** Platform, OS and app version, sent with the check-in. */
export function deviceInfo(): { platform: string; osVersion: string; appVersion: string } {
  const capacitor = (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const platform = capacitor?.getPlatform?.() ?? 'web';
  return { platform, osVersion: osFrom(navigator.userAgent), appVersion: APP_VERSION };
}

function osFrom(ua: string): string {
  const android = ua.match(/Android ([\d.]+)/);
  if (android) return `Android ${android[1]}`;
  const ios = ua.match(/(?:iPhone|iPad|iPod).*? OS ([\d_]+)/);
  if (ios) return `iOS ${ios[1].replace(/_/g, '.')}`;
  const win = ua.match(/Windows NT ([\d.]+)/);
  if (win) return win[1] === '10.0' ? 'Windows 10/11' : `Windows NT ${win[1]}`;
  const mac = ua.match(/Mac OS X ([\d_]+)/);
  if (mac) return `macOS ${mac[1].replace(/_/g, '.')}`;
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}
