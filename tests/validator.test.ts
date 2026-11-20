import { describe, expect, it } from 'vitest';
import { CURATED_SEED } from '../src/gen/history';
import { generateWorld } from '../src/gen/world';
import { validateWorld } from '../src/sim/validator';

const SEEDS = [CURATED_SEED, ...Array.from({ length: 100 }, (_, i) => `BATCH-${String(i).padStart(3, '0')}`)];

describe('procedural validator', () => {
  it('curated seed is valid', () => {
    const rep = validateWorld(generateWorld(CURATED_SEED));
    expect(rep.errors).toEqual([]);
  });

  it(`fixed batch of ${SEEDS.length} seeds is solvable with safe passages`, () => {
    const failures: string[] = [];
    const arrangements = new Map<string, number>();
    for (const s of SEEDS) {
      const rep = validateWorld(generateWorld(s));
      arrangements.set(rep.arrangement, (arrangements.get(rep.arrangement) ?? 0) + 1);
      if (!rep.ok) failures.push(`${s} [${rep.arrangement}]: ${rep.errors.join('; ')}`);
    }
    console.log('arrangements', Object.fromEntries(arrangements));
    expect(failures).toEqual([]);
    expect(arrangements.size).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it('generation is deterministic per seed and differs across seeds', () => {
    const a = JSON.stringify(generateWorld('ALPHA-1').case);
    const b = JSON.stringify(generateWorld('ALPHA-1').case);
    const c = JSON.stringify(generateWorld('ALPHA-2').case);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
