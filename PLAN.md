# Plan

The current order is in **Where the plan stands (2026-11-27, after round 119)**, near the end. Earlier lists and phases are history.

## Requirement: think lean, always moving forward
Applies to every item in this plan, before it counts as done.
- **Lean:** the smallest change that does the job. Reuse what exists (data, sprites, systems) before adding code, files or assets. No dead code.
- **Optimize first:** measure CPU time, graphics-card time and build size against the last pushed version, and fix what got worse before pushing. Cache, and build in small per-frame budgets.
- **Always moving forward:** ship each step playable and take the next item. Do not stall on polish or rework; note what is left in STATUS.md and carry on.

## Workflow for every step (set 2026-11-26)
1. Build the next step from "Where the plan stands".
2. Test as a player: a scripted player that makes real choices through the game rules, then real play in Chrome. Unit tests alone are not enough.
3. Performance check, on every build: CPU time (ground building, game step) and build size against the last pushed version; graphics-card time too when drawing changes. Keep it lean.
4. If all is good, commit and push.
5. Update STATUS.md and this plan, then clear the session and start the next step.

No stopping to ask: pick the sensible default and note it in STATUS.md. If a usage limit is hit, pause and carry on after it resets.

## The two concepts

**A. Free-roam sea world.** Endless procedural seas of islands and landmasses. Sail between them, then dock and walk on foot. Ports, trade, ship fights, buried treasure. (Chosen. The player is an ordinary person, not a pirate.)

**B. Flat-earth / ice-wall realms.** One known disc-world ringed by an ice wall. Beyond it, distinct realms (Asgard, Atlantis, ...), each with its own look and rules.

## Which is easier?

**The sea world (A) is easier, and the generators fit it directly.**

- The world is a function of a seed and coordinates: islands in 600-unit sectors, generated on demand and stored nowhere. Already written and tested.
- Sea is cheap to render: one animated water plane plus a few island meshes. Ships are seed-built meshes. Fog and light rays are a great fit underwater and at sea.
- Ships -> shore -> on foot is a natural ladder, and the ground mesh comes from a height field.
- Scope has a natural ladder: sail -> trade -> fight -> walk ashore.

**Flat-earth realms (B) is a *content* problem, not a code problem.**

- The structure is easy: a radial world (distance from centre decides ocean / ice wall / beyond), and realms are a lookup by angle or distance. Cheaper than it sounds as a generator.
- The cost is that every realm needs its own terrain rules, palette, creatures, sound and lore. Asgard, Atlantis and others = several mini-games' worth of art-by-code. One polished biome already costs a lot.
- Bounded (a disc) is easier for a generator but gives up the "massive open world" feel you described. Realms *beyond* the wall can be separate seeds, which is easy.

**Recommendation: build A, but make B a later layer.** Give every sector a `realm` field from day one (`'sea'` now). The ice wall and Asgard/Atlantis later become "new realm = new palette + terrain function + spawn table" on the same engine. You lose nothing, and you ship something playable first.

## Decision: one realm active at a time (map-to-map, not one blended world)

Realms are separate maps. Reaching a realm's edge (ice wall, fog bank, whirlpool, portal) shows a short transition and loads the next realm. This removes the hardest part of the flat-earth idea: no blending biomes at borders, no streaming two worlds at once.

What this means for the design:

- **A realm is a plug-in.** One interface: `{ id, palette, sky/fog, terrain function, sector generator, spawn table, edge rule, music }`. The engine runs exactly one at a time. Today's code is the `sea` realm.
- **Each realm can use its own render settings.** Atlantis can be fully underwater with its own fog and light-ray look; Asgard can be sky and snow; the sea stays sunny. No shared lighting compromises.
- **Realms can be bounded.** Small, hand-shaped realms are fine; only the main sea needs to be endless.
- **Carry-over state:** gold, cargo, ship, reputation, flags. Per-realm state: seed, discovered sectors, defeated enemies. Save = current realm + seed + player state.
- **Transitions:** the edge is a trigger zone; fade or loading screen; spawn at the matching gate in the new realm. A "gate" is just a position and a destination realm.
- **Shipping order is free.** Realms can land one at a time without breaking anything. Realm 1 = the sea.

Effect on difficulty: the flat-earth concept is now **about as easy as the sea world**, because the cost is the same per realm and the structure is just a loader. The per-realm content cost (look, terrain, creatures, sound) from the comparison above still applies, but it is paid one realm at a time.

## Decided: free-roam, the player chooses who to be

The player starts as an ordinary person on an expedition. Once the opening story is done they are free to play it their own way: explorer, trader, fighter, or a mix. "Pirate" is something a player *does*, never a label the game puts on them.

- **Combat stays** (ship fights, loot, ranks of hostile ships). What is missing is consequences, so a later pass adds *reputation per faction*: attack peaceful ships and the coast guard hunts you (the bounty mechanic is the seed of this); trade honestly and ports give better prices.
- **Trade stays** and grows: more goods, price swings, cargo contracts, ship upgrades.
- **Exploration** keeps its rewards: treasure caches, rim outposts, the wall, further realms.
- Playstyles are open-ended by design: do not gate content behind a chosen class. Systems (reputation, contracts, bounties) just react to what the player does.

## Decided: art direction

First person on land, third person at sea (the original mechanics, which the user liked), with **pixel-art anime graphics**: low internal resolution, one fixed palette, navy outlines, flat colours, flat sprite people. No blocky voxel look, no grain. The top-down 2D renderer built along the way is not used. See STATUS.md.

## Phases (nothing started past phase 0)

0. **Core generator + rules (done, 2 known test issues, see `STATUS.md`).**
1. **Fix the 2 failing tests**, then wrap today's generator as the first `Realm` (the interface above) with a gate list and an edge rule.
2. **Renderer:** WebGPU water, island and ship meshes, fog/sky, chase camera plus free camera, build script to a single `index.html`. Verify with screenshots.
3. **Sailing loop playable:** HUD, wind indicator, docking menu (trade, repair), cannons, treasure, game over, save to localStorage.
4. **On foot:** disembark at a port or beach; walkable terrain from the same `islandHeight()` function; collision; simple towns and NPCs; interiors optional.
5. **Depth:** more biomes (jungle, ice, ruins), weather, day/night, factions and reputation, ship upgrades, procedural audio (waves, creaks, cannons).
6. **Second realm (the flat-earth idea):** ice wall as the sea's edge gate, then one new realm (e.g. Atlantis, sunken, with an underwater look) to prove realm switching, carry-over state and per-realm rendering.

## Decided: cameras

- **On foot: first-person** (free camera; collision against `islandHeight()`; no character model needed).
- **On a ship: chase camera** behind and above. Boarding blends from eye height on deck to the chase position over about 1 s, and controls switch from walking to steering. Disembarking reverses it.
- Top-down was considered and rejected: it saves almost no work (same 3D renderer) and loses horizon, sky and the ship-against-sea look. It could return later as an optional camera mode.

## Open questions for you

- Single-player only, or is multiplayer on the table?
- Target: desktop Chrome/Edge with WebGPU only, as both source projects do?
- Is the flat-earth idea a *theme* (ice wall, strange realms) or the main hook? That decides whether phase 6 comes earlier.

## Roadmap additions (from the user, not started)

**Sandbox / consequences (design rule: the player decides who to be, so everyone can be hurt and every deed is remembered)**
- **All NPCs killable.** Shopkeepers, villagers, guards, sailors. Killing has consequences, never a hard block. Shops stay closed or change hands when their owner dies.
- **Reputation, two layers.** *Local* (per town/island: how that settlement treats you, prices, shop access, guards) and *world* (per realm: how that realm's government and sailors see you). Crimes (killing, piracy, theft) lower them; deeds (trade, quests, defending ships) raise them. This is what lets someone choose to be a pirate.
- **World governments.** Every realm has its own government: police/coast guard, laws, bounties, navy patrols. Wanted level and bounties follow world reputation; local guards follow local reputation. Realm 1 first (a navy already exists as an enemy kind).
- **Mercenaries.** Hire-able crews and companies the player can join, take contracts from, or hire for ship/land fights. Joining ties into reputation (the company's employer, its enemies).

**New content**
- **Quests in more towns** (town-level quest givers beyond the main chain, tied to local reputation).
- **Storms** (weather events at sea: wind shifts, bigger swell, lightning, damage; good and bad for sailing).
- **Underwater travel** (a dedicated underwater look): dive from a ship or shore, explore, salvage.
- **Ship weapons** (more cannon types, swivel guns, fire/chain shot, ram variants) and **ship upgrades without buying a whole new ship** (sails, hull plating, bigger hold, more guns, better oars, bought as parts and fitted at the shipyard).
- **Land battles** (fights on foot: weapons, enemies, raids on towns/forts, mercenary involvement).

**Dependencies, roughly:** killable NPCs -> reputation (local + world) -> governments/police -> mercenaries. Ship parts and weapons are independent of that chain and can come first. Land battles need killable NPCs and a combat system on foot.

**Recruitment (added by the user, not started)**
- **Crewmates:** the player starts alone; later they can recruit crew in taverns/ports (sailors, gunners, a carpenter, a navigator). Crew fill ship roles (faster reloads, auto-repair, better trim help, more guns manned), cost wages, have morale and loyalty, and can be killed, lost, or turn on you.
- **Fleet / extra ships:** own more than one ship, captain them by hiring or promoting crew, give simple orders (follow, escort, attack, guard a port, trade route). This is the "army or group" route: a pirate fleet, a trading house or a mercenary company.
- **Followers on land:** the same recruits can join land battles. Recruiting and mercenaries share one system: a recruit is a mercenary you hired yourself.
- Ties to reputation: a good name attracts honest crew, a bad one attracts pirates and costs you in lawful ports.

## Suggestions (other good ideas, ordered roughly by value for effort)

1. **Day/night cycle and weather** (shares storm tech): lamps, stars, night raids, fog banks. Big mood gain, mostly shader work.
2. **Contracts and a trade board** in every port (deliver X to Y, escort, hunt a named pirate). Gives non-main-quest goals and uses reputation.
3. **Ship repair/upgrade parts** and **named enemy captains** (a few recurring rivals with their own ships, bounties on your head).
4. **Fishing, diving and salvage** (side income, a gentle activity, leads to the underwater idea).
5. **Wrecks and ghost ships as set pieces** (loot, lore) and **sea monsters** as rare events.
6. **A map/chart** you fill in as you explore, plus a spyglass. Makes exploration feel earned.
7. **Smuggling** (contraband goods, patrol checks) once governments exist.
8. **Island events and ports with personality** (festivals, plague, blockades, port wars that change prices).
9. **Boarding and capturing ships** (fight on the deck, keep the prize as a fleet ship). Joins naval combat to recruitment and land fighting.
10. **Photo mode / ship customisation** (sail colours, flags, figurehead).

## Recommended order from here

1. **Fix and polish what exists:** hand-play the whole opening, the ship physics and the swell, tune combat difficulty (the denser seas), and replay the bot regression. Cheap, and everything else builds on it.
2. **Combat on foot + killable NPCs** (foundation: health, weapons, death for every NPC; shops close when their owner dies).
3. **Reputation, local + world** (a small data model plus a few reactions: prices, guards hostile, doors closed). This is the first system that turns "kill anyone" into a real choice.
4. **Governments, bounties and guards** for realm 1 (the navy is already there), built on top of reputation.
5. **Ship parts/upgrades and weapons** (can start earlier in parallel; independent of 2-4).
6. **Recruitment and crew, then fleets**, then **mercenary companies** (needs killable NPCs, reputation and the upgrade system first).
7. **Weather/storms and day/night**, then **contracts**, then **underwater** and **land battles at scale**, then realm 2.

Reason: 2-4 are the spine of the "be whatever you want" promise, and everything later (crew, mercenaries, smuggling, contracts) plugs into them. Doing the cosmetic and exploration items earlier is possible, but they do not unlock anything.

## Status of the ordered list (user confirmed: start with steps 1 and 2)

More ideas (value order): 1 day/night + weather, 2 contracts board per port, 3 ship parts + named rival captains with bounties, 4 fishing/diving/salvage, 5 wrecks/ghost ships/sea monsters, 6 explored-area chart, 7 smuggling, 8 island events (festivals, blockades), 9 boarding and capturing ships, 10 ship customisation.

Build order: **1 polish what exists (IN PROGRESS)** · **2 foot combat + killable NPCs (IN PROGRESS)** · 3 reputation (local + world) · 4 governments, guards, bounties · 5 ship parts and weapons (parallel to 2-4) · 6 crew, fleets, mercenaries · 7 storms, contracts, underwater, big land battles.

## Added by the user (2026-11-24, not started)

### The law from the other side: bounty missions (the cop path)
Goal: the player can be a lawman as easily as an outlaw. Nothing is gated; the same systems (reputation, bounty gold, guards, the jail) just pay out in the other direction.
- **Bounty board / bounty missions.** Every guard station (and notice board) lists wanted people: a name, a portrait seed, a reward, a last-known island or sea sector, and whether the target is wanted **dead or alive** (arrested targets pay more, killed ones less; killing an "alive only" target hurts reputation).
- **Targets are real people in the world**, not spawned from nothing: a named raider captain with a ship, a thief hiding in a town's houses, a deserter on a remote island, a rival crew's officer. They are generated from the seed and the issue number (like the notice boards) so they are stable and persist once met.
- **Arrest, don't just kill.** On foot: reduce the target's health to near zero ("subdued") and use a *bind* action, or shout for surrender when outnumbered. At sea: board and subdue (see boarding below). A bound prisoner follows you or is carried; they can escape, be rescued by their crew, or be killed by rivals on the way.
- **Bring them back to ANY town in the same world (realm).** A target can be handed in at the guard station of any port in the current realm, not only the town that posted the bounty. The reward is paid by the realm's government; the handing-in town's local reputation goes up. Wanted level and bounty gold follow the *world* score, so the same hand-in works for the player's own bounty being cleared by serving.
- **Prisoners use the jail we already have** (the cell inside every guard station): handed-in targets are locked in the cell (the player can see them there); the player's own arrests wake them in the same cell.
- **Reputation hooks:** lawful work raises world and local reputation, which unlocks cheaper prices, access to navy contracts, a badge or commission (the cop rank ladder), and being let off a bounty; hunting people who are not on the board still counts as murder. Bounty hunting rivals (other hunters, the crews of the people you jailed) come after high-profile cops.
- **Build on:** the existing `bountyGold`, `alert`, guards, `stationOf` and cell (`jail.spawn`, `jail.gate`), the notice boards (`rules/news.js`), the world reputation score (`rules/rep.js`), named raiders (`sectorEnemies`).
- **Steps:** (1) wanted-target data model + board listing; (2) kill-for-reward on foot and at sea; (3) subdue/arrest + prisoner following; (4) hand-in at any guard station in the realm + payout and reputation; (5) escapes, rescues, rival hunters; (6) ranks and a badge.

### Boarding other ships
- **Board an enemy or merchant ship** from your own: come alongside (or ram-and-grapple), press a key to throw grapples, and your hull and theirs lock together for a short deck fight on foot (the same sword/pistol combat as on land, on the enemy's deck).
- **Outcomes:** capture the ship (keep it as a prize or fleet ship, sell it, scuttle it, or sail it as your own), loot the hold and the captain, take the captain **prisoner** (this ties directly into bounty missions: a wanted captain taken alive is a hand-in), or be repelled. Crew (once recruitment exists) fight beside you; alone you face the whole crew, so small ships and raids on weak merchantmen come first.
- **Consequences:** boarding a peaceful ship is piracy (bounty, reputation); boarding a raider or a wanted ship is lawful and pays. Navy ships board *you* when you have a bounty at sea.
- **Build on:** the ship classes and hulls (`rules/ships.js`, `hullHit`), the foot combat and weapons (`rules/weapons.js`, `swing`), enemy kinds and health (`KINDS`), the sinking and fx system (`s.sinking`, `puff`), and the jail and bounty systems for prisoners.
- **Steps:** (1) approach and grapple (ships lock together, wind/steering locked); (2) a deck arena built from the ship's length with a few defenders; (3) win/lose rules and loot; (4) capture options (prize ship, prisoner); (5) enemy boarding parties against the player.


### Build order (revised)
3 reputation (done) · 4 governments, guards, bounties, jail (done: guards, arrest, a real guard station with a cell) · **4b bounty missions + hand-in anywhere (cop path)** · **5b boarding other ships** (needs 4b for prisoners) · 5 ship parts and weapons (independent) · 6 crew, fleets, mercenaries · 7 storms, contracts, underwater, big land battles.

### Added by the user (2026-11-24, second batch, not started)
- **Some NPCs fight back, and you can't tell which.** A hidden trait per person (seeded from the world seed and their id): most are harmless, a few carry a weapon and attack when hit, or even first if you look wealthy or wanted. No visual tell on purpose (maybe a subtle body-language hint once you have the reputation or a skill to read people). Build on `hurtNpc`, the guard lunge and the `kb` knock-back; health and damage come from `KINDS` / `weapons.js`.
- **Government navy ships hunt you, but not right away.** A world-reputation / `bountyGold` threshold (well past a first crime) makes navy ships start appearing in the sea sectors around ports and then chase; the worse the record, the bigger and more numerous. They fade out when the bounty is paid or cleared. Build on `sectorEnemies`, the wanted level and `alert`, and boarding (navy boards you when wanted at sea).
- **Attack towns from the ship with a toggle.** When near a town the player can switch "bombard towns" on or off (key shown in the prompt/HUD). Off by default: cannonballs pass over town buildings so fights with ships near a port never hurt it by accident. On: cannons damage buildings and people, which raises local and world bounty, alerts guards and can close the port to you. Build on the cannon projectile code in `game.js` and `crime()` / `addLocal`.
- **Town states (status, not territory), for sieges and pillaging.** Each town/city has a health pool and a status that changes as it is bombarded from the sea: calm -> damaged (some buildings scorched, people flee indoors) -> burning (fires and smoke on buildings, guards and shops panic or shut, production and prices suffer) -> pillaged / ruined (shops closed, people gone or hostile, loot available, slow recovery over time). Thresholds on town HP drive the visuals (flat fire/smoke sprites on buildings through the existing `fx` system) and the gameplay (shops closed, fewer NPCs, guards fight, reputation and bounty hit). Later states can also come from events (blockade, plague, festival) so a town's status is one shared field. Build on the bombardment toggle above, `islandTown` buildings, `alert`, `rep.js` and `s.fx`.
- **Wind favours the objective (done, 2026-11-24).** The wind comes in 150 s spells; each spell has an 80% chance of blowing roughly toward the current objective (within about 0.45 rad), otherwise it is the old free random drift. Spells blend over 40 s. `windAt(t, goal)` in `rules/sea.js`.

### World map (done 2026-11-24)
M opens a map that only shows what the player has found out (visits, NPC charts, quests). Grand map = every realm in REALMS (src/rules/map.js); add a world by adding one entry. Planned worlds: Asgard, Atlantis, Olympus (hinted by rumours in that order; reaching them still needs the realm loader of phase 6).

## Where the plan stands (end of 2026-11-24)
**Done:** 1 polish, 2 foot combat and killable NPCs, 3 reputation, 4 governments/guards/bounties/jail, 4b bounty missions (cop path), 5b boarding ships (steps 1-4), 5 ship parts and weapons (no ram variants), hidden fighters, hunting navy, bombardment toggle and town states, 6 crew and recruitment, 6 fleets, the world map (locked until the Wall breaks; registry-based so Asgard, Atlantis, Olympus are single entries).

**Still open, in the order I would do them:**
1. **(Done, R44: deliver and cull; escort still open) Contracts board in every port** (deliver cargo X to Y, escort a merchant with your fleet, hunt a named pirate; pays by reputation). Gives goals beyond the main story and uses fleets, reputation and bounties.
2. **Mercenary companies** (hire or join; contracts from employers; ties to reputation) and **fleet trade routes**. Finishes step 6.
3. **(Storms and weather done, R57; day/night still open) Storms and day/night** (shared tech: lightning, wind shifts, lamps, night raids, fog banks).
4. **Navy/raiders boarding you**, rival bounty hunters, rescues of prisoners (finishes 4b and 5b), a small ship attack animation.
5. **Underwater travel and salvage**, then **land battles at scale** (raids on towns, mercenaries, shells hurting people).
6. **Realm loader and the first new world** (Asgard, Atlantis or Olympus): per-realm palette, terrain, spawn table, edge rule, carry-over state, then fill the grand map. Needs the contracts, weather and underwater pieces to be worth it.
7. Smaller ideas: sea monsters and wrecks, smuggling, island events as town states (blockade, plague, festival), ship customisation and visible parts, explored-area extras on the map.

## After the Wall: open ocean, no more story (planned 2026-11-24, not started)
**Decisions from the user:** breaking the gate plays a short animation of the ship passing through, then the game becomes pure open world (no more main quests; contracts, bounties, trade, boarding, fleets, crew stay). The next worlds sit a long sail away from the player in the same continuous ocean, so you reach them by sailing, not by a loading screen. Ambient sea creatures and birds (not interactable yet) make the sailing feel alive. This **replaces** the earlier "one realm active at a time, map-to-map" decision for the outside: beyond the Wall is one continuous ocean with realms as regions of it. The realm registry in `rules/map.js` stays as the source of names, rumours and map positions.

**1. The breakthrough scene (small, do first).** On the ram hit set `s.cine = {t0, kind:'breach'}` instead of `s.ending`. About 7 s, no input: ice cracks and falls (flat ice-chunk and spray sprites through `s.fx`), the chase camera pulls back and slightly low behind the ship, the ship is driven through the gate by script (speed ramps up, a little swell), the wall slides past, then a bright flash-fade into the outer sea (new sky and fog: warm light, long view, no ice haze) and a title card "Beyond the Wall". Then control returns and the quest HUD is gone. Nothing saved mid-scene (save the post-scene state). `ui.ending` and the "coming soon" screen are removed.
**2. Open-world switch.** After `flags.crossed`: no objective compass, quest log shows only contracts and a journal of discoveries. The map (M) is the only guide (already locked until now). Rumours (tavern, sailors, notice boards) hint at the next regions, in map order.
**3. The outer ocean.** `sectorIslands` currently returns nothing past `WALL_R + SECTOR`. Add an outer-sea generator: very sparse open ocean (rare lone islets, wrecks, drifting ice), dense archipelagos only inside each realm's disc. Realm position comes from `REALMS[].grand` (Asgard is about 1.95 wall radii out, roughly 5700 units past the Wall, about 6 minutes at top speed), so a realm is a real destination with open water between. A realm is data: `{centre, radius, palette, sky/fog, biome table, building style, creature table, music}`.
**4. Which world first: Asgard (easiest).** It reuses most of what exists: the frozen biome, the cold sky and fog ramp, snow ground and the pixel pipeline, so it is mostly a re-skin: fjord-like islands with cliffs and pines, timber long-halls and rune stones in the town generator, a longship mesh for local ships, an aurora in the sky (static pixel bands, no motion), cold music variant. Keep the "above the clouds" idea for later (a cloud-sea fog layer is cheap if wanted).
- Olympus is second (sunny archipelago of tall marble-and-gold islands, temples, eagles): same sea, new palette, taller peaks and one new building style.
- Atlantis is last and hardest: it needs a real underwater render mode (diving, fog, light rays), a new movement mode and a transition. Plan it together with the underwater and salvage item.
**5. Sea life (ambient, not interactable).** Deterministic from (seed, sector, time), so no state, nothing saved, no cost when out of view; flat pixel sprites in the existing atlas, instanced, hard cap about 40 visible, spawned within about 250 units and faded in and out. Candidates: whales (slow swim, spout, now and then a breach), dolphin pods that race your bow wake, flying fish skipping off the swell, turtles and rays near shallows, fish-school shadows, a giant shadow gliding under the hull now and then (the "adventure" moment), sea snakes and a rare huge tentacle or fin far away. Birds: gulls near land, albatross over open sea, V-flocks heading toward land (a free hint to a coast), ravens and an aurora in Asgard, eagles in Olympus. Sound: procedural whale song at distance, spouts, gull cries. Per-realm creature tables keep each world distinct. Later they can become interactable (fish for food, harpoon, tame, flee from a sea monster).
**6. Build order.** (a) breakthrough scene and end the quest line, (b) outer-ocean generator and the new sky, (c) ambient creatures and birds (works on Terra too, so test it early), (d) Asgard region data and look, (e) map, rumours, discovery journal, (f) Olympus, (g) Atlantis with underwater. Each step: tests, Chrome check, optimization measure (budget: under 0.2 ms rules and under 1 ms extra CPU for creatures), update STATUS.md.
**Open choices to settle:** how far Asgard sits (default: the existing map position, about 6 minutes of sailing), whether Terra's gate leads out on the same side as Asgard (default: no, you must find the way round, rumours and birds help), and whether the Wall can be sailed back through (default: yes, a gap stays).

### Revision (2026-11-24, after the user's reply): worlds stay separate, entered by distance
**This overrides "one continuous ocean" above and restores the original rule: one realm in memory at a time, map to map.** Reason: resources. Only one realm's sectors, caches and creatures exist at once.
- **Outer Sea zone.** Breaking the gate puts you in a sparse ring just outside the Wall (still Terra's data, cheap: almost no islands, ambient sea life, birds, a few wrecks and drifting ice). Sailing out to the edge ring (about 3500 units past the Wall, roughly 4 minutes at top speed; tune by feel) triggers the entry to a world. The **bearing** you leave on picks the destination from `REALMS[].grand.ang` (Asgard up, Atlantis lower left, Olympus right), so the map and the sailing agree and no extra data is needed.
- **Entry sequence.** Near the edge (last 300 units) a hint: birds fly that way, the sky tints, faint music. At the ring: first visit shows "Entering unknown waters" (a known world shows its name), the ship slows, a short fade, the realm loads, and the player is placed at that realm's outer rim facing in. The way back is the same on the other side: sail out from the rim to return to the Outer Sea or Terra.
- **Carry-over:** gold, cargo, ship, crew, fleet (fleet ships come along), weapons, parts, bounty, quest flags, contracts. **Per realm (saved by realm id):** world reputation and local reputation, town states, discovered map cells, killed bosses/named captains, prisoner lists, wanted list index. One realm is serialised as active, others as small stubs.
- **Resource rules on a transition:** drop the old realm's island, mesh and prop caches (`wcache`, `seedCache`, sector caches), enemies, shots, fx, creature state; rebuild lazily for the new one. Atlas sprites shared between realms stay; realm-only sprites are baked after the fade. Keep the budgets: rules under 0.2 ms a step, creatures under 1 ms CPU, at most about 40 creature sprites, draw only what is in view.
- **Rumours start on Terra from the first minutes (lore before the Wall).** Asgard hints appear from the start in the tavern, the old sailor, the harbourmaster, notice boards (odd items: a longship plank washed ashore with runes, a trader who swears he saw lights in the north, sailors who will not sail past the ice at night, children's songs about the feast-hall), and escalate with progress: wreck news, a relic sold by a merchant, the warden at Frostwatch telling what the Wall was built to keep out. These are flavour only (not quests) and feed the existing rumour order (Asgard, then Atlantis, then Olympus). The map shows nothing until the Wall is broken, but the hints are recorded from the start.
- **Build order change:** (a) breakthrough scene + outer-sea ring + edge trigger + "Entering unknown waters" + the realm loader with a stub realm (so the transition, carry-over and cache freeing are tested before any art), (b) early Asgard rumours on Terra, (c) ambient creatures and birds, (d) Asgard content, (e) the rest as before.

### Update (2026-11-24): the Wall has no gate, one weak spot; Asgard's look (decided)
- **The Wall** is a continuous ice cliff, same height all round, banded deep blue to white with a snow lip, icicles and rubble. One stretch (the weak spot, seeded; `gateAngle` in code) is paler and cracked. It needs the ram at speed above 3.2. When broken it **stays open** (ragged edges, ice rubble) and you can sail back through. More weak spots in other directions come with more worlds (one per world, on that world's bearing).
- **Asgard must look and feel different from Terra:** Vikings, not villagers (fur, braids and beards, horned and plain helmets, round shields, axes), timber long-halls with carved dragon-head gables and turf or shingle roofs, stave halls, rune stones, drying racks, smoke holes, fjord cliffs and pines, snow, longships (square striped sail, dragon prow, shields along the rail) for local and enemy ships, a cold palette, aurora. Asgardian sea life and birds are different from Terra's (ice whales and narwhals, seals, orca, ravens and white eagles, no tropical fish). Each world gets its own people, building, ship and creature set.

## Where the plan stands (2026-11-27, after round 119)
**Next, in a suggested order** (Chrome checks of trade runs, raids and cutpurses done in round 110; the scheduled runs are on)
0. **Lived-in islands (asked by the user, 2026-11-27; do this first).** Some islands are just hills; some of them should feel like real inhabited places. See "Lived-in islands" below. Step 1 (hamlets) done in round 117, step 2 (people and animals) in round 118, step 3 (kinds) in round 119; step 4 next.
1. Player feedback and checks by eye and ear (open item 1). The shipyard trade-route page, a raid and a cutpurse fought with a sword were checked in Chrome in round 110 (raids made longer so you can join); sound and real mouse play still need a person.
2. Town stories: Asgard versions (the shieldmaiden done, round 113; the rune-reader done, round 114), the pickpocket kid (done, round 115), the runaway noble (done, round 116), the rival ship drawn at sea during a race (next; item 3; the navy deserter done, round 112).
3. Asgard people carrying axes (item 5).
4. Towns: street layouts per type, clothing for fishing, trade and fortress towns, a Norse hof (item 6).
5. Night: more events, guards joining a chase, house burglaries (item 7).
6. Underwater in 3D (item 8).
7. Deeper mercenaries, trade routes and land battles (item 9).

### Lived-in islands (asked by the user; steps 1-3 done, rounds 117-119)
Today only islands that roll a port get buildings and people; the rest are a hill with scattered trees, bushes and rocks. Make a good share of those port-less islands feel inhabited, in small steps:
1. **(Done, round 117: houses round a well, crop plots, a footpath, a boat by the landing; no jetty yet)** **Settlements without a port:** on many of the bigger wild islands, a hamlet or farmstead: two to five houses or huts, a well, fences, crop plots, a footpath, and a small jetty with a rowboat. Reuse the town building meshes and sprites.
2. **(Done, round 118: an islander by a cooking fire, sometimes a farmer, walkers, sheep, goats and chickens, chimney smoke, a lantern; nobody sits yet)** **People and animals:** a few islanders walking, working or sitting by a fire (with a line to say), plus goats, sheep or chickens; smoke from chimneys, lit windows and a lantern at night.
3. **(Done, round 119: farm, fishing camp, shepherds, woodcutters, hermit, lighthouse, ruin with squatters, weighted per world; animals graze outside the pen)** **Different kinds**, so they do not all look alike: farm, fishing camp, shepherds' hill, woodcutters, hermit, lighthouse, old ruin with squatters; each world with its own look (Terra, Asgard, Atlantis, Olympus).
4. **Something to do:** trade a few provisions, hear a rumour, a small job here and there.

Keep: islands, ports and their positions stay where they are (old saves still work); some islands stay wild; monster nests and lairs, wrecks and quest spots stay clear; lean as always (check ground-building time, frame time and build size). Check by eye in Chrome from the sea and on foot.

**Next step:** "Lived-in islands", step 4 (something to do: trade a few provisions, hear a rumour, a small job here and there; the kind can decide what is on offer, e.g. fish at a fishing camp, wool at a steading, timber at a woodcutters' camp, a sighting from the lighthouse keeper). A hamlet is `islandTown(isl)` with `kind` (round 119), `yard`, `fire`, `npcs` (roles islander, farmer, fisher, shepherd, woodcutter, hermit, keeper, squatter) and work-place marks; its animals come from `hamletBeasts(isl)`. After that, item 2 in the list above: town stories, next the rival ship drawn at sea during a race. The runaway noble was done in round 116 (The Runaway Heir: pay off or fight the house steward's men, and while the heir is with you an arrest costs half the fines; also a fix: gangs no longer hit a companion who is falling back). The pickpocket kid was done in round 115 (Quick Hands: buy or fight the kid free of a fence, and while the kid is with you no cutpurse gets your purse; any world). The rune-reader was done in round 114 (The Stone That Lies: a lying stone, barrow-robbers, and a navigator who finds a 30-gold grave-gift at every new rune stone; Asgard-only event). The shieldmaiden was done in round 113 (The Broken Shield: a debt or a holmgang, the raiders' camp, and a shield that cuts the blows on you by a quarter; Asgard-only events; Norse names that match). The navy deserter was done in round 112 (New Papers: a forger, marines, and a navigator who thins the navy hunters; hurt companions now fall back). Rival-crew races were done in round 111 (a 60-gold bet to reach a nearby port before the rival; a side-story template). Round 110 checked the shipyard trade-route page, a raid and a cutpurse with a sword in Chrome, and made raids last 20-35 s so a player in a shop can join. Night-only events and thieves were done in round 108: after dark a cutpurse may lift part of your purse and run (catch him for it back), and some nights a port has "Cutpurses Abroad" (more of them, a reward per head). Raids on towns (land battles, first pass) were done in round 107: a landing party now and then at the port you walk, fought beside the guards (and Iron Tide sell-swords for members), paid per raider, or the town burns. Fleet trade routes were done in round 106 (one-off runs from a shipyard for 30% of the margin, raiders 8-35%). Mercenary companies were done in round 105 (join for jobs and ranks, or hire a ship for 10 minutes; the Iron Tide ties to your name). The hydra in Olympus (fought with fire shot) was done in round 104; the harpies came in round 109. The kraken's underwater phase (its den, finished with powder kegs by the diver) was done in round 103. Every world's own chart, with its wrecks and gate, was done in round 102. Night rules (shops shut 20:00-06:00, a tavern bed until dawn, a night watch) were done in round 101, the dive view in round 100 (with a fix: the kraken had shared the wrecks' spots), risks while diving in round 99, wrecks on the chart map in round 98, sunnier Olympus weather in round 97, the Atlantis sea gate in round 96. Day and night (item 7) is done as looks only (round 90).
**Done:** contracts and tavern jobs, the Wall breakthrough and Outer Sea, separate worlds with a loader, fast travel, weather, sea life, Asgard first pass, three town types, AFK and debug modes, side stories, town events, companions, compass and chart map, one hand for all weapons, welcome and tutorial, choosing the quest to follow, buildings and a jail in every town, the graphics speed-up, the rim-or-explore message after the supply cache, the sea serpent, draugr longships in Asgard, rune stones and the aurora in Asgard, mead halls in Asgard, Norse axes, fjord coasts and Norse music in Asgard, Asgard's rune gate on to Olympus, mining towns, smugglers' coves and temple towns, day and night, wrecks and salvage, Atlantis's own world, Olympus's own world, the kraken in Atlantis, the cyclops in Olympus, the sea gate from Atlantis to Olympus, sunnier Olympus weather, wrecks on the chart map, risks while diving, the dive view, night rules, a chart for every world, the kraken's den, the hydra, mercenary companies, fleet trade routes, raids on towns, cutpurses at night, harpies, rival-crew races, the navy deserter, the shieldmaiden, the rune-reader, the pickpocket kid, the runaway heir, hamlets on wild islands, people and animals in them, kinds of hamlet. All pushed (round 119).

**Open, in a suggested order**
1. Gather player feedback, and check by eye and ear what has only been tested (story fights, event crowds, jail, map, sounds; soft and mid looks, storms, Asgard and a weak graphics card since the speed-up).
2. (Done, round 74) Every town gets real buildings, including a guard station with a jail.
3. Rest of the town stories (see "Living towns" below). Part done in round 77: board, deadline and escort steps, two stories, two events. Round 78 added the remaining main events and the singer. Rival-crew races done in round 111, the navy deserter in round 112, the shieldmaiden (Asgard) in round 113, the rune-reader (Asgard) in round 114, the pickpocket kid in round 115, the runaway heir in round 116. Left for later: the rival ship drawn at sea.
4. (Done, round 79) First monster: the sea serpent.
5. (Done, rounds 80-86) Asgard second pass: draugr longships, rune stones and aurora, mead halls, axes, fjords, music, and the rune gate. Left for later: Asgard people carrying axes.
6. More town types: mining (done, round 87), smugglers (done, round 88), temple (done, round 89). Left for later: street layouts per type, clothing for fishing, trade and fortress towns, a Norse hof in place of the temple in Asgard.
7. (Done, round 90) Day and night, looks only; (done, round 101) night rules: shops shut, a tavern bed, a night watch. (Done, round 108) night-only event and thieves: cutpurses. Left for later: more night events, guards joining a chase, house burglaries.
8. Underwater and salvage (first pass done, round 91: wrecks, rumours, diving from the ship), then Atlantis (own world done, round 92) and Olympus (own world done, round 93). Left for later: wrecks on the map (done round 98 for Terra, round 102 for every world), risks while diving (done, round 99), a dive view (done, round 100; nothing in 3D underwater yet), an Atlantis monster (the kraken's surface phase, done round 94; its den, round 103), an Atlantis gate (done, round 96), an Olympus monster (the cyclops, done round 95; the hydra, round 104; the harpies, round 109) and sunnier Olympus weather (done, round 97).
9. Mercenary companies (first pass done, round 105; left for later: per-world company names, escort jobs), fleet trade routes (first pass done, round 106; left for later: standing routes, escorting your own trader), land battles (first pass done, round 107: raids on the port you are in; left for later: leading your own landing party against a town, sieges, per-world raider looks).

The aim for the open game: the player picks a life (explorer, criminal, trader, guard, mercenary), taverns carry rumours and quests, and each town offers something new.

### Mythical creatures (suggested 2026-11-25, waiting for the user's choice)
One monster active at a time, in rare places, flat pixel sprites, hinted first by rumours; mostly fought with existing cannons, special shot, boarding and melee.
- Outer Sea: sea serpent, ice leviathan (a waking "island"), ghost whale in fog.
- Asgard: Jormungandr's young (storms), draugr longships, frost giant, Fenrir wolf pack, valkyries.
- Atlantis (best with underwater): kraken (surface phase first), sirens, hippocampus (tameable).
- Olympus: cyclops throwing boulders, harpies, hydra (fire shot), Scylla and Charybdis.
Suggested first: sea serpent (done, round 79), then draugr longships (done, round 80), then the kraken's surface phase (done, round 94), then the cyclops in Olympus (done, round 95).

## Living towns, layered quests, companions (planned 2026-11-25; first pass built, see STATUS.md round 68)
Goal: towns with something going on, and side quests with more than one layer instead of "kill X" or "talk to Y". Lean rule: everything is **data + a pure function of (seed, town, issue)** like the notice boards. No new renderer work, no new meshes; a handful of new flat sprites at most. Only resolved ids go in the save.

### A. Town events (`rules/events.js`, about 120 lines + data)
- **One event per town per notice issue** (or none: about 50% of issues), picked from a weighted table by town type (fishing, trade, fortress, plain) and world. Shown on the notice board, mentioned by the tavern keeper and villagers, and announced when you walk in ("Port X: the Herring Festival is on").
- **Each event is data:** `{ id, weight, types, look, effect, hook }`.
  - `look`: reuse what exists: extra villagers in the plaza, banners and lanterns (one new sprite), a campfire or smoke (`fx`), shut shops, more guards. No new layout code.
  - `effect`: prices (a good is cheap or dear), shop closed, guards plus or minus, crew cheaper, rep bonus. All already modelled.
  - `hook`: an optional mini-quest (a quest template from part B, seeded from the event).
- **Starter list (about 14):** festival (cheap food, a drinking contest, a race round the island); market day (a travelling trader with one rare part); tavern brawl (join, stop it for rep, or bet); fire in a house (carry water from the well in time); plague scare (doctor needs herbs from a wild island; shops half shut); blockade (raiders off the harbour, prices up until you break it); public trial (testify, bribe or free the accused); wedding (a gift, or the groom has fled); duel challenge (a local swordsman, fists or blades, purse on it); smugglers caught (help the guards or help them escape); missing child (tracks lead to a cave or a wreck); press gang (navy taking men, including your crew); storm damage (repair job for wood, pays in standing); a stranger in town (a companion lead, part C).
- **Town states join in:** an event can set the existing town state (burning, blockaded), so siege, fire and plague share one field.

### B. Layered quests (`rules/sidequests.js`, a small step engine + templates as data)
- **A quest is a short chain of steps**, and each step reuses a system we already have:
  `go` (sail or walk to a place, compass points there) · `talk` (a named NPC spawned on a real island) · `find` (dig, search a wreck, a chest in a house: the treasure X code) · `fight` (a group of N foes at a place: the `spawnFoe` / `stepFoes` code, which already works) · `board` (a named ship: boarding) · `bring` (carry an item or a person back: the prisoner-follow code) · `choose` (2-3 options, each opening a different next step) · `timer` (a deadline, like contracts).
- **Templates with twists, not fixed scripts.** A template has slots (giver, item, place, group, rival) filled from the seed, and one or two **twists** picked at random so the same template plays differently. Examples:
  1. *The Lost Heirloom*: find a ring -> the X is dug up already -> tracks point to a gang camp on another island -> fight them or buy it back -> twist: the giver stole it first (return it, keep it, or hand the giver to the guards).
  2. *The Missing Brother*: talk to his crewmates -> his ship was taken by raiders -> board the raider -> he has joined them willingly (bring him home bound, leave him, or let him join your crew).
  3. *A Cargo That Isn't*: a simple delivery -> the crates are contraband -> the navy stops you on the way (pay, fight, or dump the cargo) -> the receiver pays double or sells you out.
  4. *The Cursed Map*: half a map from a dying sailor -> the other half is held by a rival crew (a named crew from the notice boards) -> race them to the island -> fight at the dig site.
  5. *The Debt*: a shopkeeper is being leaned on -> follow the collector -> a loan shark with guards in a house -> pay the debt, fight, or take over the racket (rep goes either way).
  6. *A Ghost on the Lanes*: sailors vanish -> a wreck with a log -> it leads to a ghost ship near the rim -> board it -> the captain begs you to finish his last delivery.
- **Givers:** any town can post one or two (tavern menu "Anyone need help?", a villager with a "!" on a quest day, an event hook). They are ordinary people, killable, with local rep tied to the outcome.
- **Layers stay honest:** each step tells you the next one in the quest log, with a one-line "what I know" journal. At most 3 side quests at once.
- **Rival crews (already in the news) become real quest actors:** they hold the item, race you, or ask for help. Their size from the notice board decides the fight.

### C. Companions who join for a while (`rules/companions.js`)
- **One companion at a time, short-term**, met through an event or a quest step ("a stranger in town"). They follow you on foot (prisoner-follow code), fight the nearest foe (the foe code pointed the other way), have HP, can die, and leave when their part is done. Afterwards a few offer to join your crew permanently.
- **Each one is data:** a name, a look (an existing person sprite with a palette tint), 6-10 lines, one perk, and a personal want:
  - the *disgraced swordswoman*: fights well, wants to face the duellist who shamed her;
  - the *old cartographer*: marks a hidden cache on the map, slow, must be protected;
  - the *pickpocket kid*: opens locked chests, steals from shops if you let them (rep risk);
  - the *runaway noble*: pays well, is being hunted by guards;
  - the *tavern singer*: lifts crew morale, knows every rumour;
  - the *navy deserter*: knows patrol routes (the navy hunts you less), wanted on sight;
  - in Asgard: a *shieldmaiden* and a *rune-reader*.
- **They talk:** a line when you enter a town, after a fight, at an event, when you do something they hate. This is cheap (a string table) and gives most of the "interesting character" feel.
- **Their want is a quest:** finishing it is what makes them offer to stay.

### Build order (each step: tests, Chrome check, size and CPU check, STATUS.md)
1. Step engine + `go / talk / find / fight / choose` + two templates (Heirloom, Missing Brother). Quest log shows side quests.
2. Town events: the data table, notice board and tavern lines, 6 events with looks and effects.
3. Companions: follow + fight + talk + two characters.
4. Remaining steps (`board`, `bring`, `timer`), the other templates, the rest of the events and characters, Asgard versions.

Steps 1 to 3 are built (first pass). Step 4 is open.
**Budget:** under 25 kB of source for all three parts (mostly text), under 0.1 ms per step, one or two new sprites, no new meshes.

## Held weapon and hands: review (2026-11-25)
Built since: one hand drawing for every weapon, held from the lower right, walk bob and wind-up (see STATUS.md). The list below is the original review.
Seen as drawings (not in the game): the fist and the weapon hands do not match. The fist is big and detailed (thumb, tendons, long sleeve); the weapon hands are small, boxy and identical for both arms.
1. **One hand drawing for everything.** Reuse the fist (the best drawing) for every weapon: draw the back of the hand, then the grip, then the fingers on top, so the hand wraps the handle. Same scale for fists and weapons. Removes the second arm builder, so the file gets smaller.
2. **The second hand must be a left hand.** Today both hands are the same shape; mirror it (thumb on the other side) and bring its arm from the lower left, shorter, so it reads as two arms.
3. **Hold weapons the way you would use them, all coming from the lower right**, tip near the crosshair, so the middle and left of the view stay clear: sword in a guard leaning about 25 degrees toward the middle; dagger low and short; spear held low and pointing forward at the crosshair (seen from behind, short); axe resting on the right shoulder; pistol pointing forward (seen from behind: rear sight and muzzle, not side-on and pointing at the sky).
4. **Movement bob:** swap the always-on idle sway for a walk bob only while moving and a slower one when standing (CSS class toggled by the game; no cost).
5. **A wind-up frame** before each swing (pull back, then strike) so attacks read better; still `steps()`.
6. **Check at the real size:** at 112 px the finger lines may vanish after the palette snap; draw them two pixels thick or drop them.
7. Optional: the left hand shows on its own for F actions (dig, bind, pick up), as one short sprite.
