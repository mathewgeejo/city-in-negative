import * as THREE from 'three';
import { type Era, otherEra } from '../core/types';
import { routeName } from '../gen/history';
import { regionAt } from '../gen/layout';
import { generateWorld, type World } from '../gen/world';
import { buildAtlas } from '../render/atlasContent';
import { EraScene, type ShadowQuality } from '../render/eraScene';
import { Materials } from '../render/materials';
import { Renderer } from '../render/renderer';
import type { Atlas } from '../render/textures';
import { collidersFor, blocked } from '../sim/collision';
import { type ActionId, type Actions, type DerivedHistory, evaluateHistory, NO_ACTIONS, worldState, type WorldState } from '../sim/events';
import { type DocId, docView, type Theory } from '../sim/evidence';
import { type Crossing, crossing, crossingSafe, DOC_SOURCES, sideOf } from '../sim/sources';
import type { UI } from '../ui/ui';
import { Audio } from './audio';
import { Director } from './director';
import { buildInteractables, type Interactable } from './interactions';
import { Input, Player } from './player';
import { clearPhotos, loadSettings, type PrintMeta, putPhoto, type SaveData, type Settings, writeSave, writeSettings } from './save';

export interface DocEntry { id: DocId; at: number; ws: WorldState; viaPrint?: string }

const V = new THREE.Vector3(), V2 = new THREE.Vector3(), FWD = new THREE.Vector3();

export class Game {
  readonly renderer: Renderer;
  readonly mats = new Materials();
  readonly input: Input;
  readonly player = new Player();
  readonly audio = new Audio();
  readonly director = new Director(this);
  ui!: UI;
  settings: Settings = loadSettings();

  world!: World;
  atlas!: Atlas;
  scenes!: Record<Era, EraScene>;
  era: Era = 'present';
  actions: Actions = { ...NO_ACTIONS };
  hist!: DerivedHistory;
  ws!: WorldState;
  docs = new Map<DocId, DocEntry>();
  prints: PrintMeta[] = [];
  pinned: string[] = [];
  theory: Theory = { evidence: {} };
  progress = { plateLifted: false, lockerOpened: false, solved: false, tutorial: 0, tramSeen: false };
  playTime = 0;

  vf = { up: false, k: 0, viable: null as Crossing | null, ghost: { x: 0, y: 0, mix: 0 } };
  held: { meta: PrintMeta; url: string } | null = null;
  heldAlign = { ok: false, score: 0, dx: 0, dy: 0, s: 1, visible: false, cr: null as Crossing | null };
  interactables: Interactable[] = [];
  focus: Interactable | null = null;
  tram = { x: 400, dir: -1, speed: 6.5, running: false, armed: false, wait: 0, bells: 0 };
  private relayT = 4;
  private relayCaptions = 0;
  private transition: { t: number; cr: Crossing; switched: boolean } | null = null;
  private saveT = 0;
  private capturing = false;
  running = false;
  uiOpen = false;
  private last = 0;
  private visitedPast = false;
  readonly perf = { frame: new Float32Array(600), cpu: new Float32Array(600), vf: new Uint8Array(600), i: 0 };
  private rectsCache: { key: string; rects: ReturnType<typeof collidersFor> } = { key: '', rects: [] };

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    addEventListener('resize', () => this.renderer.resize());
    this.applySettings();
  }

  applySettings() {
    const s = this.settings;
    this.player.sensitivity = s.sensitivity;
    this.player.headBob = s.headBob;
    this.player.invertY = s.invertY;
    this.audio.setVolume(s.volume);
    if (this.renderer.renderScale !== s.renderScale) { this.renderer.renderScale = s.renderScale; this.renderer.resize(); }
    if (this.scenes) for (const sc of Object.values(this.scenes)) sc.setShadowQuality(s.shadows);
    this.renderer.gl.shadowMap.enabled = s.shadows !== 'off';
    writeSettings(s);
  }

  /* ---------------- world lifecycle ---------------- */

  persist = false;

  async load(seed: string, save?: SaveData | null, persist = true) {
    this.persist = persist;
    this.disposeWorld();
    this.world = generateWorld(seed);
    this.actions = { ...(save?.actions ?? NO_ACTIONS) };
    this.derive();
    this.atlas = buildAtlas(this.world.case, this.world.layout);
    this.mats.setAtlas(this.atlas.texture);
    const q = this.settings.shadows as ShadowQuality;
    this.scenes = {
      present: new EraScene(this.renderer.gl, this.world, 'present', this.mats, this.atlas, this.ws, q),
      past: new EraScene(this.renderer.gl, this.world, 'past', this.mats, this.atlas, this.ws, q),
    };
    this.interactables = buildInteractables(this);
    this.docs = new Map((save?.docs ?? []).map((d: any) => [d.id, { id: d.id, at: d.at, ws: d.ws ?? this.ws, viaPrint: d.viaPrint }]));
    this.prints = save?.prints ?? [];
    this.pinned = save?.pinned ?? [];
    this.theory = save?.theory ?? { evidence: {} };
    this.progress = { ...{ plateLifted: false, lockerOpened: false, solved: false, tutorial: 0, tramSeen: false }, ...(save?.progress ?? {}) };
    this.playTime = save?.playTime ?? 0;
    this.held = null;
    this.vf.up = false; this.vf.k = 0;
    this.tram = { x: 400, dir: -1, speed: 6.5, running: false, armed: this.progress.tutorial >= 2, wait: 6, bells: 0 };
    this.refreshDynamics();
    const l = this.world.layout;
    if (save) {
      this.era = save.era;
      this.player.place(save.pos.x, save.pos.z, save.pos.yaw, save.pos.pitch);
      this.ensureValidPosition();
      if (save.heldPrint) { const m = this.prints.find((p) => p.id === save.heldPrint); if (m) void this.holdPrint(m); }
    } else {
      this.era = 'present';
      this.player.place(l.start.x, l.start.z, l.start.yaw, l.start.pitch);
    }
    this.visitedPast = this.era === 'past' || this.prints.some((p) => p.era === 'past');
    // compile both eras up front so the first raise of the camera doesn't hitch
    this.player.apply(this.renderer.camera);
    this.renderer.gl.compile(this.scenes.present.scene, this.renderer.camera);
    this.renderer.gl.compile(this.scenes.past.scene, this.renderer.camera);
    this.ui?.onWorldLoaded();
    this.save();
  }

  disposeWorld() {
    if (!this.scenes) return;
    this.director.abort();
    this.scenes.present.dispose();
    this.scenes.past.dispose();
    this.atlas.dispose();
    if (this.held) URL.revokeObjectURL(this.held.url);
    this.held = null;
    (this.scenes as any) = undefined;
    this.renderer.gl.renderLists.dispose();
  }

  async newGame(seed: string) {
    await clearPhotos().catch(() => {});
    await this.load(seed, null);
  }

  /** Re-derive the present from seed + actions. */
  derive() {
    this.hist = evaluateHistory(this.world.case, this.actions);
    this.ws = worldState(this.world.case, this.hist, this.actions);
  }

  refreshDynamics() {
    if (!this.scenes) return;
    for (const sc of Object.values(this.scenes)) sc.dyn.apply(this.ws, this.progress);
    const aw = this.world.layout.spots['archive.window'];
    this.audio.setTrickle(this.ws.past.gutterRedirected, aw.x, 3, aw.z - 0.5);
  }

  setAction(id: ActionId, value: boolean) {
    if (this.director.busy && (id === 'gutter' || id === 'label')) return;
    const prev = this.ws;
    const prevFired = new Map(this.hist.fired.map((f) => [f.id, f.text]));
    this.actions = { ...this.actions, [id]: value };
    this.derive();
    this.refreshDynamics();
    const c = this.world.case;
    const local: Record<ActionId, [string, string]> = {
      gutter: ['You lever the gutter joint round with the pole. It now spills toward the archive window.', 'You swing the gutter back over the downpipe.'],
      label: [`You swap the brass-framed label. It now reads ${routeName(c, this.ws.past.labelShows).toUpperCase()}.`, `You swap the label back: ${routeName(c, this.ws.past.labelShows).toUpperCase()}.`],
      note: [`You leave a note on the clerk's blotter about Order ${c.orderNo}.`, 'You take your note back.'],
      gate: ['The bolt slides. You prop the gate open with a brick.', 'You close the gate and shoot the bolt.'],
    };
    if (!(id === 'gutter' && value)) this.caption(local[id][value ? 0 : 1]);
    this.director.onChange(prev, this.ws);
    const changes = this.hist.fired.filter((f) => f.year > c.pastYear && prevFired.get(f.id) !== f.text).map((f) => `${f.year}: ${f.text}`);
    const removed = [...prevFired.keys()].filter((k) => !this.hist.fired.some((f) => f.id === k));
    if (changes.length || removed.length) this.ui.historyToast(changes.length ? changes : ['A later consequence no longer happens.']);
    this.save();
  }

  hasDoc(id: DocId) { return this.docs.has(id); }

  acquire(id: DocId, viaPrint?: string, quiet = false) {
    const existing = this.docs.get(id);
    if (existing && !(id === 'doc.slip' || id === 'doc.stencil')) return;
    this.docs.set(id, { id, at: Date.now(), ws: JSON.parse(JSON.stringify(this.ws)), viaPrint: viaPrint ?? existing?.viaPrint });
    if (!existing && !quiet) this.ui.toast(`In your journal: ${docView(this.world.case, id, this.ws).title}`);
    this.save();
  }

  takeBox() {
    const c = this.world.case;
    this.acquire('doc.log');
    if (this.ws.present.boxHasOrder) this.acquire('doc.order');
    this.say(`Inside the box: the station's signal log${this.ws.present.boxHasOrder ? `, and a carbon copy of Maintenance Order ${c.orderNo}` : ''}.`);
    this.ui.openDoc('doc.log');
  }

  say(text: string, speaker?: string) { this.ui.subtitle(text, speaker); }
  caption(text: string) { if (this.settings.captions) this.ui.subtitle(text, undefined, true); }

  /* ---------------- camera, prints, passages ---------------- */

  toggleCamera() {
    if (this.transition) return;
    this.vf.up = !this.vf.up;
    if (this.vf.up && this.held) this.held = null;
    if (this.vf.up && this.progress.tutorial === 0) {
      this.progress.tutorial = 1;
      // the opening tram: already approaching, from the side the player faces
      const l = this.world.layout;
      const side = Math.sign(l.spots['clock'].x - this.player.x) || 1;
      this.tram.x = this.player.x + side * 48;
      this.tram.dir = -side;
      this.tram.running = true;
      this.tram.armed = true;
      this.tram.bells = 0;
      this.tram.speed = 5.5;
    }
    this.ui.setViewfinder(this.vf.up);
  }

  async takePhoto() {
    if (!this.vf.up || this.vf.k < 0.85 || this.capturing) return;
    this.capturing = true;
    const other = otherEra(this.era);
    const canvas = this.renderer.capture(this.scenes[other].scene, 960);
    this.audio.ui('shutter');
    this.ui.flash(this.settings.reduceFlashes);
    const l = this.world.layout;
    const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const viable = this.vf.viable;
    const loc = regionAt(l, this.player.x, this.player.z);
    const docs = this.docsInFrame(other);
    const meta: PrintMeta = {
      id, seed: this.world.seed, era: other, takenFrom: this.era,
      pose: { x: this.player.x, y: this.player.eye, z: this.player.z, yaw: this.player.yaw, pitch: this.player.pitch },
      location: loc, locationLabel: l.regions.find((r) => r.id === loc)?.label ?? 'Tram Street',
      anchorId: viable?.anchor.id,
      actions: { ...this.actions },
      clues: this.clueSnapshot(other, true),
      docs,
      caption: '',
      time: Date.now(),
      thumb: thumbFrom(canvas),
    };
    if (viable) {
      const a = viable.anchor;
      V.set(a.x, Math.min(a.height * 0.5, 1.8), a.z);
      this.renderer.project(V, V2);
      meta.anchorScreen = { x: V2.x, y: V2.y, dist: Math.hypot(a.x - this.player.x, a.z - this.player.z) };
    }
    const year = other === 'past' ? this.world.case.pastYear : this.world.case.presentYear;
    meta.caption = `${meta.locationLabel}, ${year}${viable ? ` · ${viable.anchor.label.toLowerCase()}` : ''}${docs.length ? ` · ${docs.map((d) => docView(this.world.case, d, this.ws).title.toLowerCase()).join(', ')}` : ''}`;
    this.prints.unshift(meta);
    for (const d of docs) this.acquire(d, id);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
    if (blob) await putPhoto(id, blob).catch(() => {});
    this.capturing = false;
    if (viable) {
      this.vf.up = false;
      this.ui.setViewfinder(false);
      await this.holdPrint(meta);
      if (this.progress.tutorial < 3) this.progress.tutorial = 3;
    } else this.ui.toast(`Print developed: ${meta.caption}`);
    this.save();
  }

  async holdPrint(meta: PrintMeta) {
    const { getPhoto } = await import('./save');
    const blob = await getPhoto(meta.id).catch(() => undefined);
    const url = blob ? URL.createObjectURL(blob) : meta.thumb;
    if (this.held && this.held.url.startsWith('blob:')) URL.revokeObjectURL(this.held.url);
    this.held = { meta, url };
    this.ui.setHeld(url);
  }

  releasePrint() { if (this.held) { if (this.held.url.startsWith('blob:')) URL.revokeObjectURL(this.held.url); this.held = null; this.ui.setHeld(null); } }

  /** Which document sources of `era` are legible inside the viewfinder right now. */
  private docsInFrame(era: Era): DocId[] {
    const l = this.world.layout, r = this.renderer.viewfinderRect();
    const out = new Set<DocId>();
    for (const s of DOC_SOURCES) {
      if (!s.photo || s.era !== era || (s.when && !s.when(this.ws))) continue;
      const sp = l.spots[s.spot];
      const d = Math.hypot(sp.x - this.player.x, sp.z - this.player.z);
      const range = s.spot === 'board' ? 16 : s.spot === 'diagram' ? 8 : 5.5;
      if (d > range) continue;
      V.set(sp.x, sp.y, sp.z);
      this.renderer.project(V, V2);
      if (V2.z > 1 || V2.x < r.x + r.w * 0.08 || V2.x > r.x + r.w * 0.92 || V2.y < r.y + r.h * 0.08 || V2.y > r.y + r.h * 0.92) continue;
      out.add(s.doc);
    }
    return [...out];
  }

  /** Frozen description of history-dependent objects for an era (optionally only those in frame). */
  clueSnapshot(era: Era, inFrame: boolean, ws = this.ws): Record<string, string> {
    const l = this.world.layout, c = this.world.case;
    const objs: [string, string, string][] = era === 'past'
      ? [
        ['Records box', ws.past.cratePlace === 'archive' ? 'crate.archive' : ws.past.cratePlace === 'print' ? 'plate' : 'depot.shelf', `${ws.past.cratePlace === 'archive' ? 'in the archive' : ws.past.cratePlace === 'print' ? 'in the print shop press bay' : `on depot shelf ${c.shelfCode}`}, label ${routeName(c, ws.past.labelShows)}`],
        ['Gutter', 'gutter', ws.past.gutterRedirected ? 'swung toward the archive window' : 'running to the downpipe'],
        ['Dispatch slip', 'desk.slip', ws.past.slip === 'duplicate' ? 'stamped duplicate' : 'original'],
        ['Note', 'desk.note', ws.past.noteOnDesk ? 'on the blotter' : 'none'],
        ['Alley gate', 'gate', ws.past.gateOpen ? 'propped open' : 'bolted'],
      ]
      : [
        ['Brass plate', 'plate', ws.present.logAt === 'cinema.plate' ? 'loose, a box beneath' : 'screwed down, empty beneath'],
        [`Locker ${c.lockerNo}`, 'depot.locker', `${ws.present.lockerStencil === 'transfer' ? `stencilled EX STORES ${c.shelfCode}` : 'plain'}, ${ws.present.logAt === 'depot.locker' ? 'a box inside' : 'empty'}`],
        ['Alley gate', 'gate', ws.present.gateOpen ? 'gone, a right of way' : 'chained shut'],
        ['Archive stain', 'downpipe', ws.present.stain],
        ['Gutter', 'gutter', ws.present.gutterBent ? 'bent toward the window' : 'straight'],
      ];
    const out: Record<string, string> = {};
    const r = this.renderer.viewfinderRect();
    for (const [name, spot, state] of objs) {
      if (inFrame) {
        const sp = l.spots[spot];
        if (Math.hypot(sp.x - this.player.x, sp.z - this.player.z) > 20) continue;
        V.set(sp.x, sp.y || 0.5, sp.z);
        this.renderer.project(V, V2);
        if (V2.z > 1 || V2.x < r.x || V2.x > r.x + r.w || V2.y < r.y || V2.y > r.y + r.h) continue;
      }
      out[name] = state;
    }
    return out;
  }

  /** Differences between a print's frozen clue state and the street as it is now. */
  contradictions(p: PrintMeta): { name: string; then: string; now: string }[] {
    const now = this.clueSnapshot(p.era, false);
    return Object.entries(p.clues).filter(([k, v]) => now[k] !== undefined && now[k] !== v).map(([k, v]) => ({ name: k, then: v, now: now[k] }));
  }

  private findViable(): Crossing | null {
    let best: Crossing | null = null, bestScore = Infinity;
    const r = this.renderer.viewfinderRect();
    for (const a of this.world.anchors) {
      const d = Math.hypot(a.x - this.player.x, a.z - this.player.z);
      if (d < 1.2 || d > 9.5) continue;
      const side = sideOf(a, this.player.x, this.player.z);
      const cr = crossing(a, this.era, side);
      if (!crossingSafe(this.world.layout, cr, this.ws)) continue;
      V.set(a.x, Math.min(a.height * 0.5, 1.8), a.z);
      this.renderer.project(V, V2);
      if (V2.z > 1) continue;
      const ox = (V2.x - (r.x + r.w / 2)) / r.w, oy = (V2.y - (r.y + r.h / 2)) / r.h;
      const score = Math.hypot(ox, oy);
      // must be facing the opening, not walking away from it
      const fx = Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
      const toA = ((a.x - this.player.x) * fx + (a.z - this.player.z) * fz) / d;
      if (toA < 0.55) continue;
      if (score < bestScore) { bestScore = score; best = cr; this.vf.ghost.x = ox; this.vf.ghost.y = oy; }
    }
    if (best && bestScore > 0.3) { this.vf.ghost.mix = 0.5; return null; }
    if (!best) { this.vf.ghost.mix = 0; return null; }
    this.vf.ghost.mix = 0.5 * Math.min(1, bestScore / 0.3);
    return best;
  }

  private updateHeld() {
    const h = this.held, al = this.heldAlign;
    al.ok = false; al.visible = false; al.cr = null;
    if (!h || !h.meta.anchorId || !h.meta.anchorScreen || h.meta.takenFrom !== this.era) return;
    const a = this.world.anchors.find((x) => x.id === h.meta.anchorId);
    if (!a) return;
    const d = Math.hypot(a.x - this.player.x, a.z - this.player.z);
    if (d > 12) return;
    V.set(a.x, Math.min(a.height * 0.5, 1.8), a.z);
    this.renderer.project(V, V2);
    if (V2.z > 1) return;
    al.visible = true;
    al.dx = V2.x - h.meta.anchorScreen.x;
    al.dy = V2.y - h.meta.anchorScreen.y;
    al.s = THREE.MathUtils.clamp(h.meta.anchorScreen.dist / Math.max(0.5, d), 0.5, 2);
    const r = this.renderer.viewfinderRect();
    const off = Math.hypot(al.dx, al.dy) / r.w;
    const side = sideOf(a, this.player.x, this.player.z);
    const cr = crossing(a, this.era, side);
    const safe = crossingSafe(this.world.layout, cr, this.ws);
    al.score = Math.max(0, 1 - off / 0.25) * Math.max(0, 1 - Math.abs(Math.log(al.s)) / 0.45);
    // generous tolerance: within ~12% of the frame and ±30% scale
    al.ok = safe && off < 0.12 && al.s > 0.74 && al.s < 1.35 && d < 7.5;
    if (al.ok) al.cr = cr;
  }

  private beginCross(cr: Crossing) {
    if (this.transition) return;
    this.transition = { t: 0, cr, switched: false };
    this.audio.ui('cross');
    this.ui.crossFx(true, this.settings.reduceFlashes);
  }

  private updateTransition(dt: number) {
    const tr = this.transition!;
    tr.t += dt;
    if (!tr.switched && tr.t > 0.45) {
      tr.switched = true;
      if (this.director.busy) this.director.abort();
      this.era = tr.cr.to;
      this.player.place(tr.cr.landing.x, tr.cr.landing.z, this.player.yaw, this.player.pitch);
      this.releasePrint();
      this.ui.crossFx(false, this.settings.reduceFlashes);
      const c = this.world.case;
      if (this.era === 'past' && !this.visitedPast) {
        this.visitedPast = true;
        this.progress.tutorial = Math.max(this.progress.tutorial, 4);
        setTimeout(() => this.say(`Late August, ${c.pastYear}. The afternoon after the station closed. Raise the camera here to see your own time.`), 400);
      } else this.caption(this.era === 'past' ? `${c.pastYear}, late summer.` : `${c.presentYear}, a rainy evening.`);
      this.save();
    }
    if (tr.t > 1.0) this.transition = null;
  }

  private updateTram(dt: number) {
    const tr = this.tram;
    if (!tr.armed) return;
    if (tr.running) {
      tr.x += tr.dir * tr.speed * dt;
      const rel = (this.player.x - tr.x) * tr.dir; // >0 while approaching
      const bell = (i: number, cond: boolean) => {
        if (cond && !(tr.bells & (1 << i))) {
          tr.bells |= 1 << i;
          this.audio.bell('past', tr.x, 3, 0);
          if (this.settings.captions && (this.vf.up || this.era === 'past')) this.caption(`Tram bell, ${this.dirWord(tr.x, 0)}.`);
          else if (this.settings.captions && i === 0) this.caption(`A tram bell, faint, ${this.dirWord(tr.x, 0)}. Only the camera shows it.`);
        }
      };
      bell(0, rel < 46);
      bell(1, rel < 14);
      bell(2, rel < -10);
      if (Math.abs(tr.x) > 100) {
        tr.running = false;
        tr.wait = 26 + Math.random() * 14;
        this.progress.tramSeen = true;
        if (this.progress.tutorial === 1) this.progress.tutorial = 2;
      }
    } else {
      tr.wait -= dt;
      if (tr.wait <= 0) { tr.running = true; tr.dir = -tr.dir; tr.x = -tr.dir * 98; tr.bells = 0; tr.speed = 6.5; }
    }
  }

  dirWord(x: number, z: number): string {
    const fx = Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    const dx = x - this.player.x, dz = z - this.player.z;
    const f = dx * fx + dz * fz, s = dx * -fz + dz * fx;
    const ang = Math.atan2(s, f) * (180 / Math.PI);
    return Math.abs(ang) < 30 ? 'ahead' : Math.abs(ang) > 140 ? 'behind you' : ang > 0 ? (Math.abs(ang) < 70 ? 'ahead right' : 'to your right') : (Math.abs(ang) < 70 ? 'ahead left' : 'to your left');
  }

  private rects() {
    const open = this.era === 'past' ? this.ws.past.gateOpen : this.ws.present.gateOpen;
    const key = `${this.era}:${open}`;
    if (this.rectsCache.key !== key) this.rectsCache = { key, rects: collidersFor(this.world.layout, this.era, open) };
    return this.rectsCache.rects;
  }

  ensureValidPosition() {
    const rects = this.rects();
    if (!blocked(rects, this.player.x, this.player.z, 0.32)) return;
    // nearest safe passage landing in this era, else the opening position
    for (const a of this.world.anchors) for (const side of [1, -1] as const) {
      const cr = crossing(a, otherEra(this.era), side);
      if (crossingSafe(this.world.layout, cr, this.ws)) { this.player.place(cr.landing.x, cr.landing.z, this.player.yaw, 0); return; }
    }
    const s = this.world.layout.start;
    this.era = 'present';
    this.player.place(s.x, s.z, s.yaw, s.pitch);
  }

  /* ---------------- frame ---------------- */

  start() {
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const t0 = performance.now();
      this.frame(dt, now / 1000);
      const p = this.perf;
      p.frame[p.i] = dt * 1000; p.cpu[p.i] = performance.now() - t0; p.vf[p.i] = this.renderer.stats.vfActive ? 1 : 0;
      p.i = (p.i + 1) % p.frame.length;
    };
    requestAnimationFrame(loop);
  }

  frame(dt: number, t: number) {
    if (!this.scenes) return;
    const inp = this.input;
    const active = !this.uiOpen && inp.locked;
    if (active) {
      this.playTime += dt;
      if (inp.hit('KeyC')) this.toggleCamera();
      if (inp.hit('Mouse0')) void this.takePhoto();
      if (inp.hit('Tab')) this.ui.openJournal();
      if (inp.hit('KeyE')) {
        if (this.heldAlign.ok && this.heldAlign.cr) this.beginCross(this.heldAlign.cr);
        else if (this.focus) this.focus.use();
      }
      if (inp.hit('KeyQ') && this.held) this.releasePrint();
    }
    if (inp.hit('F3')) this.ui.togglePerf();
    if (this.transition) this.updateTransition(dt);
    this.vf.k += ((this.vf.up ? 1 : 0) - this.vf.k) * Math.min(1, dt * 9);
    this.player.slow = this.vf.up ? 0.6 : 1;
    this.player.update(dt, inp, this.rects(), active && !this.transition);
    // the tram pushes the player off the rails in the past
    if (this.era === 'past' && this.tram.running && Math.abs(this.player.z) < 1.6 && Math.abs(this.player.x - this.tram.x) < 5.9) this.player.z = this.player.z >= 0 ? 1.6 : -1.6;
    this.player.apply(this.renderer.camera);
    this.updateTram(dt);
    this.director.update(dt, t);
    const cam = this.renderer.camera.position;
    this.scenes.present.update(dt, t, cam, this.tram.x);
    this.scenes.past.update(dt, t, cam, this.tram.x);
    // present motion details with sound
    const pres = this.scenes.present;
    if (pres.drips) { const k = pres.drips.update(dt); if (k >= 0) { const p = pres.drips.points.geometry.attributes.position; const dx = p.getX(k) - cam.x, dz = p.getZ(k) - cam.z; if (dx * dx + dz * dz < 100) this.audio.drip(p.getX(k), 0, p.getZ(k)); } }
    this.relayT -= dt;
    if (this.relayT < 0) {
      this.relayT = 12;
      const ck = this.world.layout.spots['clock'];
      this.audio.click('present', ck.x, ck.y, ck.z, 1600, 0.9, 0.06);
      if (pres.clockHand) pres.clockHand.rotation.z -= Math.PI / 30;
      if (this.era === 'present' && this.relayCaptions < 2 && this.settings.captions && Math.hypot(ck.x - cam.x, ck.z - cam.z) < 30) { this.relayCaptions++; this.caption(`The station clock's relay clicks, ${this.dirWord(ck.x, ck.z)}.`); }
    }
    // camera framing and held prints
    this.vf.viable = this.vf.up ? this.findViable() : null;
    if (!this.vf.up) this.vf.ghost.mix = 0;
    this.updateHeld();
    // interaction focus
    this.focus = null;
    if (!this.vf.up && !this.transition) {
      let best = Infinity;
      const fwd = this.renderer.camera.getWorldDirection(FWD);
      for (const it of this.interactables) {
        if (it.era !== this.era) continue;
        const p = it.pos();
        const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
        const hd = Math.hypot(dx, dz);
        if (hd > it.reach) continue;
        const d = Math.hypot(dx, dy, dz);
        const cos = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
        if (cos < Math.cos(((it.cone ?? 35) * Math.PI) / 180)) continue;
        if (!it.prompt()) continue;
        const score = (1 - cos) * 4 + hd * 0.1;
        if (score < best) { best = score; this.focus = it; }
      }
    }
    const fx = Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    this.audio.update(this.era, this.vf.k > 0.5, cam.x, cam.y, cam.z, fx, fz, this.tram.x, this.tram.running);
    // render: the second pass only exists while the camera is raised
    const other = this.vf.k > 0.02 && this.vf.up ? this.scenes[otherEra(this.era)].scene : null;
    this.renderer.render(this.scenes[this.era].scene, other, t, this.vf.ghost.mix > 0 ? { x: this.vf.ghost.x * 0.035, y: -this.vf.ghost.y * 0.035, mix: this.vf.ghost.mix } : undefined);
    this.ui.frame(dt);
    this.saveT += dt;
    if (this.saveT > 8) { this.saveT = 0; this.save(); }
    inp.endFrame();
  }

  snapshot(): SaveData {
    return {
      version: 1, seed: this.world.seed, era: this.era,
      pos: { x: this.player.x, z: this.player.z, yaw: this.player.yaw, pitch: this.player.pitch },
      actions: this.actions,
      docs: [...this.docs.values()].map((d) => ({ id: d.id, at: d.at, ws: d.ws, viaPrint: d.viaPrint })) as any,
      prints: this.prints, heldPrint: this.held?.meta.id, pinned: this.pinned, theory: this.theory,
      progress: this.progress, playTime: this.playTime,
    };
  }
  save() { if (this.world && this.persist) writeSave(this.snapshot()); }
}

function thumbFrom(c: HTMLCanvasElement): string {
  const t = document.createElement('canvas');
  t.width = 300; t.height = 200;
  t.getContext('2d')!.drawImage(c, 0, 0, 300, 200);
  return t.toDataURL('image/jpeg', 0.7);
}
