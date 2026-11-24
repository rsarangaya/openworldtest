# Plan

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

First person on land, third person at sea (the original mechanics, which the user liked), with **pixel-art anime graphics in the style of the user's MultiTest game**: low internal resolution, one fixed palette, navy outlines, flat colours, flat sprite people. No blocky voxel look, no grain. The top-down 2D renderer built along the way is not used. See STATUS.md.

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
1. **Contracts board in every port** (deliver cargo X to Y, escort a merchant with your fleet, hunt a named pirate; pays by reputation). Gives goals beyond the main story and uses fleets, reputation and bounties.
2. **Mercenary companies** (hire or join; contracts from employers; ties to reputation) and **fleet trade routes**. Finishes step 6.
3. **Storms and day/night** (shared tech: lightning, wind shifts, lamps, night raids, fog banks).
4. **Navy/raiders boarding you**, rival bounty hunters, rescues of prisoners (finishes 4b and 5b), a small ship attack animation.
5. **Underwater travel and salvage**, then **land battles at scale** (raids on towns, mercenaries, shells hurting people).
6. **Realm loader and the first new world** (Asgard, Atlantis or Olympus): per-realm palette, terrain, spawn table, edge rule, carry-over state, then fill the grand map. Needs the contracts, weather and underwater pieces to be worth it.
7. Smaller ideas: sea monsters and wrecks, smuggling, island events as town states (blockade, plague, festival), ship customisation and visible parts, explored-area extras on the map.
