import { type Era, inEra, type Rect } from '../core/types';
import type { Layout } from '../gen/layout';

export const PLAYER_R = 0.3;

/** Colliders active in `era` given whether the alley gate stands open in that era. */
export function collidersFor(l: Layout, era: Era, gateOpen: boolean): Rect[] {
  const out: Rect[] = [];
  for (const c of l.colliderRects) {
    if (c.id === 'dyn:alley.gate') { if (!gateOpen) out.push(c.rect); continue; }
    if (inEra(c.eras, era)) out.push(c.rect);
  }
  return out;
}

export function blocked(rects: Rect[], x: number, z: number, r = PLAYER_R): boolean {
  for (let i = 0; i < rects.length; i++) {
    const b = rects[i];
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  }
  return false;
}

/** Push a circle out of all rects (two iterations is enough for axis-aligned interiors). Mutates p. */
export function resolveCircle(rects: Rect[], p: { x: number; z: number }, r = PLAYER_R) {
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (let i = 0; i < rects.length; i++) {
      const b = rects[i];
      const cx = Math.max(b.x0, Math.min(p.x, b.x1));
      const cz = Math.max(b.z0, Math.min(p.z, b.z1));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else {
        // centre inside the rect: exit along the shortest axis
        const ex = [p.x - b.x0 + r, b.x1 - p.x + r, p.z - b.z0 + r, b.z1 - p.z + r];
        const m = Math.min(...ex);
        if (m === ex[0]) p.x = b.x0 - r; else if (m === ex[1]) p.x = b.x1 + r; else if (m === ex[2]) p.z = b.z0 - r; else p.z = b.z1 + r;
      }
      moved = true;
    }
    if (!moved) break;
  }
}

/** Coarse occupancy grid for reachability analysis. */
export class Grid {
  readonly cell = 0.4;
  readonly x0 = -50; readonly z0 = -56;
  readonly nx = 250; readonly nz = 230;
  readonly solid: Uint8Array;
  constructor(rects: Rect[], r = PLAYER_R) {
    this.solid = new Uint8Array(this.nx * this.nz);
    for (const b of rects) {
      const i0 = Math.max(0, Math.floor((b.x0 - r - this.x0) / this.cell));
      const i1 = Math.min(this.nx - 1, Math.floor((b.x1 + r - this.x0) / this.cell));
      const k0 = Math.max(0, Math.floor((b.z0 - r - this.z0) / this.cell));
      const k1 = Math.min(this.nz - 1, Math.floor((b.z1 + r - this.z0) / this.cell));
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
        // cell centre test keeps thin walls from swallowing door gaps
        const cx = this.x0 + (i + 0.5) * this.cell, cz = this.z0 + (k + 0.5) * this.cell;
        if (cx > b.x0 - r && cx < b.x1 + r && cz > b.z0 - r && cz < b.z1 + r) this.solid[k * this.nx + i] = 1;
      }
    }
  }
  idx(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.cell), k = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return -1;
    return k * this.nx + i;
  }
  free(x: number, z: number): boolean {
    const i = this.idx(x, z);
    return i >= 0 && !this.solid[i];
  }
  /** Flood fill from seeds; returns visited mask. */
  flood(seeds: number[], into?: Uint8Array): Uint8Array {
    const seen = into ?? new Uint8Array(this.nx * this.nz);
    const q: number[] = [];
    for (const s of seeds) if (s >= 0 && !this.solid[s] && !seen[s]) { seen[s] = 1; q.push(s); }
    while (q.length) {
      const c = q.pop()!;
      const i = c % this.nx, k = (c - i) / this.nx;
      const nb = [i > 0 ? c - 1 : -1, i < this.nx - 1 ? c + 1 : -1, k > 0 ? c - this.nx : -1, k < this.nz - 1 ? c + this.nx : -1];
      for (const n of nb) if (n >= 0 && !this.solid[n] && !seen[n]) { seen[n] = 1; q.push(n); }
    }
    return seen;
  }
  /** Is any reachable cell within `rad` of (x,z)? */
  near(mask: Uint8Array, x: number, z: number, rad: number): boolean {
    for (let dz = -rad; dz <= rad; dz += this.cell) for (let dx = -rad; dx <= rad; dx += this.cell) {
      if (dx * dx + dz * dz > rad * rad) continue;
      const i = this.idx(x + dx, z + dz);
      if (i >= 0 && mask[i]) return true;
    }
    return false;
  }
}
