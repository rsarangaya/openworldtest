// The notice board in every town: little pieces of news for immersion. Pure data, no drawing.
// A new issue comes out every ISSUE_LEN seconds of play. An issue is a pure function of (world seed, town, issue number, what the player has done), so a
// town always posts the same notices for the same issue, rival crews grow from issue to issue (follow them as you sail), and towns hear about the player.
import { rngFor, pick } from '../gen/rng.js';
import { STYLES } from '../gen/style.js';
import { asgardLine } from './lore.js';
import { captainName, shipName, islandName } from '../gen/names.js';
import { GOODS, islandTown } from '../gen/world.js';
import { SHIPS } from './ships.js';
import { board } from './hunt.js';
import { eventFor } from './events.js';
import { serpentRumour } from './serpent.js';
import { krakenRumour } from './kraken.js';
import { cyclopsRumour } from './cyclops.js';
import { draugrRumour } from './draugr.js';
import { wreckRumour } from './salvage.js';
import { townState, TOWN_STATE } from './game.js';

const cap = (w) => w[0].toUpperCase() + w.slice(1);
export const ISSUE_LEN = 420;
export const issueOf = (s) => 1 + Math.floor(s.t / ISSUE_LEN);

const CADJ = ['Salt', 'Black', 'Red', 'Grey', 'Iron', 'Tide', 'Storm', 'Hollow'], CNOUN = ['Wolves', 'Gulls', 'Lanterns', 'Herons', 'Anchors', 'Otters', 'Reapers', 'Sparrows'];
// three rival crews, the same in every town and every game with this seed. They keep growing as the issues go by.
export const rivalCrews = (seed) => [0, 1, 2].map((i) => {
  const r = rngFor(seed, 6100 + i);
  return { id: i, name: `The ${pick(r, CADJ)} ${pick(r, CNOUN)}`, captain: captainName(r), ship: shipName(r), base: 5 + ((r() * 6) | 0), growth: 0.7 + r(), home: islandName(r), lean: ['raiders', 'traders', 'the navy'][i] };
});
export const crewSize = (c, issue) => c.base + Math.floor(issue * c.growth * 2.2);
export const crewShips = (c, issue) => 1 + Math.floor(crewSize(c, issue) / 16);

const BEATS = [
  (c, n, r, g) => ['Sighted', `Fishermen report ${c.ship} working the lanes under Captain ${c.captain}. ${crewSize(c, n)} hands aboard, they say, and ${crewShips(c, n) > 1 ? crewShips(c, n) + ' ships in company' : 'one ship'}.`],
  (c, n, r, g) => ['Hands wanted', `${c.name} are signing on sailors in ${c.home}. They stood at ${crewSize(c, n - 1)} last month and now count ${crewSize(c, n)}. Wages are good, or so the recruiters say.`],
  (c, n, r, g) => ['Shots fired', `${c.name} traded shots with the navy off ${islandName(r)}. ${crewShips(c, n)} ${crewShips(c, n) > 1 ? 'ships' : 'ship'} came out of it, with ${crewSize(c, n)} crew. Nobody will say who lost more.`],
  (c, n, r, g) => ['Cargo', `${c.name} sold a full hold of ${g} on the quay at ${islandName(r)} and drank the profits. Captain ${c.captain} paid for the whole bar, and then some.`],
  (c, n, r, g) => ['Growing', `${c.name} keep growing: ${crewSize(c, n)} strong now. Some call it a crew, some call it a small town on the water.`],
  (c, n, r, g) => ['Overheard', `Captain ${c.captain} of ${c.name} was heard in a tavern calling the Wall "a door nobody has knocked on". The tavern keeper says the tab was settled.`],
  (c, n, r, g) => ['Rumour', `${c.name} are said to be hunting a buried cache near ${islandName(r)}. ${crewSize(c, n)} hands with shovels would be a lot of shoveling.`],
];

const PLAYER = [
  [(s) => !s.ship, (s, t) => ['A newcomer', `Someone has been asking around ${t.home} about passage to the Wall. The shipwright is doing well out of the questions.`]],
  [(s) => s.ship && (s.shipClass || 'sailboat') === 'sailboat', (s, t) => ['A small blue-striped sailboat', `A little sailboat with one triangular sail and a blue stripe has been seen in the lanes. ${t.know} Whoever sails her is alone and in no hurry.`]],
  [(s) => s.ship && (s.shipClass || 'sailboat') !== 'sailboat', (s, t) => ['A bigger boat', `The blue-striped boat is a ${SHIPS[s.shipClass].name} now. ${t.know} The harbourmaster says it is the same captain who started on a plain sailboat.`]],
  [(s) => (s.killsBy.raider || 0) >= 1, (s, t) => ['Fewer raiders', `Raider sails are rarer on the lanes. ${t.know} People credit one blue-striped captain; the navy credits itself.`]],
  [(s) => (s.killsBy.serpent || 0) >= 1, (s, t) => ['Serpent slain', `A sea serpent has been killed by cannon fire, the first anyone can remember. ${t.know} The fish market is selling "serpent steaks"; nobody believes them.`]],
  [(s) => (s.killsBy.cyclops || 0) >= 1, (s, t) => ['Cyclops slain', `A one-eyed giant who threw boulders at ships has been brought down by cannon fire from the sea. ${t.know} The goatherds are back on the cliffs.`]],
  [(s) => (s.killsBy.kraken || 0) >= 1, (s, t) => ['Kraken slain', `A kraken has been cut loose and sunk by cannon fire. ${t.know} The pearl divers are back in the water, and they swear the sea is bluer.`]],
  [(s) => (s.killsBy.wreck || 0) >= 1, (s, t) => ['Wreck stripped', `A diver has brought up the strongbox of an old wreck. ${t.know} Half the harbour has bought a diving bell since, and nobody has found a thing.`]],
  [(s) => (s.killsBy.barrow || 0) >= 1, (s, t) => ['Draugr laid to rest', `A sea barrow is quiet: every dead longship of it burned and sunk. ${t.know} The skalds are already arguing over who gets to make the song.`]],
  [(s) => s.kills >= 5, (s, t) => ['Wrecks', `The navy has stopped counting wrecks along the lanes. Sailors say one captain is behind most of them, and will not say which.`]],
  [(s) => s.found.size >= 1, (s, t) => ['Dug up', `A buried cache has been found and emptied. Beach-diggers are out in numbers, hoping for the next one.`]],
  [(s) => s.flags.sailor, (s, t) => ['Sea tales', `An old sailor has a new listener for his tales of the Wall. He has been telling them for years; this is the first time anyone sailed off to check.`]],
  [(s) => (s.bounty || 0) > 0, (s, t) => ['Notice', `The navy asks for word on the captain of a blue-striped ship, accused of firing on a peaceful vessel. A bounty may follow.`]],
  [(s) => s.upgrades.ram, (s, t) => ['An icebreaker', `A ship has been fitted with an icebreaker ram at Frostwatch. Whoever it is, they mean to try the Wall.`]],
  [(s) => s.gold >= 2500, (s, t) => ['Rich', `The captain of the blue stripe is said to be rich enough to buy the pier. Several pier owners are being polite.`]],
  [(s) => (s.crew || []).length > 0, (s, t) => ['A crew', `The blue-striped ship now sails with ${s.crew.length} hands. ${t.know}`]],
];

const EGGS = [
  'Cat elected harbourmaster. Approval rating 100%. Opposition candidate (a gull) concedes.', 'Lost: one lighthouse. Last seen Tuesday. Reward: a very good view.', 'Seagulls issue demands. Negotiations ongoing. Chips are not on the table.',
  'The Society of the Flat Sea meets on the pier at dusk. Bring a spirit level.', "Letters: \"Does anyone know where the documentary crew went? Asking for a friend.\"", 'Weather: probably sea.', 'For sale: one anchor, lightly used. Has never been dropped.',
  'Fiddler wanted for Saturday dance. Must not know "Drunken Sailor".', 'The Warden of Frostwatch says the ice is thinner than the documentary claimed. The documentary has not replied.', 'Ghost ship sightings are up 12%. The ghosts say it is all the same ship.',
  'Missing: a boat named "Not This One". Finder please do not return.', 'Crab race Sunday. Crabs will be given a fair start, and a sideways one.', 'A reminder that the sea is not, in fact, flat. See the bulletin about the Society of the Flat Sea.',
];
const LOCAL = [
  (t, r) => ['Harbour', `${t.keeper} says the new barrel at the tavern is "only a little bit watery". Reviews are mixed.`],
  (t, r) => ['Lost and found', `A goat has been found near the plaza, unharmed and unrepentant. Owner may collect it from whoever it likes best.`],
  (t, r) => ['Dock notice', `Please do not feed the gulls from the pier. They have started to expect it, and to argue.`],
  (t, r) => ['Market', `Stalls open at dawn, close at dusk, and sometimes in between when the weather turns.`],
  (t, r) => ['Shipwright', `The shipwright reminds captains that a ship does not float better with more cargo, however it looks on paper.`],
  (t, r) => ['Notice', `The ${t.size} council meets after the next high tide. Agenda: tides.`],
  (t, r) => ['Weather', `Wind ${t.wind}% this morning. Good for sailing if you point the right way, and not so good if you do not.`],
  (t, r) => ['News', `A trader from ${islandName(r)} says the roads there are rougher than the sea. Locals say it is the sea that is rougher.`],
];

// the whole board for one town at the current issue
export function newsFor(s, isl) {
  const n = issueOf(s), r = rngFor(isl.seed, 7000 + n), items = [], town = { home: 'Port Haven', size: isl.tier || 'village' };
  const tavern = isl.port && islandTown(isl).npcs.find((q) => q.kind === 'tavern'); town.keeper = tavern?.name || 'the tavern keeper'; town.wind = Math.round((s.wind?.speed ?? 0.8) * 100);
  const fame = s.kills + (s.found?.size || 0) * 2 + ((s.killsBy?.raider || 0) >= 2 ? 3 : 0);
  town.know = isl.port?.home ? 'It all happened right here in our harbour.' : fame >= 3 ? `People in ${isl.name} talk about little else.` : `Word of it reached ${isl.name} a few days ago.`;
  if (isl.port) { items.push({ tag: 'Prices', head: 'Harbourmaster', body: `${cap(isl.port.cheap)} is plentiful and cheap here this week. ${cap(isl.port.dear)} is short and dear. Buy and sell accordingly.` }); }
  const ev = eventFor(s, isl); if (ev) items.push({ tag: 'Happening now', head: ev.name, body: ev.line });
  if ((isl.seed + n) % 2 === 0) { const sr = serpentRumour(s, isl.x, isl.z), dr = !sr && draugrRumour(s, isl.x, isl.z), kr = !sr && !dr && krakenRumour(s, isl.x, isl.z), cr = !sr && !dr && !kr && cyclopsRumour(s, isl.x, isl.z); if (sr || dr || kr || cr) items.push({ tag: 'Rumour', head: sr ? 'Sea serpent' : dr ? 'The sea barrow' : kr ? 'A kraken' : 'A cyclops', body: sr || dr || kr || cr }); } else { const wr = wreckRumour(s, isl.x, isl.z); if (wr) items.push({ tag: 'Rumour', head: 'An old wreck', body: wr }); } // every other issue, the monster of this world
  items.push({ tag: 'Overheard', head: 'North of the ice', body: asgardLine(s, isl.seed, n) }); // the long legend: it starts on day one
  for (const f of [pick(r, LOCAL)]) { const [h, b] = f(town, r); items.push({ tag: 'Local', head: h, body: b }); }
  if (isl.port) for (const w of board(s).slice(0, 2)) items.push({ tag: 'Wanted', head: w.name, body: `${w.crime}. Last heard of ${w.kind === 'ship' ? 'sailing the lanes in the ' + w.ship : 'near ' + w.where}. ${w.aliveOnly ? 'Wanted ALIVE only.' : 'Dead or alive.'} Reward ${w.reward} gold.` });
  if (isl.port && townState(s, isl.id)) items.push({ tag: 'Harbour', head: 'After the shelling', body: ['', 'Cannon fire from the sea has scorched the waterfront. Half the town is indoors and the council wants a name.', 'The town is burning. Shops are shut and the streets are empty. Somebody will answer for this.', 'The town has been pillaged. What the shells missed, the boarding parties took.'][townState(s, isl.id)] });
  const crews = rivalCrews(s.seed), a = crews[(n + isl.seed) % 3], b = crews[(n + isl.seed + 1) % 3];
  for (const c of [a, b]) { const rr = rngFor(s.seed, 6200 + c.id, n), [h, body] = BEATS[(n + c.id * 2 + (isl.seed % 3)) % BEATS.length](c, n, rr, pick(rr, GOODS)); items.push({ tag: c.name, head: h, body }); }
  const own = PLAYER.filter(([f]) => f(s)).map(([, g]) => g); // what the towns have heard about the player: up to two items, rotating through the issues
  for (let i = 0; i < Math.min(2, own.length); i++) { const [h, body] = own[(n + i + (own.length > 2 ? n : 0)) % own.length](s, town); if (!items.some((q) => q.head === h)) items.push({ tag: 'About the captain', head: h, body }); }
  if (r() < 0.6) items.push({ tag: 'Odds and ends', head: 'Notice', body: pick(r, EGGS) });
  s.newsSeen ||= {}; const fresh = (s.newsSeen[isl.id] || 0) < n;
  return { title: `${isl.port?.name || isl.name}${STYLES[isl.style]?.label ? ' (' + STYLES[isl.style].label + ')' : ''}: notice board`, issue: n, fresh, items };
}
export const markRead = (s, isl) => { s.newsSeen ||= {}; s.newsSeen[isl.id] = issueOf(s); };
