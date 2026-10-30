/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { ProjectStage, stageLook, stageName, StageSeverity } from '../../shared/project-stage-look';
import { API_BASE } from '../portal.config';

/** The project statuses (Queued ... Completed, Cancelled) from the project_statuses table, loaded once. */
@Injectable({ providedIn: 'root' })
export class ProjectStages {
  private readonly http = inject(HttpClient);
  private loaded = false;

  readonly all = signal<ProjectStage[]>([]);
  /** The ones to choose from, in their order. */
  readonly options = computed(() => this.all().filter((s) => s.active).map((s) => ({ value: s.code, label: s.name })));

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.http.get<ProjectStage[]>(`${API_BASE}/api/trade/project-statuses`).subscribe({
      next: (s) => this.all.set(s),
      error: () => (this.loaded = false),
    });
  }

  private find(code: string): ProjectStage | undefined {
    return this.all().find((s) => s.code === code);
  }

  name(code: string): string {
    return this.find(code)?.name ?? stageName(code);
  }

  severity(code: string): StageSeverity {
    return stageLook(code, this.find(code)?.phase).severity;
  }

  icon(code: string): string {
    return stageLook(code, this.find(code)?.phase).icon;
  }

  color(code: string): string {
    return stageLook(code, this.find(code)?.phase).color;
  }

  /** Still being worked on (not completed, not cancelled). */
  isOpen(code: string): boolean {
    const s = this.find(code);
    return s ? s.phase === 'OPEN' : code !== 'COMPLETED' && code !== 'CANCELLED';
  }
}
