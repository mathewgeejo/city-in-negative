import { type CaseFile, person, routeName, train } from '../gen/history';
import type { WorldState } from './events';

export type DocId =
  | 'doc.board' | 'doc.lamp' | 'doc.diagram' | 'doc.notice' | 'doc.slip' | 'doc.plate'
  | 'doc.stencil' | 'doc.log' | 'doc.order' | 'doc.stain';

export type Slot = 'train' | 'destination' | 'authorizer';
export const SLOTS: Slot[] = ['train', 'destination', 'authorizer'];
export const SLOT_LABEL: Record<Slot, string> = { train: 'Which train moved', destination: 'Where it went', authorizer: 'Who authorised it' };

export interface DocView {
  id: DocId;
  title: string;
  style: 'ledger' | 'notice' | 'diagram' | 'slip' | 'plate' | 'stencil' | 'board' | 'order' | 'note';
  /** Each entry is a line; `**` marks emphasis rendered as stamped ink. */
  lines: string[];
  caption: string;
  /** For the diagram: platform → lines */
  diagram?: { platform: number; lines: string[] }[];
}

/** Document content at the moment of reading. `ws` matters for slip and stencil variants. */
export function docView(c: CaseFile, id: DocId, ws: WorldState): DocView {
  const auth = person(c, c.authorizer);
  const sm = person(c, c.stationMaster);
  const eng = person(c, c.engineer);
  const t = train(c, c.answerTrain);
  switch (id) {
    case 'doc.board':
      return {
        id, title: 'Departure board, closing night', style: 'board', caption: 'The board as it stood the afternoon after closing.',
        lines: [
          ...c.trains.map((tr) => `${tr.scheduled}  ${tr.label.padEnd(18)}  ${tr.sched === 'Stabled' ? `Stabled, Platform ${tr.platform}` : `${tr.sched}  P${tr.platform}`}`),
          '23:00  STATION CLOSED',
          `Lamp: PLATFORM ${c.answerPlatform} LINE CLEAR`,
        ],
      };
    case 'doc.lamp':
      return {
        id, title: 'The lamp that still lights', style: 'note', caption: 'Present day. Every other bulb on the board is dead.',
        lines: [`One lamp on the right of the board still glows each night, in the position marked for Platform ${c.answerPlatform}.`, 'Its label has weathered away.'],
      };
    case 'doc.diagram':
      return {
        id, title: 'Track diagram, Central Station', style: 'diagram', caption: `Signal Dept. drawing, initialled ${eng.initials}`,
        lines: [`Drawn by ${eng.name}, ${eng.role}`],
        diagram: [1, 2].map((p) => ({ platform: p, lines: c.platformLines[p as 1 | 2] })),
      };
    case 'doc.notice':
      return {
        id, title: 'Notice of closure', style: 'notice', caption: 'Pasted inside the concourse.',
        lines: [
          'CENTRAL STATION',
          `This station closes to all traffic at **23:00** on the last night of August ${c.pastYear}.`,
          'No movement shall be made after closing except on written order.',
          `By order, ${sm.name}, ${sm.role}`,
        ],
      };
    case 'doc.slip': {
      const dup = ws.past.slip === 'duplicate';
      const route = ws.past.cratePlace === 'archive' ? ws.past.labelShows : ws.past.cratePlace;
      const where = route === 'print' ? `store beneath Press Bay ${c.pressBay}` : `stores shelf ${c.shelfCode}`;
      return {
        id, title: dup ? 'Dispatch slip (duplicate, stamped)' : 'Dispatch slip', style: 'slip',
        caption: dup ? `Stamped by ${c.clerk}.` : 'On the clerk\'s desk.',
        lines: [
          'CENTRAL STATION · RECORDS DISPATCH',
          `Item: Signal log, Box 3 (sealed)`,
          `Default carrier: ${routeName(c, c.defaultRoute)}`,
          ...(dup ? [`**DESPATCHED → ${routeName(c, route).toUpperCase()}**`, `**${where.toUpperCase()}**`] : ['To be held in archive until bricking-up.']),
        ],
      };
    }
    case 'doc.plate':
      return {
        id, title: 'Brass floor plate', style: 'plate', caption: 'Set into the floor tiles.',
        lines: [c.printer.toUpperCase(), `PRESS BAY ${c.pressBay}`, `EST. ${c.pastYear - 41}`],
      };
    case 'doc.stencil':
      return {
        id, title: `Locker ${c.lockerNo}`, style: 'stencil', caption: 'Stencilled on the locker door.',
        lines: ws.present.lockerStencil === 'transfer'
          ? [`LOCKER ${c.lockerNo}`, `EX STORES ${c.shelfCode}`, `TRANSFER ${c.depotRenovYear}`]
          : [`LOCKER ${c.lockerNo}`],
      };
    case 'doc.log':
      return {
        id, title: 'Signal log, last night of service', style: 'ledger', caption: 'Recovered from the box.',
        lines: [
          `22:40  Platform ${c.answerPlatform} road set for stabling`,
          '23:00  Station closed. Lamps out.',
          `**23:06  ${t.label} away, Platform ${c.answerPlatform}**`,
          `        Line clear given. Authority: Maint. Order ${c.orderNo}`,
          '23:09  Road restored. Log closed.',
        ],
      };
    case 'doc.order':
      return {
        id, title: `Maintenance order No. ${c.orderNo}`, style: 'order', caption: ws.present.boxHasOrder ? 'Depot carbon copy.' : 'Pinned in the depot office.',
        lines: [
          `CORPORATION TRAMWAYS & RAILWAY · ORDER ${c.orderNo}`,
          `**${cap(c.orderReason)}: the ${c.blockedDest} line is blocked from 22:00.**`,
          `Engine stabled on the Platform ${c.answerPlatform} road to clear after close by the remaining open road.`,
          `Authorised: ${auth.name}`,
          `${auth.role}`,
        ],
      };
    case 'doc.stain':
      return {
        id, title: 'Water stain', style: 'note', caption: 'Courtyard, present day.',
        lines: [ws.present.stain === 'heavy' ? 'A dark, old stain spreads from the bent gutter across the archive window.' : 'A faint stain runs from the downpipe toward the old archive window. Something up there once spilled the wrong way.'],
      };
  }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------------------------------------
 * Deduction model: each document contributes constraints. The validator uses it to prove that the
 * full evidence set resolves every slot uniquely while weaker sets stay ambiguous; the case board
 * uses it to explain which link is still missing.
 * ---------------------------------------------------------------------------------------------- */

export interface Candidates { train: Set<string>; destination: Set<string>; authorizer: Set<string>; platform: Set<number> }

export function deduce(c: CaseFile, docs: Iterable<DocId>): Candidates {
  const have = new Set(docs);
  const cand: Candidates = {
    train: new Set(c.trains.map((t) => t.id)),
    destination: new Set(c.destinations),
    authorizer: new Set(c.people.map((p) => p.id)),
    platform: new Set([1, 2]),
  };
  const keep = <T>(s: Set<T>, f: (v: T) => boolean) => { for (const v of [...s]) if (!f(v)) s.delete(v); };
  if (have.has('doc.lamp') || have.has('doc.board')) {
    keep(cand.platform, (p) => p === c.answerPlatform);
    keep(cand.train, (id) => train(c, id).platform === c.answerPlatform);
  }
  if (have.has('doc.log')) {
    keep(cand.train, (id) => id === c.answerTrain);
    keep(cand.platform, (p) => p === c.answerPlatform);
  }
  if (have.has('doc.order')) {
    keep(cand.destination, (d) => d !== c.blockedDest);
    keep(cand.authorizer, (id) => id === c.authorizer);
    keep(cand.platform, (p) => p === c.answerPlatform);
    keep(cand.train, (id) => train(c, id).platform === c.answerPlatform);
  }
  if (have.has('doc.diagram') && cand.platform.size === 1) {
    const p = [...cand.platform][0] as 1 | 2;
    keep(cand.destination, (d) => c.platformLines[p].includes(d));
  }
  return cand;
}

/** Which documents can carry each answer on the case board. */
export const SLOT_EVIDENCE: Record<Slot, DocId[]> = {
  train: ['doc.log'],
  destination: ['doc.order', 'doc.diagram'],
  authorizer: ['doc.order'],
};

export interface Theory { train?: string; destination?: string; authorizer?: string; evidence: Partial<Record<Slot, DocId>> }

export interface SlotVerdict { slot: Slot; ok: boolean; message: string }

export function answerOf(c: CaseFile, s: Slot): string {
  return s === 'train' ? c.answerTrain : s === 'destination' ? c.answerDest : c.authorizer;
}

export function judgeTheory(c: CaseFile, th: Theory, docs: Set<DocId>): { solved: boolean; verdicts: SlotVerdict[] } {
  const cand = deduce(c, docs);
  const verdicts: SlotVerdict[] = SLOTS.map((slot) => {
    const val = th[slot];
    const ev = th.evidence[slot];
    if (!val) return { slot, ok: false, message: 'Choose an answer for this link.' };
    if (!ev) return { slot, ok: false, message: 'Pin a document or print that supports this answer.' };
    if (!docs.has(ev)) return { slot, ok: false, message: 'That evidence is not in your journal.' };
    const set = cand[slot] as Set<string>;
    if (!SLOT_EVIDENCE[slot].includes(ev)) return { slot, ok: false, message: hintFor(c, slot, docs, 'irrelevant') };
    if (set.size > 1) return { slot, ok: false, message: hintFor(c, slot, docs, 'ambiguous') };
    if (!set.has(val)) return { slot, ok: false, message: hintFor(c, slot, docs, 'contradicted') };
    return { slot, ok: true, message: 'Supported.' };
  });
  return { solved: verdicts.every((v) => v.ok), verdicts };
}

function hintFor(c: CaseFile, slot: Slot, docs: Set<DocId>, why: 'irrelevant' | 'ambiguous' | 'contradicted'): string {
  if (why === 'contradicted') {
    return slot === 'train' ? 'The log names a different engine.' : slot === 'destination' ? 'Your evidence rules that line out.' : 'The signature on the order is someone else\'s.';
  }
  if (slot === 'train') {
    return docs.has('doc.log') ? 'Attach the signal log; the board only lists what was scheduled.' : 'The board lists who was stabled, not who moved. The signal log would say. Where did it go when the station was sealed?';
  }
  if (slot === 'destination') {
    if (!docs.has('doc.order')) return 'Something closed one of the lines that night. Look for the order the log refers to.';
    if (!docs.has('doc.diagram')) return `The order closes the ${c.blockedDest} line, but where else could Platform ${c.answerPlatform} lead? Find the track diagram.`;
    return 'Attach the maintenance order; it is what rules the other line out.';
  }
  return docs.has('doc.order') ? 'Attach the maintenance order; its signature names who authorised the run.' : 'The closure notice only proves who closed the station. Someone signed for the movement.';
}
