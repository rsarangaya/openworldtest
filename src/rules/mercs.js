// Mercenary companies (PLAN item 9). Two companies keep an agent in most taverns. HIRE one of their ships into your fleet for a term (no spare hand needed, paid up front,
// no pay-day upkeep), or JOIN one and take its jobs (one at a time, reported at any tavern with its agent). Ranks raise the pay and cut the hire price.
// Ties to reputation: the Iron Tide hunts raiders, will not deal with a Distrusted name and strikes a member off when the realm turns on them; the Black Gulls pay
// well to sink merchantmen (which costs your name and earns a bounty the usual way) and deal with anyone. Pure functions on the game state.
import { KINDS } from '../gen/world.js';
import { rngFor } from '../gen/rng.js';
import { shipName } from '../gen/names.js';
import { worldRep, addWorld } from './rep.js';
import { fleetOf, MAX_FLEET } from './fleet.js';

export const TERM = 600, JOIN_FEE = 50, JOB_WINDOW = 900, TIDE_MIN_REP = -25;
export const COMPANIES = {
  tide: { name: 'The Iron Tide', blurb: 'Sell-swords who keep the lanes clear of raiders, for a fee.', prey: 'raider', preyName: 'raiders', each: 140, hireKind: 'navy', hireFee: 260, lawful: true },
  gull: { name: 'Black Gull Company', blurb: 'No flag and no questions. They pay for sunk merchantmen.', prey: 'trader', preyName: 'merchantmen', each: 220, hireKind: 'raider', hireFee: 180, lawful: false },
};
export const RANKS = [['Recruit', 0, 1], ['Sergeant', 3, 1.15], ['Captain', 6, 1.3]]; // [title, jobs done, pay multiplier]
export const mercOf = (s) => s.merc || null; // { co, jobs, job }
export const rankOf = (jobs) => RANKS.filter((r) => jobs >= r[1]).pop();
// which agents drink in this tavern: no Black Gulls in a fortress town, no Iron Tide in a smugglers' cove
export const agentsAt = (isl) => Object.keys(COMPANIES).filter((id) => !((id === 'gull' && isl?.style === 'fortress') || (id === 'tide' && isl?.style === 'smuggler')));
// why a company will not deal with you (null when it will)
export const refusal = (s, co) => (COMPANIES[co].lawful && worldRep(s) <= TIDE_MIN_REP ? 'The Iron Tide does not deal with a name like yours.' : null);
const member = (s, co) => mercOf(s)?.co === co;
export const hirePrice = (s, co) => { const m = member(s, co) ? (rankOf(s.merc.jobs)[0] === 'Captain' ? 0.5 : 0.7) : 1; return Math.round(COMPANIES[co].hireFee * m); };
export const hired = (s) => fleetOf(s).filter((f) => f.merc);

export function join(s, co, say) {
  const why = refusal(s, co); if (why) { say(s, why); return false; }
  if (mercOf(s)) { say(s, `You already sail with ${COMPANIES[s.merc.co].name}.`); return false; }
  if (s.gold < JOIN_FEE) { say(s, `Joining costs ${JOIN_FEE} gold.`); return false; }
  s.gold -= JOIN_FEE; s.merc = { co, jobs: 0, job: null }; say(s, `You sign the roll of ${COMPANIES[co].name}. Ask their agent in any tavern for work.`); return true;
}
export function leave(s, say, why) { const m = mercOf(s); if (!m) return false; s.merc = null; say(s, why || `You leave ${COMPANIES[m.co].name}.`); return true; }

// the job on offer to a member (stable per job count), then taking it
export function offer(s) {
  const m = mercOf(s); if (!m || m.job) return null; const C = COMPANIES[m.co], r = rngFor(9700 + m.jobs, m.co === 'tide' ? 1 : 2), n = 2 + Math.floor(r() * 2);
  return { n, pay: Math.round(C.each * n * rankOf(m.jobs)[2] / 5) * 5, text: `Sink ${n} ${C.preyName}.` };
}
export function takeJob(s, say) {
  const m = mercOf(s), o = offer(s); if (!o) return null; const C = COMPANIES[m.co];
  m.job = { n: o.n, pay: o.pay, base: s.killsBy?.[C.prey] || 0, due: s.t + JOB_WINDOW }; say(s, `${C.name} job: sink ${o.n} ${C.preyName} within ${JOB_WINDOW / 60} min, then report to any of their agents. Pays ${o.pay} gold.`); return m.job;
}
export const jobProgress = (s) => { const m = mercOf(s), j = m?.job; return j ? Math.min(j.n, (s.killsBy?.[COMPANIES[m.co].prey] || 0) - j.base) : 0; };
export const jobText = (s) => { const m = mercOf(s), j = m?.job; if (!j) return ''; const C = COMPANIES[m.co]; return `${C.name}: sink ${j.n} ${C.preyName} (${jobProgress(s)}/${j.n}), report to their agent · ${Math.max(0, Math.round((j.due - s.t) / 60))} min left · ${j.pay}g`; };
// at a tavern with the company's agent: pay a finished job; returns the gold
export function report(s, isl, say) {
  const m = mercOf(s), j = m?.job; if (!j || !agentsAt(isl).includes(m.co) || jobProgress(s) < j.n) return 0;
  const was = rankOf(m.jobs)[0]; m.job = null; m.jobs++; s.gold += j.pay; s.score += j.pay; if (COMPANIES[m.co].lawful) addWorld(s, 2);
  say(s, `The agent of ${COMPANIES[m.co].name} counts the sinkings: ${j.pay} gold.`); const now = rankOf(m.jobs)[0]; if (now !== was) say(s, `You are made ${now} of ${COMPANIES[m.co].name}.`); s.events?.push({ type: 'coin' }); return j.pay;
}

// hire one of a company's ships into your fleet for TERM seconds
export function hireShip(s, co, say) {
  const why = refusal(s, co); if (why) { say(s, why); return null; }
  const C = COMPANIES[co], price = hirePrice(s, co), p = s.ship;
  if (!p) { say(s, 'You need a ship of your own to lead a hired one.'); return null; }
  if (fleetOf(s).length >= MAX_FLEET) { say(s, `Your fleet is full (${MAX_FLEET} ships).`); return null; }
  if (s.gold < price) { say(s, `${C.name} wants ${price} gold for a ship.`); return null; }
  const n = (s.mercN = (s.mercN || 0) + 1), r = rngFor(9800 + n, co === 'tide' ? 1 : 2), hp = KINDS[C.hireKind].hp;
  const f = { id: 'm' + n, kind: C.hireKind, seed: (r() * 4294967296) >>> 0, name: shipName(r, s.realm || 'terra'), x: p.x - Math.cos(p.yaw) * 60, z: p.z - Math.sin(p.yaw) * 60, yaw: p.yaw, speed: 0, hp, maxHp: hp, cd: 2, ax: p.x, az: p.z, merc: co, until: s.t + TERM };
  s.gold -= price; fleetOf(s).push(f); say(s, `${f.name} of ${C.name} joins your fleet for ${TERM / 60} minutes (${price} gold).`); return f;
}

// once a second: hired terms run out, jobs run late, and the Iron Tide strikes off a member the realm has turned on
export function stepMercs(s, say) {
  const fl = s.fleet; if (fl) for (let i = fl.length - 1; i >= 0; i--) { const f = fl[i]; if (f.merc && s.t >= f.until) { fl.splice(i, 1); say(s, `${f.name}'s term is up; she sails back to ${COMPANIES[f.merc].name}.`); } }
  const m = mercOf(s); if (!m) return;
  if (m.job && s.t > m.job.due) { m.job = null; if (COMPANIES[m.co].lawful) addWorld(s, -1); say(s, `Job failed: ${COMPANIES[m.co].name} wanted the ${COMPANIES[m.co].preyName} sunk by now.`); }
  if (COMPANIES[m.co].lawful && worldRep(s) <= TIDE_MIN_REP) { leave(s, say, 'The Iron Tide strikes your name from its roll.'); if (fl) for (let i = fl.length - 1; i >= 0; i--) if (fl[i].merc === 'tide') { say(s, `${fl[i].name} breaks off and sails home.`); fl.splice(i, 1); } }
}
