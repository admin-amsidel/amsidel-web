/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { SITE } from '../../data/site.config';

export interface BrandStatement {
  title: string;
  text: string;
}

export interface BrandPicture {
  src: string;
  alt: string;
  /** Shown over the picture. */
  label?: string;
}

/**
 * What a brand's page says. Everything is optional: a section with nothing in it does not show, so a brand can start
 * small and nothing is ever filled in with made-up text. The logo, name and business details come from the Brands page.
 */
export interface BrandSiteContent {
  tagline?: string;
  /** Used when no logo has been uploaded for the brand. */
  logo?: string;
  hero?: string;
  about?: { title: string; paragraphs: string[]; picture?: BrandPicture };
  vision?: BrandStatement;
  mission?: BrandStatement;
  values?: BrandStatement[];
  /** What the brand offers, with pictures. */
  offerings?: BrandPicture[];
  /** The kinds of customer the brand works for. */
  clientTypes?: { title: string; intro?: string; types: BrandStatement[]; picture?: BrandPicture };
  /** Named clients. */
  clients?: string[];
  projects?: { title: string; intro?: string; pictures: BrandPicture[] };
  /** Used for whatever the Brands page does not hold. */
  contact?: { phone?: string; email?: string; altEmail?: string; website?: string; hours?: string };
  /** The brand's page on the public site, inside this app. */
  publicLink?: string;
}

/**
 * Each brand's page, by brand code (AD = Amsidel Doors & Windows; the key must match the code on the Brands page). A new brand gets an entry here, with its pictures in public/images/.
 * Amsidel Doors & Windows is taken from the public site (pages/about, pages/projects, data/site.config), so the two say
 * the same. No client has been named yet, so the page shows the kinds of customer the site lists.
 */
export const BRAND_SITES: Record<string, BrandSiteContent> = {
  AD: {
    tagline: 'A new name in doors and windows, built on old-fashioned care.',
    logo: 'brand/amsidel-logo.png',
    hero: 'images/hero/hero-1.webp',
    about: {
      title: 'One team for every door and window in your building',
      paragraphs: [
        `Amsidel Doors & Windows is the building-products brand of ${SITE.company}. We started with a simple observation: most homeowners deal with three or four different suppliers for their windows, main door, internal doors and bathroom doors, and none of them talk to each other.`,
        'We bring uPVC, aluminium, WPC and steel systems together with a complete range of safety, ABS, membrane, laminated, skin and fibre doors. One survey, one quotation, one installation team, and one number to call afterwards.',
      ],
      picture: { src: 'images/gallery/gallery-06.webp', alt: 'Bay window seat with large casement windows' },
    },
    vision: {
      title: 'Spaces people are proud to live and work in',
      text: 'To be the most trusted name for doors and windows in the homes and buildings we serve: designed with care, built to last and backed by honest service.',
    },
    mission: {
      title: 'Get every opening right, first time',
      text: 'Advise honestly, measure precisely, supply quality materials and install them properly, then stay available long after handover.',
    },
    values: [
      { title: 'Craftsmanship', text: 'Attention to detail in every frame, joint and finish.' },
      { title: 'Integrity', text: 'Clear pricing, honest timelines and promises we keep.' },
      { title: 'Customer first', text: 'Service that continues long after the installation.' },
      { title: 'Sustainability', text: 'Energy-efficient, long-life products that waste less.' },
    ],
    offerings: [
      { src: 'images/banners/upvc.webp', alt: 'uPVC doors and windows', label: 'uPVC' },
      { src: 'images/banners/aluminium.webp', alt: 'Aluminium doors and windows', label: 'Aluminium' },
      { src: 'images/banners/wpc.webp', alt: 'WPC doors', label: 'WPC' },
      { src: 'images/banners/steel.webp', alt: 'Steel doors and windows', label: 'Steel' },
      { src: 'images/banners/safety.webp', alt: 'Safety doors', label: 'Safety' },
      { src: 'images/banners/abs.webp', alt: 'ABS doors', label: 'ABS' },
      { src: 'images/banners/membrane.webp', alt: 'Membrane doors', label: 'Membrane' },
      { src: 'images/banners/laminated.webp', alt: 'Laminated doors', label: 'Laminated' },
      { src: 'images/banners/skin.webp', alt: 'Skin doors', label: 'Skin' },
      { src: 'images/banners/fibre.webp', alt: 'Fibre doors', label: 'Fibre' },
    ],
    clientTypes: {
      title: 'Homeowners, architects and builders',
      intro: "Whether it's a single bedroom door or every opening in an apartment project, we tailor the products, the schedule and the paperwork to the job.",
      types: [
        { title: 'Homeowners', text: 'Guidance on materials, styles and budgets for new homes and renovations.' },
        { title: 'Architects & interior designers', text: 'Samples, finishes and technical details to match your specification.' },
        { title: 'Builders & developers', text: 'Bulk supply and phased installation that fits your site schedule.' },
        { title: 'Dealers', text: "We're building a dealer network; get in touch to partner with us." },
      ],
      picture: { src: 'images/gallery/gallery-11.webp', alt: 'Black-framed glazed doors on a house front' },
    },
    projects: {
      title: 'Projects & inspiration',
      intro: 'Ideas for entrances, living spaces and bedrooms. Choose a picture to see it larger.',
      pictures: Array.from({ length: 15 }, (_, i) => ({
        src: `images/gallery/gallery-${String(i + 1).padStart(2, '0')}.webp`,
        alt: `Doors and windows, picture ${i + 1}`,
      })),
    },
    contact: { phone: SITE.phone, email: SITE.email, altEmail: SITE.altEmail, website: SITE.website, hours: SITE.hours },
    publicLink: '/doors-windows',
  },
};
