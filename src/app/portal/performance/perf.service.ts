import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '../portal.config';
import { Achievement, Cycle, Goal, GoalBody, ReviewView, Skill, SkillCategory, TeamRow } from './perf.models';

const PERF = `${API_BASE}/api/performance`;

/** Performance reviews: cycles, my review, my team's reviews. */
@Injectable({ providedIn: 'root' })
export class PerfService {
  private readonly http = inject(HttpClient);

  cycles(): Observable<Cycle[]> {
    return this.http.get<Cycle[]>(`${PERF}/cycles`);
  }

  saveCycle(body: { name: string; startDate: string; endDate: string; brandId: number | null; closed: boolean }, id?: number): Observable<Cycle> {
    return id ? this.http.put<Cycle>(`${PERF}/cycles/${id}`, body) : this.http.post<Cycle>(`${PERF}/cycles`, body);
  }

  /** Mine (employeeId empty) or a team member's. */
  review(cycleId: number, employeeId?: number | null): Observable<ReviewView> {
    return this.http.get<ReviewView>(employeeId ? `${PERF}/cycles/${cycleId}/employees/${employeeId}` : `${PERF}/cycles/${cycleId}/me`);
  }

  team(cycleId: number): Observable<TeamRow[]> {
    return this.http.get<TeamRow[]>(`${PERF}/cycles/${cycleId}/team`);
  }

  saveIntro(cycleId: number, selfIntro: string): Observable<ReviewView> {
    return this.http.put<ReviewView>(`${PERF}/cycles/${cycleId}/me/intro`, { selfIntro });
  }

  saveSkill(cycleId: number, body: { name: string; category: SkillCategory; selfLevel: number }, id?: number): Observable<Skill> {
    return id ? this.http.put<Skill>(`${PERF}/skills/${id}`, body) : this.http.post<Skill>(`${PERF}/cycles/${cycleId}/me/skills`, body);
  }

  /** A manager adds a skill to someone below them, with their level and note. */
  addSkillFor(cycleId: number, employeeId: number, body: { name: string; category: SkillCategory; managerLevel: number; note: string }): Observable<Skill> {
    return this.http.post<Skill>(`${PERF}/cycles/${cycleId}/employees/${employeeId}/skills`, body);
  }

  deleteSkill(id: number): Observable<void> {
    return this.http.delete<void>(`${PERF}/skills/${id}`);
  }

  validateSkill(id: number, managerLevel: number, note: string): Observable<Skill> {
    return this.http.put<Skill>(`${PERF}/skills/${id}/validation`, { managerLevel, note });
  }

  saveGoal(cycleId: number, employeeId: number, body: GoalBody, id?: number): Observable<Goal> {
    return id ? this.http.put<Goal>(`${PERF}/goals/${id}`, body) : this.http.post<Goal>(`${PERF}/cycles/${cycleId}/employees/${employeeId}/goals`, body);
  }

  deleteGoal(id: number): Observable<void> {
    return this.http.delete<void>(`${PERF}/goals/${id}`);
  }

  goalProgress(goalId: number, progress: number): Observable<Goal> {
    return this.http.put<Goal>(`${PERF}/goals/${goalId}/progress`, { progress });
  }

  taskProgress(goalId: number, taskId: number, progress: number): Observable<Goal> {
    return this.http.put<Goal>(`${PERF}/goals/${goalId}/tasks/${taskId}/progress`, { progress });
  }

  rate(goalId: number, who: 'self' | 'manager', rating: number, comment: string): Observable<Goal> {
    return this.http.put<Goal>(`${PERF}/goals/${goalId}/${who}-rating`, { rating, comment });
  }

  addAchievement(body: { employeeId: number | null; title: string; category: string | null; achievedOn: string; details: string | null }): Observable<Achievement> {
    return this.http.post<Achievement>(`${PERF}/achievements`, body);
  }

  deleteAchievement(id: number): Observable<void> {
    return this.http.delete<void>(`${PERF}/achievements/${id}`);
  }
}
