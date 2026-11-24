// Contracts board (every port notice board). Each town offers three jobs per notice issue, a pure function of (island seed, issue, nearby ports).
// DELIVER: carry n crates of a good to another port and hand them over at its notice board before the deadline.
// CULL: sink n hostile raiders (counted from the moment you sign) and report back to the board that posted it.
// Pay follows your local standing; finishing earns standing, missing the deadline costs it. Active jobs live in s.contracts (max 3), finished ids in s.cdone.
import { rngFor, pick } from '../gen/rng.js';
import { GOODS } from '../gen/world.js';
import { issueOf } from './news.js';
import { localRep, shunned, deed, addLocal } from './rep.js';

export const MAX_ACTIVE = 3, OFFERS = 3;
const five = (v) => Math.round(v / 5) * 5;
export const payMult = (s, id) => 1 + Math.max(-0.2, Math.min(0.2, localRep(s, id) / 500));
export const active = (s) => (s.contracts = Array.isArray(s.contracts) ? s.contracts : []);
const done = (s) => (s.cdone = s.cdone || {});

// ports: nearby port islands (not this one). Returns the open offers for this town now.
export function offers(s, isl, ports) {
  const issue = issueOf(s), r = rngFor(isl.seed, 9400 + issue), out = [];
  for (let i = 0; i < OFFERS; i++) {
    const id = `k${isl.id}:${issue}:${i}`, cull = i === OFFERS - 1 || !ports.length, base = { id, from: isl.id, fromName: isl.port?.name || isl.name, pay: 0 };
    if (cull) { const n = 2 + Math.floor(r() * 2); out.push({ ...base, type: 'cull', n, window: 900, reward: five(120 * n + r() * 60), text: `Sink ${n} raiders on the lanes and report back here.` }); continue; }
    const to = pick(r, ports), good = pick(r, GOODS), n = 3 + Math.floor(r() * 4), d = Math.hypot(to.x - isl.x, to.z - isl.z);
    out.push({ ...base, type: 'deliver', n, good, to: { id: to.id, name: to.port?.name || to.name, x: to.x, z: to.z }, window: Math.round(240 + d / 4), reward: five(70 + d * 0.07 + n * 12), text: `Carry ${n} crates of ${good} to ${to.port?.name || to.name} (${Math.round(d)} m).` });
  }
  return out.filter((o) => !done(s)[o.id] && !active(s).some((c) => c.id === o.id));
}
export const quote = (s, o) => Math.round(o.reward * payMult(s, o.from));

// sign a job: refused in a town that hates you or when you carry the most already
export function accept(s, o, say) {
  if (active(s).length >= MAX_ACTIVE) { say(s, `You can only carry ${MAX_ACTIVE} contracts at a time.`); return null; }
  if (shunned(s, o.from)) { say(s, 'They will not give work to someone they hate.'); return null; }
  const c = { ...o, due: s.t + o.window, pay: quote(s, o), base: o.type === 'cull' ? s.killsBy?.raider || 0 : 0 };
  active(s).push(c); say(s, `Contract signed: ${o.text} Pays ${c.pay} gold within ${Math.round(o.window / 60)} min.`); return c;
}
export const progress = (s, c) => (c.type === 'cull' ? Math.min(c.n, (s.killsBy?.raider || 0) - c.base) : 0);
export const ready = (s, c, isl) => (c.type === 'cull' ? c.from === isl.id && progress(s, c) >= c.n : c.to.id === isl.id);
// at a board: pay every job that can be settled here; returns the gold earned
export function settle(s, isl, say) {
  let total = 0;
  for (const c of [...active(s)]) {
    if (!ready(s, c, isl)) continue;
    active(s).splice(active(s).indexOf(c), 1); done(s)[c.id] = 1; s.gold += c.pay; s.score += c.pay; total += c.pay; deed(s, 'contract', c.from); if (c.type === 'deliver') deed(s, 'contract', isl.id, 0.5);
    say(s, `${c.type === 'cull' ? 'The harbourmaster counts the wrecks' : 'The crates are signed for'}: ${c.pay} gold.`); s.events?.push({ type: 'coin' });
  }
  return total;
}
export function abandon(s, id, say) { const i = active(s).findIndex((c) => c.id === id); if (i < 0) return; const [c] = active(s).splice(i, 1); done(s)[c.id] = 1; addLocal(s, c.from, -3); say(s, 'You drop the contract. They will remember.'); }
// once a second: a missed deadline costs standing with the town that posted it
export function stepContracts(s, say) {
  const a = active(s); if (!a.length) return;
  for (const c of [...a]) if (s.t > c.due) { a.splice(a.indexOf(c), 1); done(s)[c.id] = 1; deed(s, 'contractFail', c.from); say(s, `Contract failed: ${c.fromName} wanted ${c.type === 'cull' ? 'the raiders sunk' : c.n + ' ' + c.good + ' at ' + c.to.name} by now.`); }
}
export const describe = (s, c) => (c.type === 'cull' ? `Sink ${c.n} raiders (${progress(s, c)}/${c.n}), report to ${c.fromName}` : `Deliver ${c.n} ${c.good} to ${c.to.name}`) + ` · ${Math.max(0, Math.round((c.due - s.t) / 60))} min left · ${c.pay}g`;
