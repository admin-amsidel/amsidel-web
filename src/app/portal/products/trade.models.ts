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

export type TradeSubject = 'QUOTATION' | 'INVOICE' | 'PURCHASE' | 'ITEM' | 'CUSTOMER' | 'SUPPLIER' | 'PRODUCT_TYPE' | 'PROJECT' | 'PROJECT_TASK'
  | 'MONEY_ENTRY' | 'BANK_STATEMENT' | 'BANK_BALANCE';

/** One step in a record's history. */
export interface HistoryEntry {
  id: number;
  at: string;
  subjectType: TradeSubject;
  subjectId: number;
  subjectLabel: string | null;
  action: string;
  details: string | null;
  byName: string | null;
  brandCode: string | null;
}

export const HISTORY_ACTIONS: Record<string, { label: string; icon: string; tone: 'blue' | 'green' | 'amber' | 'red' | 'grey' }> = {
  CREATED: { label: 'Made', icon: 'pi pi-plus-circle', tone: 'blue' },
  UPDATED: { label: 'Changed', icon: 'pi pi-pencil', tone: 'grey' },
  STATUS: { label: 'Status', icon: 'pi pi-flag', tone: 'blue' },
  INVOICED: { label: 'Made into invoice', icon: 'pi pi-receipt', tone: 'green' },
  ISSUED: { label: 'Issued', icon: 'pi pi-check-circle', tone: 'green' },
  RECEIVED: { label: 'Received into stock', icon: 'pi pi-download', tone: 'green' },
  PAYMENT: { label: 'Payment', icon: 'pi pi-wallet', tone: 'green' },
  REFUND: { label: 'Refund', icon: 'pi pi-replay', tone: 'amber' },
  VOIDED: { label: 'Payment voided', icon: 'pi pi-ban', tone: 'red' },
  CANCELLED: { label: 'Cancelled', icon: 'pi pi-times-circle', tone: 'red' },
  DELETED: { label: 'Deleted', icon: 'pi pi-trash', tone: 'red' },
  STOCK: { label: 'Stock changed', icon: 'pi pi-box', tone: 'amber' },
  SETTLED: { label: 'Settled & closed', icon: 'pi pi-lock', tone: 'green' },
  REOPENED: { label: 'Reopened', icon: 'pi pi-lock-open', tone: 'amber' },
  COMMENT: { label: 'Comment', icon: 'pi pi-comment', tone: 'blue' },
  WRITE_OFF: { label: 'Discount written off', icon: 'pi pi-percentage', tone: 'amber' },
  UPLOADED: { label: 'Uploaded', icon: 'pi pi-upload', tone: 'blue' },
};

// ---- projects ----

export type ProjectStatus = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; severity: 'secondary' | 'info' | 'success' | 'danger' }> = {
  QUEUED: { label: 'Queued', severity: 'secondary' },
  IN_PROGRESS: { label: 'In progress', severity: 'info' },
  COMPLETED: { label: 'Completed', severity: 'success' },
  CANCELLED: { label: 'Cancelled', severity: 'danger' },
};

export const PROJECT_STATUS_OPTIONS = (Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((s) => ({ value: s, label: PROJECT_STATUS[s].label }));

export interface PersonRef {
  id: number;
  name: string;
  designation: string | null;
}

export interface ProjectMoney {
  estimated: number | null;
  finalAmount: number | null;
  quoted: number;
  billed: number;
  paid: number;
  /** Finalized, else billed, else estimated. */
  toPay: number;
  due: number;
  quotations: number;
  invoices: number;
  /** Discounts written off on its invoices. */
  writtenOff: number;
}

export interface ProjectTask {
  id: number;
  title: string;
  description: string | null;
  status: ProjectStatus;
  regDate: string;
  startDate: string | null;
  endDate: string | null;
  assignee: PersonRef | null;
  billId: number | null;
  billNumber: string | null;
  billKind: DocKind | null;
  remarks: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string | null;
  history: HistoryEntry[];
}

export interface ProjectRow {
  id: number;
  code: string;
  name: string;
  brandCode: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  status: ProjectStatus;
  settled: boolean;
  ownerName: string | null;
  startDate: string | null;
  endDate: string | null;
  money: ProjectMoney;
  tasks: number;
  tasksDone: number;
  createdByName: string | null;
  updatedAt: string | null;
}

export interface Project {
  id: number;
  code: string;
  name: string;
  brand: BrandRef;
  customer: PartyRef;
  description: string | null;
  status: ProjectStatus;
  settled: boolean;
  settledAt: string | null;
  settledByName: string | null;
  owner: PersonRef | null;
  members: PersonRef[];
  startDate: string | null;
  endDate: string | null;
  remarks: string | null;
  money: ProjectMoney;
  bills: SalesRow[];
  payments: Payment[];
  tasks: ProjectTask[];
  history: HistoryEntry[];
  createdByName: string | null;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  /** I may change it (not settled, or I am an admin / owner). */
  editable: boolean;
  /** Owner or admin: settle with money due, reopen, delete. */
  admin: boolean;
}

export interface ProjectBody {
  brandId: number | null;
  name: string;
  customerId: number;
  description: string | null;
  ownerId: number | null;
  memberIds: number[];
  startDate: string | null;
  endDate: string | null;
  estimatedAmount: number | null;
  finalAmount: number | null;
  status: ProjectStatus | null;
  remarks: string | null;
}

export interface TaskBody {
  title: string;
  description: string | null;
  status: ProjectStatus | null;
  regDate: string;
  startDate: string | null;
  endDate: string | null;
  assigneeId: number | null;
  billId: number | null;
  remarks: string | null;
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
  updatedByName: string | null;
  updatedAt: string | null;
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
  updatedByName: string | null;
  updatedAt: string | null;
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
  updatedByName: string | null;
  updatedAt: string | null;
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
  updatedByName: string | null;
  updatedAt: string | null;
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
  history: HistoryEntry[];
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
  /** Discount written off after issue (Income & expenses); settled like a payment. */
  writtenOff: number;
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
  createdByDesignation: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
  history: HistoryEntry[];
  projectId: number | null;
  projectCode: string | null;
  projectName: string | null;
  /** I may delete it (owner or admin, and it can be deleted). */
  canDelete: boolean;
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
  createdByName: string | null;
  projectId: number | null;
  projectCode: string | null;
}

export interface SalesBody {
  kind: DocKind;
  brandId: number | null;
  customerId: number;
  projectId: number | null;
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
  updatedByName: string | null;
  updatedAt: string | null;
  history: HistoryEntry[];
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
  createdByName: string | null;
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
