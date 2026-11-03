/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '../portal.config';
import { MyTask, TaskBody, TaskCustomer, TaskLogs, TaskStatus, WorkTask } from './worklog.models';

const TASKS = `${API_BASE}/api/tasks`;

/** Tasks (see TaskController in amsidel-backend): mine for everyone; the rest for owners and admins. */
@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);

  mine(): Observable<MyTask[]> {
    return this.http.get<MyTask[]>(`${TASKS}/mine`);
  }

  /** The customers a task may be for (no Customers menu needed). */
  customers(): Observable<TaskCustomer[]> {
    return this.http.get<TaskCustomer[]>(`${TASKS}/customers`);
  }

  list(status: TaskStatus | null): Observable<WorkTask[]> {
    return this.http.get<WorkTask[]>(TASKS, { params: status ? { status } : {} });
  }

  /** The task's page: the task and every work log entry against it. */
  logs(id: number): Observable<TaskLogs> {
    return this.http.get<TaskLogs>(`${TASKS}/${id}/logs`);
  }

  save(body: TaskBody, id?: number): Observable<WorkTask> {
    return id ? this.http.put<WorkTask>(`${TASKS}/${id}`, body) : this.http.post<WorkTask>(TASKS, body);
  }
}
