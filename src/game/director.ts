import type { Pt } from '../core/types';
import type { WorldState } from '../sim/events';
import type { Game } from './game';

type Step = { walk: Pt[] } | { wait: number } | { fn: () => void };

/** Stages the witnessed part of history in the past era: the clerk notices the leak, packs the log,
 * stamps the duplicate and wheels the box away. The simulation result is already final; this only
 * performs the transition so the player can watch it. */
export class Director {
  busy = false;
  private steps: Step[] = [];
  private waitT = 0;
  private squeakT = 0;
  private carrying = false;

  constructor(private g: Game) {}

  /** Called after history is re-derived from an action taken in the past. */
  onChange(prev: WorldState, next: WorldState) {
    const g = this.g;
    const crateChanged = prev.past.cratePlace !== next.past.cratePlace;
    if (this.busy && crateChanged) this.abort();
    if (!crateChanged) return;
    const sc = g.scenes.past;
    if (g.era !== 'past' || !sc.clerk) return;
    const l = g.world.layout;
    if (prev.past.cratePlace === 'archive' && next.past.crateHasLog) {
      const route = next.past.cratePlace === 'print' ? l.paths['clerk.toPrint'] : l.paths['clerk.toDepot'];
      const win = l.paths['clerk.window'];
      const toCrate = l.paths['clerk.toCrate'];
      const aw = l.spots['archive.window'];
      const archiveCrate = l.spots['crate.archive'];
      // hold the crate in the archive until she collects it
      sc.dyn.crate.position.set(archiveCrate.x, 0, archiveCrate.z);
      sc.dyn.crate.rotation.y = 0;
      this.steps = [
        { fn: () => g.caption('Water spills from the joint in the gutter and runs down the archive window.') },
        { wait: 1.4 },
        { walk: win },
        { fn: () => g.say('Water! Not in here, not on the log.', g.world.case.clerk) },
        { wait: 1.6 },
        { walk: win.slice().reverse() },
        { fn: () => g.caption('She unlocks the cabinet and lifts out the signal log.') },
        { wait: 2.2 },
        { fn: () => { g.audio.clerkSound(aw.x, aw.z, 'stamp'); setTimeout(() => g.audio.clerkSound(aw.x, aw.z, 'stamp'), 350); g.say('Duplicate, stamped. It goes today.', g.world.case.clerk); } },
        { wait: 1.6 },
        { walk: toCrate },
        { fn: () => this.attach() },
        { walk: route },
        { fn: () => { this.detach(); g.caption(next.past.cratePlace === 'print' ? 'She sets the box down on the brass plate in the press bay.' : 'She slides the box onto the depot stores shelf.'); } },
        { wait: 1.2 },
        { walk: [...route.slice().reverse(), ...toCrate.slice().reverse()] },
        { fn: () => this.finish() },
      ];
      this.busy = true;
      this.next();
      return;
    }
    if (!next.past.crateHasLog && prev.past.crateHasLog) g.caption('Once the window dries, the clerk carries the box back to the archive.');
    else g.caption(`By evening a porter has re-sent the box to ${next.past.cratePlace === 'print' ? 'the print shop' : 'the depot'}, as the label says.`);
  }

  private attach() {
    const sc = this.g.scenes.past;
    const f = sc.clerk!;
    f.trolley.visible = true;
    f.trolley.add(sc.dyn.crate);
    sc.dyn.crate.position.set(0, 0.21, 0.75);
    sc.dyn.crate.rotation.set(0, 0, 0);
    this.carrying = true;
  }

  private detach() {
    const sc = this.g.scenes.past;
    sc.clerk!.trolley.visible = false;
    sc.dyn.group.add(sc.dyn.crate);
    this.carrying = false;
    this.g.refreshDynamics();
  }

  private finish() {
    this.busy = false;
    this.steps = [];
    const sc = this.g.scenes.past;
    const desk = this.g.world.layout.spots['desk.slip'];
    sc.clerk!.root.position.set(desk.x + 0.4, 0, desk.z + 0.9);
    sc.clerk!.root.rotation.y = Math.PI;
  }

  abort() {
    if (this.carrying) this.detach();
    this.finish();
    this.g.refreshDynamics();
  }

  private next() {
    const s = this.steps.shift();
    if (!s) { this.finish(); return; }
    if ('walk' in s) this.g.scenes.past.clerkWalker!.start(s.walk);
    else if ('wait' in s) this.waitT = s.wait;
    else { s.fn(); this.next(); }
  }

  update(dt: number, t: number) {
    const w = this.g.scenes.past?.clerkWalker;
    if (!w) return;
    const done = w.update(dt, t);
    if (!this.busy) return;
    if (this.carrying) {
      this.squeakT -= dt;
      if (this.squeakT < 0) { this.squeakT = 0.9; const p = w.fig.root.position; this.g.audio.clerkSound(p.x, p.z, 'squeak'); }
    }
    if (w.active) return;
    if (done) { this.next(); return; }
    if (this.waitT > 0) { this.waitT -= dt; if (this.waitT <= 0) this.next(); }
  }
}
