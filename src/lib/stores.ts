import data from "@/data/stores.json";

export type Hours =
  | "mall"
  | { mon_fri?: string; sat?: string; sun?: string };

export interface Store {
  id: string;
  name: string;
  unit: string;
  category: string;
  /** Per-store override. When absent, treat as "mall" hours. */
  hours?: Hours;
  /** True for available/vacant units. */
  vacant?: boolean;
  /** Workflow state from the source feed: 'Occupied', 'Available', etc. */
  occupancy?: string;
  /** SmartCentres' per-tenant URL slug, used to link out to their detail page. */
  subdomain?: string | null;
  /** [x, y] in viewBox units; matches the polygon centroid in site.geojson. */
  centroid?: [number, number] | null;
}

export interface Category {
  id: string;
  label: string;
}

export const STORES: Store[] = data.stores as Store[];
export const CATEGORIES: Category[] = data.categories as Category[];
export const MALL_HOURS = data.mall_hours as Exclude<Hours, "mall">;
/** SVG viewBox sized to the projected property bounds. */
const VB = (data as { viewBox?: number[] }).viewBox;
export const VIEW_BOX: [number, number, number, number] =
  VB && VB.length === 4
    ? [VB[0], VB[1], VB[2], VB[3]]
    : [0, 0, 1200, 1293];

/**
 * Rank stores by relevance to a free-text query.
 * Exact-prefix > word-start > substring > fuzzy-token.
 */
export function searchStores(query: string, all: Store[] = STORES): Store[] {
  const q = query.trim().toLowerCase();
  if (!q) return all;
  const scored: Array<{ store: Store; score: number }> = [];
  for (const s of all) {
    const name = s.name.toLowerCase();
    let score = 0;
    if (name === q) score = 1000;
    else if (name.startsWith(q)) score = 500;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 250;
    else if (name.includes(q)) score = 100;
    else if (s.category.toLowerCase().includes(q)) score = 25;
    if (score > 0) scored.push({ store: s, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.store.name.localeCompare(b.store.name))
    .map((x) => x.store);
}

/**
 * Visible tenants in the From/To picker. With no slot filled we
 * respect both the category chip and the search query. Once either
 * slot is picked we drop the category filter so the operator can
 * choose a non-matching origin or destination — a destination's
 * category shouldn't constrain the origin. The search query always
 * applies (search is how you scan a long list).
 */
export function pickerStores(
  query: string,
  category: string | null,
  all: Store[] = STORES,
  anySlotPicked = false,
): Store[] {
  let xs = searchStores(query, all);
  if (category && !anySlotPicked) xs = xs.filter((s) => s.category === category);
  return xs;
}

export function storeById(id: string): Store | undefined {
  return STORES.find((s) => s.id === id);
}
