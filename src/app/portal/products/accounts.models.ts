/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HistoryEntry, PayMode } from './trade.models';

/** The code of a category of other income or expense (money_types on the server), e.g. TRANSPORT. */
export type MoneyCategory = string;

/** The discount (invoice write-off): always an active expense. */
export const DISCOUNT = 'DISCOUNT';

/** A category, set up by owners and admins. Funding (investment, loans) moves the bank, not the profit. */
export interface MoneyType {
  code: string;
  label: string;
  income: boolean;
  funding: boolean;
  /** Switched off: kept for old entries, not offered for new ones. */
  active: boolean;
  builtIn: boolean;
  /** The discount: only its name can change. */
  locked: boolean;
  /** Entries were made with it: it cannot be deleted or change between income and expense. */
  used: boolean;
  sortOrder: number;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface MoneyTypeBody { label: string; income?: boolean; funding?: boolean; active?: boolean; sortOrder?: number | null }

/** A line under the ones the portal started with, in the category list. */
export const CATEGORY_HINTS: Record<string, string> = {
  INVESTMENT: 'Money put in by another person',
  DIRECTOR_LOAN: 'A loan from an investor or director',
  CAPITAL: "The brand's own capital",
  BANK_LOAN: 'A loan credited by the bank',
  OTHER_INCOME: 'Interest, scrap sale, commission…',
  TRANSPORT: 'Lorry, auto, courier',
  FIXING: 'Fitting labour at site',
  MAINTENANCE: 'Repairs, service visits',
  REFUND: 'Money given back that is not an invoice refund',
  DISCOUNT: 'What a customer did not pay',
  RENT: 'Shop, godown, office',
  UTILITIES: 'Monthly bills',
  BANK_CHARGES: 'Charges and GST on them',
  LOAN_REPAYMENT: 'EMI or paying back a loan',
  MISC: 'Anything else',
};

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
