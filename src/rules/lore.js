// Asgard lore on Terra: rumours that start in the first minutes and grow with the story, so the legend is old by the time the player breaks the Wall.
// Pure text, picked deterministically from (who is speaking, which issue); the stage follows progress. Nothing here is a quest.
import { hash } from '../gen/rng.js';

export const stageOf = (s) => (s.flags?.crossed ? 3 : s.quest >= 6 ? 2 : s.quest >= 3 ? 1 : 0);
const LINES = [
  [ // 0: whispers, no name yet
    'A trader swears he saw green lights dancing north of the ice on a night with no moon.',
    'Fishermen pulled a plank from the sea last spring, carved with a dragon\'s neck. Nobody knows the wood.',
    'Old sailors say the Wall was not built to keep us in. Ask them what it keeps out, and they change the subject.',
    'The children sing a rhyme about a hall with a roof of golden shields and a feast that never ends. Nobody remembers who taught it to them.',
    'Crews will not anchor near the Wall at night. They say they hear horns out there, and they do not mean ships.',
    'A drunk claims his grandfather saw a ship with a striped square sail and a beast\'s head on the prow, sailing out of the ice itself.',
    'They say a frozen sailor was found once on the rim, in furs, with an axe, and a tongue nobody could read.',
    'Someone scratched strange angular letters into the harbour post. The harbourmaster scrubbed them off. They came back.',
  ],
  [ // 1: the name is out
    'The old stories give the land past the ice a name: Asgard. The sailors say it quietly.',
    'Asgard, the carved-prow people call it, and the feast-hall there is said to be bigger than a harbour.',
    'A cutter crew found a longship rail drifting, riveted in iron, with not one soul aboard. They say it smelled of snow.',
    'A carved raven was nailed to the harbour post overnight. Nobody saw who. The tavern keeper says it is an invitation, or a warning.',
    'The horns carry on a cold wind. Sailors call it the Asgard wind and turn their faces from it.',
    'They say Asgard has no night in winter, only green fire in the sky, and its people sail on wind and on something stranger.',
    'An old chart shows nothing north of the Wall but a drawing of a ship with a dragon prow, and one word: Asgard.',
    'The Asgardians, the old women say, fight with axes and songs, and they do not forgive a broken oath.',
  ],
  [ // 2: the Warden's secrets
    'The Warden at Frostwatch keeps a round shield with a painted wolf, older than the outpost. He says the Wall holds back the cold, and what rides on it.',
    'Frostwatch folk say the Wall was raised so Terra would never meet Asgard unready. They also say it was never meant to be broken.',
    'Whatever lies past the ice, the Warden says, they have been watching the weak spot as long as we have.',
    'A carved raven keeps landing on the Frostwatch watchtower. The Warden feeds it and says nothing.',
    'On the quietest nights the watchmen hear singing from beyond the ice. The Warden says they must not answer.',
    'Frostwatch has a rack of old axes nobody here knows how to forge. The Warden says they were left as a courtesy.',
  ],
  [ // 3: the Wall has been broken
    'They say a breach has opened in the Wall. Sailors argue whether to cheer or to bar their doors.',
    'The horns past the ice have gone quiet. The old women say that means they are listening.',
    'Ships are talking of the Outer Sea and of a sky that is no longer the Wall\'s grey. And of Asgard, further out, beyond sight.',
    'Whoever broke the Wall is not on any wanted list. Yet. The tavern keeper says the north will want a word.',
    'Traders are betting on how long the breach stays open. Nobody is betting on what comes through it.',
    'An Asgardian raven was seen over Port Haven this morning, circling the dock, then gone north.',
  ],
];
// one rumour: weighted towards the current stage, but the older ones still turn up
export function asgardLine(s, a = 0, b = 0) {
  const st = stageOf(s), h = hash(a >>> 0, (b | 0) + 17, 91), cur = h % 3 !== 0 ? st : h % (st + 1), pool = LINES[cur];
  return pool[(hash(a >>> 0, (b | 0) + 5, 33) >>> 0) % pool.length];
}
export const LORE_COUNT = LINES.reduce((n, l) => n + l.length, 0);
// Asgard's rune stones: one carved stone on each Asgard island, read with F. Each tells a piece of the north's own story (the same pool on every Asgard world).
const RUNES = [
  'Here lies no man. Here stands a stone for those the sea kept. Their ships still row below, and they do not rest.',
  'Ulf raised this stone for his brother, who sailed south to the great ice and came back with eyes that would not close.',
  'The sky fire burns green when the old ones feast. Keep your fires low on those nights, or they will come to share it.',
  'Under the waves the Serpent sleeps with its tail in its mouth. Every storm is one breath. Do not count them.',
  'We built the ice so the warm folk would not find us before they were ready. Some among us wanted it never broken.',
  'Hall of shields, hall of mead, its roof a thousand round boards of gold. Bring a song and a scar, and the door will open.',
  'Fire is the friend of the living. The drowned fear only flame; iron sinks in them like a stone in a bog.',
  'Thorgrim carved this. He sailed to the edge of the world and saw a city of glass under the water. Nobody believed him.',
  'An oath sworn on this stone binds the sworn and the son of the sworn. Break it and the ravens will tell.',
  'The wolf is bound with a cord made of things that are not: a cat\'s footfall, a mountain\'s root. One day the cord will fail.',
  'Count the stones of the north. Where the last one stands, the old ones say, the cold sea has a crack of its own.',
  'Two ravens fly at dawn over every island and come home at dusk. What they saw, the old one knows.',
];
export const runeLine = (isl) => RUNES[(hash(isl.seed >>> 0, 7, 41) >>> 0) % RUNES.length];
export const RUNE_COUNT = RUNES.length;
// Atlantis's crystal pillars: one on each Atlantis island, read with F. Their inscriptions tell the drowned kingdom's own story.
const PILLARS = [
  'Ten kings ruled the ring of islands, and every ninth year they met here, at the pillar, to judge one another by the law cut in its side.',
  'The sea gave us the island and the sea will ask for it back. Build light, build white, and teach the children to swim before they walk.',
  'Orichalc for the rings of the walls, gold for the roofs of the gods, and sea-glass for the eyes of the pillars, so they can watch the deep.',
  'The old city lies below this one. On calm nights its towers still burn, a long way down, and the fishermen hang their nets away from them.',
  'The dolphins came to the harbour on the morning of the great wave and would not leave. Those who followed them out to sea were spared.',
  'Here the canal-builders cut three rings of water round the hill, and a bridge over each, and a gate on each bridge that never closed.',
  'A Terran ship came through the fog in the time of the ninth king. Its sailors called our towers stars and our people ghosts.',
  'Do not take what the sea keeps. The wrecks belong to the drowned, and the drowned keep careful count.',
  'The pillar sings when the tide turns. Put your ear to it: that is the old city counting its bells.',
  'A king of the seventh ring wished to rule the sky as well as the sea. The mountain that answered him is still far to the east.',
  'The mantas carried the first builders over the reef, and so no Atlantean may harm one. Feed them, and they will remember your sail.',
  'Every pillar stands where a tower stood. Count them, and you will know how large the city was before the water came.',
];
export const pillarLine = (isl) => PILLARS[(hash(isl.seed >>> 0, 9, 43) >>> 0) % PILLARS.length];
export const PILLAR_COUNT = PILLARS.length;
