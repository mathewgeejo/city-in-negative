import type * as THREE from 'three';
import type { Rect } from '../core/types';
import { PLAYER_R, resolveCircle } from '../sim/collision';

/** Keyboard/mouse state, abstracted into actions. */
export class Input {
  keys = new Set<string>();
  dx = 0; dy = 0;
  pressed = new Set<string>();
  locked = false;
  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; } });
    addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.pressed.add('Mouse0'); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.el; });
  }
  lock() { if (!this.locked) void (this.el.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  /** consume a one-shot press */
  hit(code: string) { const h = this.pressed.has(code); this.pressed.delete(code); return h; }
  endFrame() { this.pressed.clear(); this.dx = 0; this.dy = 0; }
}

/** First-person walker on the ground plane with restrained camera motion. */
export class Player {
  x = 0; z = 0; yaw = 0; pitch = 0;
  vx = 0; vz = 0;
  eye = 1.62;
  private bob = 0;
  private p = { x: 0, z: 0 };
  sensitivity = 1;
  headBob = true;
  invertY = false;
  slow = 1;

  place(x: number, z: number, yaw: number, pitch = 0) { this.x = x; this.z = z; this.yaw = yaw; this.pitch = pitch; this.vx = this.vz = 0; }

  update(dt: number, inp: Input, rects: Rect[], enabled: boolean) {
    if (enabled) {
      const s = 0.0022 * this.sensitivity;
      this.yaw += inp.dx * s;
      this.pitch -= inp.dy * s * (this.invertY ? -1 : 1);
      this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch));
    }
    let fx = 0, fz = 0;
    if (enabled) {
      const k = inp.keys;
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      fx = sy * f + cy * r;
      fz = -cy * f + sy * r;
      const len = Math.hypot(fx, fz);
      if (len > 0) { fx /= len; fz /= len; }
      const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 4.6 : 3.0) * this.slow;
      fx *= speed; fz *= speed;
    }
    const a = 1 - Math.exp(-dt * 10);
    this.vx += (fx - this.vx) * a;
    this.vz += (fz - this.vz) * a;
    // substep so fast frames can't tunnel through thin walls
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vx, this.vz) * dt) / (PLAYER_R * 0.8)));
    for (let i = 0; i < steps; i++) {
      this.p.x = this.x + (this.vx * dt) / steps;
      this.p.z = this.z + (this.vz * dt) / steps;
      resolveCircle(rects, this.p);
      this.x = this.p.x; this.z = this.p.z;
    }
    const sp = Math.hypot(this.vx, this.vz);
    this.bob += dt * sp * 2.2;
  }

  apply(cam: THREE.PerspectiveCamera) {
    const sp = Math.hypot(this.vx, this.vz);
    const b = this.headBob ? Math.sin(this.bob * 2) * 0.018 * Math.min(1, sp / 3) : 0;
    cam.position.set(this.x, this.eye + b, this.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch, -this.yaw, 0);
    cam.updateMatrixWorld();
  }

  forward(): { x: number; z: number } { return { x: Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
}
