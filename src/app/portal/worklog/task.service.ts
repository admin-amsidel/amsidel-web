import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '../portal.config';
import { MyTask, TaskBody, TaskStatus, WorkTask } from './worklog.models';

const TASKS = `${API_BASE}/api/tasks`;

/** Tasks (see TaskController in amsidel-backend): mine for everyone; the rest for owners and admins. */
@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);

  mine(): Observable<MyTask[]> {
    return this.http.get<MyTask[]>(`${TASKS}/mine`);
  }

  list(status: TaskStatus | null): Observable<WorkTask[]> {
    return this.http.get<WorkTask[]>(TASKS, { params: status ? { status } : {} });
  }

  save(body: TaskBody, id?: number): Observable<WorkTask> {
    return id ? this.http.put<WorkTask>(`${TASKS}/${id}`, body) : this.http.post<WorkTask>(TASKS, body);
  }
}
