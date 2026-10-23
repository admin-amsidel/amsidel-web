/** The product portal (/api/trade): money in rupees, quantities with up to 2 decimals. Everything belongs to a brand. */

export interface BrandRef {
  id: number;
  code: string;
  name: string;
}

export interface Balance {
  billed: number;
  paid: number;
  due: number;
}

export interface ProductType {
  id: number;
  brand: BrandRef;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  itemCount: number;
}

export interface Supplier {
  id: number;
  brand: BrandRef;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  phone2: string | null;
  email: string | null;
  website: string | null;
  location: string | null;
  address: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  upi: string | null;
  notes: string | null;
  active: boolean;
  balance: Balance;
  bills: number;
  items: number;
}

export interface Customer {
  id: number;
  brand: BrandRef;
  code: string;
  name: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  location: string | null;
  address: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  notes: string | null;
  active: boolean;
  balance: Balance;
  quotations: number;
  invoices: number;
  lastDocDate: string | null;
}

export interface Item {
  id: number;
  brand: BrandRef;
  typeId: number;
  typeCode: string;
  typeName: string;
  supplierId: number | null;
  supplierName: string | null;
  code: string;
  name: string;
  supplierItemCode: string | null;
  details: string | null;
  sizes: string | null;
  unit: string;
  hsnCode: string | null;
  supplierPrice: number;
  mrp: number;
  showroomPrice: number;
  minSellPrice: number;
  trackStock: boolean;
  reorderLevel: number | null;
  totalIn: number;
  totalOut: number;
  onHand: number;
  stockValue: number;
  lowStock: boolean;
  active: boolean;
}

export type StockKind = 'OPENING' | 'PURCHASE' | 'PURCHASE_CANCEL' | 'SALE' | 'SALE_CANCEL' | 'ADJUST_IN' | 'ADJUST_OUT';

export const STOCK_KIND_LABELS: Record<StockKind, string> = {
  OPENING: 'Opening stock',
  PURCHASE: 'Bought',
  PURCHASE_CANCEL: 'Purchase cancelled',
  SALE: 'Sold',
  SALE_CANCEL: 'Sale cancelled',
  ADJUST_IN: 'Added by hand',
  ADJUST_OUT: 'Removed by hand',
};

export interface StockMove {
  id: number;
  movedOn: string;
  kind: StockKind;
  quantity: number;
  balanceAfter: number;
  unitCost: number | null;
  docId: number | null;
  docNumber: string | null;
  docType: 'SALE' | 'PURCHASE' | null;
  note: string | null;
  recordedByName: string | null;
  createdAt: string;
}

export interface ItemDetail {
  item: Item;
  moves: StockMove[];
}

export type DocKind = 'QUOTATION' | 'INVOICE';
export type DocStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'ISSUED' | 'CANCELLED';
export type PurchaseStatus = 'DRAFT' | 'RECEIVED' | 'CANCELLED';
export type PayStatus = 'UNPAID' | 'PARTLY_PAID' | 'PAID' | null;
export type PayMode = 'CASH' | 'BANK' | 'UPI' | 'CHEQUE' | 'CARD';
export type PayKind = 'PAYMENT' | 'REFUND';

export const PAY_MODES: { label: string; value: PayMode }[] = [
  { label: 'Bank', value: 'BANK' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Cash', value: 'CASH' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Card', value: 'CARD' },
];

export interface Totals {
  subtotal: number;
  discount: number;
  miscLabel: string | null;
  miscAmount: number;
  taxable: number;
  gstRate: number;
  interState: boolean;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
  paid: number;
  due: number;
}

export interface Company {
  brandId: number;
  code: string;
  name: string;
  address: string | null;
  gstNumber: string | null;
  phone: string | null;
  email: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  upi: string | null;
  logoUpdatedAt: string | null;
}

export interface PartyRef {
  id: number;
  code: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  gstNumber: string | null;
}

export interface Payment {
  id: number;
  party: 'CUSTOMER' | 'SUPPLIER';
  kind: PayKind;
  paidOn: string;
  amount: number;
  mode: PayMode;
  transactionId: string | null;
  bankDetails: string | null;
  upiId: string | null;
  remarks: string | null;
  recordedByName: string | null;
  createdAt: string;
  voided: boolean;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  docId: number | null;
  docNumber: string | null;
  partyName: string | null;
  brandCode: string | null;
}

export interface SalesLine {
  id?: number;
  itemId: number | null;
  itemCode?: string | null;
  name: string;
  typeName?: string | null;
  hsnCode: string | null;
  size: string | null;
  description: string | null;
  unit: string | null;
  quantity: number;
  rate: number;
  amount?: number;
  unitCost?: number;
  belowMinPrice?: boolean;
}

export interface SalesDoc {
  id: number;
  kind: DocKind;
  number: string | null;
  status: DocStatus;
  payStatus: PayStatus;
  company: Company;
  customer: PartyRef;
  docDate: string;
  validUntil: string | null;
  quotationId: number | null;
  quotationNumber: string | null;
  invoiceId: number | null;
  invoiceNumber: string | null;
  lines: SalesLine[];
  totals: Totals;
  costTotal: number;
  margin: number;
  remarks: string | null;
  terms: string | null;
  payments: Payment[];
  createdByName: string | null;
  createdAt: string;
  issuedAt: string | null;
  issuedByName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  editable: boolean;
}

export interface SalesRow {
  id: number;
  kind: DocKind;
  number: string | null;
  status: DocStatus;
  payStatus: PayStatus;
  brandCode: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  docDate: string;
  validUntil: string | null;
  total: number;
  paid: number;
  due: number;
}

export interface SalesBody {
  kind: DocKind;
  brandId: number | null;
  customerId: number;
  docDate: string;
  validUntil: string | null;
  lines: SalesLine[];
  discount: number;
  miscLabel: string | null;
  miscAmount: number;
  gstRate: number;
  interState: boolean;
  remarks: string | null;
  terms: string | null;
}

export interface PurchaseLine {
  id?: number;
  itemId: number;
  itemCode?: string;
  name?: string;
  unit?: string;
  quantity: number;
  rate: number;
  amount?: number;
  itemSupplierPrice?: number;
}

export interface PurchaseBill {
  id: number;
  number: string;
  status: PurchaseStatus;
  payStatus: PayStatus;
  company: Company;
  supplier: PartyRef;
  supplierBillNo: string | null;
  billDate: string;
  lines: PurchaseLine[];
  totals: Totals;
  remarks: string | null;
  payments: Payment[];
  createdByName: string | null;
  createdAt: string;
  receivedAt: string | null;
  receivedByName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  editable: boolean;
}

export interface PurchaseRow {
  id: number;
  number: string;
  status: PurchaseStatus;
  payStatus: PayStatus;
  brandCode: string;
  supplierId: number;
  supplierName: string;
  supplierBillNo: string | null;
  billDate: string;
  total: number;
  paid: number;
  due: number;
  lines: number;
}

export interface PurchaseBody {
  brandId: number | null;
  supplierId: number;
  supplierBillNo: string | null;
  billDate: string;
  lines: { itemId: number; quantity: number; rate: number }[];
  discount: number;
  miscLabel: string | null;
  miscAmount: number;
  gstRate: number;
  interState: boolean;
  remarks: string | null;
}

export interface PaymentBody {
  paidOn: string;
  amount: number;
  kind: PayKind;
  mode: PayMode;
  transactionId: string;
  bankDetails: string;
  upiId: string;
  remarks: string;
}

// ---- reports ----

export interface Group {
  key: string;
  label: string;
  count: number;
  quantity: number;
  amount: number;
  cost: number | null;
  margin: number | null;
}

export interface SalesReport {
  from: string;
  to: string;
  lines: {
    date: string; docId: number; number: string; brandCode: string; customerId: number; customerCode: string; customerName: string;
    customerPhone: string; itemId: number | null; itemCode: string | null; itemName: string; typeName: string; size: string | null;
    quantity: number; unit: string; rate: number; amount: number; cost: number; margin: number;
  }[];
  invoices: SalesRow[];
  byCustomer: Group[];
  byType: Group[];
  byItem: Group[];
  totals: { invoices: number; subtotal: number; discount: number; misc: number; taxable: number; gst: number; total: number;
    paid: number; due: number; cost: number; margin: number };
}

export interface PurchaseReport {
  from: string;
  to: string;
  lines: {
    date: string; billId: number; number: string; supplierBillNo: string | null; brandCode: string; supplierId: number;
    supplierCode: string; supplierName: string; itemId: number; itemCode: string; itemName: string; typeName: string;
    quantity: number; unit: string; rate: number; amount: number;
  }[];
  bySupplier: Group[];
  byType: Group[];
  byItem: Group[];
  byMonth: Group[];
  totals: { bills: number; subtotal: number; discount: number; misc: number; gst: number; total: number; paid: number; due: number };
}

export interface StockReport {
  from: string;
  to: string;
  items: { item: Item; boughtInRange: number; soldInRange: number; adjustedInRange: number; retailValue: number }[];
  stockValue: number;
  retailValue: number;
  lowStock: number;
  outOfStock: number;
}

export interface PaymentReport {
  from: string;
  to: string;
  payments: Payment[];
  received: number;
  refundedToCustomers: number;
  paidToSuppliers: number;
  refundedBySuppliers: number;
}

export interface Owed {
  id: number;
  code: string;
  name: string;
  phone: string;
  brandCode: string;
  bills: number;
  billed: number;
  paid: number;
  due: number;
  oldestBill: string | null;
}

export interface OwedReport {
  customers: Owed[];
  receivable: number;
  suppliers: Owed[];
  payable: number;
}

export interface MonthBar {
  month: string;
  label: string;
  sales: number;
  purchases: number;
  received: number;
  paidOut: number;
}

export interface Overview {
  today: string;
  salesThisMonth: number;
  invoicesThisMonth: number;
  purchasesThisMonth: number;
  receivedThisMonth: number;
  paidOutThisMonth: number;
  receivable: number;
  payable: number;
  stockValue: number;
  items: number;
  lowStock: number;
  outOfStock: number;
  openQuotations: number;
  lowItems: Item[];
  recentInvoices: SalesRow[];
  openQuotationList: SalesRow[];
  months: MonthBar[];
  topSuppliers: Group[];
  topItems: Group[];
}

// ---- labels ----

export const DOC_STATUS: Record<DocStatus, { label: string; severity: 'secondary' | 'info' | 'success' | 'warn' | 'danger' }> = {
  DRAFT: { label: 'Draft', severity: 'secondary' },
  SENT: { label: 'Sent', severity: 'info' },
  ACCEPTED: { label: 'Accepted', severity: 'success' },
  REJECTED: { label: 'Rejected', severity: 'danger' },
  ISSUED: { label: 'Issued', severity: 'info' },
  CANCELLED: { label: 'Cancelled', severity: 'danger' },
};

export const PURCHASE_STATUS: Record<PurchaseStatus, { label: string; severity: 'secondary' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Draft', severity: 'secondary' },
  RECEIVED: { label: 'Received', severity: 'success' },
  CANCELLED: { label: 'Cancelled', severity: 'danger' },
};

export function payLabel(s: PayStatus): { label: string; severity: 'success' | 'warn' | 'danger' } | null {
  if (s === 'PAID') return { label: 'Paid', severity: 'success' };
  if (s === 'PARTLY_PAID') return { label: 'Part paid', severity: 'warn' };
  if (s === 'UNPAID') return { label: 'Unpaid', severity: 'danger' };
  return null;
}

/** 12.5 -> "12.5", 3 -> "3". */
export function qty(v: number | null | undefined): string {
  return String(Math.round(Number(v ?? 0) * 100) / 100);
}

/** The first and last day of a month, a few months back (0 = this month). */
export function monthRange(back = 0): [Date, Date] {
  const now = new Date();
  return [new Date(now.getFullYear(), now.getMonth() - back, 1), new Date(now.getFullYear(), now.getMonth() - back + 1, 0)];
}

/** April to March of this financial year. */
export function fyRange(): [Date, Date] {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [new Date(start, 3, 1), new Date(start + 1, 2, 31)];
}

/** Rounds to paise. */
export function money(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Same sums as the server (TradeMoney): lines, less discount, plus charges, GST, rounded to the rupee. */
export function workOut(amounts: number[], discount: number, misc: number, gstRate: number) {
  const subtotal = money(amounts.reduce((s, a) => s + a, 0));
  const taxable = money(subtotal - (discount || 0) + (misc || 0));
  const gst = money((taxable * (gstRate || 0)) / 100);
  const exact = money(taxable + gst);
  const total = Math.round(exact);
  return { subtotal, taxable, gst, roundOff: money(total - exact), total };
}
