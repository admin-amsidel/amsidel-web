import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';
import { MyPay, PaymentMode, PayComponent, PayKind, PayrollYear, Payslip, PayslipMonth, PayslipSave, Salary, SalaryBody, TaxCalc } from './payroll.models';

const PAY = `${API_BASE}/api/payroll`;

/** Payroll set-up: pay components and salaries per financial year (fy = the year it starts, 2025 = FY 2025-26). */
@Injectable({ providedIn: 'root' })
export class PayrollService {
  private readonly http = inject(HttpClient);

  components(): Observable<PayComponent[]> {
    return this.http.get<PayComponent[]>(`${PAY}/components`);
  }

  saveComponent(body: { code: string; name: string; kind: PayKind; sortOrder: number; active: boolean; tax: boolean }, id?: number): Observable<PayComponent> {
    return id ? this.http.put<PayComponent>(`${PAY}/components/${id}`, body) : this.http.post<PayComponent>(`${PAY}/components`, body);
  }

  deleteComponent(id: number): Observable<void> {
    return this.http.delete<void>(`${PAY}/components/${id}`);
  }

  /** Everyone with their totals; this financial year when fy is not given. */
  year(fy?: number): Observable<PayrollYear> {
    return this.http.get<PayrollYear>(`${PAY}/salaries`, { params: fy ? { fy } : {} });
  }

  salary(employeeId: number, fy: number): Observable<Salary> {
    return this.http.get<Salary>(`${PAY}/salaries/${employeeId}`, { params: { fy } });
  }

  /** The income tax under both regimes for the salary being typed. */
  taxPreview(fy: number, body: { effectiveFrom: string; monthlyGross: number; monthlyProfessionalTax: number; declared: number | null }):
    Observable<{ NEW: TaxCalc; OLD: TaxCalc }> {
    return this.http.post<{ NEW: TaxCalc; OLD: TaxCalc }>(`${PAY}/tax-preview`, body, { params: { fy }, context: silent() });
  }

  save(employeeId: number, fy: number, body: SalaryBody): Observable<Salary> {
    return this.http.put<Salary>(`${PAY}/salaries/${employeeId}`, body, { params: { fy } });
  }

  delete(employeeId: number, fy: number): Observable<void> {
    return this.http.delete<void>(`${PAY}/salaries/${employeeId}`, { params: { fy } });
  }

  // ---- monthly payslips (payroll) ----

  month(year: number, month: number): Observable<PayslipMonth> {
    return this.http.get<PayslipMonth>(`${PAY}/payslips`, { params: { year, month } });
  }

  /** Draft payslips for the month; workingDays = this month's for all of them (empty = each salary's own). */
  generate(year: number, month: number, employeeIds?: number[], workingDays?: number): Observable<{ created: number; skipped: number; notes: string[] }> {
    return this.http.post<{ created: number; skipped: number; notes: string[] }>(`${PAY}/payslips/generate`, { year, month, employeeIds, workingDays });
  }

  payslip(id: number): Observable<Payslip> {
    return this.http.get<Payslip>(`${PAY}/payslips/${id}`);
  }

  savePayslip(id: number, body: PayslipSave): Observable<Payslip> {
    return this.http.put<Payslip>(`${PAY}/payslips/${id}`, body);
  }

  recalculate(id: number): Observable<Payslip> {
    return this.http.post<Payslip>(`${PAY}/payslips/${id}/recalculate`, {});
  }

  publish(ids: number[]): Observable<{ published: number }> {
    return this.http.post<{ published: number }>(`${PAY}/payslips/publish`, { ids });
  }

  unpublish(id: number): Observable<Payslip> {
    return this.http.post<Payslip>(`${PAY}/payslips/${id}/unpublish`, {});
  }

  /** The salary was credited: the employee now sees the payslip. */
  /** reference = the transaction ID; both it and the remarks may be empty. */
  markPaid(id: number, body: { paidOn: string; mode: PaymentMode; reference: string; remarks: string }): Observable<Payslip> {
    return this.http.put<Payslip>(`${PAY}/payslips/${id}/payment`, body);
  }

  unmarkPaid(id: number): Observable<Payslip> {
    return this.http.delete<Payslip>(`${PAY}/payslips/${id}/payment`);
  }

  markPaidBulk(ids: number[], paidOn: string, mode: PaymentMode, reference: string, remarks: string): Observable<{ credited: number }> {
    return this.http.post<{ credited: number }>(`${PAY}/payslips/payments`, { ids, paidOn, mode, reference, remarks });
  }

  deletePayslip(id: number): Observable<void> {
    return this.http.delete<void>(`${PAY}/payslips/${id}`);
  }

  // ---- the employee's own pay ----

  myPay(fy?: number): Observable<MyPay> {
    return this.http.get<MyPay>(`${API_BASE}/api/my-pay`, { params: fy ? { fy } : {} });
  }

  myPayslip(id: number): Observable<Payslip> {
    return this.http.get<Payslip>(`${API_BASE}/api/my-pay/payslips/${id}`);
  }

  /** Downloads the payslip PDF (own: My pay; any in scope: payroll). The request needs the login token, so not a plain link. */
  downloadPdf(p: Payslip, own: boolean): Observable<void> {
    const url = own ? `${API_BASE}/api/my-pay/payslips/${p.id}/pdf` : `${PAY}/payslips/${p.id}/pdf`;
    return new Observable<void>((sub) => {
      const req = this.http.get(url, { responseType: 'blob' }).subscribe({
        next: (blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `Payslip-${p.year}-${String(p.month).padStart(2, '0')}-${p.employee.empNumber}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 30000);
          sub.next();
          sub.complete();
        },
        error: (err) => sub.error(err),
      });
      return () => req.unsubscribe();
    });
  }
}
