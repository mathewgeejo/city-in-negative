import type { CaseFile, Route } from '../gen/history';

/* ------------------------------------------------------------------------------------------------
 * History is data. The player's past actions set "action facts"; history events read facts as
 * prerequisites and write new facts as effects. The present is the fixed point of applying every
 * event in chronological order to (seed defaults + actions). Nothing here touches scene objects.
 * ---------------------------------------------------------------------------------------------- */

export type FactValue = string | number | boolean;
export type Facts = Record<string, FactValue>;

export type ActionId = 'gutter' | 'label' | 'note' | 'gate';
export type Actions = Record<ActionId, boolean>;
export const NO_ACTIONS: Actions = { gutter: false, label: false, note: false, gate: false };

export interface ActionDef {
  id: ActionId;
  doVerb: string;
  undoVerb: string;
  fact: string;
  on: FactValue;
  off: FactValue;
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  gutter: { id: 'gutter', doVerb: 'Swing the gutter toward the archive window', undoVerb: 'Swing the gutter back to the downpipe', fact: 'gutter', on: 'redirected', off: 'straight' },
  label: { id: 'label', doVerb: 'Swap the delivery label', undoVerb: 'Swap the label back', fact: 'label', on: 'swapped', off: 'default' },
  note: { id: 'note', doVerb: 'Leave a note for the clerk', undoVerb: 'Take your note back', fact: 'note', on: 'left', off: 'none' },
  gate: { id: 'gate', doVerb: 'Draw the bolt and prop the gate open', undoVerb: 'Close and bolt the gate', fact: 'gate', on: 'unbolted', off: 'bolted' },
};

type Cond = [fact: string, op: '==' | '!=', value: FactValue];

export interface HistoryEvent {
  id: string;
  /** Year offset from the past moment (0 = the afternoon you can visit). */
  when: number;
  requires: Cond[];
  effects: (f: Facts, c: CaseFile) => Facts;
  /** Short line for the journal timeline. */
  text: (f: Facts, c: CaseFile) => string;
  /** Whether the player can witness this in the past era. */
  witnessed?: boolean;
}

const other = (r: Route): Route => (r === 'print' ? 'depot' : 'print');

export const EVENTS: HistoryEvent[] = [
  {
    id: 'leak', when: 0, witnessed: true,
    requires: [['gutter', '==', 'redirected']],
    effects: () => ({ 'archive.wet': true }),
    text: () => 'Rainwater from the turned gutter runs down the archive window and under the sill.',
  },
  {
    id: 'clerkPacks', when: 0, witnessed: true,
    requires: [['archive.wet', '==', true]],
    effects: (f, c) => ({
      'log.packed': true,
      'slip.duplicate': true,
      'box.route': f['label'] === 'swapped' ? other(c.defaultRoute) : c.defaultRoute,
    }),
    text: (f) => `The clerk packs the signal log, stamps a duplicate slip and wheels the box to ${f['box.route'] === 'print' ? 'the print shop' : 'the depot stores'}.`,
  },
  {
    id: 'noteRead', when: 0, witnessed: true,
    requires: [['note', '==', 'left']],
    effects: (f) => ({ 'clerk.readNote': true, 'box.hasOrder': f['log.packed'] === true }),
    text: (f) => (f['log.packed'] ? 'The clerk reads your note and adds the depot carbon of the maintenance order to the box.' : 'The clerk reads your note and pins it by the cabinet.'),
  },
  {
    id: 'gateLeftOpen', when: 0, witnessed: true,
    requires: [['gate', '==', 'unbolted']],
    effects: () => ({ 'gate.past': 'open' }),
    text: () => 'The alley gate is propped open with a brick.',
  },
  {
    id: 'archiveBricked', when: 1,
    requires: [['log.packed', '!=', true]],
    effects: () => ({ 'log.location': 'sealed' }),
    text: () => 'The archive is bricked up with the station. The signal log stays inside.',
  },
  {
    id: 'rightOfWay', when: 4,
    requires: [['gate.past', '==', 'open']],
    effects: () => ({ 'gate.present': 'open' }),
    text: () => 'Neighbours use the open alley gate for years; it is taken off its hinges as a right of way.',
  },
  {
    id: 'cinemaConversion', when: 8,
    requires: [],
    effects: (f): Facts => (f['box.route'] === 'print' ? { 'log.location': 'cinema.plate' } : {}),
    text: (f, c) => `${c.printer} closes; the shop becomes ${c.cinema} (${c.cinemaYear}). ${f['box.route'] === 'print' ? 'The box under the press bay is floored over beneath the new projection booth.' : 'The press bays are floored over beneath a projection booth.'}`,
  },
  {
    id: 'depotRenovation', when: 15,
    requires: [],
    effects: (f): Facts => (f['box.route'] === 'depot' ? { 'log.location': 'depot.locker', 'locker.stencil': 'transfer' } : {}),
    text: (f, c) => `The depot becomes ${c.workshop} (${c.depotRenovYear}). ${f['box.route'] === 'depot' ? `Stores shelf ${c.shelfCode} is cleared into locker ${c.lockerNo}.` : 'The stores shelves are torn out for lockers.'}`,
  },
  {
    id: 'stainSpreads', when: 30,
    requires: [],
    effects: (f) => ({ 'stain.present': f['gutter'] === 'redirected' ? 'heavy' : 'faint' }),
    text: (f) => (f['gutter'] === 'redirected' ? 'Thirty years of overflow leave a dark stain across the archive window.' : 'A faint stain runs from the downpipe toward the archive window.'),
  },
];

const DEFAULT_FACTS = (c: CaseFile): Facts => ({
  'archive.wet': false,
  'log.packed': false,
  'slip.duplicate': false,
  'box.route': 'none',
  'box.hasOrder': false,
  'clerk.readNote': false,
  'gate.past': 'bolted',
  'gate.present': 'locked',
  'log.location': 'archive',
  'locker.stencil': 'plain',
  'stain.present': 'faint',
  defaultRoute: c.defaultRoute,
});

export interface DerivedHistory {
  facts: Facts;
  fired: { id: string; year: number; text: string }[];
}

function test(f: Facts, [k, op, v]: Cond): boolean {
  return op === '==' ? f[k] === v : f[k] !== v;
}

/** Derive the full history (past afternoon + thirty years) from seed defaults and actions. Pure. */
export function evaluateHistory(c: CaseFile, actions: Actions): DerivedHistory {
  const facts: Facts = DEFAULT_FACTS(c);
  for (const a of Object.values(ACTIONS)) facts[a.fact] = actions[a.id] ? a.on : a.off;
  const fired: DerivedHistory['fired'] = [];
  const ordered = EVENTS.slice().sort((a, b) => a.when - b.when);
  // Same-year events may depend on each other (note after packing), so iterate each year to a
  // fixed point before moving on.
  const years = [...new Set(ordered.map((e) => e.when))];
  for (const y of years) {
    const evs = ordered.filter((e) => e.when === y);
    const done = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of evs) {
        if (done.has(e.id) || !e.requires.every((cnd) => test(facts, cnd))) continue;
        Object.assign(facts, e.effects(facts, c));
        done.add(e.id);
        changed = true;
      }
    }
    // Re-run effects once more so events whose effects read later same-year facts settle.
    for (const e of evs) if (done.has(e.id)) Object.assign(facts, e.effects(facts, c));
    for (const e of evs) if (done.has(e.id)) fired.push({ id: e.id, year: c.pastYear + y, text: e.text(facts, c) });
  }
  return { facts, fired };
}

/** Where things physically are in each era, derived from facts. Used by both renderer and validator. */
export interface WorldState {
  past: {
    cratePlace: 'archive' | 'print' | 'depot';
    crateHasLog: boolean;
    labelShows: Route;
    slip: 'original' | 'duplicate';
    gateOpen: boolean;
    gutterRedirected: boolean;
    noteOnDesk: boolean;
    clerkPlace: 'desk';
  };
  present: {
    logAt: 'sealed' | 'cinema.plate' | 'depot.locker';
    boxHasOrder: boolean;
    gateOpen: boolean;
    stain: 'faint' | 'heavy';
    lockerStencil: 'plain' | 'transfer';
    gutterBent: boolean;
  };
}

export function worldState(c: CaseFile, h: DerivedHistory, actions: Actions): WorldState {
  const f = h.facts;
  const route = f['box.route'] as Route | 'none';
  return {
    past: {
      cratePlace: route === 'none' ? 'archive' : route,
      crateHasLog: f['log.packed'] === true,
      labelShows: actions.label ? other(c.defaultRoute) : c.defaultRoute,
      slip: f['slip.duplicate'] ? 'duplicate' : 'original',
      gateOpen: f['gate.past'] === 'open',
      gutterRedirected: f['gutter'] === 'redirected',
      noteOnDesk: actions.note,
      clerkPlace: 'desk',
    },
    present: {
      logAt: (f['log.location'] === 'archive' ? 'sealed' : f['log.location']) as WorldState['present']['logAt'],
      boxHasOrder: f['box.hasOrder'] === true,
      gateOpen: f['gate.present'] === 'open',
      stain: f['stain.present'] as 'faint' | 'heavy',
      lockerStencil: f['locker.stencil'] as 'plain' | 'transfer',
      gutterBent: f['gutter'] === 'redirected',
    },
  };
}
