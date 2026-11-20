import type { Era } from '../core/types';
import type { World } from '../gen/world';
import { collidersFor, Grid } from './collision';
import { type ActionId, type Actions, evaluateHistory, worldState, type WorldState } from './events';
import { type DocId, deduce, SLOTS, answerOf } from './evidence';
import { actionSpot, crossing, crossingSafe, DOC_SOURCES, PHOTO_STANDS, type Crossing } from './sources';

export interface ValidationReport {
  seed: string;
  arrangement: string;
  ok: boolean;
  errors: string[];
  solvableStates: number;
  crossings: number;
}

const ACTION_IDS: ActionId[] = ['gutter', 'label', 'note', 'gate'];

export function allActionStates(): Actions[] {
  const out: Actions[] = [];
  for (let m = 0; m < 16; m++) out.push({ gutter: !!(m & 1), label: !!(m & 2), note: !!(m & 4), gate: !!(m & 8) });
  return out;
}
const key = (a: Actions) => ACTION_IDS.map((k) => (a[k] ? 1 : 0)).join('');

export interface Reach { grids: Record<Era, Grid>; masks: Record<Era, Uint8Array>; crossings: Crossing[] }

/** Multi-era flood fill from the opening position, following every safe passage. */
export function reachability(w: World, ws: WorldState): Reach {
  const l = w.layout;
  const grids = {
    present: new Grid(collidersFor(l, 'present', ws.present.gateOpen)),
    past: new Grid(collidersFor(l, 'past', ws.past.gateOpen)),
  };
  const crossings: Crossing[] = [];
  for (const a of w.anchors) for (const from of ['present', 'past'] as Era[]) for (const side of [1, -1] as const) {
    const cr = crossing(a, from, side);
    if (crossingSafe(l, cr, ws)) crossings.push(cr);
  }
  const masks = { present: new Uint8Array(grids.present.solid.length), past: new Uint8Array(grids.past.solid.length) };
  grids.present.flood([grids.present.idx(l.start.x, l.start.z)], masks.present);
  let changed = true;
  while (changed) {
    changed = false;
    for (const cr of crossings) {
      const gFrom = grids[cr.from], gTo = grids[cr.to];
      const di = gFrom.idx(cr.depart.x, cr.depart.z), li = gTo.idx(cr.landing.x, cr.landing.z);
      if (di >= 0 && masks[cr.from][di] && li >= 0 && !masks[cr.to][li] && !gTo.solid[li]) {
        gTo.flood([li], masks[cr.to]);
        changed = true;
      }
    }
  }
  return { grids, masks, crossings };
}

export function obtainableDocs(w: World, ws: WorldState, rc: Reach): Set<DocId> {
  const docs = new Set<DocId>();
  for (const s of DOC_SOURCES) {
    if (s.when && !s.when(ws)) continue;
    const sp = w.layout.spots[s.spot];
    if (!sp) continue;
    if (s.inspect && rc.grids[s.era].near(rc.masks[s.era], sp.x, sp.z, 2.2)) docs.add(s.doc);
    if (s.photo) {
      const other: Era = s.era === 'past' ? 'present' : 'past';
      const st = w.layout.spots[PHOTO_STANDS[s.spot] ?? s.spot];
      if (st && rc.grids[other].near(rc.masks[other], st.x, st.z, 2.5)) docs.add(s.doc);
    }
  }
  return docs;
}

function resolves(w: World, docs: Set<DocId>): boolean {
  const cand = deduce(w.case, docs);
  return SLOTS.every((s) => {
    const set = cand[s] as Set<string>;
    return set.size === 1 && set.has(answerOf(w.case, s));
  });
}

export function validateWorld(w: World): ValidationReport {
  const errors: string[] = [];
  const c = w.case, l = w.layout;
  const states = allActionStates();
  const info = new Map<string, { ws: WorldState; rc: Reach; docs: Set<DocId>; solvable: boolean }>();
  for (const a of states) {
    const ws = worldState(c, evaluateHistory(c, a), a);
    const rc = reachability(w, ws);
    const docs = obtainableDocs(w, ws, rc);
    info.set(key(a), { ws, rc, docs, solvable: resolves(w, docs) });
  }

  // 1. Passages: every active passage has a safe landing and a safe way back.
  const base = info.get('0000')!;
  for (const a of w.anchors) {
    const enabled = base.rc.crossings.filter((cr) => cr.anchor.id === a.id);
    if (!enabled.length) errors.push(`passage ${a.id} has no safe crossing`);
    for (const cr of enabled) {
      const back = crossing(a, cr.to, (cr.side * -1) as 1 | -1);
      if (!crossingSafe(l, back, base.ws)) errors.push(`passage ${a.id} ${cr.from}->${cr.to} has no safe return`);
    }
  }
  if (!base.rc.crossings.some((cr) => cr.anchor.id === 'p.station' && cr.from === 'present' && cr.side === 1)) {
    errors.push('opening passage (station entrance, present street side) is not safe');
  }

  // 2. Start position and composition.
  const g = base.rc.grids.present;
  if (!g.free(l.start.x, l.start.z)) errors.push('start position is blocked');
  const fx = Math.sin(l.start.yaw), fz = -Math.cos(l.start.yaw);
  const inView = (x: number, z: number) => {
    const dx = x - l.start.x, dz = z - l.start.z, d = Math.hypot(dx, dz);
    return (dx * fx + dz * fz) / d > Math.cos((34 * Math.PI) / 180);
  };
  const clock = l.spots['clock'], board = l.spots['board'];
  if (!inView(clock.x, clock.z)) errors.push('station clock not visible from start');
  if (!inView(board.x, board.z)) errors.push('old station doorway not visible from start');
  if (!inView((l.street.brokenX0 + l.street.brokenX1) / 2, 0)) errors.push('broken tram rail not visible from start');

  // 3. The opening teaches the past: the default state must not already be solvable, and both
  // evidence routes must independently solve the case.
  if (base.solvable) errors.push('case solvable without changing the past');
  const viaDefault = info.get('1000')!;
  const viaAlt = info.get('1100')!;
  if (!viaDefault.solvable) errors.push(`default route (${c.defaultRoute}) does not yield a solution`);
  if (!viaAlt.solvable) errors.push('alternate (label) route does not yield a solution');
  if (viaDefault.ws.present.logAt === viaAlt.ws.present.logAt) errors.push('label swap does not change where the log ends up');
  if (base.ws.present.logAt !== 'sealed') errors.push('log is reachable before any change');

  // 4. Clues distinguish the answer from alternatives: each core document is necessary.
  const full = viaDefault.docs;
  const without = (d: DocId) => deduce(c, [...full].filter((x) => x !== d));
  if (without('doc.log').train.size < 2) errors.push('train is determined without the signal log');
  if (without('doc.order').authorizer.size < 2) errors.push('authoriser is determined without the order');
  if (without('doc.diagram').destination.size < 2) errors.push('destination is determined without the track diagram');
  if (without('doc.order').destination.size < 2) errors.push('destination is determined without the order');
  if (c.trains.length < 3 || c.destinations.length < 4 || c.people.length < 4) errors.push('not enough distractors');

  // 5. Recoverability: from every state, some solvable state is reachable by toggling past actions
  // whose interaction points are reachable in that state.
  const solvableFrom = new Map<string, boolean>();
  for (const start of states) {
    const seen = new Set([key(start)]);
    const q = [start];
    let ok = false;
    while (q.length && !ok) {
      const s = q.shift()!;
      const it = info.get(key(s))!;
      if (it.solvable) { ok = true; break; }
      for (const id of ACTION_IDS) {
        const sp = l.spots[actionSpot(id, it.ws)];
        if (!sp || !it.rc.grids.past.near(it.rc.masks.past, sp.x, sp.z, 2.2)) continue;
        const n = { ...s, [id]: !s[id] };
        if (!seen.has(key(n))) { seen.add(key(n)); q.push(n); }
      }
    }
    solvableFrom.set(key(start), ok);
    if (!ok) errors.push(`state ${key(start)} cannot reach a solution`);
  }

  // 6. Determinism and undo consistency (history is a pure function of actions).
  const once = JSON.stringify(evaluateHistory(c, { gutter: true, label: true, note: true, gate: true }).facts);
  const again = JSON.stringify(evaluateHistory(c, { gutter: true, label: true, note: true, gate: true }).facts);
  if (once !== again) errors.push('history evaluation is not deterministic');
  if (JSON.stringify(evaluateHistory(c, { gutter: false, label: false, note: false, gate: false }).facts) !== JSON.stringify(worldStateFacts(w))) errors.push('undo does not restore default history');

  // 7. Key interiors reachable.
  const need: [Era, string][] = [['present', 'plate'], ['present', 'depot.locker'], ['present', 'office.use'], ['past', 'desk.slip'], ['past', 'diagram'], ['past', 'gutter.use'], ['present', 'downpipe']];
  for (const [era, sp] of need) {
    const p = l.spots[sp];
    if (!base.rc.grids[era].near(base.rc.masks[era], p.x, p.z, 2.2)) errors.push(`${sp} not reachable in ${era}`);
  }

  return { seed: w.seed, arrangement: l.arrangement, ok: errors.length === 0, errors, solvableStates: [...info.values()].filter((v) => v.solvable).length, crossings: base.rc.crossings.length };
}

function worldStateFacts(w: World) {
  return evaluateHistory(w.case, { gutter: false, label: false, note: false, gate: false }).facts;
}
