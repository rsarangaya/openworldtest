# Status

Last updated: 2026-11-26. **Free-roam sailing game: first person on land, third person at sea, pixel-art look. The story takes you to the Wall; breaking it opens pure open-world play, with other worlds across the Outer Sea. Asgard has a first pass.** Pushed and live: https://rsarangaya.github.io/openworldtest/ (up to round 80, commit c389280). Work in progress: players are asked for feedback.

## Run it

```powershell
cd open-world-test
npm install        # once
npm test           # 114 tests, all passing
npm run build      # writes index.html (315.7 kB, 123.5 kB gzipped)
npm run dev        # unminified build
```

Open `index.html` in desktop Chrome or Edge (WebGPU needed). Click the game to capture the mouse; Esc pauses and a second Esc resumes.
URL options: `?look=soft` (smooth colours, 720p), `?look=mid` (540p), `?debug` (then the ` key opens the test panel). Join them with `&`.

**Controls.** On foot: WASD move, Shift run, Space jump, F talk / read notice board / bind a beaten outlaw / board ship, Q or left click attack, 1-5 weapons, Tab quest log (pick the quest to follow), M map (from the cartographer's story or after the Wall; Fast travel tab after the Wall), P AFK mode. At sea: A/D steer, W/S sails, Z/C boom, R sail straight, O oars, Q/E cannons, 1-3 round/chain/fire shot, F dock, G grapple a ship alongside, B bombard towns on/off, T fleet orders, M map, P AFK.

## Where things stand (2026-11-26)

**In the game**
- Start: a welcome message and a one-page tutorial on a new game.
- Story: 8 quests to the Wall (after the supply cache a pop-up says you can head straight for the rim or explore first); one weak spot, broken with the ram in a breakthrough scene; the breach stays open.
- Open world after: Outer Sea, edge of the world picks the next world by bearing, fast travel to visited ports.
- Side stories: layered, with choices and fights (up to 3 at once); four companions who join for a while.
- Town events: sixteen kinds, changing with the notice board.
- Quest choice: follow the story, a side story or a contract from the quest log.
- Navigation: compass strip with your ship's direction; zoomable chart map, earned from the cartographer's story or by breaking the Wall.
- Jobs and law: contracts (notice boards and taverns), bounty missions, reputation, guards, jail, navy hunters. Guard stations fly a flag.
- Ships: five-point sail model, oars, classes, parts, special shot, boarding, crew, fleets.
- Every port has a real building for each of its people, including a guard station with a cell.
- Towns: fishing village, trade port, fortress town (own colours, landmarks, perk) plus the plain look; tavern keeper menu.
- World life: weather, sea animals and birds per world, wakes and bow spray, Asgard rumours from the start.
- Asgard (first pass): Norse names, cold islands, longhouses, viking people, longships, its own animals.
- Speed (one machine): CPU about 0.8 ms a frame; GPU about 2.4-3.5 ms at 270p and 3.6-5 ms at 720p.
- Monsters: the sea serpent (three lairs per Terra world) and draugr longships (three sea barrows per Asgard world), both rumoured first.
- Tools: AFK mode, debug panel, CPU time in the panel.

**Not verified by a person or by eye**
- Sound (never heard by me).
- In the running game: story fights, event crowds, leaving a jail cell, the map, fortress towns, the trade-port crane, the new town jails, Asgard towns.
- Soft and mid looks, storms and a weak graphics card since the speed-up (round 75).
- The "Your call" pop-up after really digging up a cache (it was triggered directly in Chrome).
- Real tab switching with AFK on; frame rate on a normal foreground tab; real mouse play.
- Difficulty, pacing and the economy over a full playthrough.

**Known gaps**
- Asgard still uses Terra's island generator and layout; no rune stones, aurora, fjord coasts, mead hall, Norse music or its own weak spot.
- Atlantis and Olympus are map entries and rumours only (they currently load a Terra-like stand-in).
- No day and night, underwater, monsters beyond the serpent, mercenary companies or fleet trade routes.
- Town types not built: mining, smugglers, temple; no per-type street layouts or clothing.

The round-by-round history follows (newest at the end).

## Art direction (final): first person + pixel art

The look: a small pixel canvas scaled up with hard edges, one fixed palette, navy outlines, flat colours and procedural pixel sprites, drawn by a small engine of our own (no libraries).

**Built, working, seen in Chrome:**
- **Pixel pass:** the 3D world renders at 270 pixels high (Options -> Pixel detail) and the browser scales it up with hard edges. A final GPU pass snaps every pixel to one fixed palette and draws navy outlines wherever one surface is in front of another. No dithering, no grain (it was tried and removed: it hurt the eyes).
- **Pixel billboard sprites:** people, trees, bushes, rocks, flowers, grass tufts, the well, market stalls, lamps, benches, crates, barrels, and the shop counters and shelves are flat anime pixel sprites (modest eyes (kept small on purpose), hair, little bodies, four facing directions and walk frames). Each is painted once, snapped to the palette, packed into one GPU atlas, and drawn as an instanced camera-facing quad. Shopkeepers stand inside their shops behind a counter; villagers stroll round the plaza.
- **Mechanics as originally liked:** first person on land (mouse look, WASD, jump), third-person chase camera at sea, blended when you board or go ashore.
- **No clipping:** the player is blocked by trees, rocks, the well, stalls, lamps, barrels, counters, shelves, shopkeepers and villagers; villagers walk a circle that clears every prop; props keep their distance from each other; shopkeepers clear their counters. All tested.
- **Cheap:** about 3 ms CPU per frame, about 14 ms GPU, at a 270p internal size. (Do not trust the in-page fps counter when the tab is in the background: Chrome throttles it to about 1 fps.)

**Grain / crawling fix (user report, with a screenshot of the ship):** the shimmer came from smooth gradients landing on different palette colours frame to frame. Measured as "% of pixels that change between two frames 0.7 s apart with the camera held still": **12.6% before, about 1-3% after** (spikes of 5-7% when a whole sea band or the ship steps). What changed, with calm techniques (unlit flat tones, pre-made pixel textures, "no outlines past 60 m (they shimmer)"):
- No dither at all; colours are flat palette tones. All vertex-colour gradients (wall shading, roofs, sails, dock, ice) are flat per face.
- Cel lighting in 3 flat levels, fog in 8 flat steps, no per-cell ground speckle, no fine colour noise on terrain.
- Outlines only on surfaces closer than 60 units (none along the far horizon).
- The sky has hard-edged pixel clouds that do not move. The sea **does move** (deliberate trade-off, kept at the user's request): slow swells shown as a few flat water tones, no ripples, glitter or foam noise.
- The ship's bob is stepped (small discrete steps, smaller angles) and its hair-thin rigging is gone or thick; shopkeepers stand still.
- A static scene with this pipeline adds no noise of its own; anything left here comes from things that genuinely move (sea, ship steps, villagers).

**Fixed (user report: "I can't move, and all the people are condensed in one area"):** the start point was the plaza centre, which is where the well stands (solid), so the player spawned inside it and every step was refused. Now the player starts on the nearest spot with 2.4 units of open space all round (new test: every direction can move from the start on three seeds). Villagers: half still wander the plaza, the other half walk a wider loop (radius about 9-10.6) so people are spread through the town; the existing no-clipping test covers the new loop. Tests: 24/24.

**Bug sweep ("analyze and fix all stupid bugs like this"):** found by probing reachability in Node and driving the real flow in Chrome.
- Shops could not be entered at all: the counter stood right behind the door and filled the whole width. Counter moved back and the shopkeeper behind it; new test walks through every shop door in the world (seed 1717).
- Some shop doors faced open sea: a shop now needs dry land in front of its door.
- Boarding only worked within 14 units (the very tip of the dock): now 24, so anywhere on the dock.
- A native "overwrite your save?" box froze the whole page (and any automation): replaced with an in-menu "click again" confirm.
- The HUD (gold) did not refresh while a shop was open: fixed.
- Caches keyed by island id could mix worlds with different seeds (tests only): now keyed by island seed.
- Start position inside the well and villagers all in the plaza (previous fix).
Tests: 27/27. Known and left: other seeds than 1717 have a few shops whose door front is cramped (the game only uses 1717); shop interiors are dark.

**Still weak (next):**
1. **Buildings are plain flat-coloured boxes** with a pitched roof: blocky and untextured. Next: pixel-art textures drawn in the shader (plank walls, roof tiles, windows, doors), real doorways, and softer shapes.
2. **Terrain and water** are flat colours with big triangles. Next: pixel textures (grass specks, sand grain, cobbles, wave highlights) and a banded pixel sea.
3. **Ships** are still low-poly 3D meshes (smooth enough, but not pixel sprites). Option: render 8-16 angles to sprites.
4. The top-down 2D renderer (`src/render2d`, `src/main2d.js`) is not used in the build; its painters feed the sprites. It could become a map view.
5. The old 3D pass is in `legacy-3d/` for reference only.

## What is in the game (unchanged by the art pass)

- **World "Terra":** a round world of radius 6000 ringed by an ice wall with one gate. Generated per 600-unit sector from seed 1717, nothing stored. Warm in the middle, temperate, then frozen toward the wall.
- **Landmasses:** islets, islands and large islands in six biomes. Size decides the town (village about 4 buildings, town about 9, city about 22). Every town has a plaza with well, market stalls, lamps and benches; a dock; shops (merchant, tavern, shipwright, plus the story NPCs) with the shopkeeper inside; houses; a clear approach in front of every shop door. Some islands hold buried treasure.
- **Gameplay:** walk the town, trade, buy a boat, sail by the wind, fight ships (broadsides on Q/E), dig up treasure, jump (Space). Merchantmen (peaceful), navy cutters (hostile only with a bounty), raiders, ghost ships near the rim. Provisions run out. Repairs, an icebreaker ram.
- **Story (8 quests):** documentary intro, buy a ship, buy supplies, find the old sailor, sink two raiders, dig up a supply cache, reach Frostwatch, buy the ram, ram the gate; the ending screen lists Atlantis and Asgard as coming soon.
- **UI:** main menu (Start, or Continue + New Game; Options; Exit), pause, quest log (Tab), options (volume, render scale, view distance, fullscreen), one save slot, procedural audio.
- **Browser-shortcut guard:** while playing, Ctrl/Cmd combos and F-keys are blocked; a "leave site?" prompt protects against Ctrl+W (verified: it blocked a navigation in Chrome); in fullscreen, Keyboard Lock also captures the reserved shortcuts. Escape pauses and releases it. The fullscreen part is untested.
- **Player:** an ordinary person, not labelled a pirate. Playstyle (explorer, trader, fighter, pirate) is up to the player; combat and trade are both in.

## Optimization (standing rule)

No image, font or model files. Sprites are baked once into cached offscreen canvases (two detail levels, capped at about 14M pixels, least-recently-used eviction). Island coastlines are built once per island (about 2.5 ms each) in a 6 ms-per-frame budget. Only what is on screen is drawn, per-frame objects are pooled, and the canvas is capped at 2.4M pixels. Built file: 80 kB (32 kB gzipped).

## Verified

- 41 Node tests pass (the list below was the first 23; later rounds added sailing, ships, shipyard, news, hull collision, killable NPCs and more): determinism, no overlapping islands, town size follows landmass size, docks and boats, no floating buildings, hollow enterable shops with a clear approach, jump, collision, trading, combat, save round-trip, a 15-minute soak, a scripted playthrough of the whole story, closed island coastlines, props clear of buildings, and the no-clipping rules (props apart, villagers clear of props, shopkeepers clear of counters, the player cannot walk through a tree or the well).
- Seen in desktop Chrome: pixel look, sprite people with anime faces, a furnished shop with the shopkeeper behind the counter, the sea with a ship and the island.

## NOT verified (be skeptical)

- Hand-playing: nothing has been played by a person with a real mouse (look, walking, sailing, tacking, sword, boarding). Fullscreen / Keyboard Lock capture and real mouse capture are untested (the Chrome tool cannot lock the pointer), so "Esc no longer works" could only be partly reproduced.
- The audio mix was measured, never heard. Banded colour patches on the swell seen from high up (palette snap) are untuned. NPCs do not fight back yet.
- Combat, quest pacing and the ending were tested in Node, not played by eye.
- Real frame rate on a foreground tab (the background-tab reading is meaningless).

## Known limits

- Single realm only; Atlantis and Asgard are placeholders. No building interiors beyond the shops, no day/night, no weather or storms yet.
- No reputation, guards or law yet: killing people only counts murders (`s.murders`) and closes shops for a while.
- Landmasses are single islands, not continents.

## Next steps (old list, superseded by the top of this file and PLAN.md)

1. Reputation, local per town and world per realm (PLAN.md step 3), fed by murders, piracy, quests and trade; prices, shop access and the notice board react.
2. Governments, guards and bounties (step 4), then ship parts and weapons (step 5), then crew, fleets and mercenaries (step 6).
3. Hand-play it (mouse look, walk, board, sail, fight) and tune. Pixel textures for buildings remain the weakest art.
4. Update this file after each step.

**Clipping / lamps fix (user report):** dock lamps, crates and barrels were placed at terrain height, so they sat under the water beside the dock; they now stand on the planks. Plaza lamps overlapped the benches (benches moved in). Villagers on the wide ring walked through buildings or on slopes (649 slope samples, 121 wall hits across the 11 nearby islands); each loop is now checked against buildings, dock, water and slope and falls back to a clear radius. Intro screen now has a dark veil behind the text. New test covers villagers (28 tests pass).

**Round 2 (user report: NPCs bunched, props turning to face you, floating stalls, art hurts):** villagers now spread through the whole town (5/10/18 by size, a quarter at the plaza, the rest each pace a small loop at their own spot, each loop checked against walls, props, dock, water, slope; cached per island). Wide props (stalls, benches, shop counters and shelves) are drawn square-on and no longer turn with the camera (negative billboard scale = fixed facing); they sit at the lowest ground under their width so none float. Outlines are now near-black (palette entry 0 and the sprite ink), sprite lines about twice as thick, 3D outlines reach 110 units instead of 60. Tradeoff: a fixed-facing prop is paper-thin seen exactly from the side. 28 tests pass.

**Round 3 (user screenshots):** terrain cracks ("island gaps") came from fine ground cells next to coarse ones (T-junctions); fine-cell edges now take the straight-line height so they meet exactly. Black "roof underside" was dark shade snapping to the new black palette entry: black is now reserved for outlines (3D snap skips palette 0) and shadow side is lighter. Houses get outlines at creases/corners (1/depth second-difference test within 45 units). Camera near plane 0.4 -> 0.1 (walls no longer cut away when you stand next to them). Stalls are placed only where the ground is level under their whole footprint. Depth outline threshold 0.12 -> 0.22 (fewer stray lines on slopes). 28 tests pass. Open: "16-bit art" idea not started.

**Round 4 (16-bit + RPG people):** palette is now 107 colours (black for outlines, 14 muted hue ramps x 6 shades, greys, skin tones, creams, a few bright accents). People redrawn as grounded RPG figures: ~7 heads tall, small plain faces (dark dot eyes, brow, no blush), weathered skin, muted worn cloth, belts and boots, beards, trade gear (merchant hat and coat, tavern apron, shipwright leather apron and hammer, sailor bandana and stripes, warden fur mantle and staff). Structures, ground, water and ships stay 3D; people and props are 2D pixel sprites. preview16.html shows the sprites on their own. 28 tests pass; build 93.2 kB.

**Round 5 (screenshot of a wall filling the view + stray terrain lines):** island mesh is now split into ground and structures; only structures get crease outlines (the ground's facet edges no longer draw black lines). Player keeps 0.5 from walls (was 0.4) so the camera no longer ends up pressed flat against one. Remaining lines on ground are real silhouettes (a crest hiding the slope behind it).

**Round 6:** (1) `?look=soft` preview: open index.html with that suffix for smooth colours (no palette snap), 720p internal height, sprites baked 3x; default look unchanged. (2) Quest arrow is now a notched dart (SVG) that points to the target. (3) Buildings spaced further apart (min gap about 6 units, was about 0-4; towns spread over a wider ring). (4) A signpost beside every shop door with a picture: bag = shop, mug = tavern, ship = shipwright, anchor = sailor, snowflake = warden. 28 tests pass; build 95.7 kB.

**Round 7:** `?look=mid` preview (540p internal height, palette snap kept, outlines only where a building/prop/person is in front, none on bare ground silhouettes). Quest arrow is now a real arrow (head + shaft) and, once you are on foot, it points at the actual NPC (shipwright, merchant, sailor, warden) instead of the port/dock coordinate it used before (that was why it pointed the wrong way). Verified: facing the NPC = arrow up, turn right = arrow left. 28 tests pass; 95.9 kB.

**Round 8:** quest compass and wind indicator are both dart-shaped SVG pointers. Docking: you can only go ashore when your ship is within 10 units of a pier (you step out onto the pier), and only board from within 4 units of the pier; away from a pier the game says "You can only go ashore at a dock." No collision with shopkeepers or villagers (props, buildings and the shop counter still block). Water rewritten: five wind-wave directions (90 m down to 6 m, fading with distance so far water does not crawl) give a real surface normal; fresnel reflection of the sky, sun glints (pow 180 + pow 24), whitecaps on crests; long swell now moves the surface and the ship (amplitude 0.9, three waves, same formula in sea.js). 29 tests pass; 96.8 kB.

**Round 9 (screenshot: a stall with the hill poking through it):** the flat plaza pad is now 9.5 units wide (was 7), so a stall's whole footprint sits on level ground; buildings must keep 8.6 units clear of the plaza (measured to the wall, not the centre); each stall tries 4 radii x 17 angles and is dropped if no level spot exists (worst footprint height difference now 0.23, was 3.1; 4 of ~14 port islands get one stall fewer than planned). 29 tests pass; 97.0 kB.

**Round 10:** Ship top speed 9 -> 15 (faster acceleration and turning). Autosail (R): full sail, steers for the quest objective (or holds course), swings round land and shoals ahead, stops 70 units out ("Arrived"), any A/D/W/S takes the helm back; HUD shows "Autosail ON"; stops itself on grounding. Ship battle instructions moved out of the quest box: a "Ship controls / Ship battles" panel appears for 16 s every time you board. Waves: swell 0.9 -> 1.7 with a fourth component, steeper chop normals, water mesh 140 -> 200; ship heaves with the swell, pitches along it, rolls across it, wobbles, and heels over when turning; the chase camera rides the swell. Sky reflection and foam toned down so the sea stays blue. 30 tests pass; 99.0 kB. Not tuned: foam still heavy near big crests.

## Round 11
- Autosail (R) now holds the heading you were on (no objective steering); it swings round land and returns to the heading. Auto-trims the sail.
- Sail trim: Z/C swing the boom (p.trim); a badly trimmed sail spills up to half the wind. HUD shows trim.
- Oars: O toggles rowing, ROW_SPEED 4.5 regardless of wind. HUD row + ship tips updated.
- Freeze: could not reproduce (headless 10-min autosail sim: worst step 1.7 ms, no NaN; Chrome 30 s at sea: no frame over 120 ms). One 1 s frame hitch seen right after newGame (sector build). Autosail with no objective can sail into raiders: hull reached 0 in the 10-min sim.
- 30 tests pass, index.html 99.5 kB (40.4 kB gzip).

## Round 12
- Autosail is now only "sail straight ahead at full sail" (no steering around anything). Crew wording removed: you are alone, you row.
- Ship classes (src/rules/ships.js): Sailboat, Cutter, Brigantine, Galleon (hull, hold, speed, turn, guns, damage). Shipyard sells upgrades, 60% trade-in, ship must be at the dock. Player ship mesh changes per class (blue belt/pennant).
- Enemy/NPC silhouettes: fat tan merchantmen with deck cargo, long grey navy ships with red belt, low black raiders with triangular sails and skull flag, pale tattered ghost ships.
- Player guns lead the nearest enemy inside the broadside cone; hit radius 6.
- Audio: generative music (D major pads + plucks through an echo), shore waves/wind/gulls on land, town murmur + voices + clinks near plazas (scaled by village/town/city and distance to the plaza).
- BUGS FOUND BY THE BOT RUN AND FIXED: (1) sailEfficiency/wrapPi gave NaN when yaw < about -8.4 (JS % keeps sign) -> ship position NaN, world froze; (2) ui.updateHud read p.trim with no ship (on foot before buying) -> threw every frame, picture froze; (3) treasure islands had no landing after "dock only" -> A Lost Cache was a soft-lock; they now have a beach landing.
- Tests: 32 pass. tools in scratchpad: bot.mjs (headless player), bfs.mjs (every shopkeeper and pier reachable in all 22 towns of seed 1717).
- Round 12 addendum: full bot playthrough finished the game at 41 game-minutes (all 8 quests, ending reached). Fixes from it: pier barrels/crates moved to the pier edge (1.5) so the walkway is not squeezed; gate needs speed > 3.2 (was 4; cargo and a low hull made rowing too slow); shipyard UI verified in Chrome (buy, trade-in at 60%).

## Round 13
- Land lifted 1.4 above the sea past the shoreline (lift() in world.js; town layout still decided on baseHeight so layouts are unchanged); pier deck DOCK_Y = 2.2 above the highest crest. ~40% of big islands plus the home city are flat plateaus (isl.flat).
- Sail trim HUD: gauge with a gold best-trim mark and a white current mark, % of wind caught.
- Enemy health bars (HP billboard sprites, 11 steps) over every ship within 260.
- Denser seas (0-3 ships per sector), raiders more common near home, sunk ships' waters refill after 90 s once you are far; while "Clear the Lanes" is active at least two raiders are always within 600 of you (ensureRaiders).
- 34 tests pass.

## Round 14 — triangular starter boat, real points of sail, swell, wake, speedo, quest markers
- Sailboat is now small (L 6.2) with ONE triangular sail on a boom; cutter has one too (plus jib). Player sails are separate meshes that pivot at the mast and swing with the trim (src/main.js `sailMat`).
- Sail physics (rules/sea.js `polar`, rules/game.js `bestTrim`): speed by angle off the wind follows a polar — stalls head to wind (<~30°), makes way from ~45° off, fastest on a beam reach, running is slower. Boom swings to the downwind side; best trim = half the angle off the wind (0.08..1). Wrong trim costs up to 75%. Boarding sets the trim for you. HUD shows the point of sail (Close-hauled, Beam reach…) beside the trim gauge.
- Swell: amplitude 1.7→2.1, shorter and faster; shader (render/gpu.js) shades the swell slope; ship heaves 1:1, pitches/rolls more; camera bobs more. Land lift 1.4→2.1 and DOCK_Y 2.2→2.9 to stay above the crests (test guards it).
- Wake: `wakeMesh` (3 cycled frames) bow V + ragged trail + stem splash, scaled by ship length and speed, on every moving ship.
- Speedometer: big knots readout bottom centre while sailing (ui.js `#speedo`).
- Quest markers: "Clear the Lanes" points at the nearest raider; "A Lost Cache" at the nearest undug treasure (searched 3 sectors out).
- Tests: 37 pass (new: points of sail, quest targets, wake + crest clearance). Checked in Chrome: sail swings, ship pitches on the swell, speedo and heading rows show.
- Not verified: hand-played tacking, wake from the bow side, enemy wakes, the taller land on other island types.

## Round 15 — real swell humps
- Swell reworked (rules/sea.js `wave`, mirrored in render/gpu.js): three long crossing trains, amplitude 3 (crest up to ~3.4, was ~2.5), clean rounded humps. Water shading now uses the swell slope (x4.5) plus sun lighting on the slope, height-tinted colour, foam only on the highest crests; small ripples toned down.
- Calm zones: swell flattens to dead calm within 1.7x island radius and ramps back to full by 3.6x (`calm`/`setCalm`; shader gets the 8 nearest islands through the G uniform, main.js `updateCalm`). Docks, berths and beaches stay dry however big the open-sea swell is.
- Ships follow the surface truthfully: heave 1:1, pitch/roll factors now ~1.1 (were 2.1/1.8).
- Test: swell is flat near an island and >2.5 in open water. 37 pass. Not verified: from a distance the humps read as banded patches (palette snap); entering/leaving a calm zone while sailing.

## Round 16 — ships no longer clip into islands
- Collision now tests the whole hull (bow, stern, beam; `hullHit` in rules/game.js) instead of the centre point, for the player and for enemies (per-kind hull sizes). A ship already overlapping land may still sail out; turning into land is blocked too (yaw is restored).
- `unstickShip`: moored/just-bought/just-docked ships are pushed seaward until the hull is clear (checked twice a second while you are on foot). Test: every ship class at every port within 3 sectors ends clear of land. 38 tests pass.
- PLAN.md: added the sandbox/reputation/government/mercenary/storms/underwater/weapons/upgrades/land-battle roadmap. Not verified visually after the fix; bot regression not re-run.

## Round 17 — town notice boards
- A wooden notice board stands in every town plaza (prop `board`, art.js `paintBoard`, solid, villagers keep clear). Press F next to it to read (rules/news.js `newsFor`, ui.js `ui.news`).
- A new issue every 420 s of play. Each board: real prices (what is cheap/dear here), a local item, two rival-crew items, up to two items about the player, and sometimes an easter egg. Pure function of (seed, town, issue, player state), so boards are stable within an issue.
- Three rival crews (same everywhere) grow each issue (size, extra ships) through seven story beats; towns hear about the player (new boat, bigger ship, raiders cleared, treasure dug up, bounty, ram, wealth, and `s.crew` once recruitment exists). "New notices pinned" shows when a new issue came out since you last looked (`s.newsSeen`).
- Tests: 39 pass (new: boards exist, readable, issues change, crews grow, towns hear about the player). Checked in Chrome. Not done: the news does not yet use per-town reputation (plan item).

## Round 18 — polish pass (step 1) and foot combat (step 2), new well art
- **Well:** redrawn as a stone ring with a dark mouth, posts, roof, rope and bucket (the old sprite showed the water as a flat blue disc that read as a blue orb).
- **Step 1, polish:** the bot (now taught the new sail rules: trim, points of sail) found real problems and they are fixed: (a) blocking turns at the dock locked the helm; now only moving into land is blocked, turning is free and the hull is eased seaward; (b) hull test points trimmed to bow 1.1 / stern -1.0 / beam 1.0; (c) grounding damage is speed x0.7 above speed 3 (was x1.5 above 2); (d) sea density about 1.2 ships a sector (was ~1.65); raiders are still guaranteed for "Clear the Lanes". Bot run: reaches the ending at 42.7 game-min, hull 90/100. Still not hand-played by a person.
- **Step 2, foot combat:** Q or left click swings a sword (reach 3.3, 0.55 s cooldown, 10 damage). Every shopkeeper and villager has HP (villager 20, shopkeeper 45, warden 80), a health bar over them for 12 s after a hit, loot on death (gold), and `s.murders` is counted for the reputation system to come. A dead shopkeeper's shop shows "Closed: the owner is gone" and a relative takes over after 240 s, so no quest can be locked. Slash arc on screen and a whoosh/thud. NPCs do not fight back yet (the plan item for guards/reputation).
- 41 tests pass (new: kills, closed shop reopening, helm never locked at the dock, notice boards).

## Round 19 — reputation (step 3)
- `src/rules/rep.js`: LOCAL standing per town (`s.rep.local[islandId]`) and WORLD standing (`s.rep.world`), both -100..100. Saved with the game.
- Crimes: hitting a person (-2 local), killing a villager (-25), shopkeeper (-40), warden (-60), each with a smaller world penalty; sinking a peaceful ship -12 world. Deeds: trading (+0.4 local per unit), quests (+4 / +5 world), sinking a hostile ship (+3 world).
- Reactions: prices (good name up to 8% off buying, 6% better selling; bad name up to 20% dearer, 15% worse selling); at -60 or lower the merchant, shipwright and warden refuse to serve you in that town (tavern and sailor still talk, so the story cannot lock). Market shows "Standing here" and "Realm" tiers.
- Healing: a bad local name recovers 1 point per 20 s; world standing recovers slowly only while you have no bounty. So nothing stays locked forever.
- Test added (42 pass). Not yet: news boards and guards do not use it (step 4); not hand-played; the numbers are untuned.

## Round 20 — law: guards, bounties, arrest (step 4, first cut)
- Any hit or kill on a port island raises an alarm there for 120 s (`s.alert[islandId]`), and a town where your standing is -25 or lower always counts you as wanted. While wanted and on foot, that island's wardens (2 village / 3 town / 4 city, 60 HP) spawn at the plaza edge and chase you at 3.5 (you walk 4, run 7.5), hitting for 6 a second in melee. You can fight back with the sword (a guard costs you more standing).
- You now have health (`s.hp`, 100, regenerates after 6 s unhurt; shown in the HUD when hurt). At 0 you are arrested: you pay the fine from your gold, are put back in the plaza with full health, and the alarm ends. Debt you cannot pay stays as your bounty.
- Bounty gold (`s.bountyGold`): hit 5, villager 60, shopkeeper 120, warden 200, guard 150, peaceful ship 150. Serious crimes also make the navy hostile (`s.bounty`). "Wanted" shows in the HUD; the market has "Pay your bounty", which clears it (and the navy's hostility).
- Guards are drawn with the warden sprite. 43 tests pass. Not done: navy/guards at sea or at docks when you arrive wanted, bounty hunters, news-board items for the bounty, hand-play and tuning, a visual check in Chrome.

## Round 21 — land weapons, and Chrome check of the law
- `src/rules/weapons.js`: sword (start), dagger (60g, fast, short), spear (120g, reach 5), axe (150g, heavy 20 dmg), pistol (260g, ranged shot, 26 reach, 1.8 s reload). Keys 1-5 equip what you own; the HUD shows the weapon; the merchant's market has an "Arms" table (price follows your local standing). Attacks (Q / click) use the weapon's reach, cone, damage and cooldown, on villagers, shopkeepers and guards. 44 tests pass.
- Seen in Chrome (localhost, 2026-11-23): forcing an alarm made 2 guards walk up and hit me (health 100 to 82), then arrest: 200 gold fine, back in the plaza at full health, guards gone, no console errors. Key 3 equipped the spear.
- Not seen: the Arms table in the market (built and unit-tested logic only), the pistol shot, guard look (they reuse the warden sprite, so they look like villagers), hand-played tuning.

## Round 22 — guard station, and a mouse-capture bug
- **Guard station:** a new sprite prop `station` (stone post, blue roof, barred windows, banner; `paintStation` in art.js) is placed on level dry ground 9-21 units from every plaza, clear of buildings and props (at least 80% of ports get one; tested). Guards now spawn at the station, and an arrested player wakes in front of it facing it (fallback: the plaza). `stationOf(isl)` is cached (islandProps is not cheap and it is asked every step; the first version made the law test take 11 s).
- **Bug (user report: "when guards hit me the camera is stuck looking straight up and I can't do anything until I hit Esc"):** fighting with left-click called `goFullscreen()` on every click, and a fullscreen change drops the pointer lock, so the game paused itself (Esc resumed it); Chrome also reports one huge mouse jump when the lock is re-acquired, which pinned the pitch at straight up. Fixed: only the click that captures the mouse may go fullscreen, mouse deltas are clamped to 200 px, and an arrest resets the view and held keys. Not reproducible by tool (it cannot lock the pointer), so it needs a hand-play check.

## Round 23 — attack, hit and sink animations
- **On foot:** the weapon you hold is now drawn in front of you (flat pixel-ish picture per weapon, idle sway) and animates when you attack: sword swings across, dagger and spear stab forward, axe chops down, pistol recoils with a muzzle flash. A red vignette flashes when a guard hits you. Guards lunge at you when they strike and flinch when hit; every land hit throws a small spark.
- **At sea:** `s.fx` (flash, smoke, splash; pure data in rules, drawn as palette sprites) is spawned by cannon fire (muzzle flash and smoke), shots that hit (flash, smoke, splash; the hit ship flashes red, also your own hull), and misses (a splash). A ship that reaches 0 HP goes to `s.sinking` for 4.5 s (`SINK_S`): it rolls over and slips under with smoke rising and a big splash halfway, darkening as it goes, then is gone (despawned). Neither effects nor sinking ships are saved.
- Tests: 46 pass (new: impact fx, sinking lasts then despawns, a miss splashes, save drops them). Seen in Chrome: the sword swing mid-animation, a raider and a trader half-sunk and tilted, flash and smoke over water (placed by script; not yet seen in a real fight).
- Not done: your own ship sinking (game over is instant), NPC death animation on foot (they vanish), hit sounds beyond the existing boom/slash.

## Round 24 — death animations, weapon moved
- **Held weapon moved** from the bottom right (the message log covered it) to the lower middle (left 56%, above the log in z-order).
- **People:** a killed person topples over (a quarter-second drop) and lies where they fell for 9 s (`CORPSE_S`), then shrinks away. The body is the standing sprite turned 90 degrees (`sprites.fallen`); the kill also puffs smoke. Bodies are remembered in `s.npcs[id]` (x, z, y, kind, seed) until the shop reopens or they fade.
- **Your own ship:** at 0 hull the ship no longer ends the game on the spot. For 4.5 s (`SINK_S`) it rolls over and slips under with smoke and a big splash, steering is off, then game over (`s.sunkT`). Saves ignore a ship that is going down (found in Chrome: an autosave in that window would have loaded as an instant game over); `saveGame` also refuses once the game is over.
- 48 tests pass. Seen in Chrome: the player ship sinking (wreck, then smoke only), the new weapon position clear of the log, a body (set by script). Not seen: a real kill (body falling) and the corpse looks thin and bar-like.

## Round 25 — first-person weapon redrawn
- The held weapon is now a first-person view: a right forearm with a leather sleeve and cuff coming up from the bottom edge, the back of a right fist (knuckles on top, thumb on the left, fingers curling over the grip) closed around the handle, and the weapon tilted about 22 degrees toward the centre. It is bigger and sits lower-middle (left 52%, above the log). Swing, stab, chop and recoil animations pivot from the bottom so the arm stays attached. Seen in Chrome for sword, dagger, spear, axe and pistol. Weapons are in `WSVG` in ui.js; the hand is one shared drawing.
- Not seen: the swing animations with the new arm (the earlier ones were checked with the old floating sprite).

## Round 26 — first-person two-handed grip
- Weapons are now held with two hands on the grip (sword, axe, spear) with the forearms coming in from both lower corners, and four fingers curled round the handle and stacked down it with the back of the hand on the arm side; dagger and pistol are one-handed. Bigger and centred (left 30%, 66vh wide), tilted 6 degrees. The weapon generator is a small script (kept out of the project); the output lives in `WSVG` in ui.js.
- Seen in Chrome: sword and axe two-handed, pistol one-handed. Swing animations with the two-arm version not yet seen.

## Round 27 — people react differently from ships; the 3D weapon experiment was reverted
- **People vs ships:** a hit person now sprays a few red droplets that fly out and fall (fx kind `hurt`), is knocked back half a unit away from you and squashed for a quarter second; a killed person sprays more and topples (no smoke, no flash). Flash, smoke and splash stay for ships only.
- **Held weapon:** a 3D voxel viewmodel (extruded sprites, boxy arms) was tried and removed on request (too heavy, too 3D). The flat sprite overlay from Round 26 is back: two hands on the grip, forearms from both lower corners. The voxel code is deleted.
- Not seen after the revert: the people hit reaction in a real fight.

## Round 28 — seamless held weapon
- Each arm is now ONE silhouette (sleeve, cuff, wrist, hand, fingers, thumb) with a single outline round the whole shape, instead of every piece outlined separately; the finger lines and sleeve shading are drawn inside it. The weapon has the same treatment. The drawing is built by a small function in ui.js (`WSVG`), not stored as baked strings, so the file is smaller than before (143.7 kB). Seen in Chrome: sword, axe, pistol. Swing animations with this version not yet seen.

## Round 29 — pixel held weapon
- The held weapon was too clean (smooth vector). Each weapon is now rasterised once at the game's own pixel size (112x110 px, a little coarser than the world on purpose), snapped to the game palette with all-or-nothing alpha (`quantize`, same as the sprites), and shown as an `<img>` with `image-rendering: pixelated`. The swing animations step (`steps()`) instead of gliding, and the pistol flash is a hard-edged square. Seen in Chrome: the sword. Not seen: other weapons, the swing, the muzzle flash.

## Round 30 — axe pose
- The axe head was mirrored to the left (right-handed grip), and the whole axe now leans 45 degrees to the left with the hands placed along its shaft and the forearms still coming up from the bottom (`axe` in the `WSVG` builder in ui.js; `arm(side, y0, dxs)` takes a horizontal shift). Seen in Chrome. The swing animation with the leaning axe is not seen.

## Round 31 — no starting weapon, an armoury, a real guard station with a jail
- **No starting weapon.** You start with bare fists (2 damage, short reach; the held sprite is a bare raised fist). Every weapon is bought: sword 50, dagger 60, spear 120, axe 150, pistol 260 (price follows your local standing). Keys 1-5 equip what you own. The Arms table left the market.
- **Armoury (`smith`)**: a new shop kind in Port Haven, every town and every city (not villages), with its own shopkeeper (leather apron, sooty headband), a sign (anvil), and real 3D furniture inside: racks of blades and axes along the back wall, an anvil, a forge, a barrel. Talk to the smith (F) for the "Armoury" panel (buy / equip). A hated customer is refused like the other shops.
- **Guard station (`guard`)** is now an actual enterable building (10x8, or 9x7 on cramped islands) with a sergeant (helmet and breastplate) at a desk, wanted notices, a key rack, and a **barred jail cell** in the back right corner with a bunk and a gate you walk through. The old free-standing sprite is gone. Placed last in every port's building list; Port Haven always has it (tested); about 70% of cities and 40% of towns do, fewer of the cramped villages (then arrests fall back to waking in the street). Placement was loosened (260 tries, wider ring) for all shops: merchants/taverns/shipwrights now fit much more often too.
- **Arrest** now puts you in that cell: you wake inside it with the gate shut for 8 s (`JAIL_S`, bars drawn across the gate, `s.jailUntil`), then you can walk out of the gate and the front door. Guards spawn at the station's front door and steer round buildings (they used to get stuck against walls).
- Bars are collision rectangles (`b.bars`) drawn as thin iron bars, not walls. Interior 3D furniture (`shopProps`) was never being built before; it is now, for `guard` and `smith` only (the other shops still use sprites).
- PLAN.md: added bounty missions (the cop path: bounty board, dead or alive targets, subdue and bind, hand in at ANY town in the realm, prisoners in the jail) and boarding other ships (grapple, deck fight, capture/loot/prisoner), plus a revised build order.
- 48 tests pass (new: Port Haven has smith and guard buildings; the jail cell is closed while locked and open after, tested with the game's own collision). Seen in Chrome: the guard station interior with the barred cell and gate frame, the armoury racks and panel, the sergeant, the bare fist. Not seen: an arrest in a real fight leading into the cell, the gate sprite while locked, the smith's shopkeeper sprite up close.

## Round 32 — armoury and guard station are 2D pixel, not 3D
- The 3D furniture from Round 31 is gone (the old unused `shopProps` 3D code is no longer called and its smith/guard cases are deleted). Everything inside the armoury and the guard station is now a flat pixel sprite drawn square-on, like the shop counters: weapon racks, anvil, forge and a barrel (armoury); the cell as rows of iron-bar sprites (front with the gate gap, left side) plus a top rail, a bunk, the sergeant's desk, a key rack and wanted notices (guard station). Painters are in `render2d/art.js` (`paintBar`, `paintRail`, `paintBunk`, `paintDesk`, `paintKeys`, `paintNotices`, `paintRack`, `paintAnvil`, `paintForge`), placed in `gen/props.js`. The bars still block walking through invisible collision rectangles (`b.bars`) that match the sprites; racks, anvil, forge, desk and bunk have solid circles.
- Standing rule (see memory): keep it light and flat, no 3D for props or UI.
- 48 tests pass; build 149.5 kB. Seen in Chrome: the sergeant, notices, desk and the barred cell with its bunk. Not seen: the armoury interior in the new sprites.

## Round 33 (2026-11-24): prompt, wind, bug sweep
- The "F ..." prompt (`#prompt`) is fixed in the middle of the screen on the top layer, so the held hands and weapon can never cover it.
- Wind favours the objective: 150 s spells, 80% blow roughly toward the current quest target (+-0.45 rad), the rest is the old free drift; spells blend over 40 s (`windAt(t, goal)` in `rules/sea.js`, `windGoal` in `rules/game.js`). `windBias.on = false` in tests that need a fixed wind; new test covers the 80% share and no jumps.
- Bug sweep: two headless fuzz runs (12 seeds x 4-6.7 min of random sailing, and random on-foot combat in town, with periodic saves/loads and interaction) found no NaNs or exceptions. Playtest in Chrome: notice board, shipwright, merchant (buy ship, provisions), boarding and sailing work and the quests advance (One-Way Ticket, Stock the Larder done). Fixed: the shipwright's lines said "sloop" while the ship is a Sailboat.
- Not covered: real-time play of combat/arrest in the browser (the automation tab throttles the game loop, so game time barely advances); arrest and jail are covered by the unit tests and fuzz.
- 49 tests pass; build 150.0 kB.

## Round 34 (2026-11-24): explorer playthrough (headless bot) and a quest-giver bug
- An explorer bot (headless, real game rules and physics) played from the start: bought the sword and ship, toured 5-6 towns and cities (talked to every NPC, read every notice board, traded for profit, repaired, bought every weapon), upgraded sailboat -> cutter -> brigantine -> galleon, did the sailor, raiders (sea fights), buried cache (walked from the beach to the X and dug), warden and ram, then the gate: without the ram the gate stays sealed, with it the Wall is crossed and the quest line ends. Two different seeds (1717, 4242) both finish.
- **Bug found and fixed (serious, caused by the wind change in Round 33):** reading the objective's target every step (`windGoal`, like the compass) built the sailor island's town from an un-tagged copy of the island, cached it, and left the sailor (and later the Frostwatch warden) out, so the main quest could not be finished. `questWorld` now finds islands through the cached, quest-tagged `sectorIslands`. New regression test.
- Findings that are not game bugs: the bot cannot route round every island (no tacking or pathfinding), so a few long legs stalled; it does not turn broadside unless told to, so raiders hit it. Not verified: a galleon docking at every port by sea (it grounded on the shoals near Frostwatch on the way in; the berths themselves are tested), real-time play of the fights and the arrest in a browser.
- 50 tests pass; build 150.0 kB.

## Where things stand (2026-11-24)
- **Done and working:** the full main quest line (all 8 quests, two seeds, headless playthrough), reputation (local and world), guards, bounties, arrest and a real guard station with a cell, armoury and weapons (fists to pistol), battle effects, sinking and death animations, the flat pixel held weapon, the F prompt fixed mid-screen on the top layer, wind that favours the objective (80% of spells), ship upgrades (sailboat to galleon), trading, saves.
- **Quests that exist:** only the 8 story quests (One-Way Ticket, Stock the Larder, Whispers on the Water, Clear the Lanes, A Lost Cache, The Last Outpost, Break the Ice, The Wall). Towns have no quests of their own: the notice boards are flavour text and the tavern only repeats the story hint.
- **Next in PLAN.md:** 4b bounty missions (the cop path), then 5b boarding ships, 5 ship parts, 6 crew/fleets/mercenaries, 7 storms/contracts/underwater/land battles.
- **Queued ideas (in PLAN.md, not started):** NPCs that secretly fight back, navy ships that hunt you once your record is bad enough, a bombardment toggle for attacking towns from the ship, town states (damaged, burning, pillaged), a contracts board per port (suggested to go right after bounties), boarding ships, recruitment.
- **Known gaps:** real-time play of fights and arrests in a browser is unverified (the automation tab throttles the game loop); a galleon reaching every port by sea is unverified; the explorer bot cannot route round every island, so a few long legs stalled. Latest push: `2513bd9`. 50 tests pass; build 150.0 kB.

## Round 35 (2026-11-24): bounty missions, the cop path (PLAN 4b, steps 1-4 plus parts of 5-6)
- `src/rules/hunt.js`: a stable wanted list per seed (`wanted(seed, i)`); the board shows the first 4 unresolved names (`board(s)`). Targets are on-foot outlaws hiding on a real island (a port's streets or a beach landing, never Port Haven) or raider captains at sea. Each has a crime, a reward (alive), a lower dead reward, and about 30% are ALIVE-only.
- On foot: the outlaw fights back once you come within 16 units or hit them (5 damage a 1.2 s). Hit until they drop ("subdued", at 25% health), press F to bind (one prisoner at a time), a blow on a subdued man kills. Kill pays the dead rate on the spot (lawful: no bounty, world rep up); an ALIVE-only kill pays nothing and costs standing. At sea: sinking the named captain's raider pays the dead rate.
- The prisoner follows you on foot, goes aboard with you and comes ashore with you, and escapes if you are arrested or knocked senseless (a wanted man who beats you leaves you in the street a tenth poorer).
- Hand in at ANY guard station in the realm (talk to the sergeant; the panel lists the Wanted board, your rank and a "Hand them in" button). Pays the alive reward (+10% per rank), raises local and world standing, locks the prisoner in the cell (drawn in it). Ranks: Civilian, Deputy (1), Constable (3), Marshal (6), High Marshal (10). Notice boards also list two wanted names. HUD shows the prisoner.
- Tests: 57 pass (7 new). Seen in Chrome: outlaw sprite attacking, the beaten one, the F prompt, binding, the guard panel, hand-in with the prisoner visible in the cell; regression: buy ship, board and sail. Build 158.5 kB.
- Not done from 4b: rival bounty hunters and rescue by the target's crew (only escape on arrest/knockout exists), a compass arrow to a chosen target, bound prisoners at sea in a cell on the ship, a badge item.
- Not started: 5b boarding ships, 5 ship parts and weapons, 6 crew/fleets/mercenaries, 7 storms/contracts/underwater/land battles, and the second-batch ideas (hidden fighters, navy hunting you, bombardment toggle, town states).

## Round 36 (2026-11-24): boarding other ships (PLAN 5b, steps 1-4)
- **G at sea** (within 22 of a ship) throws grapples: your ship is moved alongside, both stop, and you leap onto her deck on foot (`grapple` in rules/game.js; the enemy ship is frozen and the world is the ship's own local frame, so the deck is bounded by her real length and beam, masts are solid, the sea is not walkable). The deck bobs with the swell (camera and sprites add `wave`).
- **Deck fight:** 2 (trader) to 5 (navy) crew plus a captain (60 HP), all flat sprites, same sword/axe/pistol combat as on land. Crew attack at once, the captain holds back until you are near or the crew is down. A captain at 25% surrenders. F on deck cuts the grapples and retreats; losing (health 0) throws you back aboard your ship a tenth poorer.
- **Outcome panel** when the whole crew is down: strip the hold (gold plus cargo, cast her off), claim her as a prize (double gold; piracy if she was peaceful), or scuttle her (small gold, she sinks). All three count as a sunk ship for the quest and kill counts.
- **Law:** boarding a peaceful ship (trader, or navy when you have no bounty) is piracy (bounty 150, world standing -10); boarding a raider, ghost ship or a hostile navy ship is lawful (+2 world). Claiming a peaceful ship adds 300 bounty.
- **Bounties:** if the ship's captain is a wanted name on the board, subdue him (he surrenders) and press F: he becomes your prisoner (goes into the hold, then ashore with you) and is handed in at any guard station like any other outlaw; killing him pays the dead reward.
- Saves made mid-fight load at sea (the deck is not saved).
- Tests: 61 pass (4 new: range and deck bounds, full fight to prize, defeat and retreat, piracy plus wanted captain to hand-in). Seen in Chrome with the real G key: prompt, grapple, deck with crew, masts and rails, fight, outcome panel, claim (+130 gold, 3 silk, raider counted), back at sea, no console errors. Build 166.1 kB.
- Not done: navy and raiders boarding YOU, crew fighting beside you (needs recruitment), keeping a captured ship as a fleet ship, the deck rolls with the swell only in height (no tilt), defenders walk straight through masts.

## Round 37 (2026-11-24): ship parts and special shot (PLAN step 5)
- `src/rules/parts.js`. At the shipwright's "Fittings" (ship must be at the dock): Sails (3 levels, +8% speed each), Hull plating (3, +25 hull), Bigger hold (3, +10 cargo), Gun carriages (3, +15% cannon damage), Sweeps (2, +25% rowing), Swivel guns (1; fire on their own at hostile ships within 28, never at peaceful ones). Parts stay when you trade up (`buyShip` adds the bonuses to the new hull and hold) and are saved.
- Special shot (bought 10 at a time at the shipwright): chain shot (60% damage, target slows to 40% for 8 s) and fire shot (70% damage, then 3 hull a second for 6 s). Keys 1-3 at sea pick round, chain or fire; a spent kind falls back to round shot; HUD shows the loaded shot.
- Tests: 63 pass (2 new). Seen in Chrome: Fittings and shot panel, buying parts and shot, key 2 loading chain shot, a chain shot slowing a raider. Build 169.9 kB.
- Not done: ram variants, swivel guns helping in deck fights, visible changes to the ship model for parts, fire shot flames drawn only as the existing flash and smoke sprites.

## Round 38 (2026-11-24): hidden fighters and the hunting navy (second-batch ideas)
- **Hidden fighters** (`fighterOf(seed, id, kind)`): about 7% of villagers and 11% of shopkeepers carry a weapon, decided by the world seed and their id, with no visual tell. Hit one and they stop being a stroller: a fighter (same sprite) chases you and hits for 8 a second and a half (`s.foes`); the original person is hidden while it lasts, killing it uses the normal kill path (body, loot, reputation, shop closing), and if you walk 70 away it goes home. If you carry 1500+ gold or have a bounty, a fighter within 6 units strikes first (once per 20 s). Guards never count. Saves drop active fighters.
- **Navy hunters** (`hunterCount`, `manageHunters`): from 300 bounty gold, navy cutters spawn 300-420 round you at sea (1 at 300, then one more per extra 300, up to 4, one new ship per 25 s), chase from up to 650 and fire. They count as hostile only while you have bounty gold, so boarding or sinking them is lawful, and they vanish when you pay the bounty.
- Tests: 66 pass (3 new: the fighter share and the harmless-stay-harmless rule, fight/kill/mugging/save, hunters appear only at the threshold and clear on payment). Seen in Chrome: a villager fighter revealed after one sword hit, hitting back. Build 172.6 kB.
- Not seen: a hunter navy chase in Chrome (rules and tests only). Not done: a body-language hint for fighters, hunters scaled by world reputation as well as bounty gold, navy boarding you.

## Round 39 (2026-11-24): bombarding towns and town states
- **B at sea toggles bombardment** (off by default; the HUD shows "Bombard TOWNS ON"). Off, cannonballs fly over towns exactly as before. On, a player ball that lands on a building of a port wears the town down (`bombardTown`, `townState` in rules/game.js): town HP 100 / 200 / 400 (village / town / city), 1.5x the shot's damage per hit.
- **States:** calm (over 75% HP) -> damaged (half the villagers go indoors) -> burning (under 40%: all villagers gone, merchant, shipwright, smith and tavern refuse you, flat fire and smoke sprites rise from buildings) -> pillaged (0 HP: your crew plunder it once, 150 / 300 / 600 gold, plus 300 bounty and -10 world standing). Story NPCs (sailor, warden) and guards keep working, so no quest locks. A town left alone for 30 s heals fully over 10 minutes (`s.towns`, saved).
- **Crime:** each hit adds 15 bounty gold, raises the alarm in that port and costs local and world standing (`bombard` deed). Notice boards report the shelling.
- Tests: 67 pass (1 new, long: off-by-default, every state reached, crime, plunder once, shops shut, villagers hidden, news item, healing, save). Rules cost measured in Node: 0.028 ms a step baseline, 0.036 ms with hunters, a burning town and a rich player. Seen in Chrome: bombardment turned on with B, a pillaged home port with smoke rising from the buildings.
- Not done: people killed or hurt by shells, buildings visibly scorched or destroyed (only fire and smoke), events other than bombardment (blockade, plague, festival) as town states, a real aimed broadside at a building was not tried (balls were placed by script). Frame rate in Chrome was not measured (the automation tab is throttled).

## Round 40 (2026-11-24): crew and recruitment (PLAN step 6, first part)
- `src/rules/crew.js`. Talk to a tavern keeper with a ship: the Tavern panel lists your crew (dismiss) and three people looking for a berth (stable per day, 3 new per 10 minutes per tavern). Roles: **sailor** (+3% speed, up to 5 count; helps rowing), **gunner** (cannon reload 8% faster each, up to 3), **carpenter** (mends the hull 0.4 a second each, up to 2, only when not hit for 8 s), **navigator** (never lose more than 15% of the wind to a bad trim). Each costs a signing fee (6 x wage) and wages every 120 s.
- **Capacity by ship:** sailboat 1, cutter 3, brigantine 6, galleon 10. A hated town (-60 local) will not let you hire; a bad world name (-25) gives cheaper, less loyal hands (morale 45 instead of 70, wages x0.7).
- **Morale and loss:** pay day pays all wages and lifts morale +6; if you cannot pay, half your purse goes, morale falls 30 and hands at 0 desert (taking up to three pay-days of gold). Winning a deck fight lifts morale. Up to 3 hands fight beside you on a boarded deck (30 HP, 6 damage a hit, they pick the nearest crewman and leave the captain for last); defenders also attack them, and a dead hand is gone from the crew. The notice-board item about a crew now reads the real crew size.
- Tests: 69 pass (2 new: hiring rules, capacity, roles, repairs, pay day, desertion, saves; allies on deck, a casualty, morale). Seen in Chrome: Tavern panel, hiring a sailor and a carpenter, a hand fighting beside the player on a raider's deck, no console errors. Build 180.6 kB.
- Not done (step 6 remainder): fleets (extra ships and orders), mercenary companies, recruits on land fights, crew disloyalty by reputation beyond the starting morale, crew quarters and names on the ship, and hiring at ports without a tavern.

## Round 41 (2026-11-24): the world map (M), built to grow, and real enemy attack animations
- **Map (`src/rules/map.js` rules, `src/mapview.js` drawing, `ui.map`):** M opens it (M or Esc closes). Two tabs. **Terra** shows only what you have found out: seas you sailed (a ship sees about 520 units, a walker 260), places you walked, and faint sketched charts from NPCs and quests; islands appear inside those areas, only places you have actually stood in are named, the ice wall shows where you have seen it, and a blinking arrow marks you. **All worlds** is the grand chart: Terra inside its white ice ring, the mountains ring round everything, and the other worlds round it as dark silhouettes with a "?" once you hear of them and in colour once you reach them. No objectives, no targets, no quest markers: the saved map holds only `cells`, `realms`, `heard`, `visited`.
- **How it unlocks:** walking and sailing; the first time you talk to a merchant, tavern keeper, old sailor or Warden you get a rough chart of nearby waters or the rim, or (tavern, every other time) a rumour of the next world in order Asgard, Atlantis, Olympus; quests open charts too (the sailor shows Frostwatch, the Warden the gate, and finishing the Wall hints the next world).
- **Scalable:** every world is one entry in `REALMS` (id, name, radius, cell size, where it sits on the grand map in polar coordinates, colour, rumour line). The grand map is laid out from that list alone (`worldLayout`), and a test adds a fake realm to prove nothing else needs to change. A new realm will supply its own radius and a local drawing hook; `visitRealm` marks it known.
- **Enemy attack animations:** every person has two new sprite frames: 3 = wind-up (arm raised, weapon cocked back) and 4 = the blow (weapon swung across the body with a white slash arc). They show on outlaws, hidden fighters, deck crews and your allies, and on guards: wind-up in the last third of a second before a hit when you are in reach, the blow for 0.28 s after it lands. The old size pulse was removed (a small lunge forward stays). Frames are baked on demand and cached like the others.
- Tests: 72 pass (3 new map tests: discovery and saves, NPC and quest unlocks in order, a registry entry added at run time shows up and the saved map holds no objectives). Seen in Chrome: Terra and All worlds tabs (Asgard and Atlantis hinted, Olympus hidden, player in the middle), the wind-up and blow frames on an outlaw. Build 190.5 kB.
- Not tested: the attack frames and map drawing run in the browser only (no Node test); the Terra tab at full exploration; the ship attack animation (ships still just fire).

## Round 42 (2026-11-24): the map needs the Wall broken; full playtest and bug sweep
- **Map gate:** M only opens after you have broken through the ice (`mapAvailable(s)` = `s.flags.crossed`). Before that M says "You have no map...", the key hint is hidden, and NPC and quest lines say "(You commit it to memory.)" instead of "Map updated". Discovery is still recorded from the first step, so crossing the Wall unlocks everything already found. Breaking the gate also logs "the map is yours now (M)" and adds M to the key hints. The ending screen's list of worlds now comes from the same `REALMS` registry as the map (Terra, Asgard, Atlantis, Olympus), so adding a world is still one entry.
- **Esc** now closes any panel and takes the mouse back (it used to leave the mouse free until you clicked).
- **Headless fuzz** (4 to 5 seeds x 10 game-minutes of random inputs and random shopping, hiring, boarding, bombarding, saving; an invariant check every second for NaN, negative gold, hull or hp above max, crew above capacity, deck without foot mode, prisoner state, town HP, cargo above hold): no exceptions and no real invariant breaks. Its only flags were false alarms of the fuzz itself (a new ship has no `trim` until boarded; the fuzz teleported the player onto a beach landing's water side).
- **Player playtest in Chrome** (real clicks and key presses where the harness allows; movement and some timing scripted): menu, Options, Start, intro, game; M before and after the ice; Tab quest log; Esc pause menu; notice board with the wanted names; shipwright (buy sailboat); merchant (provisions, goods); quest chain start (One-Way Ticket, Stock the Larder); boarding the ship; G, B, 3, R, O and M at sea; armoury (buy and equip sword and pistol); guard station panel (wanted board, pay bounty); tavern (hire, dismiss); hitting a villager, guards chasing and arresting, jail, paying the bounty; holding E to fire a broadside (shots, smoke, the raider fires back); holding W and Shift on foot; the ram breaking the Wall, the ending screen, sailing back, M opening Terra and All worlds; Save and quit, Continue (crossed flag, crew, map, weapon, gold all restored); ship sinking and the Lost at Sea screen. No JavaScript errors were raised at any point.
- **Not exercisable by the harness (so unverified by a person):** real mouse look and pointer lock, clicking to attack, holding keys for long real-time sailing, the audio, fullscreen. Game time runs slowly in the automation tab, so long real-time waits were replaced by stepping the rules directly.
- Observed, not changed: guards cannot reach a player standing inside the well's solid ring (only possible by teleport); a starting player can spend all 500 gold on the sailboat plus a full larder (the "Fill" button), leaving 0 gold; a hurt-and-arrested player's prisoner escapes (by design).
- 73 tests pass; build 190.8 kB.

## Round 43 (2026-11-24): fleets (PLAN step 6, second part) and an optimization check
- **Fleets (`src/rules/fleet.js`, `stepFleet` in rules/game.js):** after a won deck fight the outcome panel has a new choice, **Keep her in your fleet** (needs a spare hand to captain her and room: three ships at most). The prize joins at 60% hull with the loot but no cash bonus. Fleet ships are drawn blue-tinted with a health bar, follow you in formation, and obey one **fleet-wide order** (T at sea cycles it): **follow** (stay close, hold fire), **escort** (close, fire at hostiles within 180), **attack** (hunt hostiles within 400), **guard** (hold the spot, fight whatever comes near). They are brought to you if you outrun them by 1000, ride at anchor while you are ashore, can be shot by enemy ships (enemy fire now picks fleet ships too) and sink with their captain. Upkeep is 10 gold a pay day each; an unpaid captain deserts with the ship. Captains do not count against your own ship's crew limit, do not trim your sails, do not fight beside you, and cannot be dismissed. **Sell** a fleet ship at the shipwright (the panel lists fleet, order and hull). The HUD shows Fleet n and the order. Saved with the game.
- **Aiming fix found while testing the attack order:** cannon leading ignored your own ship's speed, so a fast moving ship's shots drifted sideways and missed; the lead now allows for the shooter's own way (helps the player too).
- Tests: 75 pass (2 new: keep/captains/upkeep/cap/save/sell; follow, guard, attack, taking fire and sinking). Seen in Chrome: the Keep option in the outcome panel, the keep message, T cycling the order, the prize following under escort at 48 units.
- **Optimization check:** rules cost 0.027 ms a step at sea baseline and 0.057 ms with a three-ship fleet, four crew, hunters, parts and bombardment (that is 0.3% of a 16 ms frame at 1 step a frame, and under 4 ms of CPU per game-second); 0.016 ms on foot; the minified build runs 0.018 ms a step in Chrome with an 88 MB JS heap and no growth in fx or NPC records. One real waste fixed: the render loop rebuilt the wanted board once per nearby island each frame, now once per frame. Build 196.6 kB (77.4 kB gzipped), up from 150 kB at the start of today: the bounty, boarding, parts, crew, fleet, map and attack-frame code. Not measured: real GPU frame time (the automation tab is throttled).

## Where things stand (end of 2026-11-24)
- **Done, tested (75 tests) and played in Chrome:** everything in Rounds 1-43 above. Today added: bounty missions and hand-in at any guard station with ranks (R35), boarding other ships with a deck fight, loot, claim, scuttle, prisoners (R36), ship parts and chain/fire shot and swivel guns (R37), hidden fighters and the hunting navy (R38), bombarding towns with damaged, burning and pillaged states (R39), crew and recruitment (R40), the world map and enemy attack animations (R41), the map locked until the Wall breaks plus a full playtest and fuzz bug sweep (R42), fleets and an optimization check (R43).
- **Performance:** rules cost 0.03-0.06 ms a step; build 196.6 kB (77.4 kB gzipped); no growth in JS heap during play. Real GPU frame time is not measured (the automation tab is throttled).
- **Not verified by a person:** real mouse look and pointer lock, click-to-attack, long real-time sailing, audio, fullscreen. All other checks used scripted movement and stepped rules.
- **Known gaps / not done:** mercenary companies and fleet trade routes (step 6 remainder); contracts board; storms, day/night, underwater, land battles at scale; navy or raiders boarding the player; rival bounty hunters and rescues; ship attack animations (ships just fire); visible ship changes for parts; the realm loader (Asgard, Atlantis, Olympus exist only as map entries and rumours); shells do not hurt people; no building interiors beyond shops and the guard station.
- **Source control:** pushed to https://github.com/rsarangaya/openworldtest (branch main, commit 4f98a41 and later). This folder had no .git before; it is now linked to that repo.

## Round 44 (2026-11-24): contracts board (PLAN: next step after fleets)
- `src/rules/contracts.js`: every port notice board posts 3 jobs per issue (pure function of island seed, issue and nearby ports). **Deliver** n crates of a good to another port within 3 sectors (deadline from the distance), **cull** 2-3 raiders (counted from signing, reported at the posting board). Pay scales with local standing (+-20%); finishing gives +4 local / +1 world, a missed deadline -6 / -1, dropping costs -3 local; a town that hates you (-60) will not post work for you. Max 3 active (`s.contracts`, finished ids in `s.cdone`, both saved).
- Opening a board settles anything payable there; the board panel lists carried jobs (Drop) and new offers (Sign); the quest log (Tab) lists active contracts with time left.
- 76 tests pass (1 new). Build rebuilt. Not seen in Chrome yet (panel layout, signing by click); escort jobs, mercenary companies and trade routes are still open.

## Round 45 (2026-11-24): the Wall has no gate, the breakthrough scene, the Outer Sea and the world loader (stub world)
- **Wall (`wallMesh` in gen/mesh.js):** a continuous cliff, banded blue to white, snow lip, icicles, rubble. One seeded **weak spot** is paler and cracked (the old gate stretch, no low sill). The ram (speed over 3.2) at the weak spot starts the scene; elsewhere the wall blocks. Once broken the breach **stays open** (ragged edge, rubble) for good and you can sail back through. Quest text now says "weak spot".
- **Breakthrough scene (`s.cine`, `stepCine`, 7.5 s):** the ram bites and the ship is held while ice sprays (letterbox bars, low side camera), at 2.6 s the Wall breaks (white flash, the wall sectors rebuild with the breach), the ship is driven through, the camera pulls back and up, then "Beyond the Wall" and control returns. The old ending screen is gone (old saves with it load fine). Past the Wall the sky turns warm.
- **Outer Sea and worlds (`rules/realm.js`):** 3500 units of open water past the Wall; at its edge the **bearing** picks the world by the map angles (Asgard up, Atlantis lower left, Olympus right) and a warp starts: banner ("Entering unknown waters" the first time, the name after), fade, swap. A realm has its own seed (`realmSeed`), so generators and caches just work. Per-world state (reputation, hunts, town states, npcs, found, dead, alerts, news) is stashed on leaving and restored on return (saved, `s.realms`); gold, ship, crew, fleet, weapons, parts, bounty and contracts travel. The prisoner is freed on a crossing. On leaving a world the town, folk, solid and station caches and hunt caches are cleared and the old world's GPU sectors freed. Contracts from another world simply expire.
- **Stub world:** the other worlds currently reuse Terra's generator with their own seed, ringed at radius 6000; sailing out of its rim returns you to the Outer Sea. Real Asgard content comes next (see PLAN.md for the viking look).
- **Resource check (before this round):** 205 kB (80 kB gzipped), JS heap 9 MB at the wall, rules 0.066 ms a step, 270p internal render; GPU time is not measurable in the throttled automation tab (last measure about 14 ms).
- 77 tests pass (1 new realm test, the story test now plays the scene). Seen in Chrome: the new wall and its weak spot, the scene (bars, spray, flash, breach with rubble, ship through), the warp to a stub world with the banner, no console errors. Build 206.3 kB.
- Not done: Outer Sea creatures and birds, early Asgard rumours on Terra, the map showing the Outer Sea, the wall's far-distance look (a big flat shape from far away), audio for the break, a real Asgard.

## Round 46 (2026-11-24): break sound, taller Wall, Asgard rumours from the first minute
- **Sound (audio.js):** `crack()` when the ram bites (a falling groan plus eight sharp ice cracks) and `iceBreak()` at the break (deep boom, a 3.6 s rolling rumble, falling-ice tinkles). All procedural, no files.
- **Wall look:** much taller (about 150-200 units), tall white spires along the top that break the skyline from far away, alternating light and dark vertical streaks. From a kilometre it now reads as a tall toothed ice line instead of a flat strip (it is still pale against the sky because of the fog).
- **Asgard rumours (`rules/lore.js`):** about 28 lines in four stages that follow progress: whispers with no name (green lights, a carved plank, horns at night), then the name Asgard (after meeting the sailor), then the Warden's secrets (Frostwatch), then after the Wall is broken. They appear on every town notice board ("Overheard: North of the ice"), from tavern keepers, villagers, the old sailor and the Warden, chosen from who speaks and the issue, so they are stable. Pure text, no quests.
- 78 tests pass (1 new lore test). Seen in Chrome: the board's Overheard item. Build 211.7 kB. Not seen by eye: the tavern and villager lines, and the sounds were not heard (procedural, measured never).

## Round 47 (2026-11-24): sea life and birds (ambient, not interactable)
- **`rules/life.js`:** pure and stateless: every animal is a function of (realm, seed, cell, time), so nothing is stored or saved. The sea is cut into 240-unit cells; a cell may hold a group that swims a slow loop that must be entirely open water (checked once, cached). Birds circle islands (ports and big islands) and a few soar over open water. At most 56 shown, within 250 units; measured under 0.5 ms a call in Node (test guard).
- **Terra (normal):** dolphins (jumping arcs), whales (surface, spout, fluke dive), flying fish, turtles, shark fins, gulls round the islands, albatross over open water. **Past the Wall** the open ocean has bigger animals (more whales, no turtles or gulls).
- **Asgard (different, own table):** narwhals (tusk), orcas, seals, pale ice whales; ravens round the islands and sea eagles over open water. No dolphins, gulls, turtles or flying fish there. New worlds add a table.
- **Art:** 13 flat pixel creature painters in `render2d/art.js` (`paintCritter`, 2-3 frames, mirrored to face the way they swim relative to the camera), baked once into the sprite atlas like everything else; no new assets. Verified that +z is screen-right when facing +x, so mirroring is correct.
- Tests: 79 pass (1 new: determinism, never over land, Asgard disjoint from Terra, cap, cost, open-ocean table). Seen in Chrome: a contact sheet of all sprites and gulls in the sky over Port Haven; whales and dolphins in the water were not caught on screen (they surface a third of the time).
- Not done: sounds for them, shadows under the surface, schools of fish, creatures reacting to the ship, Atlantis and Olympus tables. Build 220.3 kB.

## Round 48 (2026-11-24): animal stuff finished
- **Dolphins race your bow:** while your ship is under way (speed over 3) any dolphin group within 170 units leaps in pairs beside her bow, heading with her. **The big animals (whales, orcas, narwhals, seals, turtles, fins) dive out of the way** of a ship under way within 42 units; a drifting ship scares nothing.
- **Schools of fish:** a ripple-and-flicker sprite on the surface, in both Terra's and Asgard's tables.
- **Sound (procedural):** distant whale song through the echo bus when a whale, ice whale, orca or narwhal is within 320 units (one call every 16-34 s), and bird cries when a bird is within 110: gull chirps, raven croaks, eagle calls. Never heard by a person yet.
- Tests: 80 pass (1 new: the pod at the bow, a whale diving and not scared by a drifting ship, schools exist). Seen in Chrome: three dolphins leaping beside the bow of a sailing ship, no console errors. Build 222.9 kB.
- Left out on purpose: a giant shadow gliding under the hull (needs a flat water-plane sprite).

## Round 49 (2026-11-24): smoother breach
- Opening the breach no longer throws away whole sectors. Wall meshes are flagged; on the break only those are freed and re-queued (one sector a frame inside the existing 6 ms budget), so islands and everything else stay put. Measured in Chrome across a full ram scene: 25 sectors, 40 non-wall meshes and 8 wall meshes before, during and after, no console errors. 80 tests pass; build 223.0 kB.

## Round 50 (2026-11-24): fast travel (after the Wall is broken)
- **Map (M) has a third tab, Fast travel:** every port you have actually walked in the current world, nearest first, with distance, minutes at sea and provisions. Sail there from your ship at sea or at a pier; you wake on the pier of the destination with your ship moored at its dock and your fleet brought alongside. Cost: time passes (distance / 10 a second, at least 20 s, so contract deadlines and the news issues move on) and 1 provisions per 45 s at sea (you need enough). No gold fee.
- **Blocked** (with the reason shown in the tab): before the Wall breaks, no ship, mid-boarding, on foot away from a pier, a hostile ship within 260 (navy only when you have a bounty), guards or fighters after you, ship sinking or the breakthrough scene running.
- **Per world:** docks are remembered with each visited port (`s.map.places[realm]`, saved); other worlds record ports you walk into too. Old saves find their visited docks by scanning once.
- A fade covers the move; sectors around the new spot are built at once (no pop-in); sea-life state is reset.
- Tests: 81 pass (1 new). Seen in Chrome: the tab, a blocked state showing the reason, then a real sail to a port: arrived on its pier, 2 provisions and 74 s spent, no console errors. Build 226.4 kB.
- Not done: fast travel to beach landings (docks only), a gold fee or random event on the voyage, travelling between worlds (those still need sailing out to the edge).

## Round 51 (2026-11-24): ships on land fixed, animals easier to see
- **Bug (user report: ships spawn in the middle of a city):** generated sector ships (`sectorEnemies`) were placed at random spots with no check against islands, docks or towns. Now each spawn spot is tested with `onLand` (island radius x1.8 + 40) and re-rolled up to 12 times, else the ship is skipped. Checked on 3 seeds over 21x21 sectors: about 1200 ships and none on land (test added). Also fixed my own fast-travel bug of the same kind: fleet ships were placed beside the dock, possibly on shore; they now each take a clear spot (`hullHit`) near the dock.
- **Animals ("don't see the animals"):** they were small, often submerged and sparse. Now 2x bigger on screen (birds 2.4x), cells 170 units (was 240), more groups (60% / 70% in the open ocean), whales stay surfaced longer (60% of their cycle), dolphins leap more often and for longer, and the pod joins your bow from up to 300 units. Measured average of 1.3 animals within 150 units of a random sea spot before, now higher; seen in Chrome: two dolphins mid-leap ahead of the ship. Still small at a distance by design (pixel look).
- 82 tests pass; build 226.8 kB.

## Round 52 (2026-11-24): the wake lies on the water
- **Bug (user report: the wake floats high above the water):** the foam mesh rode the ship's own matrix (heave, pitch and roll) plus 0.6 up, so on the swell it hovered or tilted well above the sea. Now every foam vertex is placed on the real water surface each frame (`wave(x, z, t)` + 0.1, the same swell the sea shader uses), turned by the ship's heading only. One small dynamic GPU buffer (about 8 kB) per moving ship (new `renderer.update`), rewritten while she moves and freed about 2 s after she stops or leaves; foam is also 1.7x wider so it reads.
- Seen in Chrome: foam flecks flat on the water behind a sailing ship, dolphins at the bow, no console errors. 82 tests pass; build 227.4 kB. Not pushed yet.

## Round 53 (2026-11-24): Asgard, first real pass (a different-looking world, not a re-skin of Terra's colours)
- **Theme registry:** a realm's seed is registered with its look (`setSeedTheme` / `themeOf` in gen/world.js, set when you enter a realm and when a save loads). Islands carry `theme`. Terra is untouched (test).
- **Land:** every island is cold (frozen, with a few rocky ones), so snow and pines; cold fog and sky always (0.85); wind and sound follow.
- **Names (Norse):** places like Thorholm and Ravenvik (`-vik, -holm, -fjord, -ness, -heim, -garth, -strand, -by, -stead, -dal`), people like Gunnar Halvardsson and Sigrid Thorsdottir, longship names (Sea Wolf, Raven-Wing, Iron Serpent...). Applies to towns, NPCs, enemy ships and captains, wanted names.
- **Longhouses (`vikingTrim` in gen/mesh.js):** dark timber walls with plank seams, steep turf or thatch roofs, a carved dragon head with horns at each end of the ridge, round painted shields along the long walls, a smoke hole instead of a chimney, no shutters or flower boxes. Shops keep their doors and signs. Stalls sell fish, furs and cheese under brown hide awnings.
- **Vikings (people sprites):** fair, red or dark hair, thick beards, braids, fur collars, round shields on guards, wardens and about a third of villagers, iron helmets (horned for guards). Sprites are keyed by realm, so Terra's people are unchanged.
- **Longships:** every non-player ship in Asgard is a longship: clinker hull, high dragon prow and curled stern, shields on the rail, oars, one big striped square sail (red and white; black and red for raiders; pale for ghost ships). Terra keeps its own ships.
- **Sea life:** Asgard already has its own animals (narwhals, orcas, seals, ice whales, ravens, eagles).
- Tests: 83 pass (new: Asgard names, cold islands, longhouses and longships build, Terra untouched; it caught a negative-index bug in the shield colour). Seen in Chrome: a longhouse with dragon head, Norse villagers with shields, a fleet of longships with striped sails near a snowy island, no console errors. Build 234.2 kB. Not pushed.
- **Still the Terra generator underneath:** Asgard is a round world with the same island sizes, shop kinds and layout. Not yet done: rune stones and drying racks as props, an aurora in the sky, real fjord-shaped coasts and cliffs, a mead hall (bigger) as the tavern, viking weapon shop stock (axes first), Norse music, Asgard quests, and Asgard's own weak spot and gate to the next world.

## Round 54 (2026-11-24): animals no longer stick to the ship
- **Bug (user report: animals stick to me like glue):** the "dolphins race your bow" feature teleported every dolphin within 300 units to your ship's bow and kept them there while you sailed. Removed completely. Animals now only live on their own loops in the world; the ship changes nothing except that the big ones (whales, orcas, narwhals, seals, turtles, fins) dive away when a ship under way passes within 42 units.
- Density eased back (cells 210 units, 50% of sea cells hold a group, 60% in the open ocean) so you come across them rather than being surrounded; they still surface for longer than before.
- Test replaced: dolphin positions are identical with the ship moving, drifting, or absent. 82 tests pass.

## Round 55 (2026-11-24): AFK mode, a fuller wake, debug mode
- **AFK mode (P key, or Options):** the game keeps running when you tab away or let go of the mouse; "AFK ON (P)" badge. Browsers stop animation frames in hidden tabs, so a small worker steps the rules there (nothing drawn). Off by default and saved in options. Enemies can still reach you while you are away.
- **Wake (`src/wake.js`, replaces the old static foam mesh):** each ship remembers its stern's path for about 6.5 s; every frame the foam is built on the real water surface: two ragged churn strands and flecks that spread and thin (and curve with turns), the two arms of the V, foam along the hull and flickering bow spray; it fades out after you stop and resets after a teleport. One small dynamic buffer per ship.
- **Debug mode (`src/debug.js`):** add `?debug` to the page address, then press ` (under Esc). Info line (realm, position, ships, fps, heap) and buttons: +1000 gold, full food and health, god mode, galleon, ram and all parts, break the Wall, go to the weak spot or the Outer Sea edge, jump to Asgard or Terra, spawn raider or navy, clear enemies or bounty, skip 10 minutes. It edits the real save; anyone who adds `?debug` to the live site can use it.
- **Weather is not implemented** (only wind spells, the swell with calm water near islands, and the cold fog near the rim). No storms, rain, snow or day/night.
- 83 tests pass (new: the wake lies on the water, trails, fades, resets). Seen in Chrome: the debug panel and a +1000 gold click, the AFK badge and the worker advancing the clock about 3.9 s in 4 s with the page reporting hidden (simulated, not a real tab switch), the new wake. Build 240.1 kB. Not pushed.

## Round 56 (2026-11-24): raider skull, raiders come to jobs
- A raider's health bar carries a skull (red eyes) on its left end; other ships keep the plain bar.
- While "Clear the Lanes" or a cull contract is unfinished, there are raiders within 400 of your ship: fewer than 2 that close and one more arrives (200-350 away, mostly ahead, anywhere in open water if land is in the way), at most one every 8 s. It stops when the job's count is reached.
- 84 tests pass. Seen in Chrome: the skull on a raider's bar, none on a trader. Build 240.6 kB. Pushed together with Round 55.

## Round 57 (2026-11-24): weather
- **Spells (`rules/weather.js`):** 200 s spells blending over 30 s, a pure function of the world seed and time (nothing saved). Clear, cloudy, rain, storm, fog; cold places (Asgard, the rim near the Wall) get snow instead of rain. A new game's first 400 s are always clear.
- **Look:** greyer sky, light and water with cloud cover; thick haze in fog; rain streaks and snow flakes on a small overlay at the game's pixel size (at most 220, none when dry or under a roof); lightning flashes in storms; a label under the wind dial.
- **Sea and sailing:** storms raise the swell up to about 60% (same number for the ships and the water shader; still flat near islands), blow up to 40% harder and swing the wind about.
- **Danger:** in a storm, in open water, with more than 55% sail, the hull loses 2 every 8 s, never below 10 (weather alone cannot sink you). Reefing (S) or an island's lee is safe.
- **Sound:** rain hiss and rolling thunder after each flash.
- **Debug:** "Weather: next" cycles automatic, clear, cloudy, rain, storm, fog, snow.
- The wake's V arms and stern churn were thinned (they read as solid white lines up close).
- 85 tests pass (1 new). Seen in Chrome: storm with rain, fog, snow, no console errors. Not heard: rain and thunder. Not measured: frame rate cost on a foreground tab (the automation tab read 40 fps during snow). Build 245.4 kB. Not pushed.
- Not done: day and night, weather changing the NPCs or towns, snow lying on the ground.

## Round 58 (2026-11-24): optimization pass
- **Measured first.** CPU per frame in Chrome: about 0.4 ms rules, 1.5-3 ms drawing at sea (12-22 ships, storm or clear), 3 ms in a town; 60 fps in clear and storm at 3440x1440. The real problem was building a city island in one frame (15-31 ms in Node), which causes hitches when sailing into new waters.
- **Island building spread over frames:** the ground is a generator (`islandGroundSteps`) that pauses between heights, colours and rows of triangles; buildings are a separate step. Worst single step 31 ms -> about 10.5 ms (Node).
- **View culling:** sectors wholly behind or beside the camera are no longer sent to the GPU.
- **Wake:** the swell is sampled once per strip end instead of per corner: 0.26 -> 0.13 ms per ship (Node).
- Indoors test for rain only runs when it is raining or snowing.
- The debug panel now shows CPU ms (rules + draw).
- 85 tests pass; build 246.0 kB. Seen in Chrome: sailing fast past islands and a town, nothing missing, no console errors; in a 20 s fast sail, average frame 17.3 ms, 25 of 1190 frames over 26 ms, one 143 ms hitch (no before figure for that run; cause not found). GPU time itself is not measured. Not pushed.

## Round 59 (2026-11-24): rain makes rougher seas, bow spray, the hitch, no more triangles, twice the ship speed
- **Rougher in weather:** swell x1.4 in rain (was 1.15), x1.8 in a storm, x1.2 in snow.
- **Bow spray:** when a hull drives into a rising sea (weather only) a burst of round droplets flies off for 3/4 s, with a splash sound for your ship. Billboards only, ships within 160.
- **No triangles (user):** the splash sprite (bow, cannon, sinking, the Wall) is now round drops; the wake is built from soft round foam patches, not pointed wedges.
- **Hitch:** sprite canvases are now kept in main memory (`willReadFrequently`) since the palette snap reads them straight back, and at most about 4 ms of new sprites are painted a frame (the rest appear on the next frames). Same fast-sail test in Chrome: worst frame 45 ms (was 143), none over 50 ms; 38 of 1066 frames over 26 ms (was 25 of 1190), average 19.4 ms (was 17.3). One run each, in an automation tab, so the averages are noisy.
- **Speed doubled:** top sail speed 15 -> 30, oars 4.5 -> 9, every enemy kind's speed x2, fleet ships follow, turn and speed up to match, fast travel time halved; grounding damage is unchanged for the same impact.
- 85 tests pass (three adjusted for the new speeds). Build 246.8 kB. Not heard: splash sound.

## Round 60 (2026-11-24): town characters (fishing village, trade port, fortress town)
- **`gen/style.js`:** every port gets a fixed character from the seed. Villages mostly fishing; towns fishing/trade/fortress/plain; cities trade/fortress/plain. Port Haven stays plain, Frostwatch is a fortress.
- **Looks:** own wall and roof colours; landmarks built once on clear ground: fishing = drying racks with fish and hauled-up boats; trade = open market hall and loading crane; fortress = watchtower with banner and two lengths of curtain wall. Landmarks block walking (the hall only at its pillars and counter), villagers and props keep clear.
- **Perks:** fishing: provisions 3g (not 5), one guard fewer; trade: buy 5% cheaper, sell 5% better (selling never pays more than buying costs); fortress: weapons 15% cheaper, two more guards. The type shows on the notice board title and in a message when you first walk in.
- Also fixes an existing possible money loop: at a very high local standing, selling could pay more than buying.
- 86 tests pass (1 new). Seen in Chrome: the watchtower, the market hall, drying racks and a boat. Not seen: the crane, curtain walls; Asgard keeps its longhouse look but gets the same landmarks. Build 251.5 kB. Not pushed.
- Not done: the three other types (mining, smugglers, temple), different street layouts, villager clothing per type, Asgard-specific landmarks.

## Round 61 (2026-11-24): no more spinning ships, debug world buttons, ships sit in the water
- **Spinning forever (user):** an enemy or fleet ship touching land flicked its bow round at 7-14 rad/s and, if it could not get free, spun for ever. Now it stops short (or eases out if overlapping), turns away at 1.2-1.4 rad/s and holds that course for 2.5 s. A second cause: a fleet ship near its station was faster than its turning circle and orbited it; it now slows as it nears and rests there. Test added (pinned raiders on 8 islands, resting escort).
- **Debug "World:" buttons:** they did nothing when a menu had paused the game, and silently nothing when already there. Now they work from the pause menu and say when you are already in that world. Seen working in Chrome by real button clicks.
- **Ships look in the water:** the sea grid had one cell every ~17 units, so the drawn swell differed from the true one by up to a unit; the same vertex count is now packed round the camera (a couple of units under the ship). Ships sit 0.3 deeper, each has a dark shadow on the sea and a lapping foam collar even at rest (ships within 260).
- 87 tests pass. Seen in Chrome: your ship and a merchantman, still and moving. Build 252.3 kB. Not pushed.

## Round 62 (2026-11-24): no foam ring round ships
- User did not like the foam circling the ships: removed the resting collar and the foam along the hull sides. Kept: the wake astern, the little bow foam when moving, spray in weather, and the dark shadow under each hull. 87 tests pass, build 251.9 kB. Seen in Chrome, still and moving. Not pushed.

## Round 63 (2026-11-25): bare hands redrawn
- User: the single upright fist in the middle looked inappropriate. Bare hands are now two separate fists low in the left and right corners, knuckles up and tipped inward, thumbs tucked, forearms running out of the corners (a guard). The right hand jabs on attack. Held weapons are unchanged.
- 87 tests pass. Checked the drawing on its own in the built-in browser; NOT yet seen inside the game (the Chrome extension was not connected) and the jab not seen. Not pushed.

## Round 64 (2026-11-25): contracts in the tavern too
- The tavern panel now lists carried contracts (Drop) and that town's offers (Sign), below the crew section, and pays any job that can be settled there. Same list and same offers as the notice board, which keeps them (villages have no tavern).
- 87 tests pass, build 253.4 kB. Checked with a stand-in page in Node (tavern opens, 3 offers, signing moves one to carried); NOT seen in the browser (Chrome extension not connected). Not pushed.

## Round 65 (2026-11-25): the tavern keeper has a menu
- Talking to a tavern keeper now opens choices: Ask for a rumour (Asgard lore plus a bit of local news, "Another" for more), What should I do next? (current quest hint, while there is one), Take a job (contracts), Hire hands (crew), Who is wanted? (bounty names and rewards), About this town (type, perk, cheap and dear goods, your standing), Leave. Every page has Back. A chart the keeper gives you the first time shows on the menu.
- 87 tests pass, build 255.3 kB. Every option exercised with a stand-in page in Node; not seen in the browser (Chrome extension not connected). Not pushed.

## Round 66 (2026-11-25): one bare fist, low on the right
- Replaces the two corner fists of Round 63 (the user disliked them). Viewpoint of a held weapon: low on the right, angled up toward the middle. One right fist with curled fingers, thumb along the inner side, wrist, cuff and sleeve; it jabs toward the crosshair on attack. Held weapons unchanged.
- 87 tests pass, build 255.5 kB. The drawing was checked on its own with the game's pixel size; not yet seen over the 3D view (Chrome extension not connected). Not pushed.

## Round 67 (2026-11-25): the fist read as a left hand
- User: the single fist looked like the left arm. The hand is now mirrored (thumb on the right, little finger on the left); the forearm still comes from the lower right. 87 tests pass. Checked only as a drawing preview. Not pushed.

## Round 68 (2026-11-25): layered stories, town events, companions, new hands (pushed)
- Stories (rules/sidequests.js): saved as a small record, steps rebuilt from templates. Step kinds talk (with choices), find, fight. Four town stories (heirloom, missing brother, half a map, debt), two companion stories, five short event jobs. Taken from the notice board or the tavern (Anyone need help?), max 3, followed with a second compass line, listed in the Tab log (Follow / Give up).
- Town events (rules/events.js): nine, about 55% of ports per notice issue; announced on arrival and on the board; some change food or goods prices, add a crowd or smoke, or post a job.
- Companions: swordswoman, cartographer, the missing brother. One at a time, follows, fights, comments, can die; two can join the crew afterwards.
- Hands: the bare-fist drawing is now used for every weapon (left hand mirrored), held from the lower right; walk bob only while moving; a pull-back before each swing.
- Tests: 90 pass, including every story played to the end. Menus checked with a stand-in page in Node.
- NOT seen in the running game (Chrome extension not connected): any of it, including the new people on the ground, the crowd, the HUD layout and the hands over the 3D view. CPU time not measured. In the drawings the second hand on sword and axe is mostly hidden behind the first.
- Not built yet from PLAN.md: board / bring / timer steps, the other events and companions, rival-crew races at sea, Asgard versions.

## Round 69 (2026-11-25): bug and speed check of round 68 (pushed)
- Fixed: a story gang that knocked you out kept knocking you out (6 times in 30 s in a probe); 177 of 942 event-crowd places were inside props; the walk bob and idle stopped after the first swing; the pistol flash was invisible (no CSS size or place); pistol shots at a story gang made no sound; a second would-be companion vanished silently; rehiring a companion could duplicate a crew id.
- Checked: 3707 story steps across 157 ports all put the right people on the ground; the built file starts up to the WebGPU check in a stand-in page.
- Speed (Node, game rules only): a step is 13.5 us idle, 15.6 us with two stories and a companion; the HUD story line 2.4 us. No change needed. Drawing cost is still unmeasured.
- 91 tests pass. Still not seen in the running game.

## Round 70 (2026-11-25): headless playthrough and the bugs it found (pushed)
- A bot played through the rules (walking and sailing with a path finder): opening, quests, all 11 side stories, events, contract, bounty hand-in, crew and ship, boarding, the Wall, Asgard, fast travel, jail, navy hunters, bombardment, a sea bounty, save/load, ten idle minutes. It used free gold, healing and jumps where noted in its log; the main quest was not followed strictly in order (the warden step was checked separately).
- Fixed, from today's work: walking into a house-fire town with no buildings crashed the game; the story compass vanished when the followed story was in another world; stories and event crowds were not cleared on changing worlds.
- Fixed, older: every arrest to a cell left you frozen in the bunk (all 42 stations); saves already stuck are freed on the next step. Guards often never reached you (stuck on buildings, or behind a shop door or counter, or never appearing while you stood in their station).
- 94 tests pass. Still not seen in the running game: drawing, menus, mouse and keyboard, sound.


## Round 71 (2026-11-25): top compass, map zoom and a chart look (pushed)
- Compass strip at the top centre (src/compass.js): compass points only, plus your ship's direction and distance when you are ashore. The objective box moved below it.
- Map: scroll to zoom (up to 10x), drag to move, + / - / Find me; redrawn as a parchment sea chart (soft explored water, lumpy islands, town marks, ice wall, compass rose, scale, your ship). The map is still locked until the Wall is broken.
- Fixed: the page-wide canvas style also pinned the map canvas over the map window's corner; Terra's chart drew the wrong world's islands while you were in another world.
- Chart and compass seen in a preview page; the controls checked with a stand-in page. Not seen inside the running game.

## Round 72 (2026-11-25): the map is a quest reward
- Finishing The Last Chart (always offered in Port Haven until you have a map) gives the map; otherwise breaking the Wall does. Fast travel still needs the Wall.
- 95 tests pass. Not seen in the running game.

## Round 73 (2026-11-26): walls, station flag, welcome, quest choice (pushed)
- Fortress towns no longer get loose curtain walls.
- The guard station flies a tall flag. Port Haven always had one (with the cell), north-east of the square, behind the general store.
- A new game opens with a welcome message and a one-page tutorial.
- Quest log: Track the story, a side story or a contract; the box at the top, its arrow and the kind wind follow that one (src/rules/track.js).
- 97 tests pass. Seen in Chrome: welcome, tutorial, tracking a contract, the station and flag. Fortress towns not seen.
- Found, not fixed: 64 of 138 sampled ports have no guard station building; many have no shop buildings at all (their people stand in the square).

## Round 74 (2026-11-26): every town gets its buildings (pushed)
- **Cause:** every port without a guard station sat on a hilly island, where almost no spot was level enough to build on (112 of 249 sampled ports had no station).
- **Fix:** the ground where a town stands is now levelled the same way flat islands are. Small islands end up flat almost all over; large ones keep hills beyond the town. On the smallest islands the station may also stand closer to its neighbours.
- The notice board gets a closer-packed second pass when four market stalls leave it no room.
- A save that would load you inside a wall now puts you on free ground nearby.
- 1361 ports over 9 seeds (Terra and Asgard): none missing a building for any of its people, none missing a notice board.
- Town layouts on hilly islands have changed, including in existing saves.
- Speed (Node, port islands): the extra buildings first cost ground building 4.8 -> 6.7 ms per island (worst step 6.7 -> 8.9). Points away from the town now skip the building checks and shared ground points are computed once: about 5.4 ms (worst step 5.5-6.5). Height lookups stay about 20% dearer (0.48 -> 0.58 ms per 2000), from the levelling and the extra buildings.
- Build 287.7 -> 288.6 kB.
- 99 tests pass. Seen in Chrome (before the speed changes, which leave heights identical and the ground the same to rounding): Town Golden (a village that had no station) with its station, and two other towns from the dock; no console errors. Not seen: Asgard, and a walk through the new jails by hand.

## Round 75 (2026-11-26): graphics speed (pushed)
- **Measured first** (instrumented copy, one machine, GPU pass timestamps): CPU about 0.8 ms a frame, fast sailing had no frame over 26 ms, so the GPU was the thing to cut.
- Palette snap is one lookup in a 64x64x64 table (built once, about 55 ms at start) instead of 43 comparisons per pixel. Palette colours map as before; a colour almost exactly between two palette colours may now pick the other one (about 4% of random colours).
- Sea shader works out the island calm once per pixel instead of five times; the sky is drawn last, only where nothing covers it; water no longer blends.
- GPU ms per frame, before -> after: 270p town 3.5 -> 2.4, sea 3.4 -> 2.7-3.5; 720p town 10.0 -> 3.6, sea 16.1 -> 5.0.
- 99 tests pass; build 289.4 kB. Seen in Chrome: sea and town look the same by eye, no console errors. Not seen: soft and mid looks, storms, Asgard, a weak GPU.

## Round 76 (2026-11-26): your call after the cache (pushed)

Finishing "A Lost Cache" opens a short pop-up: go straight to the rim, or explore this world and its towns and cities first. 99 tests pass; seen in Chrome. 289.8 kB.

## Round 77 (2026-11-26): ships, deadlines and escorts in stories (pushed)
- New story step kinds: `board` (a named ship waits near the place; take her by boarding; sinking her ends the story unpaid), a deadline (`secs`, time left shown after the goal, `late` branch) and `lead` (the person you are bringing home walks behind you ashore).
- New stories: A Cargo That Isn't (timed delivery, then take the money or call the guards), A Ghost on the Lanes (wreck, ghost ship, a locket to deliver). New events: A Child Missing, Smugglers Sighted. The missing brother can now be walked home.
- Stories that need a ship are offered only when you own one. Towns will show a different mix of events and stories than before.
- 102 tests pass (3 new). Build 289.8 -> 295.2 kB (116.3 kB gzipped). A game step with three stories running: about 21 us (Node).
- Seen in Chrome: the follower ashore, the ghost ship at sea with its health bar and the quest text; no console errors after load at sea. NOT seen: boarding a story ship by hand, the deadline countdown, the new child look (changed after the Chrome check, to stop the child having a beard).
- Differs from the plan: no navy stop at sea in the cargo story.
- Still open from the living-towns step 4: public trial, wedding, press gang, storm damage, stranger events; more companions; rival-crew races at sea; Asgard versions.

## Round 77b (2026-11-26): played as a player, pier fixes (pushed)
- **Found and fixed (older than round 77):** in 2 of 118 sampled ports (one is Golden Town on the main world) the town square could not be reached from the pier: the town's levelled ground stood over the deck as a wall. Elsewhere pier edges had lips just too high to step. Ground now slopes down to the deck, and dry ground beside it ramps up. New test walks every port from pier to square.
- **Found and fixed:** the ghost story said her captain spoke even when you had killed him.
- Scripted player (five seeds, about 700 stories, random choices, saves mid-story, no money, drops, missed deadlines): no crashes or soft locks left that are the game's.
- By hand in Chrome: new game, welcome, tutorial, notice board, quest log, tavern menus, jobs, countdown, delivery choice, grappling the story ship, losing the deck fight, winning it (god mode), the outcome panel and the next step. No page errors.
- Performance against the pushed round 76: ground building per port island 4.3 -> 4.4 ms, game step unchanged (about 19 us ashore, 49 us at sea), build 289.8 -> 295.2 kB. Graphics-card time not measured (drawing unchanged apart from one sprite).
- Not covered: real mouse look and walking by hand, sound.
- Noticed, left: a small old terrace edge in one town you have to step round; the ship's stats stay on screen ashore; a hostile story ship fires at once after throwing you off her deck.

## Round 78 (2026-11-26): more town events and a singer (pushed)
- New events: wedding (missing groom), public trial, press gang, storm damage, a singer without a song. New companion: the tavern singer.
- **Fixed (since round 68):** a story that ends by talking to your companion drew that person twice; they now wait at the spot.
- Tests: 105 pass; one takes every option in every story. Scripted player: about 1000 stories, no new game faults.
- Chrome: the singer story's offer, choice and next step; no page errors. Not seen: the other four events, the companion waiting at the spot (changed after the check).
- Performance against round 77: unchanged (ground 4.4 ms, step 19 / 47 us). Build 295.2 -> 299.3 kB.
- Not built from the plan: runaway noble, navy deserter, pickpocket and shieldmaiden companions; rival-crew races at sea; Asgard story versions.

## Round 79 (2026-11-26): the sea serpent, the first monster (pushed, commit 6109741)
- Three lairs per Terra world in open water (two inside the Wall, one past it), at least 2 km from Port Haven. Notice boards (every other issue) and tavern rumours name the nearest living one with a compass bearing.
- Sail within 200 units and it rises: circles at 45 units, lunges after 7.5 s to bite (14 hull), dives after 11 s and comes up on another side 5 s later. Shot only hurts it while it is up; chain slows it, fire burns it; the guns aim at it when it is the nearest target. Leave (520 units) and it sinks back and heals. Slain: 650 gold, counts as a kill, towns run a "Serpent slain" story, and the lair stays quiet through saves. No ships spawn in a living serpent's waters. Flat pixel sprites (head opens its jaw on the lunge, three coils, a health bar).
- Defaults chosen without asking: Terra only (other worlds get their own monsters), 240 health, 650 gold, live serpent state not saved (it rises again on return). Debug panel: "Go: serpent lair".
- Tests: 110 pass (5 new, including a scripted captain who keeps it abeam and kills it, and one who sits still and gets bitten).
- Chrome (localhost, real build): the serpent rose with its message, drew correctly beside the ship with its health bar; the built game's own step, driven with held fire and rudder, killed it in about 37 game-seconds with a galleon (hull 397 -> 271), paid 650 gold, and it did not rise again. No console errors.
- Not checked: firing by real key presses (the Chrome tab was throttled to 10 fps, so a quick key tap fell between frames; game time ran at about a tenth of real time), the sound, a small boat against it.
- Performance against round 78: game step at sea 0.052 ms, 0.061 ms with the serpent up (Node); build 306.5 -> 312.4 kB (119.7 -> 122.1 kB gzipped). Graphics: two more sprites in the atlas, up to five more billboards while it is up.
- Left on the machine: a Python web server on port 8765 (not started by this run) is still running.

## Round 80 (2026-11-26): draugr longships, Asgard's monster (pushed, commit c389280)
- Three sea barrows per Asgard world, in open water (reuses the serpent's spot finder, now `seaSpots`). Asgard notice boards (every other issue) and tavern keepers rumour the nearest one with a bearing and "bring fire".
- Sail within 220 units and a pack of three dead longships rises round you ("the drowned ..."). They steer straight at you and ram (9 hull, every 6 s each; the rammer takes 8 too) and fire when abeam. Round and chain shot do half damage, fire shot 1.25x and burns them faster (4.5/s). They cannot be grappled. No cargo when sunk, normal gold. Sink all three: +450 gold, the barrow stays quiet through saves (s.slain), and towns run "Draugr laid to rest". Leave (600 units) and the survivors sink back. No ordinary ships are put in a living barrow's waters.
- Look: Asgard longship with a dark mossy hull, tattered grey-green striped sail, green accent. Debug panel: "Go: draugr barrow" (in Asgard).
- Defaults chosen without asking: pack of 3, 85 health each, ramming as their own attack (so they feel different from raiders), fire as the answer; live pack not saved.
- Balance (scripted captains, Node): galleon with fire shot wins in 30 s untouched; galleon with round shot only wins in 84 s at 247/400 hull; cutter round-only wins at 41/140; sailboat with 10 fire shot wins at 26/100. A first try (ram 12 every 4 s) sank every round-only ship, so it was softened.
- Tests: 114 pass (4 new: barrows in open water and none on Terra, the board rumour, a scripted captain who sinks the pack and it stays quiet through a save, half damage from iron / no boarding / sinking back).
- Chrome (localhost, real build, debug setup): the pack rose 211 units from the barrow with its message, rammed, and held fire-shot broadsides (Q and E held while turning) sank all three in about 25 s; +1078 gold with the bonus. The longship draws correctly with its health bar. No console errors.
- Not checked: sound, the tavern line by eye, aiming by real mouse play (the tab runs throttled).
- Performance: game step at sea 0.041 ms on Terra, 0.052 ms in Asgard, 0.056 ms with the pack up (Node; round 79 was 0.052 ms). Build 312.4 -> 315.7 kB (122.1 -> 123.5 kB gzipped).
- Left on the machine: the Chrome test tab (127.0.0.1:8777) could not be closed by me because the game asks to confirm leaving; the server behind it is stopped, so just close the tab.

