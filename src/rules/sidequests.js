// Layered side quests and temporary companions. A quest is a saved record { id, tpl, realm, seed, from, a, b, step, pos } and its steps are rebuilt from a
// template, so saves stay tiny. Step kinds: talk (a person to speak with, maybe with choices), find (an X to search), fight (a gang to beat),
// board (a named ship to grapple and take). A step may have `secs` (a deadline; `late` says what happens) or `lead` (someone walks with you ashore).
// at: 'home' (the giver's town) | 'a' (a wild island) | 'b' (another port). The people on the ground (s.qa, s.ward), story ships and a companion's position are runtime only.
// game.js passes `g` = { islandsAt, nearby, spot, walk, ground, ship, say, spray } so this file needs no imports from it.
import { rngFor, pick, hash } from '../gen/rng.js';
import { captainName } from '../gen/names.js';
import { rivalCrews, issueOf } from './news.js';
import { eventFor } from './events.js';
import { addLocal, addWorld, shunned } from './rep.js';
import { crewOf, capacity, aboard, ROLES } from './crew.js';
import { weaponOf } from './weapons.js';

export const MAX_SIDE = 3;
export const COMPANIONS = {
  swordswoman: { title: 'Disgraced swordswoman', kind: 'sailor', hp: 90, dmg: 9, role: 'gunner', town: ['Watch the alleys here.', 'I drank in a town like this for a year. Never again.'], fight: ['Stay on my left!', 'Mine. You take the rest.'], won: ['Not bad. Do not let it go to your head.'] },
  cartographer: { title: 'Old cartographer', kind: 'merchant', hp: 45, dmg: 3, role: 'navigator', town: ['This coast is drawn wrong on every chart I own.', 'Slow down. My knees are older than this town.'], fight: ['I draw maps, I do not do this!'], won: ['Is it over? Good. Where was I?'] },
  brother: { title: 'The missing brother', kind: 'sailor', hp: 60, dmg: 6, role: 'sailor', town: ['Feels strange, walking a street again.'], fight: ['I know how they fight. Watch the feint.'], won: ['I used to eat with some of those men.'] },
};

// ---------------------------------------------------------------- templates. need: the places a quest uses; build(c) returns its steps.
const T = {
  heirloom: { title: 'The Lost Heirloom', need: 'ab', pay: 180, ask: (c) => `${c.giver} says a family ring was buried on a wild shore and wants it back.`,
    steps: (c) => ({
      start: { kind: 'find', at: 'a', goal: `Dig for the ring on ${c.a}.`, say: `The hole is already open and empty. Boot prints, and a rag in the colours of a gang that camps near ${c.b}.`, to: 'camp' },
      camp: { kind: 'fight', at: 'b', n: 3, goal: `Take the ring from the gang at ${c.b}.`, say: c.twist ? 'The last of them spits: "Ask your friend who sold us the spot. Ask whose ring it was first."' : 'You prise the ring from the leader\'s finger.', to: 'back' },
      back: { kind: 'talk', at: 'home', who: c.giver, goal: `Take the ring back to ${c.giver}.`, lines: c.twist ? ['You found it! ...You are looking at me strangely. All right. I took it from a widow first. Hand it over and nobody need know.'] : ['You found it! My mother wore that every day of her life.'],
        opts: c.twist
          ? [{ t: 'Hand it over and say nothing', gold: c.pay, rep: -3, say: 'Gold changes hands. Neither of you looks pleased.' }, { t: 'Take it to the widow', gold: Math.round(c.pay / 3), rep: 12, world: 3, say: 'The widow weeps and gives you what little she has. The town hears of it.' }, { t: 'Keep the ring and sell it', gold: Math.round(c.pay * 1.4), rep: -10, say: 'It fetches a fine price. People talk.' }]
          : [{ t: 'Give it back', gold: c.pay, rep: 8, say: 'You have made a friend in this town.' }, { t: 'Keep it and sell it', gold: Math.round(c.pay * 1.4), rep: -10, say: 'It fetches a fine price. People talk.' }] },
    }) },
  brother: { title: 'The Missing Brother', need: 'ab', pay: 220, ask: (c) => `${c.giver}'s brother never came home. His old crewmate drinks in ${c.b}.`,
    steps: (c) => ({
      start: { kind: 'talk', at: 'b', who: c.other, goal: `Ask ${c.other} in ${c.b} about the brother.`, lines: ['The brother? Raiders took our boat off the point.', `They keep a camp on ${c.a}. I ran. I am not proud of it.`], to: 'camp' },
      camp: { kind: 'fight', at: 'a', n: 4, goal: `Break the raider camp on ${c.a}.`, say: 'One raider throws down his blade. He has your giver\'s eyes.', to: 'meet' },
      meet: { kind: 'talk', at: 'a', who: c.third, goal: 'Speak with the brother.', lines: ['Taken? At first. Then they gave me a share, and I stayed. Does my family need to know that?'],
        opts: [{ t: 'Come home and face them', to: 'bring' }, { t: 'Walk with me instead', join: 'brother', to: 'home' }, { t: 'Go. I will say you drowned', gold: Math.round(c.pay / 2), rep: -2, say: 'He takes a boat and does not look back.' }] },
      bring: { kind: 'talk', at: 'home', who: c.giver, lead: true, goal: `Bring him home to ${c.giver}.`, lines: ['Look at you. Thin, tanned, and home. Get inside.'], opts: [{ t: 'Take the reward', gold: c.pay, rep: 14, say: 'The family will not forget this.' }] },
      home: { kind: 'talk', at: 'home', who: c.giver, goal: `Bring the news to ${c.giver}.`, lines: ['He is alive? Alive! Raider or not, he is ours.'], opts: [{ t: 'Take the reward', gold: c.pay, rep: 10, say: 'The family will not forget this.' }] },
    }) },
  map: { title: 'Half a Map', need: 'ab', pay: 260, ask: (c) => `${c.giver} has half a treasure map. ${c.crew} hold the other half.`,
    steps: (c) => ({
      start: { kind: 'fight', at: 'b', n: 4, goal: `Take the other half from ${c.crew} at ${c.b}.`, say: `The two halves fit. The mark is on ${c.a}, and ${c.crew} saw you read it.`, to: 'race' },
      race: { kind: 'fight', at: 'a', n: 3, goal: `Beat ${c.crew} to the mark on ${c.a}.`, say: 'The beach is yours. Now dig.', to: 'dig' },
      dig: { kind: 'find', at: 'a', goal: `Dig up the cache on ${c.a}.`, say: 'A sea chest, heavy and dry inside.', gold: c.pay, rep: 4 },
    }) },
  debt: { title: 'The Debt', need: 'b', pay: 160, ask: (c) => `${c.giver} owes money to ${c.other}, who is not a patient lender.`,
    steps: (c) => ({
      start: { kind: 'talk', at: 'b', who: c.other, goal: `Settle with ${c.other} at ${c.b}.`, lines: [`${c.giver} sent you? Eighty gold and the paper burns. Or you can try your luck.`],
        opts: [{ t: 'Pay the 80 gold', cost: 80, to: 'back' }, { t: 'Draw your weapon', to: 'fight' }, { t: 'Offer to collect for him', gold: 90, rep: -12, say: 'You take his coin and his side. The town will remember.' }] },
      fight: { kind: 'fight', at: 'b', n: 3, goal: 'Beat the lender\'s men.', say: 'The ledger goes in the harbour.', to: 'back' },
      back: { kind: 'talk', at: 'home', who: c.giver, goal: `Tell ${c.giver} it is done.`, lines: ['Done? Truly? Take this. It is everything I had put by to pay him.'], opts: [{ t: 'Accept it', gold: c.pay, rep: 8, say: 'A debt ends.' }, { t: 'Refuse the money', rep: 16, world: 2, say: 'Word of your kindness travels.' }] },
    }) },
  cargo: { title: "A Cargo That Isn't", need: 'b', pay: 150, ask: (c) => `${c.giver} needs sealed crates taken to ${c.b} before the buyer sails.`,
    steps: (c) => ({
      start: { kind: 'talk', at: 'b', who: c.other, secs: c.secs, late: { say: 'The buyer has sailed. The crates are worth nothing to anyone else.', to: 'late' }, goal: `Deliver the crates to ${c.other} at ${c.b}.`, lines: ['In time. Good.', 'A lid came loose on the way, did it not? Muskets. Double pay to forget them.'],
        opts: [{ t: 'Take the double pay', gold: c.pay * 2, rep: -10, say: 'The crates vanish into the night.' }, { t: 'Call the guards', to: 'raid' }] },
      raid: { kind: 'fight', at: 'b', n: 3, goal: `Stop the smugglers at ${c.b}.`, say: 'The guards take the muskets and count out a reward.', gold: c.pay, rep: 10, world: 3 },
      late: { kind: 'talk', at: 'home', who: c.giver, goal: `Tell ${c.giver} you were too late.`, lines: ['Late. They will not deal with me again. Here, for your trouble.'], opts: [{ t: 'Take it', gold: Math.round(c.pay / 4), rep: -2 }] },
    }) },
  ghost: { title: 'A Ghost on the Lanes', need: 'ab', ship: true, pay: 280, ask: (c) => `Sailors vanish, says ${c.giver}. The last wreck washed up on ${c.a}.`,
    steps: (c) => ({
      start: { kind: 'find', at: 'a', goal: `Search the wreck on ${c.a}.`, say: 'A sodden log. The last entry: a pale ship takes crews off this very point.', to: 'hunt' },
      hunt: { kind: 'board', at: 'a', ship: 'ghost', name: 'Pale Widow', goal: `Board the Pale Widow off ${c.a}.`, say: `In the captain's cabin: a locket, and a note twelve years old. "For my daughter in ${c.b}."`, lost: 'The pale ship slips under, and whatever she carried with her.', to: 'locket' },
      locket: { kind: 'talk', at: 'b', who: c.other, goal: `Take the locket to ${c.other} at ${c.b}.`, lines: ['My father? He sailed before I could walk. Where did you get this?'],
        opts: [{ t: 'Tell the whole truth', gold: c.pay, rep: 8, world: 3, say: 'She listens to the end, and pays you what she can.' }, { t: 'Say he died bravely', gold: c.pay, rep: 6, say: 'She holds the locket a long while.' }, { t: 'Say nothing and sell it', gold: Math.round(c.pay * 1.4), rep: -8, say: 'A jeweller does not ask where it came from.' }] },
    }) },
  swordswoman: { title: 'A Blade Owed', need: 'a', pay: 200, join: 'swordswoman', ask: (c) => `${c.third} was beaten and shamed by a duellist who now hides on ${c.a}. She will walk with you.`,
    steps: (c) => ({
      start: { kind: 'fight', at: 'a', n: 3, boss: true, goal: `Find the duellist on ${c.a}.`, say: 'The duellist yields. She stands over him a long while, then sheathes her sword.', to: 'after' },
      after: { kind: 'talk', at: 'a', who: c.third, goal: 'Speak with her.', lines: ['A year I wanted that. I thought it would feel bigger.', 'I have no plans after today.'], opts: [{ t: 'Join my crew', hire: 'swordswoman', gold: c.pay, say: 'She nods once.' }, { t: 'Part as friends', gold: c.pay, rep: 4, say: 'She pays you from the duellist\'s purse and walks off.' }] },
    }) },
  cartographer: { title: 'The Last Chart', need: 'a', pay: 240, join: 'cartographer', chart: true, ask: (c) => `${c.third} wants to finish one last chart on ${c.a}, and needs an escort. A copy of the chart is yours if you see it through.`,
    steps: (c) => ({
      start: { kind: 'find', at: 'a', goal: `Take the cartographer to the old marker on ${c.a}.`, say: '"There it is!" The marker is real. So, it seems, are the people who followed you.', to: 'amb' },
      amb: { kind: 'fight', at: 'a', n: 3, goal: 'Protect the cartographer.', say: 'Quiet again. The chart is finished.', to: 'after' },
      after: { kind: 'talk', at: 'a', who: c.third, goal: 'Speak with the cartographer.', lines: ['Under the marker, as I promised. Your share, and thank you.'], opts: [{ t: 'Sail with me as navigator', hire: 'cartographer', gold: c.pay, say: '"At my age? ...Yes."' }, { t: 'Farewell', gold: c.pay, rep: 4, say: 'The chart will outlive you both.' }] },
    }) },
  // short jobs that town events post
  brawl: { title: 'Break It Up', need: '', pay: 60, ask: () => 'The tavern keeper will pay whoever ends the brawl.', steps: (c) => ({ start: { kind: 'fight', at: 'home', n: 3, goal: `End the brawl in ${c.home}.`, say: 'The brawlers think better of it.', gold: c.pay, rep: 8 } }) },
  duel: { title: 'The Duel', need: '', pay: 120, ask: () => 'The duellist offers a purse to anyone who can put him down.', steps: (c) => ({ start: { kind: 'fight', at: 'home', n: 1, boss: true, goal: `Answer the duellist in ${c.home}.`, say: 'He yields and tosses you the purse.', gold: c.pay, rep: 5 } }) },
  timber: { title: 'Timber for the Burnt House', need: 'a', pay: 110, ask: (c) => `The council needs good timber from ${c.a}.`, steps: (c) => ({ start: { kind: 'find', at: 'a', goal: `Cut timber on ${c.a}.`, say: 'You load as much as you can carry.', to: 'back' }, back: { kind: 'talk', at: 'home', who: c.giver, goal: `Deliver the timber to ${c.giver}.`, lines: ['A roof by nightfall. Bless you.'], opts: [{ t: 'Take the pay', gold: c.pay, rep: 10 }] } }) },
  herbs: { title: 'Fever Herbs', need: 'a', pay: 130, ask: (c) => `The healer needs bitterleaf that grows on ${c.a}.`, steps: (c) => ({ start: { kind: 'find', at: 'a', goal: `Gather bitterleaf on ${c.a}.`, say: 'A sack of bitterleaf. It smells terrible.', to: 'back' }, back: { kind: 'talk', at: 'home', who: c.giver, goal: `Take the herbs to ${c.giver}.`, lines: ['This will do. Half the street will live because of you.'], opts: [{ t: 'Take the pay', gold: c.pay, rep: 10 }, { t: 'Give them freely', rep: 22, world: 3 }] } }) },
  smugglers: { title: 'Run Them Down', need: 'a', ship: true, pay: 220, ask: (c) => `Smugglers are loading off ${c.a}. The council wants their ship taken.`, steps: (c) => ({ start: { kind: 'board', at: 'a', ship: 'raider', name: 'Quiet Gull', goal: `Board the Quiet Gull off ${c.a}.`, say: 'Her hold is full of untaxed goods. The council pays gladly.', lost: 'She goes down with the evidence. The council pays nothing.', gold: c.pay, rep: 10, world: 3 } }) },
  child: { title: 'The Missing Child', need: 'a', pay: 140, ask: (c) => `A child took a skiff toward ${c.a} and has not come back.`, steps: (c) => ({ start: { kind: 'find', at: 'a', goal: `Search for the child on ${c.a}.`, say: 'A small shoe, then a small voice from under the rocks. "Are you cross with me?"', to: 'back' }, back: { kind: 'talk', at: 'home', who: c.giver, lead: true, small: true, goal: `Bring the child home to ${c.giver}.`, lines: ['Oh, you foolish, wonderful thing. Thank you. Thank you.'], opts: [{ t: 'Take the reward', gold: c.pay, rep: 10 }, { t: 'Refuse any payment', rep: 22, world: 3 }] } }) },
  blockade: { title: 'Break the Blockade', need: 'a', pay: 250, ask: (c) => `The gang strangling the harbour camps on ${c.a}.`, steps: (c) => ({ start: { kind: 'fight', at: 'a', n: 4, boss: true, goal: `Clear the blockaders' camp on ${c.a}.`, say: 'Their boats burn on the beach.', gold: c.pay, rep: 14, world: 3 } }) },
};
const STORY = ['heirloom', 'brother', 'map', 'debt', 'cargo', 'ghost'];

const done = (s) => (s.sdone ||= {});
export const sideOf = (s) => (s.side ||= []);
const realm = (s) => s.realm || 'terra';
const nameOf = (i) => i.port?.name || i.name;
const place = (i) => ({ id: i.id, name: nameOf(i), x: i.x, z: i.z });

// the words and places of one quest
function ctxOf(s, q) {
  const r = rngFor(q.seed, 11), crews = rivalCrews(s.seed);
  return { giver: captainName(r), other: captainName(r), third: captainName(r), crew: pick(r, crews).name, twist: r() < 0.5, pay: T[q.tpl].pay, secs: q.b ? Math.round(240 + Math.hypot(q.b.x - q.from.x, q.b.z - q.from.z) / 5) : 0, home: q.from.name, a: q.a?.name, b: q.b?.name };
}
export const stepOf = (s, q) => T[q.tpl].steps(ctxOf(s, q))[q.step];
export const titleOf = (q) => T[q.tpl].title;
export const goalOf = (s, q) => { const left = q.due && Math.max(0, Math.ceil(q.due - s.t)); return stepOf(s, q).goal + (q.due ? ` (${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left)` : ''); };
const clock = (s, q) => { const secs = stepOf(s, q).secs; q.due = secs ? s.t + secs : undefined; };
export const placeOf = (s, q) => { const at = stepOf(s, q).at; return at === 'home' ? q.from : q[at]; };

// what a town is asking for this issue: its event's job (if any) and one story
export function sideOffers(s, isl, g) {
  if (!isl?.port) return [];
  const issue = issueOf(s), ev = eventFor(s, isl), list = [...(ev?.hook ? [ev.hook] : []), STORY[hash(isl.seed >>> 0, issue, 31) % STORY.length]];
  if (isl.port.home && !s.flags.chart && !s.flags.crossed && !list.includes('cartographer')) list.unshift('cartographer');
  const near = g.nearby(s, isl.x, isl.z, 3).filter((i) => i.id !== isl.id).sort((p, q) => Math.hypot(p.x - isl.x, p.z - isl.z) - Math.hypot(q.x - isl.x, q.z - isl.z));
  const wild = near.filter((i) => !i.port && i.landing).slice(0, 5), ports = near.filter((i) => i.port).slice(0, 4), out = [];
  list.forEach((tpl, k) => {
    const t = T[tpl], id = `q${isl.id}:${issue}:${tpl}`, seed = hash(isl.seed >>> 0, issue, 40 + k);
    if (done(s)[id] || sideOf(s).some((q) => q.id === id || q.tpl === tpl) || (t.need.includes('a') && !wild.length) || (t.need.includes('b') && !ports.length) || (t.join && s.comp) || (t.ship && !s.ship)) return;
    const q = { id, tpl, seed, realm: realm(s), step: 'start', from: place(isl) };
    if (t.need.includes('a')) q.a = place(wild[seed % wild.length]);
    if (t.need.includes('b')) q.b = place(ports[(seed >>> 3) % ports.length]);
    out.push({ q, title: t.title, text: t.ask(ctxOf(s, q)), pay: t.pay });
  });
  return out;
}
export function acceptSide(s, offer, g) {
  if (sideOf(s).length >= MAX_SIDE) { g.say(s, `You already have ${MAX_SIDE} troubles on your hands.`); return false; }
  if (shunned(s, offer.q.from.id)) { g.say(s, 'Nobody here will trust you with their troubles.'); return false; }
  const j = T[offer.q.tpl].join;
  if (j && s.comp) { g.say(s, 'You already have company.'); return false; }
  const q = { ...offer.q }; clock(s, q); sideOf(s).push(q); s.tracked = q.id; s.qa = null; g.say(s, `New story: ${offer.title}. ${goalOf(s, q)}`);
  if (j) join(s, j, ctxOf(s, offer.q).third, offer.q, g);
  return true;
}
function join(s, key, name, q, g) {
  if (s.comp) { g.say(s, `You already have company, so ${name} goes their own way.`); return; }
  const C = COMPANIONS[key]; s.comp = { key, name, q: q.id, seed: hash(q.seed, 77), hp: C.hp }; g.say(s, `${name} (${C.title.toLowerCase()}) walks with you.`);
}
export const compLine = (s, when, g) => { const c = s.comp, l = c && COMPANIONS[c.key][when]; if (l) g.say(s, `${c.name}: "${l[hash(c.seed, Math.floor(s.t)) % l.length]}"`); };

// take a story off the list, with its ship if it has one at sea
const drop = (s, q) => { done(s)[q.id] = 1; s.side.splice(s.side.indexOf(q), 1); s.qa = null; s.ward = null; const e = s.enemies.get('s' + q.id); if (e && !e.grappled) s.enemies.delete(e.id); };
function finish(s, q, g, failed) {
  drop(s, q); g.say(s, `Story ${failed ? 'over' : 'complete'}: ${titleOf(q)}.`); s.events.push({ type: 'quest' });
  if (!failed && T[q.tpl].chart && !s.flags.chart && !s.flags.crossed) { s.flags.chart = true; g.say(s, 'You are given a copy of the chart. Press M to read your map.'); }
  if (s.comp?.q === q.id) { g.say(s, `${s.comp.name} takes their leave.`); s.comp = null; }
}
// move on from the current step; `o` is the chosen option (or the step itself) and carries rewards
function advance(s, q, o, to, g) {
  if (o.gold) { s.gold += o.gold; s.score += o.gold; g.say(s, `+${o.gold} gold.`); s.events.push({ type: 'coin' }); }
  if (o.rep) addLocal(s, q.from.id, o.rep);
  if (o.world) addWorld(s, o.world);
  if (to) { q.step = to; s.qa = null; s.ward = null; clock(s, q); g.say(s, goalOf(s, q)); } else finish(s, q, g);
}
export function chooseSide(s, id, i, g) {
  const q = sideOf(s).find((v) => v.id === id); if (!q) return false;
  const st = stepOf(s, q), o = st.opts?.[i]; if (!o) return false;
  if (o.cost) { if (s.gold < o.cost) { g.say(s, `You do not have ${o.cost} gold.`); return false; } s.gold -= o.cost; }
  if (o.say) g.say(s, o.say);
  if (o.join) join(s, o.join, ctxOf(s, q).third, q, g);
  if (o.hire) { const C = COMPANIONS[o.hire]; if (s.ship && aboard(s).length < capacity(s)) { crewOf(s).push({ id: 'comp-' + q.id, name: s.comp?.name || C.title, role: C.role, wage: ROLES[C.role].wage, morale: 90, seed: s.comp?.seed || q.seed }); g.say(s, `A new ${C.role} joins your crew.`); } else g.say(s, 'There is no berth free, so you part for now.'); }
  advance(s, q, o, o.to, g); return true;
}
export function abandonSide(s, id, g) {
  const q = sideOf(s).find((v) => v.id === id); if (!q) return;
  drop(s, q); addLocal(s, q.from.id, -4); if (s.comp?.q === id) s.comp = null; g.say(s, `You walk away from "${titleOf(q)}".`);
}

// ---------------------------------------------------------------- the ground: actors appear when you are on the right island
const actors = (s) => s.qa || [];
function placeActors(s, g, here) {
  const keep = actors(s).filter((a) => here.some((i) => i.id === a.isl));
  for (const q of sideOf(s)) {
    if (q.realm !== realm(s) || keep.some((a) => a.q === q.id)) continue;
    const st = stepOf(s, q), p = placeOf(s, q), isl = here.find((i) => i.id === p.id); if (!isl || st.kind === 'board') continue;
    const base = g.spot(s, isl, hash(q.seed, q.step.length, st.at.charCodeAt(0)));
    if (!base) continue;
    if (st.kind !== 'fight') { keep.push({ q: q.id, isl: isl.id, kind: st.kind, name: st.who || 'the mark', seed: hash(q.seed, st.who ? st.who.length : 3, 5), ...base }); continue; }
    for (let k = 0; k < st.n; k++) { const at = (k && g.near(s, base.x, base.z, k * 1.7)) || base, boss = st.boss && !k; keep.push({ q: q.id, isl: isl.id, kind: 'foe', boss, seed: hash(q.seed, k, 9), x: at.x, y: at.y, z: at.z, hp: boss ? 55 : 24, max: boss ? 55 : 24, cd: 0.8 + k * 0.3 }); }
  }
  s.qa = keep;
}
// once a second: deadlines run out, and a story ship waits near its place while you sail close
function stepClocks(s, g) {
  for (const q of [...sideOf(s)]) {
    const st = stepOf(s, q);
    if (q.due && s.t > q.due) { g.say(s, st.late.say); if (st.late.to) advance(s, q, {}, st.late.to, g); else finish(s, q, g, true); continue; }
    if (st.kind === 'board' && q.realm === realm(s) && s.mode === 'ship' && s.ship && !s.enemies.has('s' + q.id)) { const p = placeOf(s, q); if (Math.hypot(p.x - s.ship.x, p.z - s.ship.z) < 900) g.ship(s, q, st.ship, st.name, p); }
  }
}
// a story ship was taken (boarded) or went to the bottom
export function sideShip(s, e, taken, g) {
  const q = e.quest && sideOf(s).find((v) => v.id === e.quest); if (!q) return;
  const st = stepOf(s, q); if (st.kind !== 'board') return;
  g.say(s, taken ? st.say : st.lost); if (taken) advance(s, q, st, st.to, g); else finish(s, q, g, true);
}
// whoever you are bringing home walks behind you
function stepWard(s, dt, g) {
  const q = s.side?.find((v) => v.realm === realm(s) && stepOf(s, v).lead); if (!q) { s.ward = null; return; }
  const f = s.foot, w = (s.ward ||= { seed: hash(q.seed, 88), small: stepOf(s, q).small }), d = w.x === undefined ? Infinity : Math.hypot(f.x - w.x, f.z - w.z);
  if (d > 28) { const p = g.near(s, f.x, f.z, 2.4) || f; w.x = p.x; w.z = p.z; w.y = g.ground(s, w.x, w.z); }
  else if (d > 3.4) g.walk(s, w, f.x, f.z, 5 * dt);
}
export function stepSide(s, dt, g) {
  const c = s.comp;
  if (s.side?.length && Math.floor(s.t) !== Math.floor(s.t - dt)) stepClocks(s, g);
  if (s.mode !== 'foot' || s.deck) { s.qa = null; s.ward = null; if (c) c.x = undefined; return; }
  if (!s.side?.length && !c) return;
  stepWard(s, dt, g);
  const f = s.foot;
  if (!s.qa || Math.floor(s.t * 2) !== Math.floor((s.t - dt) * 2)) placeActors(s, g, g.islandsAt(s, f.x, f.z));
  const foes = actors(s).filter((a) => a.kind === 'foe');
  for (const a of foes) {
    const tc = c && c.x !== undefined && Math.hypot(c.x - a.x, c.z - a.z) < Math.hypot(f.x - a.x, f.z - a.z), tx = tc ? c.x : f.x, tz = tc ? c.z : f.z, d = Math.hypot(tx - a.x, tz - a.z);
    a.face = Math.atan2(tz - a.z, tx - a.x); a.cd = Math.max(0, a.cd - dt);
    if (s.jailUntil > s.t || (!a.awake && (s.calm > s.t || Math.hypot(f.x - a.x, f.z - a.z) > 14))) continue;
    if (!a.awake) { for (const b of foes) if (b.q === a.q) b.awake = true; compLine(s, 'fight', g); }
    if (d > 1.9) g.walk(s, a, tx, tz, 3.1 * dt);
    else if (a.cd <= 0) { a.cd = 1.3; a.atk = s.t; const dm = a.boss ? 8 : 4; if (tc) { c.hp -= dm; c.hitT = s.t; } else { s.hp -= dm; s.hurtT = s.t; s.events.push({ type: 'hit' }); } }
  }
  if (c) stepComp(s, dt, g, foes);
  if (s.hp <= 0) { s.qa = null; s.calm = s.t + 25; } // knocked out: the gang goes back to its place and leaves you be long enough to get clear (hitting one wakes them)
}
function stepComp(s, dt, g, foes) {
  const c = s.comp, C = COMPANIONS[c.key], f = s.foot;
  if (c.x === undefined || Math.hypot(f.x - c.x, f.z - c.z) > 28) { const p = g.near(s, f.x, f.z, 1.8) || f; c.x = p.x; c.z = p.z; c.y = g.ground(s, c.x, c.z); }
  c.cd = Math.max(0, (c.cd || 0) - dt);
  let tg = null, td = 12;
  for (const a of [...foes.filter((q) => q.awake), ...s.foes]) { const d = Math.hypot(a.x - c.x, a.z - c.z); if (d < td) { td = d; tg = a; } }
  if (tg) { c.face = Math.atan2(tg.z - c.z, tg.x - c.x); if (td > 1.8) g.walk(s, c, tg.x, tg.z, 4 * dt); else if (c.cd <= 0) { c.cd = 1.3; c.atk = s.t; if (tg.kind === 'foe') hitFoe(s, tg, C.dmg, g); else { const n = s.npcs[tg.id]; if (n) { n.hp -= C.dmg; n.hit = s.t; if (n.hp <= 0) { n.dead = true; n.t = s.t; n.x = tg.x; n.z = tg.z; n.y = tg.y; n.kind = tg.kind; n.seed = tg.seed; } } } } }
  else if (Math.hypot(f.x - c.x, f.z - c.z) > 2.8) { g.walk(s, c, f.x, f.z, 5 * dt); c.face = Math.atan2(f.z - c.z, f.x - c.x); }
  if (c.hp <= 0) { g.say(s, `${c.name} falls and does not get up.`); const q = sideOf(s).find((v) => v.id === c.q && T[v.tpl].join); s.comp = null; if (q) abandonSide(s, q.id, g); return; }
  if (!tg && c.hp < C.hp) c.hp = Math.min(C.hp, c.hp + 2 * dt);
  const isl = g.islandsAt(s, f.x, f.z).find((i) => i.port); if (isl && c.town !== isl.id) { if (c.town !== undefined) compLine(s, 'town', g); c.town = isl.id; }
}
function hitFoe(s, a, dmg, g) {
  a.hp -= dmg; a.hitT = s.t; a.awake = true; g.spray(s, a.x, a.y + 1.3, a.z, 4);
  if (a.hp > 0) return;
  s.qa.splice(s.qa.indexOf(a), 1); (s.fallen ||= []).push({ seed: a.seed, x: a.x, y: a.y, z: a.z, t: s.t }); if (s.fallen.length > 8) s.fallen.shift(); s.events.push({ type: 'kill' });
  if (s.qa.some((b) => b.kind === 'foe' && b.q === a.q)) return;
  const q = sideOf(s).find((v) => v.id === a.q); if (!q) return;
  const st = stepOf(s, q); g.say(s, st.say); compLine(s, 'won', g); advance(s, q, st, st.to, g);
}
// the player's swing: true when it landed on one of a quest's gang
export function swingSide(s, g) {
  const w = weaponOf(s), f = s.foot, fx = Math.cos(f.yaw), fz = Math.sin(f.yaw); let best = null, bd = w.reach;
  for (const a of actors(s)) { if (a.kind !== 'foe') continue; const dx = a.x - f.x, dz = a.z - f.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fx + dz * fz) / (d || 1) > w.cone * 0.6) { bd = d; best = a; } }
  if (!best) return false;
  hitFoe(s, best, w.dmg, g); if (w.ranged) s.events.push({ type: 'cannon', x: f.x, z: f.z }); s.events.push({ type: 'slash', hit: true, w: s.weapon, swing: true }); return true;
}
// the person or mark within reach of F
export const nearActor = (s) => actors(s).find((a) => a.kind !== 'foe' && Math.hypot(a.x - s.foot.x, a.z - s.foot.z) < 3.6) || null;
export function useActor(s, a, g) {
  const q = sideOf(s).find((v) => v.id === a.q); if (!q) return { type: 'none' };
  const st = stepOf(s, q);
  if (st.kind === 'find') { g.say(s, st.say); advance(s, q, st, st.to, g); return { type: 'dig' }; }
  if (st.opts) return { type: 'side', id: q.id, name: st.who, title: titleOf(q), lines: st.lines, opts: st.opts.map((o) => o.t) };
  advance(s, q, st, st.to, g); return { type: 'side', name: st.who, title: titleOf(q), lines: st.lines };
}
// where a story points: the one asked for, else the first of this world
export function sideTarget(s, id = s.tracked) {
  const here = sideOf(s).filter((v) => v.realm === realm(s)), q = here.find((v) => v.id === id) || here[0]; if (!q) return null; // only stories of the world you are in
  const p = placeOf(s, q), a = actors(s).find((v) => v.q === q.id) || s.enemies.get('s' + q.id);
  return { x: a ? a.x : p.x, z: a ? a.z : p.z, label: p.name, title: titleOf(q), goal: goalOf(s, q) };
}
