import { seedRng } from '../core/rng';
import {
  CINEMAS, CLERK_NAMES, DESTINATIONS, ENGINES, GIVEN, MOTIVES, ORDER_REASONS, PRINTERS, ROLES,
  SHELF_LETTERS, SURNAMES, WORKSHOPS,
} from './content';

export type Route = 'print' | 'depot';

export interface Train { id: string; number: number; name: string; label: string; platform: 1 | 2; scheduled: string; sched: string }
export interface Person { id: string; name: string; role: string; initials: string }

/** The generated truth of the case. Everything the world shows is derived from this. */
export interface CaseFile {
  seed: string;
  pastYear: number;
  presentYear: number;
  trains: Train[];
  answerTrain: string;
  destinations: string[];
  platformLines: Record<1 | 2, [string, string]>;
  answerPlatform: 1 | 2;
  answerDest: string;
  blockedDest: string;
  people: Person[];
  authorizer: string;
  stationMaster: string;
  engineer: string;
  clerk: string;
  orderNo: number;
  orderReason: string;
  defaultRoute: Route;
  printer: string;
  pressBay: number;
  cinema: string;
  cinemaYear: number;
  workshop: string;
  depotRenovYear: number;
  shelfCode: string;
  lockerNo: number;
  motive: string;
}

export const CURATED_SEED = 'KESTREL-2306';

export function generateCase(seed: string): CaseFile {
  const r = seedRng(seed, 'history');
  const pastYear = r.int(1958, 1966);
  const engines = r.shuffle(ENGINES).slice(0, 3);
  const dests = r.shuffle(DESTINATIONS).slice(0, 4);
  const platformLines: Record<1 | 2, [string, string]> = { 1: [dests[0], dests[1]], 2: [dests[2], dests[3]] };
  const answerPlatform = r.pick([1, 2] as const);
  const pair = platformLines[answerPlatform];
  const ai = r.int(0, 1);
  const answerDest = pair[ai];
  const blockedDest = pair[1 - ai];

  // Two engines stand at the answer platform so the board lamp narrows but never solves.
  const otherPlatform = (answerPlatform === 1 ? 2 : 1) as 1 | 2;
  const platforms: (1 | 2)[] = [answerPlatform, answerPlatform, otherPlatform];
  const times = ['21:48', '22:15', '22:40'];
  const trains: Train[] = engines.map((e, i) => {
    const plat = platforms[i];
    const lines = platformLines[plat];
    return {
      id: `train.${e.number}`,
      number: e.number,
      name: e.name,
      label: `No. ${e.number} "${e.name}"`,
      platform: plat,
      scheduled: times[i],
      sched: i < 2 ? 'Stabled' : lines[0],
    };
  });
  const sortedTrains = r.shuffle(trains);
  const answerTrain = trains[0].id;

  const surnames = r.shuffle(SURNAMES);
  const given = r.shuffle(GIVEN);
  const roles = r.shuffle(ROLES);
  const people: Person[] = roles.map((role, i) => {
    const name = `${given[i]} ${surnames[i]}`;
    return { id: `person.${surnames[i].toLowerCase()}`, name, role, initials: `${given[i][0]}. ${surnames[i][0]}.` };
  });
  const authorizer = people[0].id;
  const stationMaster = (people.find((p) => p.role === 'Station Master') ?? people[1]).id;
  const engineer = (people.find((p) => p.role === 'Signal Inspector') ?? people[2]).id;

  const auth = people[0];
  const eng = trains[0];
  const motive = r
    .pick(MOTIVES)
    .replace('{engine}', `Engine ${eng.label}`)
    .replace('{auth}', `${auth.name}, ${auth.role.toLowerCase()},`)
    .replace('{dest}', answerDest)
    .replace('{blocked}', blockedDest);

  return {
    seed,
    pastYear,
    presentYear: pastYear + 30,
    trains: sortedTrains,
    answerTrain,
    destinations: r.shuffle(dests),
    platformLines,
    answerPlatform,
    answerDest,
    blockedDest,
    people: r.shuffle(people),
    authorizer,
    stationMaster,
    engineer,
    clerk: r.pick(CLERK_NAMES),
    orderNo: r.int(102, 188),
    orderReason: r.pick(ORDER_REASONS),
    defaultRoute: seed === CURATED_SEED ? 'print' : r.pick(['print', 'depot'] as const),
    printer: r.pick(PRINTERS),
    pressBay: r.int(1, 4),
    cinema: r.pick(CINEMAS),
    cinemaYear: pastYear + r.int(5, 9),
    workshop: r.pick(WORKSHOPS),
    depotRenovYear: pastYear + r.int(12, 18),
    shelfCode: `${r.pick(SHELF_LETTERS)}-${r.int(2, 6)}`,
    lockerNo: r.int(11, 28),
    motive,
  };
}

export function person(c: CaseFile, id: string): Person {
  return c.people.find((p) => p.id === id)!;
}
export function train(c: CaseFile, id: string): Train {
  return c.trains.find((t) => t.id === id)!;
}
export function routeName(c: CaseFile, r: Route): string {
  return r === 'print' ? `${c.printer} Printers` : 'Tramway Depot Stores';
}
