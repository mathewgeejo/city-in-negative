import * as THREE from 'three';

const GRADE = `
uniform sampler2D tSrc; uniform float uTime; uniform vec2 uGhost; uniform float uGhostMix; uniform float uExposure; uniform float uGrain; uniform float uEncode;
varying vec2 vUv;
vec3 neutralTM(vec3 color){
  const float S = 0.76; const float D = 0.15;
  color *= uExposure;
  float x = min(color.r, min(color.g, color.b));
  float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= off;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < S) return color;
  float d = 1.0 - S;
  float np = 1.0 - d * d / (peak + d - S);
  color *= np / peak;
  float g = 1.0 - 1.0 / (D * (peak - np) + 1.0);
  return mix(color, vec3(np), g);
}
vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 a = texture2D(tSrc, vUv).rgb;
  vec3 b = texture2D(tSrc, clamp(vUv + uGhost, 0.0, 1.0)).rgb;
  vec3 c = mix(a, (a + b) * 0.5, uGhostMix);
  c = toSRGB(neutralTM(c));
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.35;
  c += (hash(vUv * 731.0 + uTime) - 0.5) * uGrain;
  gl_FragColor = vec4(c, 1.0);
}`;

export interface Rect { x: number; y: number; w: number; h: number }

/** Owns the WebGL renderer, the main camera and the viewfinder pass. */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.08, 420);
  private vfCam = new THREE.PerspectiveCamera();
  private vfRT: THREE.WebGLRenderTarget;
  private capRT: THREE.WebGLRenderTarget;
  private capOut: THREE.WebGLRenderTarget;
  private comp: { scene: THREE.Scene; cam: THREE.OrthographicCamera; quad: THREE.Mesh; mat: THREE.ShaderMaterial };
  renderScale = 1;
  vfScale = 0.75;
  vfMaxWidth = 1100;
  readonly stats = { mainCalls: 0, vfCalls: 0, vfActive: false, tris: 0 };
  private W = 1; private H = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.gl.toneMapping = THREE.NeutralToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.info.autoReset = false;
    const opts = { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 };
    this.vfRT = new THREE.WebGLRenderTarget(4, 4, opts);
    this.capRT = new THREE.WebGLRenderTarget(4, 4, opts);
    this.capOut = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, depthBuffer: false });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: this.vfRT.texture }, uTime: { value: 0 }, uGhost: { value: new THREE.Vector2() }, uGhostMix: { value: 0 }, uExposure: { value: 1 }, uGrain: { value: 0.035 }, uEncode: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: GRADE,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), mat);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    this.comp = { scene, cam: new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1), quad, mat };
    this.resize();
  }

  get size() { return { w: this.W, h: this.H }; }

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H;
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio) * this.renderScale);
    this.gl.setSize(W, H, false);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    const r = this.viewfinderRect();
    const dpr = this.gl.getPixelRatio();
    const vw = Math.min(this.vfMaxWidth, Math.round(r.w * dpr * this.vfScale));
    this.vfRT.setSize(vw, Math.round(vw / 1.5));
    this.comp.cam.right = W; this.comp.cam.top = H; this.comp.cam.updateProjectionMatrix();
  }

  /** Viewfinder rectangle in CSS pixels, top-left origin. 3:2 like the prints. */
  viewfinderRect(): Rect {
    const W = this.W, H = this.H;
    const w = Math.round(Math.min(W * 0.62, H * 0.66 * 1.5));
    const h = Math.round(w / 1.5);
    return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2 - H * 0.02), w, h };
  }

  private setVfCam() {
    const r = this.viewfinderRect();
    this.vfCam.copy(this.camera);
    this.vfCam.setViewOffset(this.W, this.H, r.x, r.y, r.w, r.h);
    this.vfCam.updateProjectionMatrix();
    return r;
  }

  render(active: THREE.Scene, other: THREE.Scene | null, t: number, ghost?: { x: number; y: number; mix: number }) {
    const gl = this.gl;
    gl.info.reset();
    gl.setRenderTarget(null);
    gl.render(active, this.camera);
    this.stats.mainCalls = gl.info.render.calls;
    this.stats.tris = gl.info.render.triangles;
    this.stats.vfActive = !!other;
    if (!other) { this.stats.vfCalls = 0; return; }
    // Second pass: the other era through the same projection, bounded to the viewfinder.
    const r = this.setVfCam();
    gl.setRenderTarget(this.vfRT);
    gl.clear();
    gl.render(other, this.vfCam);
    gl.setRenderTarget(null);
    const u = this.comp.mat.uniforms;
    u.tSrc.value = this.vfRT.texture;
    u.uTime.value = t % 10;
    u.uGhost.value.set(ghost?.x ?? 0, ghost?.y ?? 0);
    u.uGhostMix.value = ghost?.mix ?? 0;
    u.uGrain.value = 0.03;
    this.comp.quad.position.set(r.x, this.H - r.y - r.h, 0);
    this.comp.quad.scale.set(r.w, r.h, 1);
    this.comp.quad.updateMatrixWorld();
    gl.autoClear = false;
    gl.render(this.comp.scene, this.comp.cam);
    gl.autoClear = true;
    this.stats.vfCalls = gl.info.render.calls - this.stats.mainCalls;
  }

  /** Expose the other era at bounded resolution; returns an sRGB canvas. */
  capture(other: THREE.Scene, maxW = 960): HTMLCanvasElement {
    const gl = this.gl;
    const r = this.setVfCam();
    const dpr = gl.getPixelRatio();
    const w = Math.min(maxW, Math.round(r.w * dpr)), h = Math.round(w / 1.5);
    this.capRT.setSize(w, h);
    this.capOut.setSize(w, h);
    gl.setRenderTarget(this.capRT);
    gl.clear();
    gl.render(other, this.vfCam);
    const u = this.comp.mat.uniforms;
    u.tSrc.value = this.capRT.texture;
    u.uGhostMix.value = 0;
    u.uGrain.value = 0.025;
    this.comp.quad.position.set(0, 0, 0);
    this.comp.quad.scale.set(this.W, this.H, 1);
    this.comp.quad.updateMatrixWorld();
    gl.setRenderTarget(this.capOut);
    gl.render(this.comp.scene, this.comp.cam);
    const px = new Uint8Array(w * h * 4);
    gl.readRenderTargetPixels(this.capOut, 0, 0, w, h, px);
    gl.setRenderTarget(null);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    g.putImageData(img, 0, 0);
    u.tSrc.value = this.vfRT.texture;
    return c;
  }

  /** World point → CSS pixel position; z>1 means behind camera. */
  project(v: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(v).project(this.camera);
    const behind = out.z > 1;
    out.set((out.x * 0.5 + 0.5) * this.W, (-out.y * 0.5 + 0.5) * this.H, behind ? 2 : out.z);
    return out;
  }

  dispose() {
    this.vfRT.dispose(); this.capRT.dispose(); this.capOut.dispose();
    this.comp.mat.dispose(); this.comp.quad.geometry.dispose();
    this.gl.dispose();
  }
}
