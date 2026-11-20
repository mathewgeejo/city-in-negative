import * as THREE from 'three';
import type { MatKey } from './builder';
import {
  ashlarTexture, brickTexture, flagsTexture, glowTexture, mosaicTexture, plasterTexture, settsTexture, streakTexture,
  woodTexture, wetRoughnessTexture,
} from './textures';

/** Materials and textures shared by both eras (era colour lives in vertex/instance colour). */
export class Materials {
  readonly tex = {
    ashlar: ashlarTexture(), brick: brickTexture(), plaster: plasterTexture(), wood: woodTexture(), setts: settsTexture(),
    flags: flagsTexture(), mosaic: mosaicTexture(), wet: wetRoughnessTexture(), streak: streakTexture(), glow: glowTexture(),
  };
  readonly byKey: Record<MatKey, THREE.Material>;
  readonly roadWet: THREE.MeshStandardMaterial;
  readonly roadDry: THREE.MeshLambertMaterial;
  readonly inst: { glass: THREE.MeshBasicMaterial; lambert: THREE.MeshLambertMaterial; emissive: THREE.MeshBasicMaterial };
  readonly streak: THREE.MeshBasicMaterial;
  readonly glow: THREE.SpriteMaterial;
  readonly puddle: THREE.MeshStandardMaterial;
  readonly figure: THREE.MeshLambertMaterial;
  private atlasMats: THREE.Material[] = [];

  constructor() {
    const L = (map?: THREE.Texture) => new THREE.MeshLambertMaterial({ map: map ?? null, vertexColors: true });
    const t = this.tex;
    this.roadWet = new THREE.MeshStandardMaterial({ map: t.setts, roughnessMap: t.wet, roughness: 1, metalness: 0, vertexColors: true, envMapIntensity: 0.9 });
    this.roadDry = L(t.setts);
    const atlas = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: false, alphaTest: 0.35 });
    const atlasLit = new THREE.MeshBasicMaterial({ vertexColors: true, alphaTest: 0.35 });
    this.atlasMats = [atlas, atlasLit];
    this.byKey = {
      masonry: L(t.ashlar), brick: L(t.brick), plaster: L(t.plaster), wood: L(t.wood), setts: L(t.setts), flags: L(t.flags),
      mosaic: L(t.mosaic), plain: L(), road: this.roadWet, emissive: new THREE.MeshBasicMaterial({ vertexColors: true }),
      atlas, atlasLit, glass: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
    this.inst = {
      glass: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      lambert: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      emissive: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    };
    this.streak = new THREE.MeshBasicMaterial({ map: t.streak, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xf1bb70, fog: true, toneMapped: true });
    this.glow = new THREE.SpriteMaterial({ map: t.glow, color: 0xf1bb70, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.puddle = new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.78, envMapIntensity: 1.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.figure = new THREE.MeshLambertMaterial({ vertexColors: true });
  }

  /** Bind the per-world lettering/document atlas. */
  setAtlas(t: THREE.Texture) {
    for (const m of this.atlasMats) { (m as THREE.MeshBasicMaterial).map = t; m.needsUpdate = true; }
  }

  dispose() {
    Object.values(this.tex).forEach((t) => t.dispose());
    new Set([...Object.values(this.byKey), this.roadDry, ...Object.values(this.inst), this.streak, this.glow, this.puddle, this.figure]).forEach((m) => m.dispose());
  }
}
