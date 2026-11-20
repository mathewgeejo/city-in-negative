import { seedRng } from '../core/rng';
import { CURATED_SEED, type CaseFile, generateCase } from './history';
import { type Anchor, generateLayout, type Layout } from './layout';

export interface World {
  seed: string;
  case: CaseFile;
  layout: Layout;
  anchors: Anchor[];
}

/** History first, then the block that has to contain it, then which passages are active. */
export function generateWorld(seed: string): World {
  const c = generateCase(seed);
  const layout = generateLayout(seed, c);
  const r = seedRng(seed, 'passages');
  const optional = layout.anchors.filter((a) => a.id !== 'p.station');
  const drop = seed === CURATED_SEED ? 'p.cinema' : r.pick(optional).id;
  const anchors = layout.anchors.filter((a) => a.id !== drop);
  return { seed, case: c, layout, anchors };
}

export function normalizeSeed(s: string): string {
  return s.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24) || CURATED_SEED;
}

export function randomSeed(): string {
  const words = ['LAMP', 'RAIL', 'SLATE', 'BRASS', 'TRAM', 'ARCH', 'PLATE', 'SIGNAL', 'GUTTER', 'LEDGER'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(1000 + Math.random() * 9000)}`;
}
