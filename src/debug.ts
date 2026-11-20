import type { Game } from './game/game';
import type { DocId } from './sim/evidence';

/** Automation hooks used by the playthrough and benchmark scripts (scripts/*.mjs). */
export function installDebug(g: Game) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(null))); };
  const face = (x: number, z: number, tx: number, tz: number, pitch = 0) => {
    g.player.place(x, z, Math.atan2(tx - x, -(tz - z)), pitch);
  };
  const api = {
    game: g,
    wait, frames,
    place(x: number, z: number, yaw: number, pitch = 0) { g.player.place(x, z, yaw, pitch); },
    /** Stand `dist` metres in front of an anchor on `side`, looking at it. */
    async faceAnchor(id: string, dist = 4, side: 1 | -1 = 1, lateral = 0) {
      const a = g.world.anchors.find((x) => x.id === id)!;
      const x = a.x + a.nx * side * dist + a.nz * lateral, z = a.z + a.nz * side * dist - a.nx * lateral;
      face(x, z, a.x, a.z, -0.02);
      await frames(4);
    },
    async faceSpot(spot: string, standX?: number, standZ?: number, pitch = 0) {
      const s = g.world.layout.spots[spot];
      face(standX ?? s.x, standZ ?? s.z, s.x, s.z, pitch);
      await frames(4);
    },
    async lookAt(x: number, y: number, z: number) {
      const p = g.player;
      const d = Math.hypot(x - p.x, z - p.z);
      p.yaw = Math.atan2(x - p.x, -(z - p.z));
      p.pitch = Math.atan2(y - p.eye, d);
      await frames(4);
    },
    async use(id: string) {
      const it = g.interactables.find((x) => x.id === id);
      if (!it) throw new Error(`no interactable ${id}`);
      const p = it.pos();
      // walk up to it: stand within reach on the walkable side
      it.use();
      await frames(3);
      return { prompt: it.prompt(), at: p };
    },
    async raise() { if (!g.vf.up) g.toggleCamera(); await wait(450); },
    async lower() { if (g.vf.up) g.toggleCamera(); await frames(2); },
    async photo() { await this.raise(); await g.takePhoto(); await frames(4); return g.prints[0]; },
    async cross() {
      await frames(4);
      if (!g.heldAlign.ok || !g.heldAlign.cr) return false;
      (g as any).beginCross(g.heldAlign.cr);
      await wait(1200);
      return true;
    },
    has(d: DocId) { return g.docs.has(d); },
    state() {
      return {
        seed: g.world.seed, era: g.era, actions: { ...g.actions }, docs: [...g.docs.keys()], prints: g.prints.length,
        logAt: g.ws.present.logAt, cratePlace: g.ws.past.cratePlace, held: !!g.held, aligned: g.heldAlign.ok,
        vf: { ...g.renderer.stats }, pos: { x: g.player.x, z: g.player.z }, solved: g.progress.solved, busy: g.director.busy,
        mem: { ...g.renderer.gl.info.memory }, programs: g.renderer.gl.info.programs?.length ?? 0,
      };
    },
    /** Frame-time statistics over `seconds` of real rAF-driven play. */
    async measure(seconds: number) {
      const p = g.perf;
      p.frame.fill(0); p.cpu.fill(0); p.i = 0;
      await wait(seconds * 1000);
      const n = Math.min(p.frame.length, Math.max(1, p.i));
      const f = Array.from(p.frame.slice(0, n)).filter((v) => v > 0).sort((a, b) => a - b);
      const c = Array.from(p.cpu.slice(0, n)).filter((v) => v > 0);
      const avg = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length);
      return {
        frames: f.length, avgMs: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1),
        p95Ms: +(f[Math.floor(f.length * 0.95)] ?? 0).toFixed(2), worstMs: +(f[f.length - 1] ?? 0).toFixed(2),
        cpuMs: +(c.reduce((a, b) => a + b, 0) / Math.max(1, c.length)).toFixed(2),
        mainCalls: g.renderer.stats.mainCalls, vfCalls: g.renderer.stats.vfActive ? g.renderer.stats.vfCalls : 0,
      };
    },
    /** Unthrottled: render N frames back to back, forcing GPU completion with a 1px read each frame. */
    syncBench(n: number) {
      const gl = g.renderer.gl.getContext();
      const px = new Uint8Array(4);
      const t0 = performance.now();
      let t = performance.now() / 1000;
      for (let i = 0; i < n; i++) { t += 1 / 60; g.frame(1 / 60, t); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      const ms = (performance.now() - t0) / n;
      return { msPerFrame: +ms.toFixed(2), fps: +(1000 / ms).toFixed(1) };
    },
  };
  (window as any).__cin = api;
}
