// Save / load. One slot in localStorage. Sets become arrays; enemies and shots are not saved (they regenerate from the seed).
import { newGame, freeFoot } from './game.js';
import { questWorld, setSeedTheme } from '../gen/world.js';

const KEY = 'pirate.save.v1';
const packRealms = (r) => r && Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v, found: [...(v.found || [])], dead: [...(v.dead || [])] }]));
const unpackRealms = (r) => r && Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v, found: new Set(v.found), dead: new Set(v.dead) }]));
export const serialize = (s) => JSON.stringify({ ...s, realms: packRealms(s.realms), cine: undefined, warp: undefined, serpent: undefined, draugr: undefined, ...(s.deck ? { mode: 'ship' } : {}), deck: null, found: [...s.found], dead: [...s.dead], enemies: undefined, guards: [], foes: [], qa: null, ward: null, fallen: [], sinking: [], fx: [], sunkT: undefined, sunkSplash: undefined, shots: [], events: [], targets: undefined });
export function deserialize(json) {
  const o = JSON.parse(json); if (o.realm) setSeedTheme(o.seed, o.realm); const base = newGame(o.baseSeed || o.seed);
  const s = { ...base, ...o, found: new Set(o.found), dead: new Set(o.dead), realms: unpackRealms(o.realms), cine: null, warp: null, enemies: new Map(), shots: [], events: [], targets: questWorld(o.seed) };
  s.over = false; s.deck = null; s.foes = []; s.qa = null; s.fallen = []; if (s.comp) delete s.comp.x; for (const q of Object.values(s.npcs || {})) delete q.away; s.guards = []; s.sinking = []; s.fx = []; s.alerted = false; s.ending = false; if (o.seed !== base.seed) s.targets = questWorld(o.seed);
  freeFoot(s);
  return s;
}
export const hasSave = () => { try { return !!localStorage.getItem(KEY); } catch { return false; } };
export const saveGame = (s) => { if (s.sunkT !== undefined || s.over) return false; /* never save a ship that is going down or a finished game */ try { localStorage.setItem(KEY, serialize(s)); return true; } catch { return false; } };
export const loadGame = () => { try { const j = localStorage.getItem(KEY); return j ? deserialize(j) : null; } catch { return null; } };
export const deleteSave = () => { try { localStorage.removeItem(KEY); } catch {} };
export const OPTIONS_KEY = 'pirate.options.v1';
export const loadOptions = () => { try { return { volume: 0.7, sens: 1, pixels: 270, distance: 2, fullscreen: true, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}') }; } catch { return { volume: 0.7, sens: 1, pixels: 270, distance: 2, fullscreen: true }; } };
export const saveOptions = (o) => { try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(o)); } catch {} };
