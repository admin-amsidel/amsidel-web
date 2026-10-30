/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { GENERATED_PRODUCTS } from './products.generated';

export type CategoryGroup = 'doors-windows' | 'doors';

export interface Category {
  slug: string;
  name: string;
  short: string;
  group: CategoryGroup;
  tagline: string;
  description: string;
  features: string[];
  applications: string[];
  /** Small square image for menus and lists. */
  thumb: string;
  /** Room-setting photo for the range showcase. */
  cover: string;
  banner: string;
}

export interface Product {
  slug: string;
  model: string;
  name: string;
  category: string;
  image: string;
}

export const CATEGORIES: Category[] = [
  {
    slug: 'upvc',
    name: 'uPVC Doors & Windows',
    short: 'uPVC',
    group: 'doors-windows',
    tagline: 'Quiet, sealed and low-maintenance',
    description:
      'Multi-chamber uPVC profiles with steel reinforcement and EPDM gaskets keep out dust, rain and street noise. They never need painting and stay true to shape through heat and monsoon.',
    features: [
      'Lead-free, UV-stabilised profiles',
      'Sliding, casement, tilt-and-turn and fixed options',
      'Single or double-glazed units',
      'Multi-point locking hardware',
    ],
    applications: ['Apartments', 'Villas', 'Balconies', 'Bedrooms facing traffic'],
    thumb: 'images/products/upvc/upvc-03.webp',
    cover: 'images/banners/upvc.webp',
    banner: 'images/banners/upvc.webp',
  },
  {
    slug: 'aluminium',
    name: 'Aluminium Doors & Windows',
    short: 'Aluminium',
    group: 'doors-windows',
    tagline: 'Slim frames, wide views',
    description:
      'Powder-coated and anodised aluminium systems for large sliding doors, folding partitions and slim-line windows. Strong enough for big glass panels, light enough to glide.',
    features: [
      'Slim sight-lines for maximum glass',
      'Sliding, slide-and-fold and casement systems',
      'Powder-coat colours and wood-grain finishes',
      'Rust-free and long lasting',
    ],
    applications: ['Living-room openings', 'Shopfronts', 'Offices', 'Terraces'],
    thumb: 'images/products/aluminium/aluminium-03.webp',
    cover: 'images/banners/aluminium.webp',
    banner: 'images/banners/aluminium.webp',
  },
  {
    slug: 'wpc',
    name: 'WPC Doors & Windows',
    short: 'WPC',
    group: 'doors-windows',
    tagline: 'The look of wood without the worry',
    description:
      'Wood-plastic composite doors, frames and windows that resist water, termites and borers. A solid, warm alternative to timber for bathrooms, kitchens and humid regions.',
    features: [
      '100% waterproof and termite-proof',
      'Will not swell, warp or rot',
      'Paint, laminate or veneer finishes',
      'Screw-holding strength close to hardwood',
    ],
    applications: ['Bathrooms', 'Kitchens', 'Coastal homes', 'Main and internal doors'],
    thumb: 'images/products/wpc/wpc-01.webp',
    cover: 'images/products/wpc/wpc-19.webp',
    banner: 'images/banners/wpc.webp',
  },
  {
    slug: 'steel',
    name: 'Steel Doors & Windows',
    short: 'Steel',
    group: 'doors-windows',
    tagline: 'Strength you can see and feel',
    description:
      'Galvanised steel doors with wood-finish transfer coatings, and pressed steel window frames that replace timber frames at a fraction of the upkeep. Built for security and decades of use.',
    features: [
      'Galvanised, anti-corrosion steel',
      'Honeycomb or PUF-filled core',
      'Multi-point locks and concealed hinges',
      'Matching steel window frames',
    ],
    applications: ['Main entrances', 'Independent houses', 'Utility areas', 'Window frames'],
    thumb: 'images/products/steel/steel-03.webp',
    cover: 'images/banners/steel.webp',
    banner: 'images/banners/steel.webp',
  },
  {
    slug: 'safety',
    name: 'Safety Doors',
    short: 'Safety',
    group: 'doors',
    tagline: 'A second line of defence',
    description:
      'Grill and mesh safety doors that let air and light in while keeping intruders and insects out. Fitted in front of your main door for everyday peace of mind.',
    features: ['Heavy-gauge steel frame', 'Insect mesh option', 'Anti-lift hinges', 'Designer patterns'],
    applications: ['Apartment entrances', 'Kitchen back doors', 'Balconies'],
    thumb: 'images/products/safety/safety-01.webp',
    cover: 'images/banners/safety.webp',
    banner: 'images/banners/safety.webp',
  },
  {
    slug: 'abs',
    name: 'ABS Doors',
    short: 'ABS',
    group: 'doors',
    tagline: 'Modern, light and moisture-resistant',
    description:
      'ABS-moulded doors with a dense internal core and a factory finish that resists scratches and moisture. Clean, contemporary designs for bedrooms and interiors.',
    features: ['Moisture and termite resistant', 'Factory-finished, no polish needed', 'Light weight, easy to hang', 'Wide colour range'],
    applications: ['Bedrooms', 'Studies', 'Bathrooms', 'Offices'],
    thumb: 'images/products/abs/abs-01.webp',
    cover: 'images/banners/abs.webp',
    banner: 'images/banners/abs.webp',
  },
  {
    slug: 'membrane',
    name: 'Membrane Doors',
    short: 'Membrane',
    group: 'doors',
    tagline: 'Carved designs, smooth finish',
    description:
      'Engineered-wood doors pressed with a PVC membrane for crisp grooves, carved patterns and a seamless finish that is easy to clean.',
    features: ['Seamless vacuum-pressed finish', 'Grooved and carved patterns', 'Easy to clean', 'Budget-friendly'],
    applications: ['Bedrooms', 'Internal doors', 'Rental homes'],
    thumb: 'images/products/membrane/membrane-03.webp',
    cover: 'images/banners/membrane.webp',
    banner: 'images/banners/membrane.webp',
  },
  {
    slug: 'laminated',
    name: 'Laminated Doors',
    short: 'Laminated',
    group: 'doors',
    tagline: 'Designer surfaces, everyday durability',
    description:
      'Flush doors faced with high-pressure laminates in wood grains, solids and textures, with optional metal inlays for a contemporary look.',
    features: ['Scratch-resistant HPL surface', 'Wood-grain, matte and gloss finishes', 'Aluminium inlay options', 'Edge-banded for durability'],
    applications: ['Bedrooms', 'Offices', 'Hotels'],
    thumb: 'images/products/laminated/laminated-02.webp',
    cover: 'images/banners/laminated.webp',
    banner: 'images/banners/laminated.webp',
  },
  {
    slug: 'skin',
    name: 'Skin Doors',
    short: 'Skin',
    group: 'doors',
    tagline: 'Classic moulded panels',
    description:
      'Moulded HDF skin doors with panelled designs, ready to paint or finish in the shade of your choice. A timeless look at a sensible price.',
    features: ['Pre-primed, paint-ready', 'Classic panel profiles', 'Solid or hollow core', 'Consistent quality'],
    applications: ['Internal doors', 'Housing projects', 'Renovations'],
    thumb: 'images/products/skin/skin-01.webp',
    cover: 'images/banners/skin.webp',
    banner: 'images/banners/skin.webp',
  },
  {
    slug: 'fibre',
    name: 'Fibre (FRP) Doors',
    short: 'Fibre',
    group: 'doors',
    tagline: 'Built for wet areas',
    description:
      'Fibre-reinforced plastic doors that shrug off water, steam and cleaning chemicals. A practical, long-life choice for bathrooms and utility areas.',
    features: ['Fully waterproof', 'Will not rust, rot or swell', 'Carved and plain designs', 'Low maintenance'],
    applications: ['Bathrooms', 'Utility areas', 'Toilets in public buildings'],
    thumb: 'images/products/fibre/fibre-01.webp',
    cover: 'images/banners/fibre.webp',
    banner: 'images/banners/fibre.webp',
  },
];

const bySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));

export const PRODUCTS: Product[] = GENERATED_PRODUCTS.map((p) => {
  const cat = bySlug.get(p.category)!;
  return { ...p, name: `${cat.short} ${cat.group === 'doors-windows' ? 'Series' : 'Door'} ${p.model}` };
});

export function categoryBySlug(slug: string | null | undefined): Category | undefined {
  return slug ? bySlug.get(slug) : undefined;
}

export function productsIn(slug: string): Product[] {
  return PRODUCTS.filter((p) => p.category === slug);
}

export function productBySlug(slug: string | null | undefined): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}
