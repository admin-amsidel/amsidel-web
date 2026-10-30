/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import type { TreeNode } from 'primeng/api';
import type { OrgNode, ReportingLine } from '../people.service';

// Pure functions (no Angular), so the chart layout rules can be checked on their own.

/**
 * A chart box: a person, or the "Amsidel Group" box that joins several tops of the tree.
 * via = the person's actual manager, when the chart does not draw them directly below that manager
 * (a peer at the same level, or a "reports to" that loops back).
 */
export type OrgBox = { kind: 'person'; person: OrgNode; via?: string } | { kind: 'group' };

/** The chart, plus people whose "reports to" closes a loop (A -> B -> ... -> A), which an admin should fix. */
export interface OrgChart {
  root: TreeNode<OrgBox> | null;
  loops: { name: string; reportsTo: string }[];
}

/** A reporting line as a tree: the top of the chain first, down to the person, then their direct reports. */
export function lineToTree(line: ReportingLine): OrgChart {
  return buildTree([...line.chain, ...line.reports], line.chain[0]?.id);
}

/** Everyone as one tree from reportsToId; several people at the top hang under an "Amsidel Group" box. */
export function forestToTree(people: OrgNode[]): OrgChart {
  return buildTree(people);
}

/**
 * Builds the chart from reportsToId.
 * 1. Loops are cut, so every chart has a top: at rootId when given, else at the most senior person in the loop.
 * 2. Levels read as rows: someone who reports to a peer at the same level number (e.g. 6.1 Branch Head under
 *    6.2 Finance Manager) is drawn beside that peer, under the next level up.
 * A box not drawn under its real manager notes who that is.
 */
function buildTree(all: OrgNode[], rootId?: number): OrgChart {
  const byId = new Map<number, OrgNode>();
  for (const p of all) if (!byId.has(p.id)) byId.set(p.id, p);
  const people = [...byId.values()];
  if (!people.length) return { root: null, loops: [] };

  // 1. the manager each person hangs from, with loops cut
  const boss = new Map<number, number | null>();
  for (const p of people) {
    boss.set(p.id, p.id !== rootId && p.reportsToId != null && byId.has(p.reportsToId) ? p.reportsToId : null);
  }
  const loops: OrgChart['loops'] = [];
  if (rootId != null) {
    const top = byId.get(rootId);
    if (top?.reportsToId != null && byId.has(top.reportsToId)) {
      loops.push({ name: top.name, reportsTo: byId.get(top.reportsToId)!.name });
    }
  }
  const settled = new Set<number>();
  for (const start of people) {
    const path: number[] = [];
    const onPath = new Set<number>();
    for (let id: number | null = start.id; id != null && !settled.has(id); id = boss.get(id) ?? null) {
      if (onPath.has(id)) {
        // the path came back to id: the loop is id ... end of path; cut it at its most senior member
        const loop = path.slice(path.indexOf(id)).map((x) => byId.get(x)!);
        const cut = [...loop].sort(compareSeniority)[0];
        loops.push({ name: cut.name, reportsTo: byId.get(boss.get(cut.id)!)!.name });
        boss.set(cut.id, null);
        break;
      }
      onPath.add(id);
      path.push(id);
    }
    path.forEach((x) => settled.add(x));
  }

  // 2. place managers before their teams, so each person's own place is known when their team is placed
  const depth = new Map<number, number>();
  const depthOf = (id: number): number => {
    if (!depth.has(id)) {
      const b = boss.get(id);
      depth.set(id, b == null ? 0 : depthOf(b) + 1);
    }
    return depth.get(id)!;
  };
  const ordered = [...people].sort(compareSeniority).sort((a, b) => depthOf(a.id) - depthOf(b.id));

  const nodes = new Map(people.map((p) => [p.id, personNode(p)]));
  const shownUnder = new Map<number, number | null>();
  const tops: TreeNode<OrgBox>[] = [];
  for (const p of ordered) {
    const node = nodes.get(p.id)!;
    let parentId = boss.get(p.id) ?? null;
    // a same-level manager: go up to the box above them, so peers share a row
    while (parentId != null && sameLevel(byId.get(parentId)!, p) && shownUnder.get(parentId) != null) {
      parentId = shownUnder.get(parentId)!;
    }
    shownUnder.set(p.id, parentId);
    const realBoss = p.reportsToId != null ? byId.get(p.reportsToId) : undefined;
    if (realBoss && parentId !== realBoss.id) (node.data as { via?: string }).via = realBoss.name;
    if (parentId == null) tops.push(node);
    else nodes.get(parentId)!.children!.push(node);
  }

  // siblings in level order: 6.1 before 6.2, then by name
  for (const n of nodes.values()) {
    n.children!.sort((a, b) => compareSeniority((a.data as { person: OrgNode }).person, (b.data as { person: OrgNode }).person));
  }
  tops.sort((a, b) => compareSeniority((a.data as { person: OrgNode }).person, (b.data as { person: OrgNode }).person));
  const root = tops.length === 1 ? tops[0] : { type: 'group', expanded: true, data: { kind: 'group' } as OrgBox, children: tops };
  return { root, loops };
}

function sameLevel(a: OrgNode, b: OrgNode): boolean {
  return a.levelNumber != null && a.levelNumber === b.levelNumber;
}

function personNode(person: OrgNode): TreeNode<OrgBox> {
  return { type: 'person', expanded: true, data: { kind: 'person', person }, children: [] };
}

function compareSeniority(a: OrgNode, b: OrgNode): number {
  return (b.levelNumber ?? 0) - (a.levelNumber ?? 0) || (a.levelCode ?? '').localeCompare(b.levelCode ?? '') || a.name.localeCompare(b.name);
}
