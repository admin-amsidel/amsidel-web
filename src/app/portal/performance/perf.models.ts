/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
export type SkillCategory = 'TECHNICAL' | 'NON_TECHNICAL';

export const SKILL_CATEGORIES: { value: SkillCategory; label: string }[] = [
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'NON_TECHNICAL', label: 'Non-technical' },
];

/** Suggestions for an achievement's kind (any text is allowed). */
export const ACHIEVEMENT_KINDS = ['Team Champ', 'Star Performer', 'Customer Star', 'Best Sales', 'Innovation', 'Safety', 'Mentor', 'Other'];

export interface Cycle {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  brandId: number | null;
  brandName: string | null;
  closed: boolean;
}

export interface PerfPerson {
  id: number;
  name: string;
  empNumber: string;
  designationName: string | null;
  photoPath: string | null;
  photoUpdatedAt: string | null;
}

export interface Skill {
  id: number;
  name: string;
  category: SkillCategory;
  /** 0: the person has not given their level yet (a skill their manager added). */
  selfLevel: number;
  /** The manager who added it; null when the person listed it. */
  addedBy: string | null;
  managerLevel: number | null;
  managerNote: string | null;
  validatedBy: string | null;
  validatedAt: string | null;
}

export interface GoalTask {
  id: number;
  title: string;
  weightage: number;
  startDate: string;
  endDate: string;
  progress: number;
}

export interface Goal {
  id: number;
  title: string;
  description: string | null;
  weightage: number;
  startDate: string;
  endDate: string;
  /** % done (from the sub-tasks, or the goal's own). */
  progress: number;
  tasks: GoalTask[];
  selfRating: number | null;
  selfComment: string | null;
  selfRatedAt: string | null;
  managerRating: number | null;
  managerComment: string | null;
  managerRatedBy: string | null;
  managerRatedAt: string | null;
  canSelfRate: boolean;
  canManagerRate: boolean;
  /** A manager until they rate it; an owner or admin always. */
  canEdit: boolean;
}

export interface Achievement {
  id: number;
  title: string;
  category: string | null;
  achievedOn: string;
  details: string | null;
  issuedBy: string | null;
  selfReported: boolean;
}

export interface Totals {
  /** Goal weights; should be 100. */
  weightTotal: number;
  progress: number;
  selfRating: number | null;
  managerRating: number | null;
  goals: number;
  selfRated: number;
  managerRated: number;
}

export interface ReviewView {
  cycle: Cycle;
  employee: PerfPerson;
  /** self: I am the person; manager: I am above them. Both false in a closed cycle. */
  rights: { self: boolean; manager: boolean };
  selfIntro: string | null;
  skills: Skill[];
  goals: Goal[];
  achievements: Achievement[];
  totals: Totals;
  today: string;
}

export interface TeamRow {
  employee: PerfPerson;
  totals: Totals;
  skills: number;
  skillsToValidate: number;
  toRate: number;
}

export interface GoalBody {
  title: string;
  description: string | null;
  weightage: number;
  startDate: string;
  endDate: string;
  tasks: { id: number | null; title: string; weightage: number; startDate: string; endDate: string }[];
}
