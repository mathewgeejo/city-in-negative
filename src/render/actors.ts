import * as THREE from 'three';
import type { Pt } from '../core/types';
import { GeoBuilder, type MatKey } from './builder';
import { col } from './palette';
import type { AtlasSlot } from './textures';

/** The red tram. Window pillars are real geometry so the sun throws moving window shadows. */
export function buildTram(mats: Record<MatKey, THREE.Material>, enamel: string, cream: string, blind?: AtlasSlot): THREE.Group {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  const red = col(enamel), cr = col(cream), dark = col('#2a2326'), roof = col('#4a4040'), brass = col('#c9a35a');
  const L = 5.4, W = 1.18;
  b.box(-L, 0.25, -W * 0.8, L, 0.6, W * 0.8, dark, 'plain', { ao: false }); // underframe
  for (const x of [-3.2, 3.2]) b.box(x - 1, 0.05, -W * 0.85, x + 1, 0.55, W * 0.85, dark, 'plain', { ao: false });
  b.box(-L, 0.6, -W, L, 1.45, W, red, 'plain', { ao: false }); // dash panels
  b.box(-L - 0.02, 1.3, -W - 0.02, L + 0.02, 1.38, W + 0.02, brass, 'plain', { ao: false }); // waist rail
  // window band: pillars only, open between
  const nWin = 7;
  for (let i = 0; i <= nWin; i++) {
    const x = -L + (2 * L * i) / nWin;
    for (const z of [-W, W - 0.12]) b.box(x - 0.12, 1.45, z, x + 0.12, 2.45, z + 0.12, cr, 'plain', { ao: false });
  }
  for (const x of [-L, L - 0.12]) b.box(x, 1.45, -W, x + 0.12, 2.45, W, cr, 'plain', { ao: false });
  b.box(-L, 2.45, -W, L, 2.85, W, cr, 'plain', { ao: false }); // letterboard
  b.box(-L - 0.1, 2.85, -W - 0.05, L + 0.1, 3.0, W + 0.05, roof, 'plain', { ao: false });
  b.box(-L + 1, 3.0, -0.6, L - 1, 3.2, 0.6, roof, 'plain', { ao: false });
  b.box(-L + 0.2, 1.5, -W + 0.15, L - 0.2, 1.55, W - 0.15, dark, 'plain', { ao: false }); // seats line
  for (let i = 0; i < nWin; i++) {
    const x = -L + (2 * L * (i + 0.5)) / nWin;
    b.box(x - 0.4, 0.95, -W + 0.3, x + 0.4, 1.5, W - 0.3, col('#5a4a3a'), 'plain', { ao: false });
  }
  for (const s of [-1, 1]) {
    b.box(s * L - 0.05, 0.9, -0.25, s * L + 0.05 * s + 0.05, 1.2, 0.25, col('#fff2c4'), 'emissive', { ao: false }); // headlamp
    b.box(s * (L + 0.15) - 0.15, 0.4, -W, s * (L + 0.15) + 0.15, 0.6, W, dark, 'plain', { ao: false }); // fender
  }
  if (blind) for (const s of [-1, 1]) b.plate(s * (L + 0.02), 2.65, 0, 1.6, 0.36, s > 0 ? 'px' : 'nx', col('#ffffff'), 'atlasLit', blind);
  for (const s of [-1, 1]) for (const z of [-W - 0.01, W + 0.01]) b.plate(s * 2.6, 0.95, z, 0.9, 0.5, z > 0 ? 'pz' : 'nz', col('#e8d6a0'), 'plain');
  // trolley pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.2, 5), new THREE.MeshLambertMaterial({ color: 0x2a2326 }));
  pole.position.set(-1.5, 4.0, 0);
  pole.rotation.z = -1.1;
  g.add(pole);
  b.build(mats, g, { castShadow: () => true, receiveShadow: false });
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.matrixAutoUpdate = true; } });
  return g;
}

/** A small stylised person. Returns the root plus parts that animate. */
export interface Figure { root: THREE.Group; body: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D; trolley: THREE.Group }

export function buildFigure(coat: string, hair: string, skin = '#e0b894'): Figure {
  const root = new THREE.Group();
  const M = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.15, 8), M(coat));
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), M(skin));
  head.position.y = 1.68;
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M(hair));
  hairM.position.y = 1.7;
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M(hair));
  bun.position.set(0, 1.74, -0.14);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.4, 6), M('#3b2f34'));
  legs.position.y = 0.2;
  const mkArm = (s: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.25 * s, 1.42, 0);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.6, 0.09), M(coat));
    a.position.y = -0.28;
    pivot.add(a);
    return pivot;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  root.add(body, head, hairM, bun, legs, armL, armR);
  const trolley = new THREE.Group();
  const tm = M('#3a3030');
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.9), tm);
  base.position.set(0, 0.18, 0.75);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.05), tm);
  handle.position.set(0, 0.6, 0.3);
  for (const x of [-0.3, 0.3]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10), tm);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.1, 0.9);
    trolley.add(wheel);
  }
  trolley.add(base, handle);
  trolley.visible = false;
  root.add(trolley);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { root, body, armL, armR, trolley };
}

/** Moves a figure along a polyline at walking pace. Allocation-free per frame. */
export class Walker {
  private seg = 0; private u = 0;
  pts: Pt[] = [];
  active = false;
  constructor(readonly fig: Figure, private speed = 1.25) {}
  start(pts: Pt[]) { this.pts = pts; this.seg = 0; this.u = 0; this.active = pts.length > 1; if (pts.length) this.fig.root.position.set(pts[0].x, 0, pts[0].z); }
  /** returns true when finished this frame */
  update(dt: number, t: number): boolean {
    const f = this.fig;
    if (!this.active) {
      f.armL.rotation.x = f.armR.rotation.x = 0;
      f.body.position.y = 0.95 + Math.sin(t * 1.3) * 0.005;
      return false;
    }
    const a = this.pts[this.seg], b = this.pts[this.seg + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 0.001;
    this.u += (this.speed * dt) / len;
    if (this.u >= 1) {
      this.seg++; this.u = 0;
      if (this.seg >= this.pts.length - 1) { this.active = false; f.root.position.set(b.x, 0, b.z); return true; }
    }
    const x = a.x + (b.x - a.x) * this.u, z = a.z + (b.z - a.z) * this.u;
    f.root.position.set(x, 0, z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    f.root.rotation.y += (((yaw - f.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 8);
    const sw = Math.sin(t * 7.5);
    f.armL.rotation.x = f.trolley.visible ? -0.9 : sw * 0.5;
    f.armR.rotation.x = f.trolley.visible ? -0.9 : -sw * 0.5;
    f.body.position.y = 0.95 + Math.abs(sw) * 0.03;
    return false;
  }
}
