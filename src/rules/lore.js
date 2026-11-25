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
