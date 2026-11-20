export type Era = 'present' | 'past';
export type EraSet = Era | 'both';

export const otherEra = (e: Era): Era => (e === 'present' ? 'past' : 'present');
export const inEra = (s: EraSet | undefined, e: Era) => s === undefined || s === 'both' || s === e;

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Pt { x: number; z: number }

export const rectContains = (r: Rect, x: number, z: number, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
