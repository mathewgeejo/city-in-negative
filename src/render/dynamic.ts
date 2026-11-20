import * as THREE from 'three';
import type { Era } from '../core/types';
import type { World } from '../gen/world';
import type { WorldState } from '../sim/events';
import { crateSpot } from '../sim/sources';
import type { Materials } from './materials';
import { col, type Palette } from './palette';
import type { Atlas, AtlasSlot } from './textures';

export interface Progress { plateLifted: boolean; lockerOpened: boolean }

/** Objects whose presence, position or appearance is derived from history. Rebuilt never; only
 * re-posed by `apply`, so undoing an action restores the exact previous configuration. */
export class Dynamics {
  readonly group = new THREE.Group();
  readonly objects = new Map<string, THREE.Object3D>();
  private geos: THREE.BufferGeometry[] = [];
  private matsOwned: THREE.Material[] = [];
  private water?: THREE.Mesh;
  private lamp?: THREE.Mesh;
  private lampGlow?: THREE.Sprite;
  private gutterSwing?: THREE.Object3D;
  private gutterTarget = 0;
  readonly crate: THREE.Group;
  private crateLabel?: THREE.Mesh;

  constructor(private w: World, readonly era: Era, private mats: Materials, private atlas: Atlas, private pal: Palette) {
    const l = w.layout;
    const present = era === 'present';
    const lam = (c: string) => this.own(new THREE.MeshLambertMaterial({ color: c }));
    const box = (wd: number, h: number, d: number, m: THREE.Material, y0 = 0) => {
      const g = new THREE.BoxGeometry(wd, h, d); g.translate(0, y0 + h / 2, 0); this.geos.push(g);
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = !present; mesh.receiveShadow = !present; return mesh;
    };
    const paper = (slot: AtlasSlot | undefined, wd: number, h: number, lit = false) => {
      const g = new THREE.PlaneGeometry(wd, h);
      if (slot) {
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, slot.u0 + uv.getX(i) * (slot.u1 - slot.u0), slot.v0 + uv.getY(i) * (slot.v1 - slot.v0));
      }
      this.geos.push(g);
      const m = lit ? new THREE.MeshBasicMaterial({ map: atlas.texture }) : new THREE.MeshLambertMaterial({ map: atlas.texture });
      this.own(m);
      return new THREE.Mesh(g, m);
    };
    const setUV = (mesh: THREE.Mesh, slot: AtlasSlot) => {
      const uv = mesh.geometry.attributes.uv as THREE.BufferAttribute;
      const base = [[0, 1], [1, 1], [0, 0], [1, 0]];
      for (let i = 0; i < 4; i++) uv.setXY(i, slot.u0 + base[i][0] * (slot.u1 - slot.u0), slot.v0 + base[i][1] * (slot.v1 - slot.v0));
      uv.needsUpdate = true;
    };
    this.setUV = setUV;
    this.paperFn = paper;

    /* gutter + downpipe head */
    const gs = l.spots['gutter'];
    const metal = lam(present ? '#2a323e' : '#5f5864');
    const gutter = new THREE.Group();
    gutter.position.set(gs.x, gs.y, gs.z);
    const trough = box(3.6, 0.16, 0.22, metal);
    trough.position.x = -1.2 * (l.mirror ? -1 : 1);
    gutter.add(trough);
    const swing = new THREE.Group();
    swing.position.x = 0.6 * (l.mirror ? -1 : 1);
    const sw = box(1.5, 0.16, 0.22, metal);
    sw.position.x = 0.75 * (l.mirror ? -1 : 1);
    swing.add(sw);
    gutter.add(swing);
    this.gutterSwing = swing;
    if (!present) {
      const wg = new THREE.BoxGeometry(0.18, 5.2, 0.05); wg.translate(0, -2.6, 0); this.geos.push(wg);
      const wm = this.own(new THREE.MeshBasicMaterial({ color: '#cfe3f0', transparent: true, opacity: 0.45, depthWrite: false }));
      this.water = new THREE.Mesh(wg, wm);
      this.water.position.set(gs.x + 0.3 * (l.mirror ? -1 : 1), gs.y - 0.1, gs.z - 0.1);
      this.group.add(this.water);
      // the pole you use to swing it, leaning on the wall
      const pole = box(0.06, 6.4, 0.06, lam('#6b4b3a'));
      const gu = l.spots['gutter.use'];
      pole.position.set(gu.x + 0.4, 0, gs.z + 0.25);
      pole.rotation.z = 0.06;
      this.group.add(pole);
    }
    this.group.add(gutter);
    this.objects.set('obj.gutter', gutter);

    /* water stain (present) */
    if (present) {
      const dp = l.spots['downpipe'], aw = l.spots['archive.window'];
      const sg = new THREE.PlaneGeometry(1, 1); this.geos.push(sg);
      const sm = this.own(new THREE.MeshBasicMaterial({ color: '#0c121a', transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
      const stain = new THREE.Mesh(sg, sm);
      const cx = (dp.x + aw.x) / 2;
      stain.position.set(cx, 4.8, aw.z - 0.03);
      stain.scale.set(Math.abs(aw.x - dp.x) + 1.2, 5.4, 1);
      stain.rotation.y = Math.PI;
      stain.rotation.z = (aw.x > dp.x ? 1 : -1) * 0.12;
      this.group.add(stain);
      this.objects.set('obj.stain', stain);
    }

    /* crate (past) */
    this.crate = new THREE.Group();
    const crateBody = box(0.8, 0.6, 0.6, lam(present ? '#4a4038' : '#a88a62'));
    this.crate.add(crateBody);
    for (const y of [0.1, 0.5]) { const s = box(0.82, 0.05, 0.62, lam(present ? '#3a3028' : '#8a6c48'), y); this.crate.add(s); }
    if (!present) {
      this.crateLabel = paper(atlas.slots.get('label.print'), 0.44, 0.22);
      this.crateLabel.position.set(0, 0.33, 0.305);
      this.crate.add(this.crateLabel);
      this.group.add(this.crate);
    }
    this.objects.set('obj.crate', this.crate);

    /* desk papers (past) */
    if (!present) {
      const ds = l.spots['desk.slip'];
      const slip = paper(atlas.slots.get('slip.original'), 0.21, 0.28);
      slip.rotation.x = -Math.PI / 2; slip.rotation.z = 0.1;
      slip.position.set(ds.x, 0.79, ds.z);
      this.group.add(slip);
      this.objects.set('obj.slip', slip);
      const dn = l.spots['desk.note'];
      const note = paper(atlas.slots.get('note'), 0.2, 0.12);
      note.rotation.x = -Math.PI / 2; note.rotation.z = -0.25;
      note.position.set(dn.x, 0.792, dn.z);
      this.group.add(note);
      this.objects.set('obj.note', note);
      const stamp = box(0.08, 0.1, 0.08, lam('#3b2f34'));
      stamp.position.set(ds.x + 0.35, 0.78, ds.z - 0.15);
      this.group.add(stamp);
      // brass plates in every press bay; the plotted bay carries the printer's name
      for (let b = 1; b <= 4; b++) {
        const sp = l.spots[`bay.${b}`];
        const slot = b === w.case.pressBay ? atlas.slots.get('plate') : atlas.slots.get(`bay.${b}`);
        const pl = paper(slot, b === w.case.pressBay ? 0.8 : 0.5, b === w.case.pressBay ? 0.4 : 0.25);
        pl.rotation.x = -Math.PI / 2;
        pl.rotation.z = Math.PI;
        pl.position.set(sp.x, 0.03, sp.z);
        this.group.add(pl);
      }
    }

    /* present: plate + cavity + log box; locker door + stencil; board lamp */
    if (present) {
      const ps = l.spots['plate'];
      const cav = box(0.82, 0.02, 0.42, this.own(new THREE.MeshBasicMaterial({ color: '#06080c' })));
      cav.position.set(ps.x, 0.005, ps.z);
      this.group.add(cav);
      const plate = paper(atlas.slots.get('plate'), 0.8, 0.4);
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(ps.x, 0.03, ps.z);
      this.group.add(plate);
      this.objects.set('obj.plate', plate);
      const logBox = box(0.5, 0.14, 0.32, lam('#3d3530'));
      this.group.add(logBox);
      this.objects.set('obj.logbox', logBox);
      const ls = l.spots['depot.locker'];
      const lockerX = ls.x, lockerZ = ls.z - 0.85;
      const doorPivot = new THREE.Group();
      doorPivot.position.set(lockerX - 0.39, 0.08, lockerZ + 0.31);
      const door = box(0.78, 1.84, 0.03, lam('#46626a'));
      door.position.x = 0.39;
      doorPivot.add(door);
      const num = paper(atlas.slots.get(`locker.${w.case.lockerNo}`), 0.36, 0.24);
      num.position.set(0.39, 1.4, 0.02);
      doorPivot.add(num);
      const stencil = paper(atlas.slots.get('stencil.transfer'), 0.5, 0.42);
      stencil.position.set(0.39, 0.75, 0.02);
      (stencil.material as THREE.MeshLambertMaterial).transparent = true;
      doorPivot.add(stencil);
      this.objects.set('obj.stencil', stencil);
      this.group.add(doorPivot);
      this.objects.set('obj.lockerdoor', doorPivot);
      // board lamp: the one bulb that still lights each night
      const bd = l.spots['board'];
      const lg = new THREE.CircleGeometry(0.17, 16); this.geos.push(lg);
      this.lamp = new THREE.Mesh(lg, this.own(new THREE.MeshBasicMaterial({ color: '#ffd38a' })));
      const ly = w.case.answerPlatform === 1 ? bd.y + 0.4675 : bd.y - 0.289;
      this.lamp.position.set(bd.x + 1.84, ly, bd.z + 0.015);
      this.group.add(this.lamp);
      this.lampGlow = new THREE.Sprite(this.own(mats.glow.clone()));
      this.lampGlow.position.copy(this.lamp.position).add(new THREE.Vector3(0, 0, 0.1));
      this.lampGlow.scale.set(1.3, 1.3, 1);
      this.group.add(this.lampGlow);
      // clock glow
      const ck = l.spots['clock'];
      const cg = new THREE.Sprite(mats.glow);
      cg.position.set(ck.x, ck.y, ck.z + 0.2);
      cg.scale.set(3.6, 3.6, 1);
      this.group.add(cg);
      // right of way plaque
      const gs2 = l.spots['gate'];
      const pq = paper(atlas.slots.get('rightofway'), 0.9, 0.34);
      const alley = l.regions.find((r) => r.id === 'loc.alley')!.rect;
      pq.position.set(alley.x1 - 0.02, 1.8, gs2.z + 1.0);
      pq.rotation.y = -Math.PI / 2;
      this.group.add(pq);
      this.objects.set('obj.plaque', pq);
    }

    /* alley gate (both eras) */
    {
      const gs = l.spots['gate'];
      const alley = l.regions.find((r) => r.id === 'loc.alley')!.rect;
      const pivot = new THREE.Group();
      pivot.position.set(alley.x0 + 0.25, 0, gs.z);
      const iron = lam(present ? '#1f2833' : '#3b2f34');
      const width = alley.x1 - alley.x0 - 0.5;
      for (let u = 0.1; u < width; u += 0.16) { const bar = box(0.035, 2.1, 0.035, iron); bar.position.x = u; pivot.add(bar); }
      for (const y of [0.15, 1.0, 1.95]) { const r = box(width, 0.07, 0.05, iron, y); r.position.x = width / 2; pivot.add(r); }
      this.group.add(pivot);
      this.objects.set('obj.gate', pivot);
      if (present) {
        const chain = box(0.12, 0.3, 0.12, lam('#6a5a40'), 0.9);
        chain.position.set(alley.x1 - 0.35, 0, gs.z + 0.08);
        this.group.add(chain);
        this.objects.set('obj.chain', chain);
      } else {
        const brick = box(0.22, 0.08, 0.11, lam('#b98b6d'));
        brick.position.set(alley.x0 + 0.9, 0, gs.z - 1.1);
        this.group.add(brick);
        this.objects.set('obj.brick', brick);
      }
    }
  }

  private setUV: (m: THREE.Mesh, s: AtlasSlot) => void;
  private paperFn: (slot: AtlasSlot | undefined, w: number, h: number, lit?: boolean) => THREE.Mesh;

  private own<T extends THREE.Material>(m: T): T { this.matsOwned.push(m); return m; }

  /** Pose every history-dependent object from the derived world state. */
  apply(ws: WorldState, pr: Progress) {
    const l = this.w.layout, c = this.w.case;
    const present = this.era === 'present';
    const o = (id: string) => this.objects.get(id);
    // gutter: straight to the downpipe, or swung toward the archive window
    const redirected = present ? ws.present.gutterBent : ws.past.gutterRedirected;
    this.gutterTarget = redirected ? (present ? 0.5 : 0.7) * (l.mirror ? -1 : 1) : 0;
    if (this.water) this.water.visible = redirected;
    const stain = o('obj.stain') as THREE.Mesh | undefined;
    if (stain) (stain.material as THREE.MeshBasicMaterial).opacity = ws.present.stain === 'heavy' ? 0.62 : 0.28;

    if (!present) {
      const sp = l.spots[crateSpot(ws)];
      const off = ws.past.cratePlace === 'print' ? -0.55 : 0;
      this.crate.position.set(sp.x, 0, sp.z + off);
      this.crate.rotation.y = ws.past.cratePlace === 'depot' ? (l.mirror ? -1 : 1) * Math.PI / 2 : 0;
      this.crate.visible = true;
      if (this.crateLabel) this.setUV(this.crateLabel, this.atlas.slots.get(`label.${ws.past.labelShows}`)!);
      const slip = o('obj.slip') as THREE.Mesh;
      const route = ws.past.cratePlace === 'archive' ? ws.past.labelShows : ws.past.cratePlace;
      this.setUV(slip, this.atlas.slots.get(ws.past.slip === 'duplicate' ? `slip.dup.${route}` : 'slip.original')!);
      o('obj.note')!.visible = ws.past.noteOnDesk;
      const gate = o('obj.gate')!;
      gate.rotation.y = ws.past.gateOpen ? 1.45 : 0;
      o('obj.brick')!.visible = ws.past.gateOpen;
    } else {
      const plate = o('obj.plate')!;
      const ps = l.spots['plate'];
      plate.position.set(ps.x + (pr.plateLifted ? 0.7 : 0), pr.plateLifted ? 0.05 : 0.03, ps.z + (pr.plateLifted ? 0.15 : 0));
      plate.rotation.z = Math.PI + (pr.plateLifted ? 0.4 : 0);
      const logBox = o('obj.logbox')!;
      const ls = l.spots['depot.locker'];
      if (ws.present.logAt === 'cinema.plate') { logBox.position.set(ps.x, -0.12, ps.z); logBox.visible = pr.plateLifted; }
      else if (ws.present.logAt === 'depot.locker') { logBox.position.set(ls.x, 0.94, ls.z - 0.85); logBox.visible = pr.lockerOpened; }
      else logBox.visible = false;
      if (logBox.visible && ws.present.logAt === 'cinema.plate') logBox.position.y = 0.0;
      const door = o('obj.lockerdoor')!;
      door.rotation.y = pr.lockerOpened ? -1.9 : 0;
      o('obj.stencil')!.visible = ws.present.lockerStencil === 'transfer';
      const gateOpen = ws.present.gateOpen;
      o('obj.gate')!.visible = !gateOpen;
      o('obj.chain')!.visible = !gateOpen;
      o('obj.plaque')!.visible = gateOpen;
    }
    void c;
  }

  update(dt: number, t: number) {
    if (this.gutterSwing) this.gutterSwing.rotation.y += (this.gutterTarget - this.gutterSwing.rotation.y) * Math.min(1, dt * 3);
    if (this.water && this.water.visible) this.water.scale.x = 0.85 + Math.sin(t * 13) * 0.15;
    if (this.lamp) {
      const f = 0.92 + Math.sin(t * 2.1) * 0.03 + (Math.sin(t * 17.3) > 0.97 ? -0.25 : 0);
      (this.lamp.material as THREE.MeshBasicMaterial).color.setRGB(1 * f, 0.83 * f, 0.54 * f);
      if (this.lampGlow) this.lampGlow.material.opacity = f;
    }
  }

  dispose() {
    this.geos.forEach((g) => g.dispose());
    this.matsOwned.forEach((m) => m.dispose());
    void this.pal; void this.mats; void this.paperFn;
  }
}

export const colFor = col;
