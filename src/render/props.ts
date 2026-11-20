import * as THREE from 'three';
import type { Era } from '../core/types';
import type { Prop } from '../gen/layout';
import type { GeoBuilder } from './builder';
import { col, type Palette } from './palette';
import type { Atlas } from './textures';

const C = new THREE.Color();
const shade = (hex: string, k: number) => C.set(hex).multiplyScalar(k).clone();

/** Local→world helper for a prop's yaw. */
function local(p: Prop) {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return (lx: number, lz: number): [number, number] => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}

/** Static prop geometry. Stateful objects (crate, plate, locker door…) live in dynamic.ts. */
export function buildProp(b: GeoBuilder, p: Prop, pal: Palette, era: Era, atlas: Atlas, skipDoorOf?: string) {
  const at = local(p);
  const facingZ = Math.abs(Math.cos(p.yaw)) > 0.5;
  const wood = col(pal.wood), dark = col(pal.shadow), trim = col(pal.trim), brass = col(pal.brass);
  const metal = era === 'past' ? col('#4e4650') : col('#2c3540');
  const sub = (lx: number, lz: number, w: number, d: number, y0: number, h: number, c: THREE.Color, mat: Parameters<GeoBuilder['box']>[7] = 'plain') => {
    const [x, z] = at(lx, lz);
    b.rbox(x, y0, z, w, h, d, p.yaw, c, mat);
  };
  switch (p.kind) {
    case 'bench':
      sub(0, 0, p.w, p.d * 0.8, 0.42, 0.08, wood, 'wood');
      sub(0, -p.d * 0.4, p.w, 0.08, 0.5, 0.45, wood, 'wood');
      for (const s of [-1, 1]) sub(s * (p.w / 2 - 0.15), 0, 0.08, p.d * 0.8, 0, 0.42, metal);
      break;
    case 'counter':
      sub(0, 0, p.w, p.d, 0, p.h, era === 'past' ? col(pal.secondary) : shade(pal.wood, 0.9), 'wood');
      sub(0, 0, p.w + 0.1, p.d + 0.1, p.h, 0.06, era === 'past' ? col('#6b4b3a') : col('#2f3540'), 'plain');
      break;
    case 'desk':
      sub(0, 0, p.w, p.d, p.h - 0.05, 0.05, era === 'past' ? col('#6b4b3a') : shade(pal.wood, 0.8), 'wood');
      for (const s of [-1, 1]) sub(s * (p.w / 2 - 0.3), 0, 0.55, p.d - 0.05, 0, p.h - 0.05, era === 'past' ? col('#5a3e30') : shade(pal.wood, 0.7), 'wood');
      break;
    case 'cabinet':
      sub(0, 0, p.w, p.d, 0, p.h, era === 'past' ? col('#6d7a6a') : metal);
      for (let i = 0; i < 4; i++) sub(0, p.d / 2 + 0.01, p.w - 0.15, 0.02, 0.15 + i * 0.45, 0.38, era === 'past' ? col('#7f8c7b') : shade(pal.trim, 0.6));
      break;
    case 'shelf': {
      for (const s of [-1, 1]) sub(s * (p.w / 2 - 0.04), 0, 0.06, p.d, 0, p.h, wood, 'wood');
      for (let i = 0; i < 4; i++) sub(0, 0, p.w, p.d, 0.2 + i * 0.75, 0.04, wood, 'wood');
      if (era === 'past') for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) sub(-0.5 + k * 0.9, 0, 0.6, p.d * 0.8, 0.24 + i * 0.75 + 0.04, 0.4, shade('#a88a62', 0.8 + ((i + k) % 3) * 0.1), 'wood');
      if (p.text) {
        const slot = atlas.slots.get(`shelf.${p.text}`);
        const [x, z] = at(0, p.d / 2 + 0.03);
        if (slot) b.plate(x, 2.55, z, 0.5, 0.25, facingZ ? (Math.cos(p.yaw) > 0 ? 'pz' : 'nz') : (Math.sin(p.yaw) > 0 ? 'px' : 'nx'), col('#ffffff'), 'atlas', slot);
      }
      break;
    }
    case 'locker': {
      const body = era === 'present' ? col('#3c5458') : col('#55605a');
      if (`depot.locker.${p.text}` !== skipDoorOf) {
        sub(0, 0, p.w - 0.04, p.d, 0, p.h, body);
        sub(0, p.d / 2 + 0.01, p.w - 0.12, 0.03, 0.08, p.h - 0.16, shade('#3c5458', 1.15));
      } else {
        // hollow shell so whatever was transferred into it can be seen when opened
        sub(0, -p.d / 2 + 0.03, p.w - 0.04, 0.06, 0, p.h, body);
        for (const s of [-1, 1]) sub(s * (p.w / 2 - 0.05), 0, 0.06, p.d, 0, p.h, body);
        sub(0, 0, p.w - 0.04, p.d, p.h - 0.06, 0.06, body);
        sub(0, 0, p.w - 0.04, p.d, 0, 0.08, body);
        sub(0, 0, p.w - 0.1, p.d - 0.1, 0.9, 0.04, body);
      }
      if (`depot.locker.${p.text}` === skipDoorOf) break;
      for (let i = 0; i < 4; i++) sub(0, p.d / 2 + 0.03, p.w * 0.5, 0.01, p.h - 0.35 - i * 0.06, 0.02, dark);
      const slot = atlas.slots.get(`locker.${p.text}`);
      const [x, z] = at(0, p.d / 2 + 0.05);
      if (slot) b.plate(x, p.h - 0.6, z, 0.36, 0.24, 'pz', col('#ffffff'), 'atlas', slot);
      break;
    }
    case 'bins':
      for (let i = 0; i < 2; i++) sub(0, (i - 0.5) * 0.8, 0.7, 0.7, 0, p.h, era === 'present' ? col('#2a3a3c') : col('#6a6a60'));
      break;
    case 'crateStack':
      sub(0, 0, p.w, p.d, 0, 0.6, col('#a88a62'), 'wood');
      sub(0.1, 0.1, p.w * 0.8, p.d * 0.6, 0.6, 0.6, col('#9a7c56'), 'wood');
      break;
    case 'bicycle': {
      const fr = era === 'present' ? col('#7a2f2f') : col('#2f3a2f');
      sub(0, 0, 0.05, 1.6, 0.6, 0.05, fr);
      for (const s of [-0.6, 0.6]) sub(0, s, 0.06, 0.65, 0.05, 0.65, dark);
      sub(0, 0.5, 0.05, 0.05, 0.6, 0.45, fr);
      break;
    }
    case 'workbench':
      sub(0, 0, p.w, p.d, p.h - 0.08, 0.08, wood, 'wood');
      for (const s of [-1, 1]) for (const t of [-1, 1]) sub(s * (p.w / 2 - 0.1), t * (p.d / 2 - 0.1), 0.08, 0.08, 0, p.h - 0.08, metal);
      sub(0.6, 0, 0.4, 0.3, p.h, 0.25, col('#7a2f2f'));
      break;
    case 'bikeRack':
      sub(0, 0, p.w, 0.08, 0, 0.12, metal);
      for (let i = 0; i < 5; i++) {
        const lx = -p.w / 2 + 0.4 + i * 0.8;
        sub(lx, 0, 0.05, 1.6, 0.55, 0.05, i % 2 ? col('#2f5a6a') : col('#6a2f2f'));
        for (const s of [-0.6, 0.6]) sub(lx, s, 0.05, 0.6, 0.05, 0.6, dark);
      }
      break;
    case 'cart':
      sub(0, 0, p.w, p.d, 0.5, 0.5, era === 'past' ? col(pal.secondary) : wood, 'wood');
      for (const s of [-1, 1]) sub(s * (p.w / 2 + 0.04), 0, 0.06, 0.9, 0.05, 0.9, dark);
      sub(0, p.d / 2 + 0.6, 0.06, 1.2, 0.75, 0.06, wood, 'wood');
      break;
    case 'well':
      sub(0, 0, p.w, p.d, 0, p.h, col(pal.masonry), 'masonry');
      sub(0, 0, p.w - 0.3, p.d - 0.3, p.h - 0.02, 0.04, dark);
      for (const s of [-1, 1]) sub(s * (p.w / 2 - 0.1), 0, 0.12, 0.12, p.h, 1.4, wood, 'wood');
      sub(0, 0, p.w, 0.14, p.h + 1.4, 0.12, wood, 'wood');
      break;
    case 'pillar': {
      // the chipped pillar: a recognisable silhouette shared by both eras
      const m = col(pal.masonry);
      sub(0, 0, p.w + 0.12, p.d + 0.12, 0, 0.4, shade(pal.masonry, 0.85), 'masonry');
      sub(0, 0, p.w, p.d, 0.4, p.h - 0.8, m, 'masonry');
      sub(0.08, 0.08, p.w * 0.6, p.d * 0.6, 1.1, 0.12, dark); // chip
      sub(0, 0, p.w + 0.16, p.d + 0.16, p.h - 0.4, 0.4, shade(pal.masonry, 1.1), 'masonry');
      break;
    }
    case 'press': {
      const iron = era === 'past' ? col('#3d3a40') : metal;
      sub(0, 0, p.w, p.d, 0, 0.5, iron);
      sub(0, -0.3, p.w * 0.8, 0.5, 0.5, 1.0, iron);
      sub(0, 0.3, p.w * 0.9, 0.7, 0.9, 0.08, col('#c9b48c'));
      sub(p.w / 2 - 0.05, -0.3, 0.1, 0.9, 0.5, 0.9, col(pal.enamel));
      break;
    }
    case 'typeCases':
      sub(0, 0, p.w, p.d, 0, p.h, wood, 'wood');
      for (let i = 0; i < 5; i++) sub(0, p.d / 2 + 0.01, p.w - 0.1, 0.02, 0.15 + i * 0.25, 0.18, shade(pal.wood, 0.8), 'wood');
      break;
    case 'booth': {
      const y0 = p.y ?? 2.5;
      sub(0, 0, p.w, p.d, y0, p.h, col(pal.plaster), 'plaster');
      sub(0, -p.d / 2 - 0.01, 0.6, 0.02, y0 + 1.2, 0.4, dark); // projection port
      sub(0, p.d / 2 + 0.01, 1.2, 0.02, y0 + 0.8, 0.8, col('#2a2a30'));
      // underside: dark, so the brass plate below reads as a pool of brightness
      break;
    }
    case 'boothLegs':
      for (const s of [-1, 1]) for (const t of [-1, 1]) sub(s * (p.w / 2 - 0.1), t * (p.d / 2 - 0.1), 0.12, 0.12, 0, p.h, metal);
      sub(0, 0, p.w, p.d, p.h - 0.12, 0.12, metal);
      break;
    case 'stairs':
      for (let i = 0; i < 8; i++) sub(0, -p.d / 2 + (i + 0.5) * (p.d / 8), p.w, p.d / 8, 0, (i + 1) * (p.h / 8), metal);
      break;
    case 'ticketBooth': {
      sub(0, 0, p.w, p.d, 0, 0.9, col('#6a2f2f'), 'wood');
      sub(0, 0, p.w, p.d, 0.9, 1.1, col('#1d2733'), 'glass');
      sub(0, 0, p.w + 0.12, p.d + 0.12, 2.0, 0.2, col('#6a2f2f'), 'wood');
      sub(0, 0, p.w * 0.8, p.d * 0.8, 2.2, 0.2, brass);
      break;
    }
    case 'barrier':
      for (const s of [-1, 1]) sub(s * (p.w / 2 - 0.3), 0, 0.2, 0.5, 0, 1, col('#2a3442'));
      for (let i = 0; i < Math.floor(p.w); i++) sub(-p.w / 2 + 0.5 + i, 0, 0.9, 0.06, 0.7, 0.18, i % 2 ? col('#8D4544') : col('#d6d2c4'));
      break;
    case 'scaffold':
      for (const s of [-1, 1]) for (const t of [-1, 1]) sub(s * p.w / 2, t * p.d / 2, 0.06, 0.06, 0, p.h, metal);
      for (let i = 1; i <= 2; i++) sub(0, 0, p.w, p.d, i * (p.h / 2) - 0.05, 0.05, wood, 'wood');
      break;
    case 'rubble':
      for (let i = 0; i < 6; i++) sub(-p.w / 2 + i * 0.5, (i % 3) * 0.4 - 0.4, 0.5, 0.4, 0, 0.15 + (i % 3) * 0.12, shade(pal.masonry, 0.7 + (i % 2) * 0.2), 'masonry');
      break;
    default:
      sub(0, 0, p.w, p.d, 0, p.h, trim);
  }
}
