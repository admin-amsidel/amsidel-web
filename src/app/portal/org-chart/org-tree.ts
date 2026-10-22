import { Component, computed, input, output } from '@angular/core';
import { PrimeTemplate, TreeNode } from 'primeng/api';
import { OrganizationChartModule } from 'primeng/organizationchart';
import { Avatar } from '../avatar';
import { OrgNode } from '../people.service';
import { OrgBox } from './org-tree-build';

/** Draws a reporting tree with PrimeNG OrganizationChart; photos where people have them, initials otherwise. */
@Component({
  selector: 'app-org-tree',
  imports: [OrganizationChartModule, PrimeTemplate, Avatar],
  template: `
    @if (value().length) {
      <div class="scroller">
        <p-organization-chart [value]="value()" [collapsible]="collapsible()">
          <ng-template let-node pTemplate="person">
            <button type="button" class="box" [class.box--me]="node.data.person.id === highlightId()"
                    [class.box--link]="linkable()" [disabled]="!linkable()" (click)="open.emit(node.data.person)">
              <app-avatar [name]="node.data.person.name" [employeeId]="node.data.person.id"
                          [photoVersion]="node.data.person.photoUpdatedAt" [photoPath]="node.data.person.photoPath" [size]="48" />
              <b>{{ node.data.person.name }}</b>
              <small class="empno">{{ node.data.person.empNumber }}</small>
              @if (node.data.person.designationName) {
                <span class="title">{{ node.data.person.designationName }}</span>
                <span class="lvl">L{{ node.data.person.levelCode }}</span>
              } @else {
                <span class="title muted">No designation</span>
              }
              @if (node.data.via) { <small class="via">reports to {{ node.data.via }}</small> }
              @if (showBrand() && node.data.person.brandCode) { <small>{{ node.data.person.brandCode }}</small> }
            </button>
          </ng-template>
          <ng-template let-node pTemplate="group">
            <div class="box box--group">
              <img src="brand/amsidel-mark.png" alt="" width="60" height="28" />
              <b>Amsidel Group</b>
            </div>
          </ng-template>
        </p-organization-chart>
      </div>
    } @else {
      <p class="p-empty">{{ emptyText() }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .scroller { overflow-x: auto; padding: 4px 0 12px; }
    :host ::ng-deep .p-organizationchart { margin: 0 auto; width: max-content; min-width: 100%; }
    :host ::ng-deep .p-organizationchart-node { padding: 0; border: 0; background: transparent; }
    :host ::ng-deep .p-organizationchart-node-content { padding: 0; border: 0; background: transparent; }
    :host ::ng-deep .p-organizationchart-connector-down,
    :host ::ng-deep .p-organizationchart-connector-left,
    :host ::ng-deep .p-organizationchart-connector-right { border-color: var(--brass); }
    :host ::ng-deep .p-organizationchart-connector-down { background: var(--brass); }
    .box {
      display: grid; justify-items: center; gap: 4px; width: 176px; padding: 14px 10px 12px;
      background: var(--bg); border: 1px solid var(--line); border-top: 3px solid var(--pine); border-radius: 10px;
      font: inherit; color: var(--ink); text-align: center;
    }
    .box b { font-size: .9rem; line-height: 1.25; }
    .box .title { font-size: .78rem; color: var(--pine); line-height: 1.25; }
    .box small { font-size: .68rem; letter-spacing: .12em; color: var(--muted); }
    .box small.empno { margin-top: -3px; letter-spacing: .08em; font-variant-numeric: tabular-nums; }
    .box small.via { letter-spacing: 0; font-size: .72rem; color: var(--brass-dark); }
    .box--link { cursor: pointer; transition: border-color .2s, box-shadow .2s; }
    .box--link:hover { border-color: var(--brass); box-shadow: 0 6px 16px rgba(30,30,33,.1); }
    .box:disabled { cursor: default; }
    .box--me { border: 2px solid var(--brass); border-top-width: 3px; background: #fbf7ef; box-shadow: 0 6px 18px rgba(176,138,78,.25); }
    .box--group { border-top-color: var(--brass); background: var(--dark); color: #fff; }
    .box--group img { height: 22px; width: auto; filter: brightness(0) invert(1); }
    /* phones: narrower boxes, so more of the line fits before scrolling sideways */
    @media (max-width: 760px) {
      .box { width: 136px; padding: 10px 6px 9px; }
      .box b { font-size: .82rem; }
      .box .title { font-size: .72rem; }
    }
  `,
})
export class OrgTree {
  readonly root = input<TreeNode<OrgBox> | null>(null);
  /** The person whose line this is, drawn in gold. */
  readonly highlightId = input<number | null>(null);
  /** Boxes can be clicked (opens that person). */
  readonly linkable = input(false);
  readonly collapsible = input(false);
  readonly showBrand = input(false);
  readonly emptyText = input('Nobody to show yet.');
  readonly open = output<OrgNode>();

  protected readonly value = computed(() => {
    const root = this.root();
    return root ? [root] : [];
  });
}
