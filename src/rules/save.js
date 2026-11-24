// Save / load. One slot in localStorage. Sets become arrays; enemies and shots are not saved (they regenerate from the seed).
import { newGame } from './game.js';
import { questWorld } from '../gen/world.js';

const KEY = 'pirate.save.v1';
export const serialize = (s) => JSON.stringify({ ...s, found: [...s.found], dead: [...s.dead], enemies: undefined, guards: [], sinking: [], fx: [], sunkT: undefined, sunkSplash: undefined, shots: [], events: [], targets: undefined });
export function deserialize(json) {
  const o = JSON.parse(json), base = newGame(o.seed);
  const s = { ...base, ...o, found: new Set(o.found), dead: new Set(o.dead), enemies: new Map(), shots: [], events: [], targets: questWorld(o.seed) };
  s.over = false; s.guards = []; s.sinking = []; s.fx = []; s.alerted = false; s.ending = !!o.ending;
  return s;
}
export const hasSave = () => { try { return !!localStorage.getItem(KEY); } catch { return false; } };
export const saveGame = (s) => { if (s.sunkT !== undefined || s.over) return false; /* never save a ship that is going down or a finished game */ try { localStorage.setItem(KEY, serialize(s)); return true; } catch { return false; } };
export const loadGame = () => { try { const j = localStorage.getItem(KEY); return j ? deserialize(j) : null; } catch { return null; } };
export const deleteSave = () => { try { localStorage.removeItem(KEY); } catch {} };
export const OPTIONS_KEY = 'pirate.options.v1';
export const loadOptions = () => { try { return { volume: 0.7, sens: 1, pixels: 270, distance: 2, fullscreen: true, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}') }; } catch { return { volume: 0.7, sens: 1, pixels: 270, distance: 2, fullscreen: true }; } };
export const saveOptions = (o) => { try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(o)); } catch {} };
