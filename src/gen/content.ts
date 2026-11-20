/** Authored vocabulary that the generators draw from. Kept separate so writing can be revised
 * without touching generation logic. */

export const ENGINES = [
  { number: 14, name: 'Kestrel' },
  { number: 9, name: 'Bittern' },
  { number: 22, name: 'Lapwing' },
  { number: 31, name: 'Merlin' },
  { number: 6, name: 'Heron' },
  { number: 17, name: 'Curlew' },
  { number: 40, name: 'Plover' },
  { number: 3, name: 'Wren' },
] as const;

export const DESTINATIONS = [
  'Harbour Sidings',
  'Quarry Branch',
  'North Junction',
  'Ferrow Reservoir',
  'Gasworks Spur',
  'Lantern Hill',
  'Saltmarsh Halt',
  'Brickfield Loop',
] as const;

export const SURNAMES = [
  'Aldous', 'Penhale', 'Marrow', 'Okafor', 'Lindqvist', 'Treadwell', 'Sefton', 'Quayle',
  'Barrowman', 'Ishikawa', 'Doyle', 'Haverty', 'Amberley', 'Castell', 'Novak', 'Rennard',
] as const;

export const GIVEN = [
  'Ruth', 'Edwin', 'Marguerite', 'Samuel', 'Ines', 'Walter', 'Constance', 'Bertram',
  'Agnes', 'Tobias', 'Winifred', 'Desmond', 'Hazel', 'Leopold', 'Ada', 'Ferris',
] as const;

export const ROLES = ['Depot Foreman', 'Station Master', 'Signal Inspector', 'Night Signalman'] as const;

export const CLERK_NAMES = ['Mrs. Ivy Penrose', 'Miss Odile Varga', 'Mrs. Nell Hartigan', 'Miss June Okoro'] as const;

export const PRINTERS = ['Hallam & Sons', 'Garrow Bros.', 'Whitlock & Daughter', 'Pellow Press'] as const;
export const CINEMAS = ['The Lyric', 'The Regal', 'The Orion', 'The Majestic'] as const;
export const WORKSHOPS = ['Spoke & Chain Cycles', 'Tramshed Cycle Works', 'Rail Yard Bikes'] as const;

export const SHELF_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Tenant histories for non-plot parcels: [past use, present use, past colour index, survived]. */
export const TENANTS: ReadonlyArray<readonly [string, string]> = [
  ['Chemist', 'Launderette'],
  ['Hatter', 'Records'],
  ['Tea Rooms', 'To Let'],
  ['Savings Bank', 'Flats'],
  ['Ironmonger', 'Hardware'],
  ['Fishmonger', 'Noodle Bar'],
  ['Tailor', 'Pawnbroker'],
  ['Post Office', 'Late Shop'],
  ['Bakery', 'Bakery'],
  ['Florist', 'Closed'],
];

export const MOTIVES = [
  '{engine} was listed for the breaker\'s yard at dawn. {auth} ran it out to {dest}, where nobody from the Board would think to look, and filed the order with the station\'s last papers.',
  'The relaying gang on the {blocked} line needed the platform road clear before morning. {auth} sent {engine} to {dest} rather than wait for the Board, and the station closed around a departure nobody announced.',
  '{auth} wanted one last engine kept in steam for the city. {engine} slipped away to {dest} six minutes after the lamps went out, and the signal log was the only witness.',
] as const;

export const ORDER_REASONS = [
  'track relaying', 'bridge inspection', 'drainage works', 'sleeper renewal',
] as const;
