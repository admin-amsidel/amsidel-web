import { HistoryEntry, PayMode } from './trade.models';

/** Other income and expenses (see the server's MoneyCategory). Funding moves the bank, not the profit. */
export type MoneyCategory =
  | 'INVESTMENT' | 'DIRECTOR_LOAN' | 'CAPITAL' | 'BANK_LOAN' | 'OTHER_INCOME'
  | 'TRANSPORT' | 'FIXING' | 'MAINTENANCE' | 'REFUND' | 'DISCOUNT' | 'RENT' | 'UTILITIES' | 'BANK_CHARGES' | 'LOAN_REPAYMENT' | 'MISC';

export const CATEGORIES: { value: MoneyCategory; label: string; income: boolean; funding: boolean; hint: string }[] = [
  { value: 'INVESTMENT', label: 'Investment from a person', income: true, funding: true, hint: 'Money put in by another person' },
  { value: 'DIRECTOR_LOAN', label: 'Investor / director loan', income: true, funding: true, hint: 'A loan from an investor or director' },
  { value: 'CAPITAL', label: 'Capital investment', income: true, funding: true, hint: "The brand's own capital" },
  { value: 'BANK_LOAN', label: 'Bank loan', income: true, funding: true, hint: 'A loan credited by the bank' },
  { value: 'OTHER_INCOME', label: 'Other income', income: true, funding: false, hint: 'Interest, scrap sale, commission…' },
  { value: 'TRANSPORT', label: 'Transportation', income: false, funding: false, hint: 'Lorry, auto, courier' },
  { value: 'FIXING', label: 'Fixing / installation', income: false, funding: false, hint: 'Fitting labour at site' },
  { value: 'MAINTENANCE', label: 'Maintenance / service', income: false, funding: false, hint: 'Repairs, service visits' },
  { value: 'REFUND', label: 'Refund outside an invoice', income: false, funding: false, hint: 'Money given back that is not an invoice refund' },
  { value: 'DISCOUNT', label: 'Discount allowed / short payment', income: false, funding: false, hint: 'What a customer did not pay' },
  { value: 'RENT', label: 'Rent', income: false, funding: false, hint: 'Shop, godown, office' },
  { value: 'UTILITIES', label: 'Electricity, phone & internet', income: false, funding: false, hint: 'Monthly bills' },
  { value: 'BANK_CHARGES', label: 'Bank charges', income: false, funding: false, hint: 'Charges and GST on them' },
  { value: 'LOAN_REPAYMENT', label: 'Loan repayment', income: false, funding: true, hint: 'EMI or paying back a loan' },
  { value: 'MISC', label: 'Miscellaneous expense', income: false, funding: false, hint: 'Anything else' },
];

export function category(c: MoneyCategory) {
  return CATEGORIES.find((x) => x.value === c)!;
}

export interface MoneyEntry {
  id: number;
  number: string;
  brandCode: string;
  brandId: number;
  category: MoneyCategory;
  categoryLabel: string;
  income: boolean;
  funding: boolean;
  entryDate: string;
  amount: number;
  /** null = no money moved (a discount written off). */
  mode: PayMode | null;
  partyName: string | null;
  transactionId: string | null;
  description: string;
  remarks: string | null;
  invoiceId: number | null;
  invoiceNumber: string | null;
  projectId: number | null;
  projectCode: string | null;
  projectName: string | null;
  customerId: number | null;
  customerName: string | null;
  purchaseBillId: number | null;
  purchaseBillNumber: string | null;
  supplierId: number | null;
  supplierName: string | null;
  bankLineId: number | null;
  writeOff: boolean;
  createdByName: string | null;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string | null;
  canDelete: boolean;
  history: HistoryEntry[];
}

export interface EntryBody {
  brandId: number | null;
  category: MoneyCategory;
  entryDate: string;
  amount: number;
  mode: PayMode | null;
  partyName: string | null;
  transactionId: string | null;
  description: string;
  remarks: string | null;
  invoiceId: number | null;
  projectId: number | null;
  purchaseBillId: number | null;
  supplierId: number | null;
  bankLineId: number | null;
}

export interface InvoiceOption {
  id: number;
  number: string;
  date: string;
  customerId: number;
  customerName: string;
  customerPhone: string | null;
  projectId: number | null;
  projectCode: string | null;
  total: number;
  paid: number;
  writtenOff: number;
  due: number;
}

export interface EntryLinks {
  invoices: InvoiceOption[];
  projects: { id: number; code: string; name: string; customerId: number; customerName: string; settled: boolean }[];
  purchases: { id: number; number: string; supplierBillNo: string | null; supplierId: number; supplierName: string; total: number }[];
  suppliers: { id: number; code: string; name: string }[];
}

// ---- bank ----

export interface BankStatement {
  id: number;
  brandCode: string;
  fileName: string;
  fromDate: string;
  toDate: string;
  openingBalance: number | null;
  closingBalance: number | null;
  totalCredit: number;
  totalDebit: number;
  lines: number;
  remarks: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  warnings: string[];
}

/** One per brand and month; typing the month again replaces it. */
export interface BankBalance {
  id: number;
  brandCode: string;
  /** 2026-10 */
  month: string;
  /** The day it counts for: the month's last day, or the day typed for the month still running. */
  asOf: string;
  balance: number;
  note: string | null;
  enteredByName: string | null;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string | null;
}

// ---- the reconciler ----

export type GroupBy = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

export interface Part {
  key: string;
  label: string;
  amount: number;
}

export interface Flow {
  customerReceipts: number;
  otherIncome: number;
  funding: number;
  moneyIn: number;
  salaries: number;
  supplierPayments: number;
  otherExpenses: number;
  fundingOut: number;
  moneyOut: number;
  net: number;
  cashIn: number;
  cashOut: number;
  inParts: Part[];
  outParts: Part[];
}

export interface Pnl {
  sales: number;
  otherIncome: number;
  revenue: number;
  purchases: number;
  salaries: number;
  otherExpenses: number;
  discounts: number;
  expenses: number;
  profit: number;
  gstOnSales: number;
  gstOnPurchases: number;
}

export interface Tally {
  opening: number | null;
  portalIn: number | null;
  portalOut: number | null;
  expected: number | null;
  actual: number | null;
  difference: number | null;
  bankIn: number | null;
  bankOut: number | null;
  covered: boolean;
  /** The days tallied: from the first known balance to the last, within the period. */
  tallyFrom: string | null;
  tallyTo: string | null;
}

export interface Bucket {
  key: string;
  label: string;
  from: string;
  to: string;
  flow: Flow;
  pnl: Pnl;
  tally: Tally;
}

export interface Match {
  type: 'CUSTOMER_PAYMENT' | 'SUPPLIER_PAYMENT' | 'SALARY' | 'ENTRY';
  id: number;
  number: string | null;
  label: string;
  docId: number | null;
}

export interface BankLineView {
  id: number;
  date: string;
  description: string | null;
  reference: string | null;
  credit: number;
  debit: number;
  balance: number | null;
  status: 'MATCHED' | 'PARTLY' | 'UNMATCHED';
  matches: Match[];
  recorded: number;
}

export interface Movement {
  type: Match['type'];
  id: number;
  date: string;
  in: boolean;
  amount: number;
  label: string;
  number: string | null;
  docId: number | null;
  reference: string | null;
}

export interface ShortPaid {
  invoiceId: number;
  number: string;
  date: string;
  brandCode: string;
  customerId: number;
  customerName: string;
  customerPhone: string | null;
  projectId: number | null;
  projectCode: string | null;
  projectName: string | null;
  total: number;
  paid: number;
  writtenOff: number;
  due: number;
  lastPaidOn: string | null;
  daysOpen: number;
}

export interface ReconcileReport {
  from: string;
  to: string;
  groupBy: GroupBy;
  brandId: number | null;
  brandCode: string | null;
  buckets: Bucket[];
  total: Bucket;
  bankLines: BankLineView[];
  notInBank: Movement[];
  shortPaid: ShortPaid[];
  statements: BankStatement[];
  balances: BankBalance[];
  notes: string[];
  counts: { bankLines: number; matched: number; unmatched: number; notInBank: number; shortPaid: number };
}

/** Where a matched record opens. */
export function matchLink(m: { type: Match['type']; docId: number | null }): string | null {
  if (m.type === 'CUSTOMER_PAYMENT' && m.docId) return '/portal/products/invoices/' + m.docId;
  if (m.type === 'SUPPLIER_PAYMENT' && m.docId) return '/portal/products/purchases/' + m.docId;
  return null;
}
