import * as THREE from 'three';
import { Rng } from '../core/rng';

/* Procedural canvas textures. Surface textures are grayscale multipliers so the same texture serves
 * both eras; vertex colour carries the era palette. All are power-of-two with mipmaps. */

export const FONT_UI = '"Josefin Sans", "Gill Sans", sans-serif';
export const FONT_TYPE = '"Special Elite", "Courier New", monospace';
export const FONT_HAND = '"Caveat", "Segoe Print", cursive';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, amt: number, n = 4000) {
  for (let i = 0; i < n; i++) {
    const v = r.range(-amt, amt);
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(r.range(0, w), r.range(0, h), r.range(1, 3), r.range(1, 3));
  }
}

export function ashlarTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = new Rng(11);
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 512, 512);
  const rows = 6;
  const rh = 512 / rows;
  for (let y = 0; y < rows; y++) {
    let x = y % 2 ? -64 : 0;
    while (x < 512) {
      const w = r.pick([128, 128, 170, 96]);
      const v = r.range(205, 238) | 0;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x + 3, y * rh + 3, w - 6, rh - 6);
      // chunky chamfer: darker lower edge, lighter top
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x + 3, y * rh + rh - 9, w - 6, 6);
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fillRect(x + 3, y * rh + 3, w - 6, 4);
      if (r.chance(0.2)) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.arc(x + r.range(10, w - 10), y * rh + r.range(10, rh - 10), r.range(3, 9), 0, 7); g.fill(); }
      x += w;
    }
    // wrap the overflowing block
  }
  noise(g, 512, 512, r, 0.06, 6000);
  return tex(c);
}

export function brickTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = new Rng(12);
  g.fillStyle = '#8e8e8e';
  g.fillRect(0, 0, 512, 512);
  const bw = 64, bh = 24;
  for (let y = 0; y < 512 / bh + 1; y++) {
    for (let x = -1; x < 512 / bw + 1; x++) {
      const ox = (y % 2) * (bw / 2);
      const v = r.range(185, 235) | 0;
      g.fillStyle = `rgb(${v},${v - 3},${v - 6})`;
      g.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
    }
  }
  noise(g, 512, 512, r, 0.07, 5000);
  return tex(c);
}

export function plasterTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = new Rng(13);
  g.fillStyle = '#e0e0e0';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 60; i++) {
    const x = r.range(0, 512), y = r.range(0, 512), rad = r.range(20, 90);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = r.range(0.03, 0.09);
    grd.addColorStop(0, `rgba(0,0,0,${a})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // faint coursing lines for rendered masonry
  g.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let y = 0; y < 512; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  noise(g, 512, 512, r, 0.04, 4000);
  return tex(c);
}

export function woodTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = new Rng(14);
  for (let x = 0; x < 256; x += 32) {
    const v = r.range(190, 230) | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 32, 256);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x, 0, 2, 256);
    g.strokeStyle = 'rgba(0,0,0,0.06)';
    for (let k = 0; k < 6; k++) { g.beginPath(); const xx = x + r.range(4, 28); g.moveTo(xx, 0); g.bezierCurveTo(xx + 4, 80, xx - 4, 170, xx + 2, 256); g.stroke(); }
  }
  return tex(c);
}

export function settsTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = new Rng(15);
  g.fillStyle = '#5a5a5a';
  g.fillRect(0, 0, 512, 512);
  const sw = 42, sh = 30;
  for (let y = 0; y < 512 / sh + 1; y++) for (let x = -1; x < 512 / sw + 1; x++) {
    const ox = (y % 2) * sw * 0.5;
    const v = r.range(150, 215) | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    const px = x * sw + ox, py = y * sh;
    g.beginPath();
    (g as any).roundRect ? (g as any).roundRect(px + 2, py + 2, sw - 4, sh - 4, 7) : g.rect(px + 2, py + 2, sw - 4, sh - 4);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(px + 6, py + 4, sw - 14, 4);
  }
  noise(g, 512, 512, r, 0.05, 3000);
  return tex(c);
}

export function flagsTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = new Rng(16);
  g.fillStyle = '#7a7a7a';
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 4; y++) {
    let x = y % 2 ? -80 : 0;
    while (x < 512) {
      const w = r.pick([128, 160, 192]);
      const v = r.range(180, 222) | 0;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x + 3, y * 128 + 3, w - 6, 122);
      x += w;
    }
  }
  noise(g, 512, 512, r, 0.06, 5000);
  return tex(c);
}

/** The floor mosaic shared across eras: a patterned border and lozenge field. Colour texture. */
export function mosaicTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = new Rng(17);
  const cols = ['#d6ccb6', '#a87a62', '#5d7470', '#e4dccb', '#a2937a'];
  const t = 16;
  for (let y = 0; y < 512 / t; y++) for (let x = 0; x < 512 / t; x++) {
    const cx = x - 16 + 0.5, cy = y - 16 + 0.5;
    const d = Math.abs(cx) + Math.abs(cy);
    const ring = Math.floor(d / 3) % 4;
    const border = x < 2 || y < 2 || x > 29 || y > 29;
    let col = border ? cols[2] : d < 3 ? cols[1] : ring === 1 ? cols[4] : ring === 3 ? cols[1] : cols[(x + y) % 2 ? 0 : 3];
    if (!border && (x === 3 || y === 3 || x === 28 || y === 28)) col = cols[1];
    g.fillStyle = col;
    g.fillRect(x * t, y * t, t, t);
    g.fillStyle = `rgba(0,0,0,${r.range(0.04, 0.12)})`;
    g.fillRect(x * t, y * t, t, 1.5);
    g.fillRect(x * t, y * t, 1.5, t);
  }
  return tex(c);
}

/** Roughness for wet paving: low values (dark) are standing water. Linear data. */
export function wetRoughnessTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = new Rng(18);
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26; i++) {
    const x = r.range(0, 512), y = r.range(0, 512), rad = r.range(25, 85);
    for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      grd.addColorStop(0, 'rgba(20,20,20,0.95)');
      grd.addColorStop(0.6, 'rgba(40,40,40,0.6)');
      grd.addColorStop(1, 'rgba(40,40,40,0)');
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(x + ox, y + oy, rad * 1.5, rad, r.range(0, 3), 0, 7); g.fill();
    }
  }
  return tex(c, true, false);
}

/** Broken vertical streak used for light reflections on wet paving. */
export function streakTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 256);
  const r = new Rng(19);
  for (let y = 0; y < 256; y += 2) {
    const fall = Math.pow(1 - y / 256, 1.4);
    const w = 10 + 18 * fall * r.range(0.4, 1);
    const a = fall * (r.chance(0.25) ? 0.15 : r.range(0.45, 1));
    const grd = g.createLinearGradient(32 - w, 0, 32 + w, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, `rgba(255,255,255,${a})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(32 - w + r.range(-3, 3), y, w * 2, 2);
  }
  const t = tex(c, false);
  t.flipY = false;
  return t;
}

export function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return tex(c, false);
}

/* ---------------- Atlas for lettering and in-world documents ---------------- */

export interface AtlasSlot { u0: number; v0: number; u1: number; v1: number; aspect: number }

/** A shelf-packed canvas atlas. Draw functions receive a context translated to the slot. */
export class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private x = 0; private y = 0; private rowH = 0;
  readonly slots = new Map<string, AtlasSlot>();
  constructor(readonly size = 2048) {
    [this.canvas, this.g] = canvas(size, size);
    this.texture = tex(this.canvas, false);
  }
  add(id: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): AtlasSlot {
    if (this.x + w > this.size) { this.x = 0; this.y += this.rowH + 2; this.rowH = 0; }
    if (this.y + h > this.size) throw new Error('atlas full');
    const g = this.g;
    g.save();
    g.translate(this.x, this.y);
    g.beginPath(); g.rect(0, 0, w, h); g.clip();
    draw(g, w, h);
    g.restore();
    const s = this.size;
    const slot = { u0: (this.x + 0.5) / s, v0: 1 - (this.y + h - 0.5) / s, u1: (this.x + w - 0.5) / s, v1: 1 - (this.y + 0.5) / s, aspect: w / h };
    this.slots.set(id, slot);
    this.x += w + 2;
    this.rowH = Math.max(this.rowH, h);
    return slot;
  }
  finish() { this.texture.needsUpdate = true; }
  dispose() { this.texture.dispose(); }
}

export function fitText(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, font: string, weight = '700') {
  let s = size;
  g.font = `${weight} ${s}px ${font}`;
  while (g.measureText(text).width > maxW && s > 8) { s -= 2; g.font = `${weight} ${s}px ${font}`; }
  return s;
}
