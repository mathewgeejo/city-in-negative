import * as THREE from 'three';
import { type Era, inEra } from '../core/types';
import type { Facade, Opening, Wall } from '../gen/layout';
import type { World } from '../gen/world';
import type { WorldState } from '../sim/events';
import { buildFigure, buildTram, type Figure, Walker } from './actors';
import { GeoBuilder, Instancer, type MatKey } from './builder';
import { Dynamics } from './dynamic';
import { Drips, Rain, skyDome, Streaks } from './effects';
import type { Materials } from './materials';
import { col, PALETTES, type Palette } from './palette';
import { buildProp } from './props';
import type { Atlas } from './textures';

export type ShadowQuality = 'off' | 'low' | 'high';

const SUN_OFFSET = new THREE.Vector3(-46, 23, 27);
const tmpC = new THREE.Color();
const mul = (hex: string, k: number) => tmpC.set(hex).multiplyScalar(k).clone();
const lerpHex = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/** One era of the block as a self-contained THREE.Scene built from shared layout footprints. */
export class EraScene {
  readonly scene = new THREE.Scene();
  readonly pal: Palette;
  readonly dyn: Dynamics;
  tram?: THREE.Group;
  clerk?: Figure;
  clerkWalker?: Walker;
  rain?: Rain;
  drips?: Drips;
  streaks?: Streaks;
  sun?: THREE.DirectionalLight;
  poster?: THREE.Mesh;
  clockHand?: THREE.Mesh;
  laundry: THREE.Mesh[] = [];
  private disposables: { dispose(): void }[] = [];
  private shadowQ: ShadowQuality = 'low';
  private b = new GeoBuilder();
  private inst: Record<'glass' | 'frame' | 'rail' | 'lampHead' | 'tile', Instancer>;

  constructor(private renderer: THREE.WebGLRenderer, readonly world: World, readonly era: Era, private mats: Materials, private atlas: Atlas, ws: WorldState, shadowQ: ShadowQuality) {
    this.pal = PALETTES[era];
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitPlane = new THREE.PlaneGeometry(1, 1);
    this.disposables.push(unitBox, unitPlane);
    this.inst = {
      glass: new Instancer(unitPlane, mats.inst.glass, 'windows.glass'),
      frame: new Instancer(unitBox, mats.inst.lambert, 'windows.frames'),
      rail: new Instancer(unitBox, mats.inst.lambert, 'railings'),
      lampHead: new Instancer(unitBox, mats.inst.emissive, 'lamp.heads'),
      tile: new Instancer(unitBox, mats.inst.lambert, 'roof.tiles'),
    };
    this.buildEnvironment();
    this.buildGround();
    for (const w of world.layout.walls) if (inEra(w.eras, era)) this.buildWall(w);
    this.buildBlocks();
    for (const f of world.layout.facades) this.buildFacade(f);
    this.buildRooms();
    const lockerSkip = `depot.locker.${world.case.lockerNo}`;
    for (const p of world.layout.props) if (inEra(p.eras, era)) buildProp(this.b, p, this.pal, era, atlas, lockerSkip);
    this.buildStation();
    this.buildLamps();
    this.buildCinemaFront();
    this.buildCourtyard();
    const statics = new THREE.Group();
    statics.name = 'statics';
    const matsForEra: Record<MatKey, THREE.Material> = { ...mats.byKey, road: era === 'present' ? mats.roadWet : mats.roadDry };
    this.b.build(matsForEra, statics, { castShadow: (m) => !['road', 'setts', 'flags', 'mosaic', 'emissive', 'glass', 'atlasLit'].includes(m), receiveShadow: era === 'past' });
    this.inst.glass.build(statics, false, false);
    this.inst.frame.build(statics, true, era === 'past');
    this.inst.rail.build(statics, true, era === 'past');
    this.inst.lampHead.build(statics, false, false);
    this.inst.tile.build(statics, false, era === 'past');
    statics.updateMatrixWorld(true);
    this.scene.add(statics);
    this.dyn = new Dynamics(world, era, mats, atlas, this.pal);
    this.scene.add(this.dyn.group);
    this.dyn.apply(ws, { plateLifted: false, lockerOpened: false });
    this.buildActorsAndFx();
    this.setShadowQuality(shadowQ);
  }

  /* ---------------- environment and lights ---------------- */
  private buildEnvironment() {
    const P = this.pal;
    const present = this.era === 'present';
    this.scene.fog = new THREE.FogExp2(P.fog, present ? this.world.layout.weather.fog : 0.0085);
    // late sun from down the street (west-south-west): raking light on the station frontage and
    // long shadows running along the road
    const sunDir = present ? new THREE.Vector3(-0.3, 0.25, -1) : SUN_OFFSET.clone().normalize();
    const sky = skyDome(present ? '#22304a' : '#f6dcb4', present ? P.sky : '#f2c89a', present ? '#4a5a78' : '#ffe3a8', sunDir);
    this.scene.add(sky);
    this.disposables.push(sky.geometry, sky.material as THREE.Material);

    // Environment for wet reflections: a dim sky with a few warm blobs where practical lights are.
    const envScene = new THREE.Scene();
    envScene.add(skyDome(present ? '#2a3650' : '#f6dcb4', present ? '#3c4c6a' : '#f2c89a', present ? '#F1BB70' : '#ffe3a8', present ? new THREE.Vector3(0, 0.15, 1) : sunDir));
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
    this.scene.environment = env;
    this.disposables.push(env);

    const hemi = new THREE.HemisphereLight(P.hemiSky, P.hemiGround, present ? 2.1 : 1.3);
    this.scene.add(hemi);
    if (present) {
      const moon = new THREE.DirectionalLight(P.key, 0.7);
      moon.position.set(-20, 30, 25);
      this.scene.add(moon);
    } else {
      const sun = new THREE.DirectionalLight(P.key, 2.3);
      sun.position.copy(sunDir).multiplyScalar(60);
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.04;
      const sc = sun.shadow.camera as THREE.OrthographicCamera;
      sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 140;
      this.scene.add(sun, sun.target);
      this.sun = sun;
    }
  }

  setShadowQuality(q: ShadowQuality) {
    this.shadowQ = q;
    if (!this.sun) return;
    this.sun.castShadow = q !== 'off';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as any).map = null;
    }
  }
  get shadowQuality() { return this.shadowQ; }

  /* ---------------- ground ---------------- */
  private buildGround() {
    const b = this.b, P = this.pal, l = this.world.layout, s = l.street;
    const present = this.era === 'present';
    const road = col(P.road), walk = mul(P.masonry, present ? 0.72 : 0.92);
    // road in tiles so sections cull
    for (let x = -96; x < 96; x += 12) b.box(x, -0.2, s.zN + 2.6, x + 12, 0, s.zS - 2.6, road, 'road', { ao: false, skip: ['ny'] });
    for (let x = -96; x < 96; x += 12) {
      b.box(x, -0.2, s.zN, x + 12, 0.12, s.zN + 2.6, walk, 'flags', { ao: false, skip: ['ny', 'nz'] });
      b.box(x, -0.2, s.zS - 2.6, x + 12, 0.12, s.zS, walk, 'flags', { ao: false, skip: ['ny', 'pz'] });
    }
    // kerbs (instanced paving detail)
    const kerb = mul(P.masonry, present ? 0.9 : 1.05);
    for (let x = -95.5; x < 96; x += 1.0) {
      const v = 0.92 + ((x * 7.13) % 1 + 1) % 1 * 0.16;
      this.inst.frame.add(x, 0.07, s.zN + 2.6, 0.97, 0.16, 0.22, 0, kerb.clone().multiplyScalar(v));
      if (x < s.crossX0 || x > s.crossX1) this.inst.frame.add(x, 0.07, s.zS - 2.6, 0.97, 0.16, 0.22, 0, kerb.clone().multiplyScalar(v));
    }
    // cross street
    b.box(s.crossX0, -0.2, s.zS - 2.6, s.crossX1, 0.005, s.crossEnd + 16, road, 'road', { ao: false, skip: ['ny'] });
    // rails
    const steel = present ? col('#3a4352') : col('#8a8078');
    const rail = (x0: number, x1: number, z: number) => b.box(x0, 0, z - 0.04, x1, 0.035, z + 0.04, steel, 'plain', { ao: false });
    for (const z of [-0.72, 0.72]) {
      if (present) {
        rail(-96, s.brokenX0, z);
        rail(s.brokenX1, 96, z);
        // broken stubs lifted at the ends
        b.box(s.brokenX0, 0, z - 0.04, s.brokenX0 + 0.8, 0.09, z + 0.04, steel, 'plain', { ao: false });
        b.box(s.brokenX1 - 0.6, 0, z - 0.04, s.brokenX1, 0.07, z + 0.04, steel, 'plain', { ao: false });
      } else rail(-96, 96, z);
    }
    if (present) b.box(s.brokenX0 + 0.5, -0.1, -1.3, s.brokenX1 - 0.4, 0.012, 1.25, col('#1c2532'), 'plain', { ao: false, skip: ['ny'] }); // patched asphalt
    else {
      // depot spur curving off the main line
      const dp = l.spots['depot.rails'];
      for (const off of [-0.72, 0.72]) {
        let px = dp.x + (l.mirror ? -1 : 1) * 9, pz = off * 0.2;
        for (let i = 1; i <= 12; i++) {
          const t = i / 12;
          const x = dp.x + (l.mirror ? -1 : 1) * 9 * (1 - t) + off * t, z = -0.72 * (1 - t) * (1 - t) + (s.zN - 0.6) * t * t + off * (1 - t) * 0.1;
          const len = Math.hypot(x - px, z - pz);
          const ang = Math.atan2(x - px, z - pz);
          b.rbox((x + px) / 2, 0, (z + pz) / 2, 0.08, 0.03, len, ang, steel, 'plain', false);
          px = x; pz = z;
        }
      }
    }
    // sett crossing strip in the past, painted lines in the present
    if (present) for (let x = -90; x < 90; x += 6) b.box(x, 0, -0.05, x + 2.6, 0.006, 0.05, col('#8a8f88'), 'plain', { ao: false });
  }

  /* ---------------- walls with real openings ---------------- */
  private buildWall(w: Wall) {
    const b = this.b, P = this.pal, era = this.era;
    const base = w.mat === 'masonry' ? P.masonry : w.mat === 'brick' ? P.brick : P.plaster;
    const c = mul(base, 0.82 + w.tone * 0.32);
    const mat: MatKey = w.mat === 'masonry' ? 'masonry' : w.mat === 'brick' ? 'brick' : 'plaster';
    const ht = w.t / 2;
    // map (u along wall, y, v across wall) → world
    const box = (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, cc: THREE.Color, m: MatKey, ao = true) =>
      w.axis === 'x' ? b.box(u0, y0, w.c + v0, u1, y1, w.c + v1, cc, m, { ao }) : b.box(w.c + v0, y0, u0, w.c + v1, y1, u1, cc, m, { ao });
    const ops = w.openings.slice().sort((p, q) => p.a - q.a);
    // vertical strips between openings
    let cur = w.a;
    for (const o of ops) {
      if (o.a > cur) box(cur, 0, -ht, o.a, w.h, ht, c, mat);
      cur = Math.max(cur, o.b);
    }
    if (cur < w.b) box(cur, 0, -ht, w.b, w.h, ht, c, mat);
    const ext = w.face; // exterior side sign (0 = interior partition)
    for (const o of ops) {
      if (o.bottom > 0) box(o.a, 0, -ht, o.b, o.bottom, ht, c, mat);
      box(o.a, o.top, -ht, o.b, w.h, ht, c, mat);
      if (o.kind === 'arch') this.archSpandrels(w, o, c, mat);
      this.openingDressing(w, o, box, c, ext);
      this.openingFill(w, o, box, era);
    }
  }

  private archSpandrels(w: Wall, o: Opening, c: THREE.Color, mat: MatKey) {
    const r = (o.b - o.a) / 2, cx = (o.a + o.b) / 2, spring = o.top - r, ht = w.t / 2;
    const n = 8;
    for (let j = 0; j < n; j++) {
      const y0 = spring + (r * j) / n, y1 = spring + (r * (j + 1)) / n;
      const ym = (y0 + y1) / 2 - spring;
      const hw = Math.sqrt(Math.max(0, r * r - ym * ym));
      this.b.box(o.a, y0, w.c - ht, cx - hw, y1, w.c + ht, c, mat, { ao: false });
      this.b.box(cx + hw, y0, w.c - ht, o.b, y1, w.c + ht, c, mat, { ao: false });
    }
  }

  private openingDressing(w: Wall, o: Opening, box: (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, c: THREE.Color, m: MatKey, ao?: boolean) => void, wallC: THREE.Color, ext: number) {
    if (!ext) return;
    const ht = w.t / 2;
    const stone = wallC.clone().multiplyScalar(1.12);
    const v0 = ext * ht, v1 = ext * (ht + 0.09);
    const [lo, hi] = v0 < v1 ? [v0, v1] : [v1, v0];
    if (o.kind === 'arch') {
      const r = (o.b - o.a) / 2;
      const cx = (o.a + o.b) / 2;
      if (w.axis === 'x') {
        this.b.archRing(cx, o.top - r, w.c + ext * (ht + 0.06), r, r + 0.45, 0.14, stone, 'masonry', 12);
        this.b.archRing(cx, o.top - r, w.c - ext * (ht + 0.03), r, r + 0.3, 0.08, stone, 'masonry', 10);
        box(cx - 0.22, o.top - 0.1, lo - 0.04, cx + 0.22, o.top + 0.55, hi + 0.06, stone.clone().multiplyScalar(1.05), 'masonry'); // keystone
      }
      for (const u of [o.a - 0.4, o.b]) box(u, 0, lo, u + 0.4, o.top - r, hi, stone, 'masonry');
      // the chipped plinth at the left jamb: a shared mark of the doorway in both eras
      box(o.a - 0.5, 0, lo - 0.02, o.a + 0.02, 0.55, hi + 0.06, stone.clone().multiplyScalar(0.9), 'masonry');
      return;
    }
    const fw = o.kind === 'window' ? 0.16 : 0.24;
    box(o.a - fw, o.bottom - (o.kind === 'window' ? 0.14 : 0), lo, o.a, o.top + fw, hi, stone, 'masonry');
    box(o.b, o.bottom - (o.kind === 'window' ? 0.14 : 0), lo, o.b + fw, o.top + fw, hi, stone, 'masonry');
    box(o.a - fw, o.top, lo, o.b + fw, o.top + fw + 0.04, hi, stone, 'masonry');
    if (o.kind === 'window') box(o.a - fw - 0.05, o.bottom - 0.14, ext > 0 ? lo : lo - 0.08, o.b + fw + 0.05, o.bottom, ext > 0 ? hi + 0.08 : hi, stone, 'masonry'); // sill
    else box(o.a - 0.05, 0, lo - (ext > 0 ? 0 : 0.3), o.b + 0.05, 0.08, hi + (ext > 0 ? 0.3 : 0), stone.clone().multiplyScalar(0.92), 'masonry', false); // step
  }

  private openingFill(w: Wall, o: Opening, box: (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, c: THREE.Color, m: MatKey, ao?: boolean) => void, era: Era) {
    if (o.dynamic) return;
    const P = this.pal;
    const isOpen = o.open !== 'none' && inEra(o.open as any, era);
    const ht = w.t / 2;
    const ext = w.face || 1;
    if (isOpen && o.kind === 'window') o = { ...o, fill: 'glass' };
    else if (isOpen) {
      if (o.kind === 'door') {
        // leaf swung inward against the jamb
        const leafW = Math.min(1.1, o.b - o.a);
        const u = o.a + 0.04;
        const v = -ext * ht;
        const vv = v - ext * leafW;
        box(u, 0.02, Math.min(v, vv), u + 0.06, o.top - 0.04, Math.max(v, vv), col(P.secondary), 'wood');
      }
      if (o.kind === 'arch' && era === 'past' && w.id === 'station.front') {
        // glazed fanlight with the sun behind it
        const r = (o.b - o.a) / 2;
        this.b.halfDisc((o.a + o.b) / 2, o.top - r, w.c + ext * 0.05, r - 0.05, ext as 1 | -1, col('#f7e2b8'), 'glass');
      }
      return;
    }
    const inset = 0.14;
    const fv0 = ext > 0 ? -ht + 0.05 : -ht + inset, fv1 = ext > 0 ? ht - inset : ht - 0.05;
    switch (o.fill) {
      case 'brick': {
        box(o.a, o.bottom, fv0, o.b, o.top, fv1, mul(P.brick, 0.78), 'brick');
        break;
      }
      case 'door':
        box(o.a, 0, fv0 + 0.1, o.b, o.top, fv1 - 0.1, col(P.secondary).multiplyScalar(0.85), 'wood');
        box(o.a + 0.15, 0.05, ext > 0 ? fv1 - 0.1 : fv0 + 0.08, o.b - 0.15, 0.3, ext > 0 ? fv1 - 0.08 : fv0 + 0.1, col(P.brass), 'plain', false);
        break;
      case 'shutter':
        box(o.a, 0, fv0 + 0.18, o.b, o.top, fv1 - 0.1, col('#4a5560'), 'plain');
        for (let y = 0.2; y < o.top; y += 0.22) box(o.a, y, ext > 0 ? fv1 - 0.1 : fv0 + 0.16, o.b, y + 0.05, ext > 0 ? fv1 - 0.06 : fv0 + 0.2, col('#5a6672'), 'plain', false);
        break;
      case 'gate':
        for (let u = o.a + 0.1; u < o.b; u += 0.16) box(u, 0, -0.03, u + 0.035, o.top, 0.03, col(this.era === 'past' ? '#3b2f34' : '#1f2833'), 'plain', false);
        box(o.a, o.top - 0.2, -0.04, o.b, o.top - 0.1, 0.04, col('#2a2a30'), 'plain', false);
        box(o.a, 1.0, -0.04, o.b, 1.08, 0.04, col('#2a2a30'), 'plain', false);
        break;
      case 'glass':
      default: {
        const lit = this.windowLit(w, o);
        box(o.a, o.bottom, -0.03, o.b, o.top, 0.03, lit, lit.r > 0.5 ? 'emissive' : 'glass', false);
        const mull = col(P.trim).multiplyScalar(this.era === 'present' ? 0.5 : 0.9);
        box((o.a + o.b) / 2 - 0.03, o.bottom, -0.06, (o.a + o.b) / 2 + 0.03, o.top, 0.06, mull, 'plain', false);
        box(o.a, (o.bottom + o.top) / 2 - 0.03, -0.06, o.b, (o.bottom + o.top) / 2 + 0.03, 0.06, mull, 'plain', false);
      }
    }
  }

  private windowLit(w: Wall, o: Opening): THREE.Color {
    const P = this.pal;
    if (this.era === 'present') {
      if (w.id.startsWith('cinema')) return col(P.glassLit).multiplyScalar(0.8);
      if (w.id.startsWith('depot')) return col('#9fb4c0').multiplyScalar(0.55);
      if (o.id === 'archive.window') return col('#121a24');
      return col(P.glass);
    }
    if (o.id === 'archive.window' || w.id.startsWith('depot.office')) return col('#8a7f74');
    return col(P.glass).lerp(col(P.sky), 0.35);
  }

  /* ---------------- solid blocks and roofs ---------------- */
  private buildBlocks() {
    const b = this.b, P = this.pal, l = this.world.layout;
    for (const bl of l.blocks) {
      if (!inEra(bl.eras, this.era)) continue;
      const r = bl.rect;
      const base = bl.mat === 'masonry' ? P.masonry : bl.mat === 'brick' ? P.brick : P.plaster;
      let c = mul(base, 0.8 + bl.tone * 0.35);
      if (bl.quiet) c = c.lerp(col(P.fog), 0.25);
      const mat: MatKey = bl.mat === 'masonry' ? 'masonry' : bl.mat === 'brick' ? 'brick' : 'plaster';
      let y = bl.h;
      if (bl.h > 0) b.box(r.x0, 0, r.z0, r.x1, bl.h, r.z1, c, mat, { skip: ['ny'], topMul: 0.7 });
      else {
        y = 0;
        for (const w of l.walls) {
          const wr = w.axis === 'x' ? { x: (w.a + w.b) / 2, z: w.c } : { x: w.c, z: (w.a + w.b) / 2 };
          if (wr.x >= r.x0 - 0.5 && wr.x <= r.x1 + 0.5 && wr.z >= r.z0 - 0.5 && wr.z <= r.z1 + 0.5) y = Math.max(y, w.h);
        }
        b.box(r.x0, y - 0.25, r.z0, r.x1, y, r.z1, c, mat, { ao: false, skip: [] }); // roof slab doubles as ceiling
      }
      const roofC = col(P.roof).multiplyScalar(0.9 + bl.tone * 0.2);
      const wdt = r.x1 - r.x0, dpt = r.z1 - r.z0;
      if (bl.roof === 'gable' || bl.roof === 'hip') {
        const rise = Math.min(wdt, dpt) * (bl.roof === 'hip' ? 0.3 : 0.42);
        b.gable(r.x0, r.z0, r.x1, r.z1, y, rise, roofC, 'plain', bl.quiet ? 0.2 : 0.35);
        if (!bl.quiet) this.roofTiles(r.x0, r.z0, r.x1, r.z1, y, rise, roofC);
        if (!bl.quiet && wdt > 5) {
          const cx = (r.x0 + r.x1) / 2 + (wdt > dpt ? wdt * 0.25 : 0), cz = (r.z0 + r.z1) / 2 + (wdt > dpt ? 0 : dpt * 0.25);
          b.box(cx - 0.4, y, cz - 0.3, cx + 0.4, y + rise + 1.2, cz + 0.3, c.clone().multiplyScalar(0.9), 'brick', { ao: false });
          for (const dx of [-0.2, 0.2]) this.inst.frame.add(cx + dx, y + rise + 1.4, cz, 0.16, 0.4, 0.16, 0, col(this.era === 'past' ? '#a0604a' : '#3a3a40'));
        }
      } else if (bl.roof === 'saw') {
        const n = Math.max(2, Math.round(dpt / 4));
        for (let i = 0; i < n; i++) {
          const z0 = r.z0 + (dpt * i) / n, z1 = r.z0 + (dpt * (i + 1)) / n;
          b.quad([[r.x0, y, z1], [r.x1, y, z1], [r.x1, y + 2.2, z0 + 0.2], [r.x0, y + 2.2, z0 + 0.2]], [0, 0.7, 0.7], roofC, 'plain');
          b.box(r.x0, y, z0, r.x1, y + 2.2, z0 + 0.2, this.era === 'present' ? col('#5a6a78') : col('#cdbf9f'), 'glass', { ao: false });
        }
      } else {
        // flat with parapet
        b.box(r.x0, y, r.z0, r.x1, y + 0.6, r.z0 + 0.3, c, mat, { ao: false });
        b.box(r.x0, y, r.z1 - 0.3, r.x1, y + 0.6, r.z1, c, mat, { ao: false });
      }
      if (bl.quiet && this.era === 'present') this.farWindows(bl.rect, bl.h);
    }
  }

  private roofTiles(x0: number, z0: number, x1: number, z1: number, y: number, rise: number, c: THREE.Color) {
    const alongX = x1 - x0 >= z1 - z0;
    const L = alongX ? x1 - x0 : z1 - z0;
    const half = (alongX ? z1 - z0 : x1 - x0) / 2 + 0.35;
    const slope = Math.atan2(rise, half);
    const courses = Math.floor(half / 0.6);
    const tc = c.clone().multiplyScalar(1.12);
    for (let side = -1; side <= 1; side += 2) for (let k = 1; k < courses; k++) {
      const t = k / courses;
      const off = half * (1 - t);
      const yy = y + rise * t + 0.03;
      if (alongX) this.inst.tile.add((x0 + x1) / 2, yy, (z0 + z1) / 2 + side * off, L + 0.6, 0.05, 0.08, 0, tc, side * slope);
      else this.inst.tile.add((x0 + x1) / 2 + side * off, yy, (z0 + z1) / 2, 0.08, 0.05, L + 0.6, 0, tc, 0);
    }
    // ridge
    if (alongX) this.inst.tile.add((x0 + x1) / 2, y + rise + 0.05, (z0 + z1) / 2, L + 0.7, 0.14, 0.2, 0, c.clone().multiplyScalar(0.8));
    else this.inst.tile.add((x0 + x1) / 2, y + rise + 0.05, (z0 + z1) / 2, 0.2, 0.14, L + 0.7, 0, c.clone().multiplyScalar(0.8));
  }

  private farWindows(r: { x0: number; z0: number; x1: number; z1: number }, h: number) {
    const facesStreet = r.z1 <= -6.9 ? 1 : r.z0 >= 6.9 ? -1 : 0;
    if (!facesStreet) return;
    const z = facesStreet > 0 ? r.z1 + 0.02 : r.z0 - 0.02;
    let k = Math.abs(Math.floor(r.x0 * 13.7));
    for (let y = 3.5; y < h - 1.5; y += 3) for (let x = r.x0 + 1.2; x < r.x1 - 1; x += 2.4) {
      k = (k * 1103515245 + 12345) & 0x7fffffff;
      const lit = (k % 100) < 22;
      this.inst.glass.add(x, y, z, 0.9, 1.3, 1, facesStreet > 0 ? 0 : Math.PI, lit ? col('#d9a35e') : col('#1e2838'));
    }
  }

  /* ---------------- facades ---------------- */
  private buildFacade(f: Facade) {
    const b = this.b, P = this.pal, era = this.era;
    const present = era === 'present';
    const dir = f.dir;
    const zf = (d: number) => f.z + dir * d;
    const zz = (d0: number, d1: number): [number, number] => [Math.min(zf(d0), zf(d1)), Math.max(zf(d0), zf(d1))];
    const baseHex = f.kind === 'station' || f.kind === 'archive' || f.kind === 'cinema' ? P.masonry : f.kind === 'depot' ? P.brick : P.plaster;
    const stone = mul(baseHex, 0.95 + f.tone * 0.3);
    const yaw = dir > 0 ? 0 : Math.PI;
    if (f.pilasters) for (const x of [f.x0 + 0.3, f.x1 - 0.3]) { const [a, c] = zz(0, 0.2); b.box(x - 0.3, 0, a, x + 0.3, f.h - 0.5, c, stone, 'masonry'); }
    { const [a, c] = zz(0, 0.12); b.box(f.x0, f.groundH - 0.12, a, f.x1, f.groundH + 0.12, c, stone.clone().multiplyScalar(1.06), 'masonry', { ao: false }); }
    if (f.cornice) {
      const [a, c] = zz(0, 0.32); b.box(f.x0 - 0.15, f.h - 0.8, a, f.x1 + 0.15, f.h - 0.45, c, stone.clone().multiplyScalar(1.08), 'masonry', { ao: false });
      const [a2, c2] = zz(0, 0.48); b.box(f.x0 - 0.25, f.h - 0.45, a2, f.x1 + 0.25, f.h - 0.25, c2, stone.clone().multiplyScalar(0.95), 'masonry', { ao: false });
    }
    // upper windows
    if (f.floors > 1) {
      const floorH = (f.h - f.groundH - 0.9) / (f.floors - 1);
      const n = Math.max(1, Math.floor((f.x1 - f.x0 - 0.8) / 2.5));
      let k = Math.abs(Math.floor(f.x0 * 31 + f.z * 7));
      for (let fl = 1; fl < f.floors; fl++) {
        const yc = f.groundH + (fl - 0.5) * floorH + 0.15;
        const wh = Math.min(1.8, floorH * 0.6), ww = f.kind === 'station' ? 1.4 : 1.1;
        for (let i = 0; i < n; i++) {
          const x = f.x0 + ((i + 0.5) * (f.x1 - f.x0)) / n;
          k = (k * 1103515245 + 12345) & 0x7fffffff;
          const lit = present && (k % 100) / 100 < f.litChance;
          const glassC = present ? (lit ? col(P.glassLit).multiplyScalar(0.75 + (k % 7) * 0.04) : col(P.glass)) : col(P.glass).lerp(col(P.sky), 0.3 + (k % 5) * 0.06);
          this.inst.glass.add(x, yc, zf(0.02), ww, wh, 1, yaw, glassC);
          const fc = col(P.trim).multiplyScalar(present ? 0.7 : 1);
          this.inst.frame.add(x - ww / 2 - 0.07, yc, zf(0.07), 0.14, wh + 0.1, 0.14, yaw, fc);
          this.inst.frame.add(x + ww / 2 + 0.07, yc, zf(0.07), 0.14, wh + 0.1, 0.14, yaw, fc);
          this.inst.frame.add(x, yc + wh / 2 + 0.1, zf(0.09), ww + 0.4, 0.2, 0.18, yaw, stone);
          this.inst.frame.add(x, yc - wh / 2 - 0.06, zf(0.1), ww + 0.3, 0.12, 0.22, yaw, stone);
          this.inst.frame.add(x, yc, zf(0.05), 0.05, wh, 0.05, yaw, fc);
          if (!present && (k % 3) === 0) for (const s of [-1, 1]) this.inst.frame.add(x + s * (ww / 2 + 0.38), yc, zf(0.08), 0.5, wh, 0.05, yaw, col(P.secondary).multiplyScalar(0.9 + (k % 4) * 0.05));
          if (f.balconies && fl === 1 && i % 2 === 0) this.balcony(x, f.groundH + 0.9 + 0.1, dir, zf, yaw, Math.min(2.4, (f.x1 - f.x0) / n - 0.2));
          if (f.balconies && fl === 2 && i % 2 === 1) this.balcony(x, f.groundH + floorH + 0.9, dir, zf, yaw, Math.min(2.2, (f.x1 - f.x0) / n - 0.3));
        }
      }
    }
    // ground floor shopfronts
    if (f.shopWindows) this.shopfront(f, zf, zz, stone);
    if (f.sign && (f.kind === 'shop' || f.kind === 'tenement' || f.kind === 'depot')) {
      const slot = this.atlas.slots.get(`sign.${f.id}.${era}`);
      const txt = era === 'past' ? f.sign.past : f.sign.present;
      if (slot && txt) {
        const segs = this.freeSegments(f);
        const seg = segs.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
        if (seg) {
          const w = Math.min(seg[1] - seg[0] - 0.6, 7);
          const cx = (seg[0] + seg[1]) / 2;
          const y = f.kind === 'depot' ? f.groundH + 0.9 : f.groundH - 0.55;
          const [a, c] = zz(0.02, 0.24);
          b.box(cx - w / 2 - 0.1, y - 0.45, a, cx + w / 2 + 0.1, y + 0.45, c, col(P.secondary).multiplyScalar(0.8), 'wood', { ao: false });
          b.plate(cx, y, zf(0.25), w, w / (384 / 72) > 0.85 ? 0.85 : w / (384 / 72), dir > 0 ? 'pz' : 'nz', col('#ffffff'), present ? 'atlas' : 'atlas', slot);
        }
      }
    }
    if (f.kind === 'rear') this.rearDetails(f, zf);
  }

  private freeSegments(f: Facade): [number, number][] {
    let segs: [number, number][] = [[f.x0 + 0.6, f.x1 - 0.6]];
    for (const [ga, gb] of f.gaps) {
      const next: [number, number][] = [];
      for (const [a, b] of segs) {
        if (gb <= a || ga >= b) { next.push([a, b]); continue; }
        if (ga > a) next.push([a, ga]);
        if (gb < b) next.push([gb, b]);
      }
      segs = next;
    }
    return segs.filter(([a, b]) => b - a > 1.6);
  }

  private shopfront(f: Facade, zf: (d: number) => number, zz: (a: number, b: number) => [number, number], stone: THREE.Color) {
    const b = this.b, P = this.pal, present = this.era === 'present';
    const paint = col(P.secondary).multiplyScalar(0.8 + f.tone * 0.3);
    for (const [s0, s1] of this.freeSegments(f)) {
      const yTop = f.groundH - 1.05;
      const [a, c] = zz(0, 0.16);
      b.box(s0, 0, a, s1, 0.65, c, paint, 'wood'); // stall riser
      b.box(s0, yTop, a, s1, yTop + 0.12, c, paint, 'wood');
      const doorW = 1.0;
      const doorX = s1 - doorW / 2 - 0.15;
      // door recess: dark panel with brass kick plate
      const [da, dc] = zz(-0.02, 0.02);
      b.box(doorX - doorW / 2, 0, da, doorX + doorW / 2, yTop, dc, col(P.shadow).multiplyScalar(present ? 1 : 1.1), 'wood', { ao: false });
      b.box(doorX - doorW / 2 + 0.08, 0.05, Math.min(zf(0.03), zf(0.05)), doorX + doorW / 2 - 0.08, 0.3, Math.max(zf(0.03), zf(0.05)), col(P.brass), 'plain', { ao: false });
      // tile threshold (patterned tile at eye-level paths)
      const [ta, tc] = zz(0, 0.8);
      b.box(doorX - doorW / 2, 0.12, ta, doorX + doorW / 2, 0.14, tc, col('#ffffff').multiplyScalar(present ? 0.55 : 0.95), 'mosaic', { ao: false });
      // display glass
      const g0 = s0 + 0.1, g1 = doorX - doorW / 2 - 0.12;
      if (g1 - g0 > 0.5) {
        const lit = present && ((Math.floor(s0 * 3.1) % 4) === 0);
        const gc = present ? (lit ? col(P.glassLit).multiplyScalar(0.45) : col(P.glass).multiplyScalar(1.1)) : col(P.glass).lerp(col(P.sky), 0.25);
        this.inst.glass.add((g0 + g1) / 2, (0.65 + yTop) / 2, zf(0.09), g1 - g0, yTop - 0.65, 1, f.dir > 0 ? 0 : Math.PI, gc);
        for (let x = g0; x <= g1 + 0.01; x += Math.max(0.8, (g1 - g0) / 3)) this.inst.frame.add(x, (0.65 + yTop) / 2, zf(0.12), 0.06, yTop - 0.65, 0.06, 0, paint);
      }
      // little console brackets under the fascia
      for (const x of [s0 + 0.1, s1 - 0.1]) { const [qa, qc] = zz(0, 0.3); b.box(x - 0.1, yTop + 0.12, qa, x + 0.1, f.groundH - 0.1, qc, stone, 'masonry', { ao: false }); }
    }
  }

  private balcony(x: number, y: number, dir: number, zf: (d: number) => number, yaw: number, w: number) {
    const P = this.pal;
    const slab = col(P.masonry).multiplyScalar(this.era === 'past' ? 1.02 : 0.9);
    this.inst.frame.add(x, y - 0.1, zf(0.55), w, 0.16, 1.1, yaw, slab);
    const iron = col(this.era === 'past' ? '#4a3f4a' : '#1e2733');
    for (let u = -w / 2 + 0.06; u <= w / 2; u += 0.14) this.inst.rail.add(x + u, y + 0.45, zf(1.05), 0.03, 0.9, 0.03, yaw, iron);
    this.inst.rail.add(x, y + 0.92, zf(1.05), w, 0.05, 0.06, yaw, iron);
    for (const s of [-1, 1]) for (let d = 0.12; d < 1.05; d += 0.15) this.inst.rail.add(x + s * w / 2, y + 0.45, zf(d), 0.03, 0.9, 0.03, yaw, iron);
    void dir;
  }

  private rearDetails(f: Facade, zf: (d: number) => number) {
    const b = this.b, P = this.pal;
    const pipe = col(this.era === 'past' ? '#5a5560' : '#2a323e');
    for (let x = f.x0 + 3.5; x < f.x1 - 2; x += 6.5) {
      const z0 = Math.min(zf(0), zf(0.16)), z1 = Math.max(zf(0), zf(0.16));
      b.box(x - 0.07, 0, z0, x + 0.07, f.h - 0.4, z1, pipe, 'plain', { ao: false });
    }
    void P;
  }

  /* ---------------- interiors ---------------- */
  private buildRooms() {
    const b = this.b, P = this.pal, present = this.era === 'present';
    for (const rm of this.world.layout.rooms) {
      if (!inEra(rm.eras, this.era)) continue;
      const r = rm.rect;
      const mat: MatKey = rm.floor === 'mosaic' ? 'mosaic' : rm.floor === 'boards' ? 'wood' : rm.floor === 'setts' ? 'setts' : 'flags';
      let c: THREE.Color;
      if (mat === 'mosaic') c = present ? (rm.id === 'concourse' ? col('#55606c') : col('#8a96a4')) : col('#e8dcc6');
      else if (mat === 'wood') c = present ? mul(P.wood, 1.1) : col('#a8845e');
      else c = mul(P.masonry, present ? 0.75 : 0.95);
      b.box(r.x0, -0.05, r.z0, r.x1, rm.floor === 'flags' || rm.floor === 'setts' ? 0.015 : 0.02, r.z1, c, mat, { ao: false, skip: ['ny'] });
      if (rm.ceil > 0) {
        const cc = mul(P.plaster, present ? 0.5 : 0.75);
        b.box(r.x0, rm.ceil, r.z0, r.x1, rm.ceil + 0.1, r.z1, cc, 'plaster', { ao: false, skip: ['py'] });
      }
    }
    // alley, back lane, court surfaces from regions not covered by rooms
    const l = this.world.layout;
    for (const id of ['loc.alley', 'loc.backlane']) {
      const r = l.regions.find((g) => g.id === id)!.rect;
      b.box(r.x0, -0.05, r.z0, r.x1, 0.01, r.z1, mul(P.masonry, present ? 0.6 : 0.85), 'setts', { ao: false, skip: ['ny'] });
    }
  }

  /* ---------------- station front: board, clock, lettering ---------------- */
  private buildStation() {
    const b = this.b, P = this.pal, l = this.world.layout, era = this.era, present = era === 'present';
    const bd = l.spots['board'];
    const bw = 4.4, bh = 2.2;
    b.box(bd.x - bw / 2 - 0.12, bd.y - bh / 2 - 0.12, bd.z - 0.3, bd.x + bw / 2 + 0.12, bd.y + bh / 2 + 0.12, bd.z - 0.02, col(present ? '#1a2230' : '#3a3030'), 'plain', { ao: false });
    const slot = this.atlas.slots.get(present ? 'board.present' : 'board.past')!;
    b.plate(bd.x, bd.y, bd.z, bw, bh, 'pz', col(present ? '#9aa4b0' : '#ffffff'), present ? 'atlas' : 'atlas', slot);
    // brackets
    for (const s of [-1, 1]) b.box(bd.x + s * (bw / 2 - 0.3) - 0.06, bd.y + bh / 2, bd.z - 0.4, bd.x + s * (bw / 2 - 0.3) + 0.06, bd.y + bh / 2 + 0.9, bd.z - 0.25, col('#2a2a30'), 'plain', { ao: false });
    // clock
    const ck = l.spots['clock'];
    b.box(ck.x - 0.95, ck.y - 0.95, ck.z - 0.3, ck.x + 0.95, ck.y + 0.95, ck.z - 0.02, mul(P.masonry, 1.1), 'masonry', { ao: false });
    b.plate(ck.x, ck.y, ck.z, 1.6, 1.6, 'pz', col('#ffffff'), present ? 'atlasLit' : 'atlas', this.atlas.slots.get(present ? 'clock.present' : 'clock.past'));
    // lettering
    const sx = (l.spots['board'].x);
    const ls = this.atlas.slots.get(present ? 'sign.station.ghost' : 'sign.f.station.past');
    if (ls) b.plate(sx, 7.4, l.street.zN + 0.05, 7.5, 1.4, 'pz', col(present ? '#ffffff' : '#ffffff'), 'atlas', ls);
    if (!present) {
      // inside: diagram, notice, platform sign
      const dg = l.spots['diagram'];
      b.plate(dg.x, dg.y, dg.z, 3.0, 2.06, 'pz', col('#ffffff'), 'atlas', this.atlas.slots.get('diagram'));
      b.box(dg.x - 1.6, dg.y - 1.13, dg.z - 0.05, dg.x + 1.6, dg.y + 1.13, dg.z - 0.01, col('#4a3a30'), 'wood', { ao: false });
      const nt = l.spots['closing.notice'];
      b.plate(nt.x, nt.y, nt.z, 0.7, 0.93, 'nz', col('#ffffff'), 'atlas', this.atlas.slots.get('notice'));
      const pg = l.spots['platform.gate'];
      b.plate(pg.x, 4.1, pg.z + 0.04, 2.4, 0.6, 'pz', col('#ffffff'), 'atlas', this.atlas.slots.get('platforms.sign'));
      // concourse pendant lamps
      for (const dx of [-5, 0, 5]) b.box(bd.x + dx - 0.25, 5.2, bd.z - 9.2, bd.x + dx + 0.25, 5.6, bd.z - 8.7, col('#fff0c8'), 'emissive', { ao: false });
    } else {
      // derelict hall: boarded inner face of the entrance
      const pg = l.spots['platform.gate'];
      b.plate(pg.x, 4.1, pg.z + 0.04, 2.4, 0.6, 'pz', col('#5a5a5a'), 'atlas', this.atlas.slots.get('platforms.sign'));
    }
    // poster position: present poster is animated (see actors), past poster is flat
    if (!present) {
      const ps = l.spots['poster'];
      b.plate(ps.x, ps.y, ps.z, 0.9, 1.2, 'pz', col('#ffffff'), 'atlas', this.atlas.slots.get('poster.past'));
    }
    // depot office: order pinned on the board in the past; a calendar in the present
    const od = l.spots['order'];
    const facing = l.mirror ? 'nx' : 'px';
    b.box(od.x - 0.03, od.y - 0.7, od.z - 0.9, od.x + 0.03, od.y + 0.7, od.z + 0.9, col(present ? '#6a5a48' : '#7a5a40'), 'wood', { ao: false });
    if (present) b.plate(od.x + (l.mirror ? -0.05 : 0.05), od.y, od.z + 0.4, 0.5, 0.68, facing, col('#ffffff'), 'atlas', this.atlas.slots.get('calendar'));
    else b.plate(od.x + (l.mirror ? -0.05 : 0.05), od.y, od.z, 0.62, 0.82, facing, col('#ffffff'), 'atlas', this.atlas.slots.get('order'));
    const offSign = this.atlas.slots.get('depot.office.sign');
    const dn = l.walls.find((w) => w.id === 'depot.office.n')!;
    const doorO = dn.openings[0];
    b.plate((doorO.a + doorO.b) / 2, 2.55, dn.c + 0.27, 1.2, 0.3, 'pz', col('#ffffff'), 'atlas', offSign);
  }

  /* ---------------- street lamps ---------------- */
  readonly practicalLights: THREE.Vector3[] = [];
  private buildLamps() {
    const l = this.world.layout, present = this.era === 'present';
    const iron = col(present ? '#1c2430' : '#3b3540');
    let k = 3;
    for (const p of l.lamps) {
      const side = p.z < 0 ? 1 : -1;
      this.inst.rail.add(p.x, 2.1, p.z, 0.12, 4.2, 0.12, 0, iron);
      this.inst.rail.add(p.x, 0.25, p.z, 0.3, 0.5, 0.3, 0, iron);
      this.inst.rail.add(p.x, 4.2, p.z + side * 0.35, 0.06, 0.06, 0.8, 0, iron);
      k = (k * 1103515245 + 12345) & 0x7fffffff;
      const lit = present && (k % 10) < 7;
      this.inst.lampHead.add(p.x, 3.95, p.z + side * 0.7, 0.32, 0.42, 0.32, 0, lit ? col(PALETTES.present.practical).multiplyScalar(1.15) : col(present ? '#2a3240' : '#d8cfc0'));
      this.inst.rail.add(p.x, 4.22, p.z + side * 0.7, 0.42, 0.08, 0.42, 0, iron);
      if (lit) this.practicalLights.push(new THREE.Vector3(p.x, 3.95, p.z + side * 0.7));
    }
  }

  /* ---------------- cinema / print shop frontage ---------------- */
  private buildCinemaFront() {
    const b = this.b, P = this.pal, l = this.world.layout, present = this.era === 'present';
    const f = l.facades.find((x) => x.id === 'f.cinema')!;
    const aw = l.spots['awning'];
    const z0 = f.z - 2.4, z1 = f.z;
    if (present) {
      // deep awning: dark underside across the top of the opening frame, marquee lettering on the fascia
      b.box(f.x0 + 0.6, 3.3, z0, f.x1 - 0.6, 3.6, z1, col('#141b26'), 'plain', { ao: false });
      b.box(f.x0 + 0.6, 3.6, z0, f.x1 - 0.6, 4.4, z0 + 0.3, col('#232c3a'), 'plain', { ao: false });
      const slot = this.atlas.slots.get('sign.f.cinema.present');
      if (slot) b.plate((f.x0 + f.x1) / 2, 4.0, z0 - 0.01, Math.min(7, f.x1 - f.x0 - 3), 0.72, 'nz', col('#ffffff'), 'atlasLit', slot);
      // bulb row under the fascia
      for (let x = f.x0 + 1; x < f.x1 - 0.8; x += 0.7) this.inst.lampHead.add(x, 3.29, z0 + 0.1, 0.04, 0.04, 0.04, 0, col('#ffd79a'));
      for (const x of [f.x0 + 1, f.x1 - 1]) b.box(x - 0.05, 0, z0 + 0.05, x + 0.05, 3.3, z0 + 0.15, col('#1c2430'), 'plain', { ao: false });
      // loose poster frame by the door
      this.practicalLights.push(new THREE.Vector3(aw.x, 3.1, aw.z));
    } else {
      // canvas blind in faded sage stripes and the printer's fascia
      for (let i = 0; i < 12; i++) {
        const x0 = f.x0 + 1 + ((f.x1 - f.x0 - 2) * i) / 12, x1 = f.x0 + 1 + ((f.x1 - f.x0 - 2) * (i + 1)) / 12;
        b.quad([[x0, 3.0, z0 + 0.8], [x1, 3.0, z0 + 0.8], [x1, 3.8, z1], [x0, 3.8, z1]], [0, 0.8, -0.6], i % 2 ? col(P.secondary) : col(P.paper).multiplyScalar(0.92), 'plain');
        b.quad([[x1, 3.0, z0 + 0.8], [x0, 3.0, z0 + 0.8], [x0, 3.8, z1], [x1, 3.8, z1]], [0, -0.8, 0.6], col(P.shadow), 'plain');
      }
      const slot = this.atlas.slots.get('sign.f.cinema.past');
      if (slot) {
        b.box((f.x0 + f.x1) / 2 - 3.8, 3.9, f.z - 0.25, (f.x0 + f.x1) / 2 + 3.8, 4.4, f.z, col(P.secondary).multiplyScalar(0.8), 'wood', { ao: false });
        b.plate((f.x0 + f.x1) / 2, 4.15, f.z - 0.26, 7.4, 0.46, 'nz', col('#ffffff'), 'atlas', slot);
      }
    }
    // the ticket booth's weak lamp & the cinema interior glow
    void aw;
  }

  private buildCourtyard() {
    const b = this.b, P = this.pal, l = this.world.layout, present = this.era === 'present';
    // downpipe beside the archive window (shared feature)
    const dp = l.spots['downpipe'];
    const pipe = col(present ? '#2b3440' : '#5f5864');
    b.box(dp.x - 0.08, 0, dp.z - 0.16, dp.x + 0.08, 7.5, dp.z, pipe, 'plain', { ao: false });
    b.box(dp.x - 0.18, 0, dp.z - 0.36, dp.x + 0.18, 0.12, dp.z, pipe, 'plain', { ao: false });
    // laundry lines in the past, a satellite of bins and wires in the present
    const ld = l.spots['laundry'];
    const court = l.regions.find((g) => g.id === 'loc.courtyard')!.rect;
    if (!present) {
      for (let i = 0; i < 2; i++) {
        const z = ld.z + i * 2.2;
        b.box(court.x0 + 0.5, ld.y + i * 0.6, z - 0.01, court.x1 - 0.5, ld.y + 0.02 + i * 0.6, z + 0.01, col('#3b3540'), 'plain', { ao: false });
      }
    } else {
      b.box(court.x0 + 0.5, ld.y + 1.8, ld.z - 0.01, court.x1 - 0.5, ld.y + 1.82, ld.z + 0.01, col('#151c26'), 'plain', { ao: false });
    }
    void P;
  }

  /* ---------------- actors, motion, practical lights ---------------- */
  private buildActorsAndFx() {
    const l = this.world.layout, P = this.pal, present = this.era === 'present';
    const aw = l.spots['awning'];
    const f = l.facades.find((x) => x.id === 'f.cinema')!;
    if (present) {
      // the pool of honey light under the cinema awning
      const spot = new THREE.SpotLight(P.practical, 26, 11, 1.05, 0.65, 1.4);
      spot.position.set(aw.x, 3.25, aw.z);
      spot.target.position.set(aw.x, 0, aw.z - 1.2);
      this.scene.add(spot, spot.target);
      const tk = l.spots['ticket.lamp'];
      const tl = new THREE.PointLight(P.practical, 2.2, 4.5, 1.6);
      tl.position.set(tk.x, tk.y + 0.3, tk.z - 0.3);
      this.scene.add(tl);
      const ck = l.spots['clock'];
      const cl = new THREE.PointLight(P.practical, 9, 9, 1.6);
      cl.position.set(ck.x, ck.y - 0.4, ck.z + 0.8);
      this.scene.add(cl);
      const lobby = new THREE.PointLight('#f0b46a', 16, 15, 1.3);
      lobby.position.set((f.x0 + f.x1) / 2, 3.6, f.z + 4.5);
      this.scene.add(lobby);
      const dep = l.rooms.find((r) => r.id === 'depot')!.rect;
      const dl = new THREE.PointLight('#a9c2d0', 14, 20, 1.2);
      dl.position.set((dep.x0 + dep.x1) / 2, 5, (dep.z0 + dep.z1) / 2);
      this.scene.add(dl);
      this.practicalLights.unshift(new THREE.Vector3(tk.x, tk.y, tk.z), new THREE.Vector3(ck.x, ck.y, ck.z));

      this.rain = new Rain(1600, this.practicalLights.slice(0, 6), l.weather.wind);
      this.scene.add(this.rain.mesh);
      const origins: THREE.Vector3[] = [];
      for (let x = f.x0 + 1; x < f.x1 - 1; x += 0.9) origins.push(new THREE.Vector3(x + Math.random() * 0.3, 3.28, f.z - 2.38));
      this.drips = new Drips(origins);
      this.scene.add(this.drips.points);
      this.streaks = new Streaks(this.mats.streak);
      const amber = col(P.practical);
      this.streaks.add(new THREE.Vector3(aw.x, 3.2, aw.z), new THREE.Vector3(aw.x - 1.4, 0, aw.z - 2.6), amber, 1.8, 3.6, 0.7);
      this.streaks.add(new THREE.Vector3(aw.x, 3.2, aw.z), new THREE.Vector3(aw.x + 2.2, 0, aw.z - 2.8), amber, 1.4, 3.2, 0.5);
      this.streaks.add(new THREE.Vector3(ck.x, ck.y, ck.z), new THREE.Vector3(ck.x, 0, ck.z + 4.2), amber, 1.0, 5.5, 0.45);
      for (const p of this.practicalLights.slice(2, 14)) this.streaks.add(p, new THREE.Vector3(p.x, 0, p.z + (p.z < 0 ? 2.2 : -2.2)), amber, 0.8, 3.0, 0.35);
      this.scene.add(this.streaks.group);
      for (const pd of l.weather.puddles) {
        const geo = new THREE.CircleGeometry(pd.r, 18);
        geo.rotateX(-Math.PI / 2);
        geo.scale(1.4, 1, 0.8);
        const m = new THREE.Mesh(geo, this.mats.puddle);
        m.position.set(pd.x, 0.015 + (Math.abs(pd.z) > 4.4 ? 0.12 : 0), pd.z);
        m.renderOrder = 2;
        this.scene.add(m);
        this.disposables.push(geo);
      }
      // the loose poster that lifts in gusts
      const ps = l.spots['poster'];
      const pg = new THREE.PlaneGeometry(0.9, 1.2, 1, 4);
      pg.translate(0, -0.6, 0);
      const pm = new THREE.MeshLambertMaterial({ map: this.atlas.texture, side: THREE.DoubleSide });
      const slot = this.atlas.slots.get('poster.present')!;
      const uv = pg.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, slot.u0 + uv.getX(i) * (slot.u1 - slot.u0), slot.v0 + uv.getY(i) * (slot.v1 - slot.v0));
      this.poster = new THREE.Mesh(pg, pm);
      this.poster.position.set(ps.x, ps.y + 0.6, ps.z + 0.02);
      this.scene.add(this.poster);
      this.disposables.push(pg, pm);
      // clock hand that steps on the relay
      const hg = new THREE.BoxGeometry(0.05, 0.62, 0.02);
      hg.translate(0, 0.28, 0);
      this.clockHand = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: '#3a2412' }));
      this.clockHand.position.set(ck.x, ck.y, ck.z + 0.03);
      const hour = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.02).translate(0, 0.18, 0), this.clockHand.material);
      hour.position.set(ck.x, ck.y, ck.z + 0.025);
      hour.rotation.z = -2.3;
      this.scene.add(this.clockHand, hour);
      this.disposables.push(hg, hour.geometry, this.clockHand.material as THREE.Material);
    } else {
      // interior daylight bounce for rooms
      const add = (x: number, y: number, z: number, c: string, i: number, d: number) => { const p = new THREE.PointLight(c, i, d, 1.5); p.position.set(x, y, z); this.scene.add(p); };
      const conc = l.rooms.find((r) => r.id === 'concourse')!.rect;
      add((conc.x0 + conc.x1) / 2, 6, (conc.z0 + conc.z1) / 2, '#fff1dc', 45, 26);
      const arc = l.rooms.find((r) => r.id === 'archive')!.rect;
      add((arc.x0 + arc.x1) / 2, 3.2, (arc.z0 + arc.z1) / 2, '#fff1dc', 16, 12);
      add((f.x0 + f.x1) / 2, 3.6, f.z + 5, '#fff1dc', 22, 15);
      const dep = l.rooms.find((r) => r.id === 'depot')!.rect;
      add((dep.x0 + dep.x1) / 2, 6, (dep.z0 + dep.z1) / 2, '#fff1dc', 30, 24);
      // tram
      this.tram = buildTram(this.mats.byKey, P.enamel, '#efe3c6', this.atlas.slots.get('tram.blind'));
      this.tram.position.set(200, 0, 0);
      this.scene.add(this.tram);
      // laundry: cloth panels swaying on the courtyard lines
      const ld = l.spots['laundry'];
      const court = l.regions.find((g) => g.id === 'loc.courtyard')!.rect;
      for (let i = 0; i < 2; i++) for (let x = court.x0 + 1.5; x < court.x1 - 1.5; x += 1.3) {
        if (((x * 7 + i * 3) | 0) % 3 === 0) continue;
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.8, 1, 2).translate(0, -0.4, 0), new THREE.MeshLambertMaterial({ color: P.cloth[(Math.abs(x * 3) | 0) % P.cloth.length], side: THREE.DoubleSide }));
        cloth.position.set(x, ld.y + i * 0.6, ld.z + i * 2.2);
        cloth.castShadow = true;
        this.scene.add(cloth);
        this.laundry.push(cloth);
        this.disposables.push(cloth.geometry, cloth.material as THREE.Material);
      }
      // the clerk
      this.clerk = buildFigure('#574958', '#3b2f34');
      const desk = l.spots['desk.slip'];
      this.clerk.root.position.set(desk.x + 0.4, 0, desk.z + 0.9);
      this.clerk.root.rotation.y = Math.PI;
      this.scene.add(this.clerk.root);
      this.clerkWalker = new Walker(this.clerk, 1.3);
    }
  }

  /** Per-frame motion. Allocation-free. */
  update(dt: number, t: number, cam: THREE.Vector3, tramX: number) {
    if (this.rain) this.rain.update(t, cam);
    if (this.streaks) this.streaks.update(cam, t);
    if (this.poster) {
      const gust = Math.max(0, Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.3));
      this.poster.rotation.x = -gust * 0.5 - Math.sin(t * 5.3) * 0.03 * gust;
    }
    if (this.tram) this.tram.position.x = tramX;
    for (let i = 0; i < this.laundry.length; i++) this.laundry[i].rotation.x = Math.sin(t * 1.1 + i * 0.9) * 0.18 + 0.1;
    if (this.sun) {
      // keep the shadow frustum on the player so only nearby silhouettes cast
      const sx = Math.round(cam.x / 2) * 2, sz = Math.round(cam.z / 2) * 2;
      this.sun.target.position.set(sx, 0, sz);
      this.sun.position.set(sx + SUN_OFFSET.x, SUN_OFFSET.y, sz + SUN_OFFSET.z);
      this.sun.target.updateMatrixWorld();
    }
    this.dyn.update(dt, t);
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !(m as any).isInstancedMeshShared) m.geometry.dispose();
    });
    this.disposables.forEach((d) => d.dispose());
    this.rain?.dispose(); this.drips?.dispose(); this.streaks?.dispose();
    this.dyn.dispose();
    if (this.sun?.shadow.map) this.sun.shadow.map.dispose();
    this.scene.traverse((o) => { if ((o as THREE.Light).isLight) (o as THREE.Light).dispose?.(); });
    this.scene.clear();
  }
}

export { lerpHex };
