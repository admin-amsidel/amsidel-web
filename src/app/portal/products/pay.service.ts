import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '../portal.config';
import { toIsoDate } from '../portal.models';

const P = `${API_BASE}/api/trade/pay`;

/** MANUAL_UPI: paid at the office to the brand's own UPI QR code; the staff record the UPI reference. */
export type OnlineMethod = 'CARD' | 'UPI' | 'MANUAL_UPI';
export type OnlinePayStatus = 'CREATED' | 'PAID' | 'FAILED' | 'CANCELLED';

export interface FeeView { method: OnlineMethod; percent: number; updatedAt: string | null; updatedByName: string | null }
/** shared = the company's default Razorpay keys (the brand has none of its own). */
export interface BrandPay { id: number; code: string; name: string; ready: boolean; mode: 'TEST' | 'LIVE' | null; shared: boolean;
  /** Whether the brand's Razorpay account takes cards / UPI (null = not known). */
  card: boolean | null; upi: boolean | null;
  /** Manual UPI: the UPI ID paid to (null = only an uploaded QR picture), and whether the brand has a UPI ID or QR at all. */
  manualUpiId: string | null; manualReady: boolean }
/** canManual: the Manual UPI (office) checkpoint is mine. */
export interface PaySetup { fees: FeeView[]; brands: BrandPay[]; canRefund: boolean; canSetFees: boolean; canManual: boolean }

export interface CustomerDue {
  id: number; code: string; name: string; phone: string | null; email: string | null;
  brandId: number; brandCode: string; bills: number; due: number;
}

export interface OpenBill {
  id: number; number: string; docDate: string; total: number; paid: number; writtenOff: number; due: number;
  customerId: number; customerName: string; brandId: number; brandCode: string;
}

/** What Razorpay's payment window is opened with; amount in paise. */
export interface Checkout {
  id: number; keyId: string | null; orderId: string | null; amount: number; currency: string; brandName: string; description: string;
  customerName: string; customerEmail: string | null; customerPhone: string | null; method: OnlineMethod;
  billAmount: number; feePercent: number; fee: number; total: number;
  /** Manual UPI: the brand's UPI ID the customer pays to. */
  payeeUpiId: string | null;
}

/** Where the money came from: the card as Razorpay reports it, or the payer's UPI ID. */
export interface SourceView {
  id: number; onlinePaymentId: number; transactionId: string; method: string; amount: number;
  cardNetwork: string | null; cardLast4: string | null; cardIssuer: string | null; cardType: string | null; cardInternational: boolean | null;
  vpa: string | null; bank: string | null; payerEmail: string | null; payerPhone: string | null;
  customerId: number; customerName: string; billNumber: string; brandCode: string; createdAt: string; label: string;
}

export interface OnlineView {
  id: number; brandId: number; brandCode: string; customerId: number; customerName: string; invoiceId: number; billNumber: string;
  method: OnlineMethod; status: OnlinePayStatus; billAmount: number; feePercent: number; fee: number; total: number; currency: string;
  orderId: string; paymentId: string | null; failure: string | null; note: string | null; refunded: number;
  tradePaymentId: number | null; requestedByName: string | null; createdAt: string; paidAt: string | null; source: SourceView | null;
  /** Manual UPI: the brand's UPI ID paid to. */
  payeeUpiId: string | null;
}

function params(values: Record<string, string | number | Date | null | undefined>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(values)) {
    if (v === null || v === undefined || v === '') continue;
    p = p.set(k, v instanceof Date ? toIsoDate(v)! : String(v));
  }
  return p;
}

/** Pay bill: bills paid online by card or UPI through the brand's Razorpay account. */
@Injectable({ providedIn: 'root' })
export class PayService {
  private readonly http = inject(HttpClient);

  setup(): Observable<PaySetup> {
    return this.http.get<PaySetup>(`${P}/setup`);
  }

  setFee(method: OnlineMethod, percent: number): Observable<FeeView> {
    return this.http.put<FeeView>(`${P}/fees`, { method, percent });
  }

  customers(brandId: number | null): Observable<CustomerDue[]> {
    return this.http.get<CustomerDue[]>(`${P}/customers`, { params: params({ brandId }) });
  }

  bills(customerId: number): Observable<OpenBill[]> {
    return this.http.get<OpenBill[]>(`${P}/bills`, { params: params({ customerId }) });
  }

  start(invoiceId: number, method: OnlineMethod, amount: number): Observable<Checkout> {
    return this.http.post<Checkout>(`${P}/orders`, { invoiceId, method, amount });
  }

  verify(id: number, body: { paymentId: string; orderId: string; signature: string }): Observable<OnlineView> {
    return this.http.post<OnlineView>(`${P}/orders/${id}/verify`, body);
  }

  fail(id: number, body: { cancelled: boolean; reason?: string | null; paymentId?: string | null }): Observable<OnlineView> {
    return this.http.post<OnlineView>(`${P}/orders/${id}/fail`, body);
  }

  /** Manual UPI: the brand's UPI QR code for this payment, with the amount filled in. */
  qr(id: number): Observable<Blob> {
    return this.http.get(`${P}/orders/${id}/qr`, { responseType: 'blob' });
  }

  /** Manual UPI: the customer paid; the UPI reference (UTR) seen in the brand's account. */
  confirmManual(id: number, body: { reference: string; payerUpiId: string | null; paidOn: string; remarks: string | null }): Observable<OnlineView> {
    return this.http.post<OnlineView>(`${P}/orders/${id}/manual`, body);
  }

  refresh(id: number): Observable<OnlineView> {
    return this.http.post<OnlineView>(`${P}/orders/${id}/refresh`, {});
  }

  refund(id: number, amount: number, reason: string): Observable<OnlineView> {
    return this.http.post<OnlineView>(`${P}/orders/${id}/refund`, { amount, reason });
  }

  history(brandId: number | null, from: Date, to: Date): Observable<OnlineView[]> {
    return this.http.get<OnlineView[]>(`${P}/history`, { params: params({ brandId, from, to }) });
  }

  sources(brandId: number | null, from: Date, to: Date): Observable<SourceView[]> {
    return this.http.get<SourceView[]>(`${P}/sources`, { params: params({ brandId, from, to }) });
  }
}

// ---- Razorpay's payment window ----

interface RazorpayResponse { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
interface RazorpayFailure { error: { description?: string; reason?: string; metadata?: { payment_id?: string } } }
interface RazorpayInstance { open(): void; on(event: 'payment.failed', fn: (r: RazorpayFailure) => void): void }
type RazorpayCtor = new (options: object) => RazorpayInstance;

const CHECKOUT_JS = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<RazorpayCtor> | null = null;

/** Razorpay's checkout script, loaded once, when first needed. */
function razorpay(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  loading ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CHECKOUT_JS;
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Razorpay did not load')));
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error('Razorpay could not be reached. Check the internet connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface WindowEvents {
  paid(r: RazorpayResponse): void;
  failed(reason: string, paymentId: string | null): void;
  closed(): void;
}

/**
 * Opens Razorpay's window for the order, showing only the way of paying chosen (cards: Visa, Mastercard, RuPay,
 * credit and debit; or UPI: QR code, UPI ID or app). The card details are typed there, never into the portal.
 */
export async function openPaymentWindow(c: Checkout, on: WindowEvents): Promise<void> {
  const Razorpay = await razorpay();
  const block = c.method === 'CARD'
    ? { name: 'Pay by card', instruments: [{ method: 'card' }] }
    : { name: 'Pay by UPI', instruments: [{ method: 'upi' }] };
  const rzp = new Razorpay({
    key: c.keyId,
    amount: c.amount,
    currency: c.currency,
    order_id: c.orderId,
    name: c.brandName,
    description: c.description,
    prefill: { name: c.customerName, email: c.customerEmail ?? '', contact: c.customerPhone ?? '' },
    notes: { bill: c.description },
    theme: { color: '#1f2937' },
    config: { display: { blocks: { chosen: block }, sequence: ['block.chosen'], preferences: { show_default_blocks: false } } },
    retry: { enabled: true },
    handler: (r: RazorpayResponse) => on.paid(r),
    modal: { ondismiss: () => on.closed(), confirm_close: true },
  });
  rzp.on('payment.failed', (r) => on.failed(r.error?.description ?? r.error?.reason ?? 'The payment failed', r.error?.metadata?.payment_id ?? null));
  rzp.open();
}
