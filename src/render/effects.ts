import * as THREE from 'three';

/** Gradient sky dome. Cheap: one draw, no lighting, fogless. */
export function skyDome(zenith: string, horizon: string, glow: string, glowDir: THREE.Vector3): THREE.Mesh {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uZ: { value: new THREE.Color(zenith) }, uH: { value: new THREE.Color(horizon) }, uG: { value: new THREE.Color(glow) }, uD: { value: glowDir.clone().normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uZ; uniform vec3 uH; uniform vec3 uG; uniform vec3 uD; varying vec3 vP;
      void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 c = mix(uH, uZ, pow(h, 0.55));
      float g = pow(max(dot(vP, uD), 0.0), 6.0); c += uG * g * 0.6; gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

/** Sparse rain streaks around the viewer; brighter near practical lights so they read only there. */
export class Rain {
  readonly mesh: THREE.LineSegments;
  private mat: THREE.ShaderMaterial;
  constructor(count: number, lights: THREE.Vector3[], wind: number) {
    const pos = new Float32Array(count * 6);
    const seed = new Float32Array(count * 2);
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const x = rnd() * 28 - 14, y = rnd() * 12, z = rnd() * 28 - 14;
      pos.set([x, y, z, x, y, z], i * 6);
      seed[i * 2] = 0; seed[i * 2 + 1] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(seed, 1));
    const L = lights.slice(0, 6);
    while (L.length < 6) L.push(new THREE.Vector3(0, -100, 0));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uL: { value: L }, uWind: { value: wind }, uAmt: { value: 1 } },
      vertexShader: `uniform float uT; uniform vec3 uCam; uniform vec3 uL[6]; uniform float uWind; attribute float aEnd; varying float vA;
        void main(){
          vec3 p = position;
          float sp = 9.0;
          p.y = mod(p.y - uT * sp, 12.0);
          vec3 base = uCam + vec3(mod(p.x - uCam.x + 14.0, 28.0) - 14.0, p.y - 2.0, mod(p.z - uCam.z + 14.0, 28.0) - 14.0);
          base.x += p.y * uWind * 0.08;
          base.y -= aEnd * 0.42; base.x -= aEnd * uWind * 0.04;
          float lit = 0.0;
          for (int i = 0; i < 6; i++) { float d = distance(base, uL[i]); lit += 1.0 / (1.0 + d * d * 0.32); }
          float dc = distance(base, uCam);
          vA = (clamp(lit, 0.0, 1.2) + 0.07) * smoothstep(0.6, 2.0, dc) * smoothstep(14.0, 8.0, dc);
          gl_Position = projectionMatrix * viewMatrix * vec4(base, 1.0);
        }`,
      fragmentShader: `uniform float uAmt; varying float vA; void main(){ gl_FragColor = vec4(vec3(0.95,0.86,0.70) * vA * 0.5 * uAmt, 1.0); }`,
    });
    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }
  update(t: number, cam: THREE.Vector3) {
    this.mat.uniforms.uT.value = t;
    (this.mat.uniforms.uCam.value as THREE.Vector3).copy(cam);
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

/** Reflections of practical lights on wet paving: ground-hugging streaks that stretch toward the
 * viewer, as a reflection would. Updated per frame without allocation. */
export class Streaks {
  readonly group = new THREE.Group();
  private items: { mesh: THREE.Mesh; light: THREE.Vector3; len: number }[] = [];
  private tmp = new THREE.Vector3();
  constructor(private mat: THREE.MeshBasicMaterial) {}
  add(light: THREE.Vector3, ground: THREE.Vector3, color: THREE.Color, width: number, len: number, strength: number) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    geo.rotateX(-Math.PI / 2);
    const m = this.mat.clone();
    m.color.copy(color).multiplyScalar(strength);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(ground).setY(0.03);
    mesh.scale.set(width, 1, len);
    mesh.renderOrder = 3;
    this.group.add(mesh);
    this.items.push({ mesh, light, len });
  }
  update(cam: THREE.Vector3, t: number) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const d = this.tmp.set(cam.x - it.mesh.position.x, 0, cam.z - it.mesh.position.z);
      const dist = d.length();
      it.mesh.rotation.y = Math.atan2(-d.x, -d.z);
      // reflection stretches with grazing angle and shimmers slightly as rain breaks the surface
      const graze = THREE.MathUtils.clamp(dist / 10, 0.4, 1.6);
      it.mesh.scale.z = it.len * graze * (0.94 + 0.06 * Math.sin(t * 7 + i * 1.7));
      it.mesh.visible = dist < 45;
    }
  }
  dispose() { this.items.forEach((i) => { i.mesh.geometry.dispose(); (i.mesh.material as THREE.Material).dispose(); }); }
}

/** Drips falling from the awning edge with a tiny splash; positions recycled, no allocation. */
export class Drips {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  constructor(private origins: THREE.Vector3[], private groundY = 0.02) {
    const n = origins.length;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n);
    origins.forEach((o, i) => { this.pos.set([o.x, o.y - Math.random() * 3, o.z], i * 3); });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xf6d9a6, size: 0.035, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
  }
  /** returns index of a drip that just landed (for sound), or -1 */
  update(dt: number): number {
    let landed = -1;
    for (let i = 0; i < this.origins.length; i++) {
      this.vel[i] += 9.8 * dt;
      this.pos[i * 3 + 1] -= this.vel[i] * dt;
      if (this.pos[i * 3 + 1] < this.groundY) {
        const o = this.origins[i];
        this.pos[i * 3 + 1] = o.y + Math.random() * 0.6; // wait on the edge a moment
        this.vel[i] = -Math.random() * 2.2;
        landed = i;
      }
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    return landed;
  }
  dispose() { this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose(); }
}
