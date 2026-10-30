/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from './portal.config';
import { BankDetails, Brand, BrandBody, Designation, Employee, EmployeeRequest, UserType } from './portal.models';

/** Employee and brand records (owners and admins; the backend applies brand limits). */
@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);

  employees(brandId?: number | null): Observable<Employee[]> {
    const params: Record<string, number> = brandId ? { brandId } : {};
    return this.http.get<Employee[]>(`${API_BASE}/api/employees`, { params });
  }

  employee(id: number): Observable<Employee> {
    return this.http.get<Employee>(`${API_BASE}/api/employees/${id}`);
  }

  create(body: EmployeeRequest): Observable<Employee> {
    return this.http.post<Employee>(`${API_BASE}/api/employees`, body);
  }

  update(id: number, body: EmployeeRequest): Observable<Employee> {
    return this.http.put<Employee>(`${API_BASE}/api/employees/${id}`, body);
  }

  resetPin(id: number, newPassword: string): Observable<void> {
    return this.http.post<void>(`${API_BASE}/api/employees/${id}/reset-password`, { newPassword });
  }

  brands(): Observable<Brand[]> {
    return this.http.get<Brand[]>(`${API_BASE}/api/brands`);
  }

  /** An employee's PAN and salary account; employeeId empty = my own (read-only). */
  bankDetails(employeeId?: number | null): Observable<BankDetails> {
    return this.http.get<BankDetails>(employeeId ? `${API_BASE}/api/employees/${employeeId}/bank-details` : `${API_BASE}/api/auth/me/bank-details`);
  }

  saveBankDetails(employeeId: number, body: { pan: string; bankAccount: string; ifsc: string; upi: string }): Observable<BankDetails> {
    return this.http.put<BankDetails>(`${API_BASE}/api/employees/${employeeId}/bank-details`, body);
  }

  /** Owners only. */
  saveBrand(body: BrandBody, id?: number): Observable<Brand> {
    return id ? this.http.put<Brand>(`${API_BASE}/api/brands/${id}`, body) : this.http.post<Brand>(`${API_BASE}/api/brands`, body);
  }

  uploadBrandLogo(id: number, file: File): Observable<Brand> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<Brand>(`${API_BASE}/api/brands/${id}/logo`, form);
  }

  /** The brand's UPI payment QR for invoices (PNG or JPEG). */
  uploadBrandUpiQr(id: number, file: File): Observable<Brand> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<Brand>(`${API_BASE}/api/brands/${id}/upi-qr`, form);
  }

  deleteBrandUpiQr(id: number): Observable<Brand> {
    return this.http.delete<Brand>(`${API_BASE}/api/brands/${id}/upi-qr`);
  }

  brandUpiQr(id: number): Observable<Blob> {
    return this.http.get(`${API_BASE}/api/brands/${id}/upi-qr`, { responseType: 'blob' });
  }

  /** keySecret blank = keep the saved one; keyId blank = online payments off. */
  saveBrandRazorpay(id: number, keyId: string, keySecret: string): Observable<Brand> {
    return this.http.put<Brand>(`${API_BASE}/api/brands/${id}/razorpay`, { keyId, keySecret });
  }

  deleteBrandLogo(id: number): Observable<Brand> {
    return this.http.delete<Brand>(`${API_BASE}/api/brands/${id}/logo`);
  }

  /** Most junior first. */
  designations(): Observable<Designation[]> {
    return this.http.get<Designation[]>(`${API_BASE}/api/designations`);
  }

  /** Only one no employee has. */
  deleteDesignation(id: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/api/designations/${id}`);
  }

  userTypes(): Observable<UserType[]> {
    return this.http.get<UserType[]>(`${API_BASE}/api/user-types`);
  }

  saveUserType(body: { name: string; baseRole: string; description: string | null; active: boolean }, id?: number): Observable<UserType> {
    return id ? this.http.put<UserType>(`${API_BASE}/api/user-types/${id}`, body) : this.http.post<UserType>(`${API_BASE}/api/user-types`, body);
  }

  /** Only one nobody has, and not a built-in one. */
  deleteUserType(id: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/api/user-types/${id}`);
  }

  saveDesignation(body: Omit<Designation, 'id'>, id?: number): Observable<Designation> {
    return id
      ? this.http.put<Designation>(`${API_BASE}/api/designations/${id}`, body)
      : this.http.post<Designation>(`${API_BASE}/api/designations`, body);
  }
}
