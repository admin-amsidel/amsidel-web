import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from './portal.config';
import { Brand, Designation, Employee, EmployeeRequest } from './portal.models';

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

  /** Most junior first. */
  designations(): Observable<Designation[]> {
    return this.http.get<Designation[]>(`${API_BASE}/api/designations`);
  }

  saveDesignation(body: Omit<Designation, 'id'>, id?: number): Observable<Designation> {
    return id
      ? this.http.put<Designation>(`${API_BASE}/api/designations/${id}`, body)
      : this.http.post<Designation>(`${API_BASE}/api/designations`, body);
  }
}
