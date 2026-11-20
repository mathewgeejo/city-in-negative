import type { Era } from '../core/types';
import { person, routeName } from '../gen/history';
import { ACTIONS, type ActionId } from '../sim/events';
import { crateSpot } from '../sim/sources';
import type { Game } from './game';

export interface Interactable {
  id: string;
  era: Era;
  pos: () => { x: number; y: number; z: number };
  reach: number;
  cone?: number;
  prompt: () => string | null;
  use: () => void;
}

/** Every interactive object, by stable id. Prompts and effects read live game state. */
export function buildInteractables(g: Game): Interactable[] {
  const l = g.world.layout, c = g.world.case;
  const S = (id: string, dy = 0) => () => { const s = l.spots[id]; return { x: s.x, y: s.y + dy, z: s.z }; };
  const has = (d: Parameters<Game['hasDoc']>[0]) => g.hasDoc(d);
  const toggle = (id: ActionId) => () => g.setAction(id, !g.actions[id]);
  const verb = (id: ActionId) => (g.actions[id] ? ACTIONS[id].undoVerb : ACTIONS[id].doVerb);
  const list: Interactable[] = [
    /* ---------------- present ---------------- */
    {
      id: 'i.board', era: 'present', pos: S('board'), reach: 6.5, cone: 32,
      prompt: () => (g.progress.solved ? 'Read the departure board' : 'Assemble your theory at the departure board'),
      use: () => { g.acquire('doc.lamp'); g.ui.openCaseBoard(); },
    },
    {
      id: 'i.stain', era: 'present', pos: () => { const s = l.spots['downpipe']; return { x: s.x, y: 2.2, z: s.z }; }, reach: 3, cone: 40,
      prompt: () => 'Examine the water stain',
      use: () => { g.acquire('doc.stain'); g.say(g.ws.present.stain === 'heavy' ? 'The stain is darker now, spread wide across the old archive window. Above it, the gutter hangs bent.' : 'A stain runs from the downpipe toward the old archive window. Something up on the roof once spilled the wrong way. Raise the camera to see the gutter as it was.'); },
    },
    {
      id: 'i.plate', era: 'present', pos: S('plate'), reach: 2.4, cone: 50,
      prompt: () => {
        if (!has('doc.plate')) return 'Examine the brass floor plate';
        if (g.ws.present.logAt === 'cinema.plate') return g.progress.plateLifted ? 'Open the box beneath the plate' : 'Lift the loose plate';
        return 'Try the brass plate';
      },
      use: () => {
        if (!has('doc.plate')) { g.acquire('doc.plate'); g.say(`Brass, worn bright by feet: ${c.printer.toUpperCase()}, PRESS BAY ${c.pressBay}. The projection booth stands right over it.`); return; }
        if (g.ws.present.logAt !== 'cinema.plate') { g.say('Screwed down tight. Knocking on it sounds hollow, but nothing rattles.'); return; }
        if (!g.progress.plateLifted) { g.progress.plateLifted = true; g.refreshDynamics(); g.audio.click('present', l.spots.plate.x, 0.2, l.spots.plate.z, 400, 0.8, 0.2); g.say('The plate lifts on old screws. Beneath it, a shallow void and a records box, dry.'); return; }
        g.takeBox();
      },
    },
    {
      id: 'i.locker', era: 'present', pos: S('depot.locker', 1.2), reach: 2.4, cone: 45,
      prompt: () => {
        if (!has('doc.stencil')) return `Examine locker ${c.lockerNo}`;
        if (g.ws.present.logAt === 'depot.locker') return g.progress.lockerOpened ? 'Take the box from the locker' : `Open locker ${c.lockerNo}`;
        return `Try locker ${c.lockerNo}`;
      },
      use: () => {
        if (!has('doc.stencil')) {
          g.acquire('doc.stencil');
          g.say(g.ws.present.lockerStencil === 'transfer' ? `Stencilled under the number: EX STORES ${c.shelfCode}, TRANSFER ${c.depotRenovYear}. Whatever sat on that depot shelf ended up here.` : `Locker ${c.lockerNo}. Fresh paint, no history.`);
          return;
        }
        if (g.ws.present.logAt !== 'depot.locker') { g.say('Unlocked and empty.'); return; }
        if (!g.progress.lockerOpened) { g.progress.lockerOpened = true; g.refreshDynamics(); g.audio.click('present', l.spots['depot.locker'].x, 1, l.spots['depot.locker'].z, 900, 0.6, 0.15); g.say('The locker door sticks, then gives. A records box sits on the shelf.'); return; }
        g.takeBox();
      },
    },
    {
      id: 'i.gate.present', era: 'present', pos: S('gate'), reach: 2.2, cone: 50,
      prompt: () => (g.ws.present.gateOpen ? null : 'Try the alley gate'),
      use: () => g.say('Chained shut. The padlock rusted solid years ago.'),
    },
    {
      id: 'i.ticket', era: 'present', pos: S('ticket.lamp'), reach: 2.2, cone: 45,
      prompt: () => 'Read the ticket booth card',
      use: () => g.say(`${c.cinema}: late show tonight, 23:00. Handwritten underneath: "Built on the old ${c.printer} print works, ${c.cinemaYear}."`),
    },
    /* ---------------- past ---------------- */
    {
      id: 'i.board.past', era: 'past', pos: S('board'), reach: 7, cone: 32,
      prompt: () => 'Read the departure board',
      use: () => { g.acquire('doc.board'); g.say(`The last night's departures are still up. Two engines stood stabled at Platform ${c.answerPlatform}.`); },
    },
    { id: 'i.diagram', era: 'past', pos: S('diagram'), reach: 3.2, cone: 40, prompt: () => 'Study the track diagram', use: () => { g.acquire('doc.diagram'); g.say('Each platform road splits two ways beyond the station throat.'); } },
    { id: 'i.notice', era: 'past', pos: S('closing.notice'), reach: 2.4, cone: 45, prompt: () => 'Read the closure notice', use: () => g.acquire('doc.notice') },
    { id: 'i.slip', era: 'past', pos: S('desk.slip'), reach: 2, cone: 50, prompt: () => (g.ws.past.slip === 'duplicate' ? 'Read the stamped duplicate slip' : 'Read the dispatch slip'), use: () => g.acquire('doc.slip') },
    { id: 'i.note', era: 'past', pos: S('desk.note'), reach: 2, cone: 50, prompt: () => verb('note'), use: toggle('note') },
    {
      id: 'i.label', era: 'past', pos: () => { const s = l.spots[crateSpot(g.ws)]; return { x: s.x, y: 0.4, z: s.z + (g.ws.past.cratePlace === 'print' ? -0.55 : 0) }; }, reach: 2, cone: 50,
      prompt: () => (g.director.busy ? null : `${verb('label')}: ${routeName(c, g.ws.past.labelShows)}`),
      use: toggle('label'),
    },
    {
      id: 'i.gutter', era: 'past', pos: () => { const s = l.spots['gutter']; return { x: s.x, y: 4, z: s.z }; }, reach: 4.5, cone: 28,
      prompt: () => (g.director.busy ? null : verb('gutter')),
      use: toggle('gutter'),
    },
    { id: 'i.gate.past', era: 'past', pos: S('gate'), reach: 2.2, cone: 55, prompt: () => verb('gate'), use: toggle('gate') },
    { id: 'i.plate.past', era: 'past', pos: S('plate'), reach: 2.2, cone: 50, prompt: () => 'Look at the press bay plate', use: () => { g.acquire('doc.plate'); g.say(`New brass: ${c.printer.toUpperCase()}, BAY ${c.pressBay}.`); } },
    {
      id: 'i.clerk', era: 'past', pos: () => { const p = g.scenes.past.clerk!.root.position; return { x: p.x, y: 1.5, z: p.z }; }, reach: 2.4, cone: 40,
      prompt: () => (g.director.busy ? null : `Talk to ${c.clerk}`),
      use: () => g.say(clerkLine(g), c.clerk),
    },
    {
      id: 'i.office', era: 'past', pos: () => { const w = l.walls.find((x) => x.id === 'depot.office.n')!; const o = w.openings[1]; return { x: (o.a + o.b) / 2, y: 1.7, z: w.c }; }, reach: 3, cone: 40,
      prompt: () => 'Peer through the office glass',
      use: () => g.say('A typed order is pinned to the board inside, too far to read through the glass. The door is locked. FOREMAN, PRIVATE.'),
    },
  ];
  return list;
}

function clerkLine(g: Game): string {
  const c = g.world.case, ws = g.ws;
  const dest = ws.past.cratePlace === 'print' ? `${c.printer} across the road, under Press Bay ${c.pressBay}` : `the depot stores, shelf ${c.shelfCode}`;
  if (ws.past.crateHasLog) {
    return `That leak nearly drowned the signal log. It's gone to ${dest}, stamped and dated.${ws.past.noteOnDesk ? ` And the depot carbon of Order ${c.orderNo} went in with it, as your note asked.` : ''}`;
  }
  if (ws.past.noteOnDesk) return `Someone left me a note about Order ${c.orderNo}. If anything leaves this room, the carbon can go with it.`;
  const sm = person(c, c.stationMaster);
  return `Last day. They brick up the archive tomorrow, log and all. ${sm.name}'s orders. Unless the roof finally gives, nothing leaves this room.`;
}
