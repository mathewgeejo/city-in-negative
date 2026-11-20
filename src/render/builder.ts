import * as THREE from 'three';

/* Static geometry accumulator. Boxes and quads are written straight into typed-array-backed lists
 * with world-space UVs and baked ambient shading in vertex colour, then merged per street section
 * and material so frustum culling still works at block scale. */

export type MatKey = 'masonry' | 'brick' | 'plaster' | 'wood' | 'setts' | 'flags' | 'mosaic' | 'plain' | 'road' | 'emissive' | 'atlas' | 'atlasLit' | 'glass';

const UV_SCALE: Record<MatKey, number> = {
  masonry: 3.2, brick: 2.2, plaster: 4, wood: 1.6, setts: 3, flags: 4, mosaic: 3.2, plain: 4, road: 4, emissive: 1, atlas: 1, atlasLit: 1, glass: 1,
};

class Buf {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
}

const SECTION = 22;

export interface BoxOpts {
  /** faces to skip: 'px','nx','py','ny','pz','nz' */
  skip?: string[];
  /** contact darkening near the ground */
  ao?: boolean;
  /** extra darkening of the top face (e.g. roofs) or brightening (<1 darkens) */
  topMul?: number;
  uvScale?: number;
}

export class GeoBuilder {
  private bufs = new Map<string, Buf>();
  private tmp = new THREE.Color();

  private buf(mat: MatKey, cx: number, cz: number, forceSection?: string): Buf {
    const s = forceSection ?? `${Math.floor(cx / SECTION)},${Math.floor(cz / SECTION)}`;
    const k = `${s}|${mat}`;
    let b = this.bufs.get(k);
    if (!b) { b = new Buf(); this.bufs.set(k, b); }
    return b;
  }

  /** Axis-aligned box. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: THREE.Color, mat: MatKey, o: BoxOpts = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    const b = this.buf(mat, (x0 + x1) / 2, (z0 + z1) / 2);
    const s = o.uvScale ?? UV_SCALE[mat];
    const skip = o.skip;
    const ao = o.ao !== false;
    const face = (id: string, verts: number[][], n: number[], uvf: (v: number[]) => [number, number], shade: number) => {
      if (skip && skip.includes(id)) return;
      const base = b.pos.length / 3;
      for (const v of verts) {
        b.pos.push(v[0], v[1], v[2]);
        b.nor.push(n[0], n[1], n[2]);
        const [u, w] = uvf(v);
        b.uv.push(u, w);
        let k = shade;
        if (ao && n[1] === 0) k *= 0.58 + 0.42 * Math.min(1, Math.max(0, v[1] / 1.6));
        b.col.push(color.r * k, color.g * k, color.b * k);
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const top = o.topMul ?? 1.0;
    face('pz', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], (v) => [v[0] / s, v[1] / s], 1);
    face('nz', [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], (v) => [-v[0] / s, v[1] / s], 1);
    face('px', [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], (v) => [-v[2] / s, v[1] / s], 0.96);
    face('nx', [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], (v) => [v[2] / s, v[1] / s], 0.96);
    face('py', [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], (v) => [v[0] / s, -v[2] / s], top);
    face('ny', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], (v) => [v[0] / s, v[2] / s], 0.55);
  }

  /** Box rotated about Y around its centre (for props). Uses local UVs. */
  rbox(cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, color: THREE.Color, mat: MatKey, ao = true) {
    if (Math.abs(Math.sin(yaw)) < 1e-3 || Math.abs(Math.cos(yaw)) < 1e-3) {
      const sw = Math.abs(Math.cos(yaw)) > 0.5;
      const hw = (sw ? w : d) / 2, hd = (sw ? d : w) / 2;
      this.box(cx - hw, y0, cz - hd, cx + hw, y0 + h, cz + hd, color, mat, { ao });
      return;
    }
    const b = this.buf(mat, cx, cz);
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (lx: number, ly: number, lz: number) => [cx + lx * c + lz * sn, y0 + ly, cz - lx * sn + lz * c];
    const N = (lx: number, ly: number, lz: number) => [lx * c + lz * sn, ly, -lx * sn + lz * c];
    const hw = w / 2, hd = d / 2;
    const faces: [number[][], number[], number][] = [
      [[P(-hw, 0, hd), P(hw, 0, hd), P(hw, h, hd), P(-hw, h, hd)], N(0, 0, 1), 1],
      [[P(hw, 0, -hd), P(-hw, 0, -hd), P(-hw, h, -hd), P(hw, h, -hd)], N(0, 0, -1), 1],
      [[P(hw, 0, hd), P(hw, 0, -hd), P(hw, h, -hd), P(hw, h, hd)], N(1, 0, 0), 0.95],
      [[P(-hw, 0, -hd), P(-hw, 0, hd), P(-hw, h, hd), P(-hw, h, -hd)], N(-1, 0, 0), 0.95],
      [[P(-hw, h, hd), P(hw, h, hd), P(hw, h, -hd), P(-hw, h, -hd)], [0, 1, 0], 1.05],
    ];
    const s = UV_SCALE[mat];
    for (const [verts, n, shade] of faces) {
      const base = b.pos.length / 3;
      verts.forEach((v, i) => {
        b.pos.push(v[0], v[1], v[2]);
        b.nor.push(n[0], n[1], n[2]);
        b.uv.push(((i === 1 || i === 2) ? w : 0) / s, ((i >= 2) ? h : 0) / s);
        let k = shade;
        if (ao && n[1] === 0) k *= 0.6 + 0.4 * Math.min(1, (v[1]) / 1.4);
        b.col.push(color.r * k, color.g * k, color.b * k);
      });
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  /** Vertical or horizontal textured quad from 4 corners (counter-clockwise seen from the front). */
  quad(p: number[][], n: number[], color: THREE.Color, mat: MatKey, uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const cx = (p[0][0] + p[2][0]) / 2, cz = (p[0][2] + p[2][2]) / 2;
    const b = this.buf(mat, cx, cz);
    const base = b.pos.length / 3;
    p.forEach((v, i) => {
      b.pos.push(v[0], v[1], v[2]);
      b.nor.push(n[0], n[1], n[2]);
      b.uv.push(uv[i][0], uv[i][1]);
      b.col.push(color.r, color.g, color.b);
    });
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Quad on a wall plane facing +z/-z/+x/-x, centred at (x,y,z), sized w×h, mapped to atlas slot. */
  plate(x: number, y: number, z: number, w: number, h: number, facing: 'pz' | 'nz' | 'px' | 'nx', color: THREE.Color, mat: MatKey, slot?: { u0: number; v0: number; u1: number; v1: number }) {
    const hw = w / 2, hh = h / 2;
    const uv: [number, number][] = slot ? [[slot.u0, slot.v0], [slot.u1, slot.v0], [slot.u1, slot.v1], [slot.u0, slot.v1]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (facing === 'pz') this.quad([[x - hw, y - hh, z], [x + hw, y - hh, z], [x + hw, y + hh, z], [x - hw, y + hh, z]], [0, 0, 1], color, mat, uv);
    else if (facing === 'nz') this.quad([[x + hw, y - hh, z], [x - hw, y - hh, z], [x - hw, y + hh, z], [x + hw, y + hh, z]], [0, 0, -1], color, mat, uv);
    else if (facing === 'px') this.quad([[x, y - hh, z + hw], [x, y - hh, z - hw], [x, y + hh, z - hw], [x, y + hh, z + hw]], [1, 0, 0], color, mat, uv);
    else this.quad([[x, y - hh, z - hw], [x, y - hh, z + hw], [x, y + hh, z + hw], [x, y + hh, z - hw]], [-1, 0, 0], color, mat, uv);
  }

  /** Gable roof prism over a rect, ridge along the longer axis. */
  gable(x0: number, z0: number, x1: number, z1: number, y: number, rise: number, color: THREE.Color, mat: MatKey, overhang = 0.35) {
    const alongX = x1 - x0 >= z1 - z0;
    x0 -= overhang; x1 += overhang; z0 -= overhang; z1 += overhang;
    const b = this.buf(mat, (x0 + x1) / 2, (z0 + z1) / 2);
    const s = UV_SCALE[mat];
    const push = (verts: number[][], n: number[], shade: number) => {
      const base = b.pos.length / 3;
      const len = Math.hypot(n[0], n[1], n[2]);
      for (const v of verts) {
        b.pos.push(v[0], v[1], v[2]);
        b.nor.push(n[0] / len, n[1] / len, n[2] / len);
        b.uv.push((alongX ? v[0] : v[2]) / s, (alongX ? v[2] : v[0]) / s + v[1] / s);
        b.col.push(color.r * shade, color.g * shade, color.b * shade);
      }
      if (verts.length === 4) b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else b.idx.push(base, base + 1, base + 2);
    };
    const top = y + rise;
    if (alongX) {
      const zm = (z0 + z1) / 2, hz = (z1 - z0) / 2;
      push([[x0, y, z1], [x1, y, z1], [x1, top, zm], [x0, top, zm]], [0, hz, rise], 1);
      push([[x1, y, z0], [x0, y, z0], [x0, top, zm], [x1, top, zm]], [0, hz, -rise], 0.8);
      push([[x0, y, z0], [x0, y, z1], [x0, top, zm]], [-1, 0, 0], 0.9);
      push([[x1, y, z1], [x1, y, z0], [x1, top, zm]], [1, 0, 0], 0.9);
    } else {
      const xm = (x0 + x1) / 2, hx = (x1 - x0) / 2;
      push([[x1, y, z1], [x1, y, z0], [xm, top, z0], [xm, top, z1]], [hx, rise, 0], 0.95);
      push([[x0, y, z0], [x0, y, z1], [xm, top, z1], [xm, top, z0]], [-hx, rise, 0], 0.85);
      push([[x0, y, z1], [x1, y, z1], [xm, top, z1]], [0, 0, 1], 0.9);
      push([[x1, y, z0], [x0, y, z0], [xm, top, z0]], [0, 0, -1], 0.9);
    }
  }

  /** Half-annulus arch ring in a wall plane (z = const), opening centred at x, springing at y. */
  archRing(x: number, y: number, z: number, rIn: number, rOut: number, depth: number, color: THREE.Color, mat: MatKey, segs = 10) {
    for (let i = 0; i < segs; i++) {
      const a0 = (Math.PI * i) / segs, a1 = (Math.PI * (i + 1)) / segs;
      const am = (a0 + a1) / 2;
      // voussoir as a small box approximated by a quad pair front/back + top
      const p = (a: number, r: number, zz: number) => [x + Math.cos(a) * r, y + Math.sin(a) * r, zz];
      const zf = z + depth / 2, zb = z - depth / 2;
      const shade = i % 2 ? 1 : 0.93;
      const cc = this.tmp.copy(color).multiplyScalar(shade).clone();
      this.quad([p(a1, rIn, zf), p(a0, rIn, zf), p(a0, rOut, zf), p(a1, rOut, zf)], [0, 0, 1], cc, mat);
      this.quad([p(a0, rIn, zb), p(a1, rIn, zb), p(a1, rOut, zb), p(a0, rOut, zb)], [0, 0, -1], cc, mat);
      this.quad([p(a1, rIn, zb), p(a0, rIn, zb), p(a0, rIn, zf), p(a1, rIn, zf)], [-Math.cos(am), -Math.sin(am), 0], cc.clone().multiplyScalar(0.8), mat);
    }
  }

  /** Filled half-disc (tympanum) in a z plane. */
  halfDisc(x: number, y: number, z: number, r: number, facing: 1 | -1, color: THREE.Color, mat: MatKey, segs = 12) {
    for (let i = 0; i < segs; i++) {
      const a0 = (Math.PI * i) / segs, a1 = (Math.PI * (i + 1)) / segs;
      const v0 = [x, y, z], v1 = [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], v2 = [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z];
      const pts = facing > 0 ? [v0, v1, v2, v2] : [v0, v2, v1, v1];
      const s = 2.2;
      this.quad(pts, [0, 0, facing], color, mat, pts.map((p) => [p[0] / s, p[1] / s]) as [number, number][]);
    }
  }

  build(materials: Record<MatKey, THREE.Material>, group: THREE.Group, opts: { castShadow: (mat: MatKey) => boolean; receiveShadow: boolean }) {
    const meshes: THREE.Mesh[] = [];
    for (const [k, b] of this.bufs) {
      if (!b.idx.length) continue;
      const mat = k.split('|')[1] as MatKey;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, materials[mat]);
      m.matrixAutoUpdate = false;
      m.castShadow = opts.castShadow(mat);
      m.receiveShadow = opts.receiveShadow && mat !== 'emissive' && mat !== 'glass';
      m.name = k;
      group.add(m);
      meshes.push(m);
    }
    this.bufs.clear();
    return meshes;
  }
}

/** Instanced repeated details (windows, railings, lamps, kerbs). */
export class Instancer {
  private mats: THREE.Matrix4[] = [];
  private cols: THREE.Color[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  constructor(private geo: THREE.BufferGeometry, private mat: THREE.Material, private name: string) {}
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, color: THREE.Color, pitch = 0) {
    this.e.set(pitch, yaw, 0);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.mats.push(this.m.clone());
    this.cols.push(color.clone());
  }
  get count() { return this.mats.length; }
  build(group: THREE.Group, cast = false, receive = true): THREE.InstancedMesh | null {
    if (!this.mats.length) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.mats.length);
    this.mats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, this.cols[i]); });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = cast;
    im.receiveShadow = receive;
    im.name = this.name;
    group.add(im);
    return im;
  }
}
