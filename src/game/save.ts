import type { Era } from '../core/types';
import type { Actions } from '../sim/events';
import type { DocId, Theory } from '../sim/evidence';

/** Frozen at the instant of exposure: nothing here is ever recomputed from current history. */
export interface PrintMeta {
  id: string;
  seed: string;
  era: Era;          // era shown in the photograph
  takenFrom: Era;    // era the photographer stood in
  pose: { x: number; y: number; z: number; yaw: number; pitch: number };
  location: string;  // region id
  locationLabel: string;
  anchorId?: string;
  anchorScreen?: { x: number; y: number; dist: number };
  actions: Actions;
  clues: Record<string, string>; // object id → state description as seen
  docs: DocId[];
  caption: string;
  time: number;
  thumb: string;     // small data URL for the contact sheet
}

export interface SaveData {
  version: 1;
  seed: string;
  era: Era;
  pos: { x: number; z: number; yaw: number; pitch: number };
  actions: Actions;
  docs: { id: DocId; at: number; variant?: string }[];
  prints: PrintMeta[];
  heldPrint?: string;
  pinned: string[];
  theory: Theory;
  progress: { plateLifted: boolean; lockerOpened: boolean; solved: boolean; tutorial: number; tramSeen: boolean };
  playTime: number;
}

export interface Settings {
  sensitivity: number; headBob: boolean; reduceFlashes: boolean; captions: boolean;
  renderScale: number; shadows: 'off' | 'low' | 'high'; volume: number; invertY: boolean;
}

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, headBob: true, reduceFlashes: false, captions: true, renderScale: 1, shadows: 'low', volume: 0.8, invertY: false };

const SAVE_KEY = 'city-in-negative:save:v1';
const SET_KEY = 'city-in-negative:settings:v1';

export function loadSave(): SaveData | null {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? (JSON.parse(s) as SaveData) : null; } catch { return null; }
}
export function writeSave(d: SaveData) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* storage full: prints are in IDB */ } }
export function clearSave() { localStorage.removeItem(SAVE_KEY); }

export function loadSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SET_KEY) ?? '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function writeSettings(s: Settings) { localStorage.setItem(SET_KEY, JSON.stringify(s)); }

/* ---------------- IndexedDB photo store ---------------- */

const DB = 'city-in-negative';
const STORE = 'prints';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

export async function putPhoto(id: string, blob: Blob) {
  const d = await db();
  await new Promise<void>((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
export async function getPhoto(id: string): Promise<Blob | undefined> {
  const d = await db();
  return new Promise((res, rej) => { const r = d.transaction(STORE).objectStore(STORE).get(id); r.onsuccess = () => res(r.result as Blob | undefined); r.onerror = () => rej(r.error); });
}
export async function clearPhotos() {
  const d = await db();
  await new Promise<void>((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
