/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import {
  afterNextRender,
  Component,
  ElementRef,
  HostListener,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE } from '../../data/site.config';
import { CREDITS } from '../../shared/credits';

/** Group landing page: the Amsidel "solar system", with Doors & Windows orbiting the group logo. */
@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  protected readonly site = SITE;
  protected readonly year = new Date().getFullYear();
  protected readonly credits = CREDITS;

  protected readonly sections = [
    { id: 'top', label: 'Home', sub: 'Welcome' },
    { id: 'brands', label: 'Our Brand', sub: 'Doors & Windows' },
    { id: 'vision', label: 'Vision & Mission', sub: "Where we're headed" },
    { id: 'values', label: 'Our Values', sub: 'What we stand for' },
    { id: 'way', label: 'The Amsidel Way', sub: 'How we work' },
    { id: 'partner', label: 'Partner With Us', sub: "Let's build together" },
  ];

  protected readonly menuOpen = signal(false);
  protected readonly active = signal(0);
  protected readonly fill = signal(0);

  private readonly railList = viewChild<ElementRef<HTMLOListElement>>('railList');
  private readonly railDots = viewChildren<ElementRef<HTMLElement>>('railDot');
  private readonly rail = viewChild<ElementRef<HTMLElement>>('rail');
  private readonly menuBtn = viewChild<ElementRef<HTMLButtonElement>>('menuBtn');

  constructor() {
    afterNextRender(() => this.updateRail(true));
  }

  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  protected goTo(event: Event, id: string): void {
    event.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.menuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(e: MouseEvent): void {
    if (!this.menuOpen()) return;
    const t = e.target as Node;
    if (!this.rail()?.nativeElement.contains(t) && !this.menuBtn()?.nativeElement.contains(t)) {
      this.menuOpen.set(false);
    }
  }

  @HostListener('window:scroll')
  protected onScroll(): void {
    this.updateRail(false);
  }

  @HostListener('window:resize')
  protected onResize(): void {
    this.updateRail(true);
  }

  protected setFill(): void {
    const list = this.railList()?.nativeElement;
    const dot = this.railDots()[this.active()]?.nativeElement;
    if (!list || !dot) return;
    const top = dot.getBoundingClientRect().top - list.getBoundingClientRect().top + dot.offsetHeight / 2 - 7;
    this.fill.set(Math.max(0, top));
  }

  private updateRail(force: boolean): void {
    const mark = window.innerHeight * 0.4;
    let idx = 0;
    this.sections.forEach((s, i) => {
      const el = document.getElementById(s.id);
      if (el && el.getBoundingClientRect().top <= mark) idx = i;
    });
    const doc = document.documentElement;
    if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) idx = this.sections.length - 1;
    if (idx === this.active() && !force) return;
    this.active.set(idx);
    // wait for the class change to apply before measuring the dot
    requestAnimationFrame(() => this.setFill());
  }
}
