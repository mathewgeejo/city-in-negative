import { describe, expect, it } from 'vitest';
import { CURATED_SEED } from '../src/gen/history';
import { generateWorld } from '../src/gen/world';
import { evaluateHistory, NO_ACTIONS, worldState } from '../src/sim/events';
import { deduce, judgeTheory, type DocId } from '../src/sim/evidence';
import { obtainableDocs, reachability } from '../src/sim/validator';

const w = generateWorld(CURATED_SEED);
const c = w.case;
const ws = (a: Partial<typeof NO_ACTIONS>) => {
  const acts = { ...NO_ACTIONS, ...a };
  return worldState(c, evaluateHistory(c, acts), acts);
};

describe('causal history', () => {
  it('default: log is sealed in the archive', () => {
    expect(ws({}).present.logAt).toBe('sealed');
    expect(ws({}).past.cratePlace).toBe('archive');
  });
  it('gutter: clerk packs and ships to the default destination (print shop on curated seed)', () => {
    const s = ws({ gutter: true });
    expect(c.defaultRoute).toBe('print');
    expect(s.past.cratePlace).toBe('print');
    expect(s.past.slip).toBe('duplicate');
    expect(s.present.logAt).toBe('cinema.plate');
  });
  it('label swap before or after the gutter routes the box to the depot locker', () => {
    expect(ws({ label: true, gutter: true }).present.logAt).toBe('depot.locker');
    expect(ws({ label: true, gutter: true }).present.lockerStencil).toBe('transfer');
    expect(ws({ label: true }).present.logAt).toBe('sealed');
  });
  it('note adds the order carbon only if the box is packed', () => {
    expect(ws({ note: true }).present.boxHasOrder).toBe(false);
    expect(ws({ note: true, gutter: true }).present.boxHasOrder).toBe(true);
  });
  it('gate left open becomes a present right of way; undo restores it', () => {
    expect(ws({ gate: true }).present.gateOpen).toBe(true);
    expect(ws({ gate: false }).present.gateOpen).toBe(false);
  });
  it('undo of every action yields the default world', () => {
    expect(ws({})).toEqual(ws({ gutter: false, label: false, note: false, gate: false }));
  });
});

describe('deduction and case board', () => {
  it('full evidence solves; partial theory names the missing link', () => {
    const s = ws({ gutter: true });
    const docs = obtainableDocs(w, s, reachability(w, s));
    expect(docs.has('doc.log')).toBe(true);
    expect(docs.has('doc.order')).toBe(true);
    const theory = { train: c.answerTrain, destination: c.answerDest, authorizer: c.authorizer, evidence: { train: 'doc.log', destination: 'doc.order', authorizer: 'doc.order' } as Record<string, DocId> };
    expect(judgeTheory(c, theory, docs).solved).toBe(true);
    const noDiagram = new Set([...docs].filter((d) => d !== 'doc.diagram'));
    const v = judgeTheory(c, theory, noDiagram);
    expect(v.solved).toBe(false);
    expect(v.verdicts.find((x) => x.slot === 'destination')!.message).toMatch(/track diagram/);
  });
  it('board lamp narrows the train but does not solve it', () => {
    expect(deduce(c, ['doc.board', 'doc.lamp']).train.size).toBe(2);
  });
});
