import { describe, expect, it } from 'vitest';
import { CURATED_SEED } from '../src/gen/history';
import { generateWorld } from '../src/gen/world';
import { validateWorld } from '../src/sim/validator';

/** The validator must actually catch broken worlds, not just pass everything. */
describe('validator catches defects', () => {
  it('flags a passage whose landing is walled off', () => {
    const w = generateWorld(CURATED_SEED);
    const a = w.anchors.find((x) => x.id === 'p.station')!;
    w.layout.colliderRects.push({ rect: { x0: a.x - 3, z0: a.z - 3, x1: a.x + 3, z1: a.z - 1 }, eras: 'past', id: 'test.block' });
    const rep = validateWorld(w);
    expect(rep.ok).toBe(false);
    expect(rep.errors.join(' ')).toMatch(/opening passage|desk|diagram|solution/);
  });
  it('flags an unreachable maintenance order photo position', () => {
    const w = generateWorld(CURATED_SEED);
    const o = w.layout.spots['office.use'];
    w.layout.colliderRects.push({ rect: { x0: o.x - 4, z0: o.z - 4, x1: o.x + 4, z1: o.z + 4 }, eras: 'present', id: 'test.block' });
    const rep = validateWorld(w);
    expect(rep.ok).toBe(false);
  });
  it('reports stats for the curated seed', () => {
    const rep = validateWorld(generateWorld(CURATED_SEED));
    console.log(rep);
    expect(rep.crossings).toBeGreaterThanOrEqual(4);
    expect(rep.solvableStates).toBeGreaterThan(0);
  });
});
