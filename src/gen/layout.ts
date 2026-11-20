import { Rng, seedRng } from '../core/rng';
import type { Era, EraSet, Pt, Rect } from '../core/types';
import { TENANTS } from './content';
import type { CaseFile } from './history';

/* ------------------------------------------------------------------------------------------------
 * The block is generated in a canonical orientation (station on the north side of Tram Street,
 * depot to its west, archway court to its east) and optionally mirrored across X. Everything is
 * built from shared parcel footprints; era differences are expressed as per-era openings, fills
 * and props so both eras line up at the edges of the viewfinder.
 * ---------------------------------------------------------------------------------------------- */

export type Fill = 'brick' | 'door' | 'shutter' | 'gate' | 'boards' | 'glass';

export interface Opening {
  id?: string;
  a: number; b: number; // world coordinate extent along the wall axis
  bottom: number; top: number;
  kind: 'door' | 'window' | 'arch' | 'gate';
  /** Eras in which the opening is passable/open. Elsewhere it is filled with `fill`. */
  open: EraSet | 'none';
  fill?: Fill;
  /** Opening controlled by a history fact instead of a fixed era set. */
  dynamic?: 'gate';
}

export interface Wall {
  id: string;
  axis: 'x' | 'z';
  c: number; a: number; b: number;
  h: number; t: number;
  eras: EraSet;
  mat: 'masonry' | 'plaster' | 'brick';
  tone: number;
  openings: Opening[];
  /** Exterior face normal sign along the perpendicular axis (+1 / -1); 0 for interior partitions. */
  face: number;
}

export interface Block {
  id: string; rect: Rect; h: number;
  roof: 'gable' | 'flat' | 'saw' | 'hip';
  mat: 'masonry' | 'plaster' | 'brick';
  tone: number; eras: EraSet; quiet?: boolean;
}

export interface Facade {
  id: string; parcel: string;
  x0: number; x1: number; z: number; dir: 1 | -1;
  h: number; floors: number; groundH: number;
  kind: 'station' | 'depot' | 'tenement' | 'cinema' | 'shop' | 'archive' | 'rear';
  tone: number;
  balconies: boolean; cornice: boolean; pilasters: boolean;
  sign?: { past: string; present: string };
  /** Ground floor door/arch openings to avoid when placing windows. */
  gaps: [number, number][];
  shopWindows: boolean;
  /** Present-era windows boarded / lit probability */
  litChance: number;
}

export interface Room {
  id: string; rect: Rect; eras: EraSet;
  floor: 'mosaic' | 'boards' | 'flags' | 'concrete' | 'carpet' | 'setts';
  ceil: number; label: string;
}

export interface Prop {
  id: string; kind: string;
  x: number; z: number; y?: number; yaw: number;
  w: number; d: number; h: number;
  eras: EraSet; collide: boolean; tone?: number; text?: string;
}

export interface Anchor {
  id: string; label: string; kind: 'doorway' | 'arch' | 'door';
  x: number; z: number; nx: number; nz: number;
  width: number; height: number;
  /** landing offset from the threshold, metres */
  depth: number;
}

export interface Region { id: string; label: string; rect: Rect }

export interface Spot { x: number; y: number; z: number; yaw: number }

export interface Layout {
  seed: string;
  arrangement: string;
  mirror: boolean;
  walls: Wall[];
  blocks: Block[];
  facades: Facade[];
  rooms: Room[];
  props: Prop[];
  anchors: Anchor[];
  regions: Region[];
  spots: Record<string, Spot>;
  paths: Record<string, Pt[]>;
  colliderRects: { rect: Rect; eras: EraSet; id: string }[];
  street: { x0: number; x1: number; zN: number; zS: number; brokenX0: number; brokenX1: number; crossX0: number; crossX1: number; crossEnd: number };
  start: { x: number; z: number; yaw: number; pitch: number };
  weather: { rain: number; fog: number; puddles: { x: number; z: number; r: number }[]; wind: number };
  lamps: Pt[];
  tenants: { parcel: string; past: string; present: string }[];
}

interface Arrangement {
  name: string;
  concourseW: number; concourseD: number; archiveW: number; archiveD: number;
  alleyW: number; depotW: number; archW: number; tenementW: number;
  courtD: number; cinemaW: number; cinemaOffset: number; crossW: number;
  well: boolean; galleries: boolean;
}

const ARRANGEMENTS: Arrangement[] = [
  { name: 'Arcade Court', concourseW: 20, concourseD: 20, archiveW: 11, archiveD: 14, alleyW: 3.6, depotW: 18, archW: 3.6, tenementW: 17, courtD: 13, cinemaW: 15, cinemaOffset: -5.5, crossW: 9, well: false, galleries: false },
  { name: 'Well Yard', concourseW: 18, concourseD: 19, archiveW: 12, archiveD: 13, alleyW: 3.2, depotW: 20, archW: 3.2, tenementW: 19, courtD: 15, cinemaW: 16, cinemaOffset: -4.5, crossW: 8, well: true, galleries: false },
  { name: 'Gallery Close', concourseW: 21, concourseD: 21, archiveW: 10, archiveD: 15, alleyW: 4, depotW: 17, archW: 4, tenementW: 16, courtD: 12, cinemaW: 14, cinemaOffset: -6, crossW: 10, well: false, galleries: true },
];

export const STREET_HALF = 7;

export function generateLayout(seed: string, c: CaseFile): Layout {
  const r = seedRng(seed, 'layout');
  const arr = { ...ARRANGEMENTS[r.int(0, ARRANGEMENTS.length - 1)] };
  const mirror = r.chance(0.5);
  const j = (v: number, amt: number) => v + r.range(-amt, amt);
  arr.concourseW = j(arr.concourseW, 1.5);
  arr.archiveW = j(arr.archiveW, 1);
  arr.depotW = j(arr.depotW, 1.5);
  arr.tenementW = j(arr.tenementW, 1.5);
  arr.cinemaW = j(arr.cinemaW, 1);
  arr.cinemaOffset = j(arr.cinemaOffset, 1.5);
  arr.courtD = j(arr.courtD, 1);

  const X = (x: number) => (mirror ? -x : x);
  const R = (xa: number, za: number, xb: number, zb: number): Rect => {
    const p = X(xa), q = X(xb);
    return { x0: Math.min(p, q), z0: Math.min(za, zb), x1: Math.max(p, q), z1: Math.max(za, zb) };
  };
  const Y = (yaw: number) => (mirror ? -yaw : yaw);

  const walls: Wall[] = [];
  const blocks: Block[] = [];
  const facades: Facade[] = [];
  const rooms: Room[] = [];
  const props: Prop[] = [];
  const anchors: Anchor[] = [];
  const regions: Region[] = [];
  const spots: Record<string, Spot> = {};
  const paths: Record<string, Pt[]> = {};
  const tenants: Layout['tenants'] = [];

  const zN = -STREET_HALF, zS = STREET_HALF;
  const T = 0.5; // wall thickness

  const wallX = (id: string, z: number, xa: number, xb: number, h: number, face: number, mat: Wall['mat'], tone: number, openings: Opening[] = [], eras: EraSet = 'both') => {
    const p = X(xa), q = X(xb);
    walls.push({ id, axis: 'x', c: z, a: Math.min(p, q), b: Math.max(p, q), h, t: T, eras, mat, tone, face, openings: openings.map((o) => { const u = X(o.a), v = X(o.b); return { ...o, a: Math.min(u, v), b: Math.max(u, v) }; }) });
  };
  const wallZ = (id: string, x: number, za: number, zb: number, h: number, face: number, mat: Wall['mat'], tone: number, openings: Opening[] = [], eras: EraSet = 'both') => {
    walls.push({ id, axis: 'z', c: X(x), a: Math.min(za, zb), b: Math.max(za, zb), h, t: T, eras, mat, tone, face: mirror ? -face : face, openings });
  };
  const block = (id: string, xa: number, za: number, xb: number, zb: number, h: number, roof: Block['roof'], mat: Block['mat'], tone: number, eras: EraSet = 'both', quiet = false) =>
    blocks.push({ id, rect: R(xa, za, xb, zb), h, roof, mat, tone, eras, quiet });
  const prop = (id: string, kind: string, x: number, z: number, yaw: number, w: number, d: number, h: number, eras: EraSet, collide = true, extra: Partial<Prop> = {}) =>
    props.push({ id, kind, x: X(x), z, yaw: Y(yaw), w, d, h, eras, collide, ...extra });
  const spot = (id: string, x: number, y: number, z: number, yaw: number) => (spots[id] = { x: X(x), y, z, yaw: Y(yaw) });
  const region = (id: string, label: string, xa: number, za: number, xb: number, zb: number) => regions.push({ id, label, rect: R(xa, za, xb, zb) });
  const path = (id: string, pts: [number, number][]) => (paths[id] = pts.map(([x, z]) => ({ x: X(x), z })));
  const anchor = (a: Omit<Anchor, 'x' | 'nx'> & { x: number; nx: number }) => anchors.push({ ...a, x: X(a.x), nx: mirror ? -a.nx : a.nx });
  const facade = (f: Omit<Facade, 'x0' | 'x1' | 'gaps'> & { xa: number; xb: number; gaps: [number, number][] }) => {
    const p = X(f.xa), q = X(f.xb);
    const { xa: _a, xb: _b, ...rest } = f;
    facades.push({ ...rest, x0: Math.min(p, q), x1: Math.max(p, q), gaps: f.gaps.map(([a, b]) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))]) });
  };

  /* ---------------- North side: depot | alley | concourse | archive | tenement(arch) ---------------- */
  const sx = r.range(-1.5, 1.5); // station centre
  const cx0 = sx - arr.concourseW / 2, cx1 = sx + arr.concourseW / 2;
  const cRear = zN - arr.concourseD;
  const ax1 = cx1 + arr.archiveW;
  const aRear = zN - arr.archiveD;
  const alX0 = cx0 - arr.alleyW;
  const dX0 = alX0 - arr.depotW;
  const dRear = cRear - 2;
  const laneZ0 = cRear - 4.2; // back lane runs behind the concourse
  const tX1 = ax1 + arr.tenementW;
  const archX0 = ax1 + r.range(2.2, 3.6);
  const archX1 = archX0 + arr.archW;
  const courtZ0 = aRear - arr.courtD;
  const courtX1 = tX1 - r.range(2, 4);
  const stationH = 11.5;
  const entranceX = sx + r.range(-2.5, 2.5);
  const entW = 3.4;

  // Station concourse (hollow in both eras: derelict hall in the present).
  const stTone = r.range(0.4, 0.6);
  wallX('station.front', zN - T / 2, cx0, cx1, stationH, 1, 'masonry', stTone, [
    { id: 'station.entrance', a: entranceX - entW / 2, b: entranceX + entW / 2, bottom: 0, top: 4.4, kind: 'arch', open: 'past', fill: 'brick' },
    { a: cx0 + 2.2, b: cx0 + 4.2, bottom: 1.2, top: 4, kind: 'window', open: 'past', fill: 'brick' },
    { a: cx1 - 4.2, b: cx1 - 2.2, bottom: 1.2, top: 4, kind: 'window', open: 'past', fill: 'brick' },
  ]);
  // Platform gates sit off to one side so the track diagram can hang straight ahead of the entrance.
  const gateSide = entranceX - sx > 0 ? -1 : 1;
  const pgX = sx + gateSide * (arr.concourseW / 2 - 4.5);
  wallX('station.rear', cRear + T / 2, cx0, cx1, stationH, -1, 'masonry', stTone, [
    { id: 'station.platforms', a: pgX - 2.6, b: pgX + 2.6, bottom: 0, top: 3.6, kind: 'gate', open: 'none', fill: 'gate' },
  ]);
  wallZ('station.west', cx0 + T / 2, cRear, zN, stationH, -1, 'masonry', stTone);
  const archDoorZ = zN - 4.2;
  wallZ('station.east', cx1 - T / 2, cRear, zN, stationH, 0, 'plaster', 0.5, [
    { id: 'archive.door', a: archDoorZ - 0.65, b: archDoorZ + 0.65, bottom: 0, top: 2.3, kind: 'door', open: 'past', fill: 'brick' },
  ]);
  rooms.push({ id: 'concourse', rect: R(cx0, cRear, cx1, zN), eras: 'both', floor: 'mosaic', ceil: 8.5, label: 'Station concourse' });
  region('loc.concourse', 'Station concourse', cx0, cRear, cx1, zN);

  // Archive wing.
  const archWinX = cx1 + arr.archiveW * r.range(0.45, 0.6);
  wallX('archive.front', zN - T / 2, cx1, ax1, 8, 1, 'masonry', stTone - 0.08, [
    { a: cx1 + 2, b: cx1 + 3.4, bottom: 1.1, top: 3.2, kind: 'window', open: 'none', fill: 'glass' },
    { a: ax1 - 3.4, b: ax1 - 2, bottom: 1.1, top: 3.2, kind: 'window', open: 'none', fill: 'glass' },
  ]);
  wallX('archive.rear', aRear + T / 2, cx1, ax1, 8, -1, 'masonry', stTone - 0.08, [
    { id: 'archive.window', a: archWinX - 0.8, b: archWinX + 0.8, bottom: 1.2, top: 3.4, kind: 'window', open: 'none', fill: 'glass' },
  ]);
  wallZ('archive.east', ax1 - T / 2, aRear, zN, 8, 1, 'masonry', stTone - 0.08);
  rooms.push({ id: 'archive', rect: R(cx1, aRear, ax1, zN), eras: 'both', floor: 'boards', ceil: 4.2, label: 'Station archive' });
  region('loc.archive', 'Station archive', cx1, aRear, ax1, zN);
  // Station roof masses (non-walkable, above walls)
  block('station.roof', cx0, cRear, cx1, zN, 0, 'gable', 'masonry', stTone, 'both');
  block('archive.roof', cx1, aRear, ax1, zN, 0, 'flat', 'masonry', stTone - 0.08, 'both');

  facade({ id: 'f.station', parcel: 'station', xa: cx0, xb: cx1, z: zN, dir: 1, h: stationH, floors: 2, groundH: 5, kind: 'station', tone: stTone, balconies: false, cornice: true, pilasters: true, gaps: [[entranceX - 3.4, entranceX + 3.4], [cx0 + 1.8, cx0 + 4.6], [cx1 - 4.6, cx1 - 1.8]], shopWindows: false, litChance: 0, sign: { past: 'CENTRAL STATION', present: '' } });
  facade({ id: 'f.archive', parcel: 'archive', xa: cx1, xb: ax1, z: zN, dir: 1, h: 8, floors: 2, groundH: 4, kind: 'archive', tone: stTone - 0.08, balconies: false, cornice: true, pilasters: false, gaps: [[cx1, ax1]], shopWindows: false, litChance: 0 });
  facade({ id: 'f.archive.rear', parcel: 'archive', xa: cx1, xb: ax1, z: aRear, dir: -1, h: 8, floors: 2, groundH: 4, kind: 'rear', tone: stTone - 0.08, balconies: false, cornice: false, pilasters: false, gaps: [[cx1, ax1]], shopWindows: false, litChance: 0 });

  // Station landmarks.
  const clockOffset = r.pick([0, 0, -1, 1]) * r.range(0, 1.2);
  spot('clock', entranceX + clockOffset, stationH - 1.6, zN + 0.32, 0);
  spot('board', entranceX, 5.35, zN + 0.42, 0);
  spot('poster', entranceX + r.pick([-1, 1]) * r.range(4.2, 5.5), 1.9, zN + 0.27, 0);
  spot('diagram', entranceX + r.range(-1, 1), 2.0, cRear + T + 0.06, Math.PI);
  spot('closing.notice', cx0 + 2.4, 1.7, zN - T - 0.05, 0);
  spot('platform.gate', pgX, 0, cRear + T, Math.PI);
  for (let i = 0; i < 3; i++) prop(`bench.${i}`, 'bench', cx0 + 3 + i * 0.01, zN - 6 - i * 4, Math.PI / 2, 2.4, 0.7, 0.9, 'past', true);
  prop('ticket.counter', 'counter', cx0 + 1.2, cRear + 5, Math.PI / 2, 4, 1, 1.1, 'past', true);
  prop('derelict.scaffold', 'scaffold', sx + 4, cRear + 6, 0, 3, 2, 4, 'present', true);
  prop('derelict.rubble', 'rubble', sx - 4, zN - 6, 0, 3, 2, 0.6, 'present', true);

  // Archive interior.
  const deskX = cx1 + 2.8, deskZ = zN - 8.2;
  prop('archive.desk', 'desk', deskX, deskZ, 0, 2.0, 0.9, 0.78, 'both', true, { tone: 0.5 });
  spot('desk.slip', deskX - 0.4, 0.8, deskZ + 0.05, 0);
  spot('desk.note', deskX + 0.5, 0.8, deskZ + 0.1, 0);
  prop('archive.cabinet', 'cabinet', ax1 - 1.1, aRear + 1.2, Math.PI, 1.4, 0.7, 1.9, 'both', true);
  for (let i = 0; i < 4; i++) prop(`archive.shelf.${i}`, 'shelf', ax1 - 0.7, zN - 2.2 - i * 2.4, -Math.PI / 2, 2.0, 0.6, 2.6, 'both', true);
  spot('crate.archive', cx1 + 1.6, 0, zN - 2.0, 0);
  spot('archive.window', archWinX, 2.3, aRear - 0.05, Math.PI);
  spot('archive.window.in', archWinX, 0, aRear + 1.3, Math.PI);
  spot('gutter', archWinX + 0.2, 7.6, aRear - 0.35, Math.PI);
  spot('downpipe', archWinX - 1.9, 0, aRear - 0.18, Math.PI);
  spot('gutter.use', archWinX - 0.6, 0, aRear - 2.2, Math.PI);

  /* ---------------- Alley + back lane ---------------- */
  region('loc.alley', 'Service alley', alX0, laneZ0, cx0, zN);
  region('loc.backlane', 'Back lane', alX0, laneZ0, cx1, cRear);
  const gateZ = cRear + 1.2;
  const gateMid = (alX0 + cx0) / 2;
  wallX('alley.gate', gateZ, alX0, cx0, 2.4, 0, 'brick', 0.5, [
    { id: 'alley.gate', a: alX0 + 0.25, b: cx0 - 0.25, bottom: 0, top: 2.2, kind: 'gate', open: 'none', fill: 'gate', dynamic: 'gate' },
  ]);
  spot('gate', gateMid, 1.1, gateZ, 0);
  spot('gate.bolt', gateMid, 1.1, gateZ - 0.4, Math.PI);
  block('lane.backs', alX0 - 0.01, laneZ0 - 9, cx1 + 0.01, laneZ0, 9, 'gable', 'brick', 0.35);
  prop('alley.bins', 'bins', alX0 + 0.7, zN - 3, 0, 0.8, 1.6, 1.1, 'both', true);
  prop('alley.crates', 'crateStack', cx0 - 0.8, cRear + 4, 0, 1.0, 1.4, 1.3, 'past', true);
  prop('alley.bike', 'bicycle', cx0 - 0.5, cRear + 5.5, 0, 0.4, 1.7, 1, 'present', true);

  /* ---------------- Depot ---------------- */
  const dTone = r.range(0.35, 0.6);
  const dDoorX = dX0 + arr.depotW * 0.42;
  const dDoorW = 5.4;
  const passX = dDoorX + dDoorW / 2 + 1.4;
  const sideDoorZ = zN - arr.concourseD * 0.55;
  const offX0 = alX0 - 6, offZ0 = zN - 6.2;
  wallX('depot.front', zN - T / 2, dX0, alX0, 8.5, 1, 'brick', dTone, [
    { id: 'depot.bigdoor', a: dDoorX - dDoorW / 2, b: dDoorX + dDoorW / 2, bottom: 0, top: 5, kind: 'door', open: 'past', fill: 'shutter' },
    { id: 'depot.passdoor', a: passX - 0.6, b: passX + 0.6, bottom: 0, top: 2.3, kind: 'door', open: 'present', fill: 'door' },
  ]);
  wallX('depot.rear', dRear + T / 2, dX0, alX0, 8.5, -1, 'brick', dTone);
  wallZ('depot.west', dX0 + T / 2, dRear, zN, 8.5, -1, 'brick', dTone);
  wallZ('depot.east', alX0 - T / 2, dRear, zN, 8.5, 1, 'brick', dTone, [
    { id: 'depot.sidedoor', a: sideDoorZ - 0.7, b: sideDoorZ + 0.7, bottom: 0, top: 2.4, kind: 'door', open: 'both' },
    { a: zN - 3.6, b: zN - 2.2, bottom: 1.4, top: 3.2, kind: 'window', open: 'none', fill: 'glass' },
  ]);
  // Office partition (locked in the past, open in the present).
  wallX('depot.office.n', offZ0, offX0, alX0 - T, 3.2, 0, 'plaster', 0.6, [
    { id: 'depot.office.door', a: offX0 + 0.6, b: offX0 + 1.7, bottom: 0, top: 2.2, kind: 'door', open: 'present', fill: 'door' },
    { id: 'depot.office.glass', a: offX0 + 2.6, b: offX0 + 4.8, bottom: 1.0, top: 2.4, kind: 'window', open: 'none', fill: 'glass' },
  ]);
  wallZ('depot.office.w', offX0, offZ0, zN - T, 3.2, 0, 'plaster', 0.6);
  rooms.push({ id: 'depot', rect: R(dX0, dRear, alX0, zN), eras: 'both', floor: 'setts', ceil: 7.5, label: 'Tramway depot' });
  rooms.push({ id: 'depot.office', rect: R(offX0, offZ0, alX0, zN), eras: 'both', floor: 'boards', ceil: 3.1, label: 'Depot office' });
  region('loc.depot.office', 'Depot office', offX0, offZ0, alX0, zN);
  region('loc.depot', 'Tramway depot', dX0, dRear, alX0, zN);
  block('depot.roof', dX0, dRear, alX0, zN, 0, 'saw', 'brick', dTone);
  facade({ id: 'f.depot', parcel: 'depot', xa: dX0, xb: alX0, z: zN, dir: 1, h: 8.5, floors: 1, groundH: 5.6, kind: 'depot', tone: dTone, balconies: false, cornice: true, pilasters: true, gaps: [[dDoorX - dDoorW / 2 - 0.4, passX + 1]], shopWindows: false, litChance: 0.5, sign: { past: 'CORPORATION TRAMWAYS · DEPOT', present: c.workshop.toUpperCase() } });

  spot('order', offX0 + 0.32, 1.55, offZ0 + 3.4, Math.PI / 2);
  spot('office.use', offX0 + 2.6, 0, offZ0 + 3.4, -Math.PI / 2);
  prop('office.desk', 'desk', alX0 - 2.2, zN - 1.6, Math.PI, 1.6, 0.8, 0.78, 'both', true, { tone: 0.3 });
  // Shelves in the past (west wall), lockers in the present (rear wall).
  const [shelfLetter, shelfNumS] = c.shelfCode.split('-');
  const shelfNum = Number(shelfNumS);
  for (let i = 1; i <= 6; i++) {
    const z = zN - 2.8 - (i - 1) * 2.4;
    prop(`depot.shelf.${i}`, 'shelf', dX0 + 0.9, z, Math.PI / 2, 2.2, 0.8, 2.8, 'past', true, { text: `${shelfLetter}-${i}` });
    if (i === shelfNum) spot('depot.shelf', dX0 + 1.7, 0, z, Math.PI / 2);
  }
  const lockerCount = 10;
  const lockerStart = c.lockerNo - r.int(2, 6);
  for (let i = 0; i < lockerCount; i++) {
    const n = lockerStart + i;
    const x = dX0 + 2 + i * 0.95;
    prop(`depot.locker.${n}`, 'locker', x, dRear + T + 0.35, 0, 0.9, 0.6, 2.0, 'present', true, { text: String(n) });
    if (n === c.lockerNo) spot('depot.locker', x, 0, dRear + T + 1.2, Math.PI);
  }
  prop('depot.workbench', 'workbench', dX0 + 1.0, zN - 7, Math.PI / 2, 3, 0.9, 0.9, 'present', true);
  prop('depot.bikes', 'bikeRack', dX0 + 5.5, zN - 12, 0, 4, 0.6, 1, 'present', true);
  prop('depot.cart', 'cart', dX0 + 7.5, zN - 13, 0.3, 1.4, 2.4, 1.2, 'past', true);
  spot('depot.rails', dDoorX, 0, zN, 0);

  /* ---------------- Tenement with archway, courtyard ---------------- */
  const tTone = r.range(0.3, 0.7);
  const tH = r.range(12, 14.5);
  block('tenement.w', ax1, aRear, archX0, zN, tH, 'gable', 'plaster', tTone);
  block('tenement.e', archX1, aRear, tX1, zN, tH, 'gable', 'plaster', tTone);
  block('tenement.archroof', archX0, aRear, archX1, zN, 0, 'flat', 'plaster', tTone);
  facade({ id: 'f.tenement', parcel: 'tenement', xa: ax1, xb: tX1, z: zN, dir: 1, h: tH, floors: 4, groundH: 4.2, kind: 'tenement', tone: tTone, balconies: true, cornice: true, pilasters: false, gaps: [[archX0 - 0.3, archX1 + 0.3]], shopWindows: true, litChance: 0.35, sign: { past: 'TEA ROOMS', present: '' } });
  facade({ id: 'f.tenement.rear', parcel: 'tenement', xa: ax1, xb: tX1, z: aRear, dir: -1, h: tH, floors: 4, groundH: 4.2, kind: 'rear', tone: tTone, balconies: arr.galleries || r.chance(0.6), cornice: false, pilasters: false, gaps: [[archX0 - 0.3, archX1 + 0.3]], shopWindows: false, litChance: 0.4 });
  rooms.push({ id: 'arch', rect: R(archX0, aRear, archX1, zN), eras: 'both', floor: 'setts', ceil: 4.6, label: 'Archway' });
  rooms.push({ id: 'courtyard', rect: R(cx1, courtZ0, courtX1, aRear), eras: 'both', floor: 'flags', ceil: 0, label: 'Courtyard' });
  region('loc.arch', 'Archway', archX0, aRear, archX1, zN);
  region('loc.courtyard', 'Courtyard', cx1, courtZ0, courtX1, aRear);
  block('court.backs', cx1 - 0.01, courtZ0 - 9, tX1 + 8, courtZ0, 11, 'gable', 'brick', 0.45);
  block('court.east', courtX1, courtZ0, tX1 + 8, aRear, 12, 'gable', 'brick', 0.55);
  if (arr.well) prop('court.well', 'well', (cx1 + courtX1) / 2 + 2, courtZ0 + arr.courtD * 0.45, 0, 1.6, 1.6, 0.9, 'both', true);
  prop('court.pillar', 'pillar', archX0 - 0.1, aRear - 0.4, 0, 0.6, 0.6, 3.6, 'both', true);
  const lx = (cx1 + courtX1) / 2;
  spot('laundry', lx, 3.2, courtZ0 + 3, 0);
  prop('court.bins', 'bins', courtX1 - 1, courtZ0 + 1.2, 0, 1.6, 0.8, 1.1, 'present', true);
  prop('court.handcart', 'cart', courtX1 - 2.6, aRear - 3, 0.6, 1.2, 2, 1, 'past', true);
  prop('court.bench', 'bench', cx1 + 3.5, courtZ0 + 1.2, 0, 2, 0.6, 0.9, 'both', true);
  prop('court.pumps', 'bicycle', courtX1 - 4, courtZ0 + 1.0, Math.PI / 2, 0.4, 1.7, 1, 'present', true);

  /* ---------------- Fillers north ---------------- */
  block('north.w', dX0 - 30, zN - 40, dX0, zN, r.range(10, 13), 'gable', 'brick', 0.5);
  block('north.depotback', dX0, dRear - 12, alX0, dRear, 10, 'gable', 'brick', 0.4);
  block('north.e', tX1, aRear, tX1 + 30, zN, r.range(10, 15), 'gable', 'plaster', 0.55);
  facade({ id: 'f.north.e', parcel: 'north.e', xa: tX1, xb: tX1 + 14, z: zN, dir: 1, h: 12, floors: 3, groundH: 4, kind: 'shop', tone: 0.55, balconies: false, cornice: true, pilasters: true, gaps: [], shopWindows: true, litChance: 0.3 });
  facade({ id: 'f.north.w', parcel: 'north.w', xa: dX0 - 14, xb: dX0, z: zN, dir: 1, h: 11, floors: 3, groundH: 4, kind: 'shop', tone: 0.5, balconies: false, cornice: true, pilasters: true, gaps: [], shopWindows: true, litChance: 0.3 });

  /* ---------------- South side: cinema (print shop) + cross street + shops ---------------- */
  const cinX0 = sx + arr.cinemaOffset - arr.cinemaW / 2, cinX1 = cinX0 + arr.cinemaW;
  const cinD = 11;
  const cinTone = r.range(0.4, 0.65);
  const cinDoorX = cinX0 + arr.cinemaW * 0.3;
  const ticketX = cinDoorX - 2.4;
  wallX('cinema.front', zS + T / 2, cinX0, cinX1, 10, -1, 'masonry', cinTone, [
    { id: 'cinema.door', a: cinDoorX - 1.2, b: cinDoorX + 1.2, bottom: 0, top: 2.8, kind: 'door', open: 'both' },
    { a: cinX0 + 1.4, b: cinX0 + 3.6, bottom: 0.7, top: 2.9, kind: 'window', open: 'none', fill: 'glass' },
  ]);
  wallX('cinema.rear', zS + cinD - T / 2, cinX0, cinX1, 10, 0, 'plaster', 0.5);
  wallZ('cinema.w', cinX0 + T / 2, zS, zS + cinD, 10, -1, 'masonry', cinTone);
  wallZ('cinema.e', cinX1 - T / 2, zS, zS + cinD, 10, 1, 'masonry', cinTone);
  block('cinema.aud', cinX0, zS + cinD, cinX1, zS + 26, 12, 'gable', 'masonry', cinTone - 0.1);
  block('cinema.roof', cinX0, zS, cinX1, zS + cinD, 0, 'flat', 'masonry', cinTone);
  rooms.push({ id: 'cinema', rect: R(cinX0, zS, cinX1, zS + cinD), eras: 'both', floor: 'mosaic', ceil: 4.6, label: 'Cinema lobby' });
  region('loc.cinema', 'Cinema lobby / print shop', cinX0, zS, cinX1, zS + cinD);
  facade({ id: 'f.cinema', parcel: 'cinema', xa: cinX0, xb: cinX1, z: zS, dir: -1, h: 10, floors: 2, groundH: 4.4, kind: 'cinema', tone: cinTone, balconies: false, cornice: true, pilasters: true, gaps: [[cinX0 + 1, cinX1 - 1]], shopWindows: false, litChance: 0, sign: { past: `${c.printer.toUpperCase()} · PRINTERS`, present: c.cinema.toUpperCase() } });

  // Press bays along the rear wall; projection booth above the plotted bay.
  const bayW = (arr.cinemaW - 3) / 4;
  for (let b = 1; b <= 4; b++) {
    const x = cinX0 + 1.5 + bayW * (b - 0.5);
    const z = zS + cinD - 2.6;
    prop(`press.${b}`, 'press', x, z, 0, Math.min(2.2, bayW - 0.5), 1.6, 1.7, 'past', true, { text: String(b) });
    spot(`bay.${b}`, x, 0.012, z + (b === c.pressBay ? 1.25 : 1.2), 0);
  }
  const plate = spots[`bay.${c.pressBay}`];
  spots['plate'] = { ...plate };
  const plateCX = X(plate.x); // canonical x
  prop('cinema.booth', 'booth', plateCX, plate.z - 0.4, 0, 3.0, 2.4, 2.4, 'present', false, { y: 2.5 });
  prop('cinema.booth.legs', 'boothLegs', plateCX, plate.z - 0.4, 0, 3.0, 2.4, 2.5, 'present', false);
  prop('cinema.stairs', 'stairs', plateCX + (plateCX < (cinX0 + cinX1) / 2 ? 2.3 : -2.3), plate.z - 0.6, 0, 1, 2.6, 2.5, 'present', true);
  prop('cinema.ticket', 'ticketBooth', ticketX, zS - 0.75, 0, 1.4, 1.0, 2.4, 'present', true);
  prop('cinema.pillar', 'pillar', cinX0 + 1.4, zS + 4.2, 0, 0.55, 0.55, 4.5, 'both', true);
  prop('cinema.counter', 'counter', cinX1 - 1.6, zS + 4, Math.PI / 2, 3, 0.8, 1.05, 'present', true);
  prop('print.cases', 'typeCases', cinX1 - 1.0, zS + 4.5, -Math.PI / 2, 3, 0.8, 1.4, 'past', true);
  prop('print.table', 'desk', cinX0 + 4.5, zS + 4.5, 0, 2.4, 1.2, 0.9, 'past', true, { tone: 0.6 });
  spot('awning', (cinX0 + cinX1) / 2, 3.5, zS - 1.2, 0);
  spot('ticket.lamp', ticketX, 2.1, zS - 0.9, 0);
  spot('print.door.out', cinDoorX, 0, zS - 1.5, 0);

  // Cross street (T junction) between cinema and shops.
  const csX0 = cinX1 + 0.01;
  const csX1 = csX0 + arr.crossW;
  const crossEnd = zS + 10;

  // South-west and south-east shop parcels.
  let px = cinX0;
  let k = 0;
  const tenantPool = r.shuffle(TENANTS);
  const southParcel = (xa: number, xb: number) => {
    const h = r.range(8.5, 13);
    const floors = h > 11 ? 3 : 2;
    const id = `south.${k}`;
    const tone = r.range(0.25, 0.8);
    const t = tenantPool[k % tenantPool.length];
    block(id, xa, zS, xb, zS + 18, h, r.chance(0.6) ? 'gable' : 'hip', r.chance(0.5) ? 'brick' : 'plaster', tone);
    facade({ id: `f.${id}`, parcel: id, xa, xb, z: zS, dir: -1, h, floors, groundH: 3.8, kind: 'shop', tone, balconies: r.chance(0.35), cornice: r.chance(0.7), pilasters: true, gaps: [], shopWindows: true, litChance: 0.35, sign: { past: t[0].toUpperCase(), present: t[1].toUpperCase() } });
    tenants.push({ parcel: id, past: t[0], present: t[1] });
    k++;
  };
  while (px > -46) {
    const w = r.range(6, 9);
    southParcel(px - w, px);
    px -= w;
  }
  px = csX1;
  while (px < 46) {
    const w = r.range(6, 9);
    southParcel(px, px + w);
    px += w;
  }
  block('cross.end', csX0 - 1, crossEnd + 4, csX1 + 1, crossEnd + 16, 10, 'gable', 'brick', 0.4, 'both', true);
  block('cross.w', cinX0, zS + 26, csX0, crossEnd + 16, 9, 'flat', 'brick', 0.4, 'both', true);
  prop('cross.barrier', 'barrier', (csX0 + csX1) / 2, crossEnd, 0, csX1 - csX0, 0.5, 1.0, 'present', true);
  prop('cross.cart', 'cart', (csX0 + csX1) / 2, crossEnd, Math.PI / 2, 1.4, csX1 - csX0 - 0.2, 1.2, 'past', true);
  // Distant quiet silhouettes along the visual extension of the street.
  for (let i = 0; i < 6; i++) {
    const x = 50 + i * 12;
    block(`far.n.${i}`, x, -30, x + 11, zN, r.range(9, 16), 'gable', 'brick', 0.5, 'both', true);
    block(`far.nw.${i}`, -x - 11, -30, -x, zN, r.range(9, 16), 'gable', 'brick', 0.5, 'both', true);
    block(`far.s.${i}`, x, zS, x + 11, 30, r.range(9, 16), 'gable', 'plaster', 0.5, 'both', true);
    block(`far.sw.${i}`, -x - 11, zS, -x, 30, r.range(9, 16), 'gable', 'plaster', 0.5, 'both', true);
  }

  /* ---------------- Anchors (time passages) ---------------- */
  anchor({ id: 'p.station', label: 'Station entrance', kind: 'doorway', x: entranceX, z: zN - T / 2, nx: 0, nz: 1, width: entW, height: 4.4, depth: 1.6 });
  anchor({ id: 'p.arch', label: 'Courtyard archway', kind: 'arch', x: (archX0 + archX1) / 2, z: zN, nx: 0, nz: 1, width: arr.archW, height: 4.4, depth: 1.6 });
  anchor({ id: 'p.depot', label: 'Depot side door', kind: 'door', x: alX0 - T / 2, z: sideDoorZ, nx: 1, nz: 0, width: 1.4, height: 2.4, depth: 1.4 });
  anchor({ id: 'p.cinema', label: 'Print shop door', kind: 'door', x: cinDoorX, z: zS + T / 2, nx: 0, nz: -1, width: 2.4, height: 2.8, depth: 1.5 });

  /* ---------------- Street ---------------- */
  region('loc.street', 'Tram Street', -46, zN, 46, zS);
  region('loc.cross', 'Cross street', csX0, zS, csX1, crossEnd);
  const brokenA = cinemaBrokenStart(cinX0, cinX1, cinDoorX);
  const brokenX0 = Math.min(X(brokenA[0]), X(brokenA[1])), brokenX1 = Math.max(X(brokenA[0]), X(brokenA[1]));
  const lamps: Pt[] = [];
  for (let x = -38; x <= 38; x += r.range(11, 14)) {
    lamps.push({ x: X(x), z: zN + 0.8 });
    lamps.push({ x: X(x + 5.5), z: zS - 0.8 });
  }

  /* ---------------- NPC paths (clerk) ---------------- */
  const inZ = zN - 1.8, outZ = zN + 1.6;
  path('clerk.window', [[deskX, deskZ + 1], [archWinX, aRear + 1.3]]);
  path('clerk.toCrate', [[deskX, deskZ + 1], [cx1 + 1.6, zN - 2.6]]);
  const toStreet: [number, number][] = [[cx1 + 1.6, zN - 2.6], [cx1 + 1.2, archDoorZ], [cx1 - 1.4, archDoorZ], [entranceX, inZ], [entranceX, outZ]];
  path('clerk.toPrint', [...toStreet, [cinDoorX, zS - 1.5], [cinDoorX, zS + 1.5], [X(plate.x) , plate.z - 0.9]]);
  path('clerk.toDepot', [...toStreet, [(alX0 + cx0) / 2, outZ], [(alX0 + cx0) / 2, sideDoorZ], [alX0 - 1.4, sideDoorZ], [dX0 + 2.6, sideDoorZ], [dX0 + 2.0, spots['depot.shelf'] ? spots['depot.shelf'].z : zN - 4]]);

  /* ---------------- Start composition ---------------- */
  const startX = Math.max(cinX0 + 1.2, Math.min(cinX1 - 1.5, cinDoorX + 2.9));
  const clock = spots['clock'];
  const sX = X(startX), sZ = zS - 1.25;
  const dx = clock.x - sX, dz = clock.z - sZ;
  // yaw: facing direction (sin(yaw), -cos(yaw)) so yaw=0 looks north (-z). Aim a little to the
  // street side of the clock so the clock sits just off centre and the broken rail enters frame.
  const baseYaw = Math.atan2(dx, -dz);
  const yaw = baseYaw - Math.sign(dx || 1) * 0.12;
  const pitch = 0.1;

  // Weather accents: puddles concentrated near practical lights and the opening foreground.
  const puddles: Layout['weather']['puddles'] = [];
  const fwdX = Math.sin(yaw), fwdZ = -Math.cos(yaw);
  puddles.push({ x: sX + fwdX * 2.6, z: Math.min(sZ + fwdZ * 2.6, zS - 2.9), r: 1.5 });
  puddles.push({ x: sX + fwdX * 6, z: sZ + fwdZ * 6, r: 1.8 });
  puddles.push({ x: X(entranceX) + 1, z: zN + 3.5, r: 2.0 });
  for (let i = 0; i < 9; i++) puddles.push({ x: r.range(-36, 36), z: r.range(-5.5, 5.5), r: r.range(0.8, 2.2) });

  const colliderRects = buildColliders(walls, blocks, props, { zN, zS, csX0: Math.min(X(csX0), X(csX1)), csX1: Math.max(X(csX0), X(csX1)), crossEnd });

  return {
    seed,
    arrangement: arr.name,
    mirror,
    walls, blocks, facades, rooms, props, anchors, regions, spots, paths, colliderRects,
    street: { x0: -40, x1: 40, zN, zS, brokenX0, brokenX1, crossX0: Math.min(X(csX0), X(csX1)), crossX1: Math.max(X(csX0), X(csX1)), crossEnd },
    start: { x: sX, z: sZ, yaw, pitch },
    weather: { rain: r.range(0.7, 1), fog: r.range(0.018, 0.026), puddles, wind: r.range(-0.4, 0.4) },
    lamps,
    tenants,
  };
}

/** Static colliders. Openings whose passability depends on era are emitted with era tags; dynamic
 * openings (the alley gate) get their own id so the world can toggle them from history facts. */
function buildColliders(walls: Wall[], blocks: Block[], props: Prop[], s: { zN: number; zS: number; csX0: number; csX1: number; crossEnd: number }) {
  const out: { rect: Rect; eras: EraSet; id: string }[] = [];
  for (const w of walls) {
    const segs = splitWall(w);
    for (const sg of segs) out.push({ rect: wallRect(w, sg.a, sg.b), eras: w.eras, id: w.id });
    for (const o of w.openings) {
      if (o.kind === 'window' || o.bottom > 0.5) continue;
      const rect = wallRect(w, o.a, o.b);
      if (o.dynamic) out.push({ rect, eras: 'both', id: `dyn:${o.id}` });
      else if (o.open === 'past') out.push({ rect, eras: 'present', id: `${w.id}:${o.id}` });
      else if (o.open === 'present') out.push({ rect, eras: 'past', id: `${w.id}:${o.id}` });
      else if (o.open !== 'both') out.push({ rect, eras: 'both', id: `${w.id}:${o.id}` });
    }
  }
  for (const b of blocks) if (b.h > 0) out.push({ rect: b.rect, eras: b.eras, id: b.id });
  for (const p of props) {
    if (!p.collide) continue;
    const c = Math.abs(Math.cos(p.yaw)), sn = Math.abs(Math.sin(p.yaw));
    const hw = (p.w * c + p.d * sn) / 2, hd = (p.w * sn + p.d * c) / 2;
    out.push({ rect: { x0: p.x - hw, z0: p.z - hd, x1: p.x + hw, z1: p.z + hd }, eras: p.eras, id: p.id });
  }
  // Outer bounds of the playable block.
  out.push({ rect: { x0: -60, z0: -8, x1: -40, z1: 8 }, eras: 'both', id: 'bound.w' });
  out.push({ rect: { x0: 40, z0: -8, x1: 60, z1: 8 }, eras: 'both', id: 'bound.e' });
  out.push({ rect: { x0: s.csX0 - 1, z0: s.crossEnd + 0.3, x1: s.csX1 + 1, z1: s.crossEnd + 6 }, eras: 'both', id: 'bound.cross' });
  return out;
}

export function splitWall(w: Wall): { a: number; b: number }[] {
  // Solid wall segments between ground-reaching openings; windows don't split collision.
  const gaps = w.openings.filter((o) => o.kind !== 'window' && o.bottom <= 0.5).map((o) => [o.a, o.b]).sort((p, q) => p[0] - q[0]);
  const segs: { a: number; b: number }[] = [];
  let cur = w.a;
  for (const [a, b] of gaps) {
    if (a > cur) segs.push({ a: cur, b: a });
    cur = Math.max(cur, b);
  }
  if (cur < w.b) segs.push({ a: cur, b: w.b });
  return segs;
}

export function wallRect(w: Wall, a: number, b: number): Rect {
  const h = w.t / 2;
  return w.axis === 'x' ? { x0: a, z0: w.c - h, x1: b, z1: w.c + h } : { x0: w.c - h, z0: a, x1: w.c + h, z1: b };
}

export function regionAt(l: Layout, x: number, z: number): string {
  // Smallest containing region wins so rooms beat the street.
  let best = 'loc.street', area = Infinity;
  for (const rg of l.regions) {
    const r = rg.rect;
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
      const a = (r.x1 - r.x0) * (r.z1 - r.z0);
      if (a < area) { area = a; best = rg.id; }
    }
  }
  return best;
}

export type { Rng };
export const eraLabel = (e: Era) => (e === 'past' ? 'Past' : 'Present');

/** The torn-up rail section sits just ahead of the opening position so it enters the first frame. */
function cinemaBrokenStart(cinX0: number, cinX1: number, doorX: number): [number, number] {
  const sx = Math.max(cinX0 + 1.2, Math.min(cinX1 - 1.5, doorX + 2.9));
  return [sx - 4.5, sx + 2.2];
}
