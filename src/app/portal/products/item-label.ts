/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */

/** What an item's QR label holds: everything about the item but its stock ("t": "AMSIDEL-ITEM"). */
export interface ItemLabel {
  brand: string | null;
  code: string;
  name: string;
  type: string | null;
  typeName: string | null;
  unit: string | null;
  hsn: string | null;
  sizes: string | null;
  details: string | null;
  supplierItemCode: string | null;
  supplierPrice: number;
  mrp: number;
  showroomPrice: number;
  minSellPrice: number;
}

/** The label read from a QR code's text; null when it is not an item label. */
export function parseItemLabel(text: string): ItemLabel | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text.trim());
  } catch {
    return null;
  }
  if (!o || o['t'] !== 'AMSIDEL-ITEM' || typeof o['code'] !== 'string' || typeof o['name'] !== 'string') return null;
  const s = (k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim() : null);
  const n = (k: string) => {
    const v = Number(o[k]);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  return {
    brand: s('brand'), code: (o['code'] as string).trim().toUpperCase(), name: (o['name'] as string).trim(), type: s('type'),
    typeName: s('typeName'), unit: s('unit'), hsn: s('hsn'), sizes: s('sizes'), details: s('details'), supplierItemCode: s('supplierItemCode'),
    supplierPrice: n('supplierPrice'), mrp: n('mrp'), showroomPrice: n('showroomPrice'), minSellPrice: n('minSellPrice'),
  };
}
