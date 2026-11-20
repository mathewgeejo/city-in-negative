import type { Era } from '../core/types';
import type { Anchor, Layout } from '../gen/layout';
import { blocked, collidersFor } from './collision';
import type { WorldState } from './events';
import type { DocId } from './evidence';

/** Where each document physically exists, keyed by layout spot ids shared with the renderer. */
export interface DocSource {
  doc: DocId; era: Era; spot: string;
  inspect: boolean; photo: boolean;
  when?: (ws: WorldState) => boolean;
}

export const DOC_SOURCES: DocSource[] = [
  { doc: 'doc.board', era: 'past', spot: 'board', inspect: true, photo: true },
  { doc: 'doc.lamp', era: 'present', spot: 'board', inspect: true, photo: true },
  { doc: 'doc.diagram', era: 'past', spot: 'diagram', inspect: true, photo: true },
  { doc: 'doc.notice', era: 'past', spot: 'closing.notice', inspect: true, photo: true },
  { doc: 'doc.slip', era: 'past', spot: 'desk.slip', inspect: true, photo: true },
  { doc: 'doc.plate', era: 'present', spot: 'plate', inspect: true, photo: true },
  { doc: 'doc.plate', era: 'past', spot: 'plate', inspect: true, photo: true },
  { doc: 'doc.stencil', era: 'present', spot: 'depot.locker', inspect: true, photo: true },
  { doc: 'doc.stain', era: 'present', spot: 'downpipe', inspect: true, photo: false },
  { doc: 'doc.order', era: 'past', spot: 'order', inspect: false, photo: true },
  { doc: 'doc.log', era: 'present', spot: 'plate', inspect: true, photo: false, when: (ws) => ws.present.logAt === 'cinema.plate' },
  { doc: 'doc.log', era: 'present', spot: 'depot.locker', inspect: true, photo: false, when: (ws) => ws.present.logAt === 'depot.locker' },
  { doc: 'doc.order', era: 'present', spot: 'plate', inspect: true, photo: false, when: (ws) => ws.present.logAt === 'cinema.plate' && ws.present.boxHasOrder },
  { doc: 'doc.order', era: 'present', spot: 'depot.locker', inspect: true, photo: false, when: (ws) => ws.present.logAt === 'depot.locker' && ws.present.boxHasOrder },
];

/** Where the player stands to take each document's photograph across eras (defaults to the spot). */
export const PHOTO_STANDS: Partial<Record<string, string>> = { order: 'office.use' };

export function crateSpot(ws: WorldState): string {
  return ws.past.cratePlace === 'archive' ? 'crate.archive' : ws.past.cratePlace === 'print' ? 'plate' : 'depot.shelf';
}

/** Interaction points for past actions (used by game and validator). */
export function actionSpot(id: 'gutter' | 'label' | 'note' | 'gate', ws: WorldState): string {
  return id === 'gutter' ? 'gutter.use' : id === 'label' ? crateSpot(ws) : id === 'note' ? 'desk.note' : 'gate.bolt';
}

/* ---------------- Passages ---------------- */

export interface Crossing { anchor: Anchor; from: Era; to: Era; side: 1 | -1; depart: { x: number; z: number }; landing: { x: number; z: number } }

export function sideOf(a: Anchor, x: number, z: number): 1 | -1 {
  return (x - a.x) * a.nx + (z - a.z) * a.nz >= 0 ? 1 : -1;
}

export function crossing(a: Anchor, from: Era, side: 1 | -1): Crossing {
  return {
    anchor: a, from, to: from === 'present' ? 'past' : 'present', side,
    depart: { x: a.x + a.nx * side * a.depth, z: a.z + a.nz * side * a.depth },
    landing: { x: a.x - a.nx * side * a.depth, z: a.z - a.nz * side * a.depth },
  };
}

export function crossingSafe(l: Layout, cr: Crossing, ws: WorldState): boolean {
  const toRects = collidersFor(l, cr.to, cr.to === 'past' ? ws.past.gateOpen : ws.present.gateOpen);
  const fromRects = collidersFor(l, cr.from, cr.from === 'past' ? ws.past.gateOpen : ws.present.gateOpen);
  return !blocked(toRects, cr.landing.x, cr.landing.z, 0.35) && !blocked(fromRects, cr.depart.x, cr.depart.z, 0.35);
}
