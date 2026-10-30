/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
/** A project status from the project_statuses table: still open, done, or called off. */
export type StagePhase = 'OPEN' | 'DONE' | 'CANCELLED';

export interface ProjectStage {
  code: string;
  name: string;
  phase: StagePhase;
  sortOrder: number;
  active: boolean;
}

export type StageSeverity = 'secondary' | 'info' | 'success' | 'warn' | 'danger' | 'contrast';

interface Look {
  name: string;
  icon: string;
  severity: StageSeverity;
  /** The timeline marker's colour. */
  color: string;
}

/** How the statuses the portal started with look (a status added later takes its phase's look). */
const LOOKS: Record<string, Look> = {
  QUEUED: { name: 'Queued', icon: 'pi pi-clock', severity: 'secondary', color: '#64748b' },
  QUOTATION_ISSUED: { name: 'Quotation issued', icon: 'pi pi-file', severity: 'warn', color: '#b45309' },
  QUOTATION_APPROVED: { name: 'Quotation approved', icon: 'pi pi-file-check', severity: 'warn', color: '#a16207' },
  CONFIRMED: { name: 'Confirmed', icon: 'pi pi-thumbs-up', severity: 'contrast', color: '#334155' },
  IN_PROGRESS: { name: 'Started', icon: 'pi pi-cog', severity: 'info', color: '#1d5fa3' },
  COMPLETED: { name: 'Completed', icon: 'pi pi-check', severity: 'success', color: '#1f7a45' },
  CANCELLED: { name: 'Cancelled', icon: 'pi pi-times', severity: 'danger', color: '#b3261e' },
};

const BY_PHASE: Record<StagePhase, Look> = {
  OPEN: { name: '', icon: 'pi pi-circle', severity: 'info', color: '#1d5fa3' },
  DONE: LOOKS['COMPLETED'],
  CANCELLED: LOOKS['CANCELLED'],
};

/** The icon, tag colour and marker colour of a status; its name when the table's list is not at hand. */
export function stageLook(code: string, phase?: StagePhase): Look {
  return LOOKS[code] ?? BY_PHASE[phase ?? 'OPEN'];
}

/** "Quotation issued" for QUOTATION_ISSUED when the table's list is not at hand. */
export function stageName(code: string): string {
  return LOOKS[code]?.name || code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');
}
