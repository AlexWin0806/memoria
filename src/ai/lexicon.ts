/**
 * Offline picture lexicon for the local planner: common concrete words → one emoji.
 * Every emoji here is a single code point from Unicode 13 or earlier with emoji
 * presentation by default (no variation selector needed), so it draws everywhere.
 *
 * Row format: word|emoji|picture noun|why   (the last two are optional).
 * The picture noun is what the scene sentence says ("a glass of milk" for "milk").
 */

export interface LexEntry {
  word: string;
  emoji: string;
  /** Noun phrase without an article, ready for "a/an …". */
  noun: string;
  /** Set when the link is not literal (number rhymes): shown in the image's reason. */
  why?: string;
}

const ROWS = `
dog|🐕 puppy|🐶 cat|🐈 kitten|🐱 mouse|🐁 rat|🐀 horse|🐎 cow|🐄 bull|🐂 pig|🐖 sheep|🐑 goat|🐐
deer|🦌 rabbit|🐇 fox|🦊 bear|🐻 wolf|🐺 lion|🦁 tiger|🐅 monkey|🐒 gorilla|🦍 elephant|🐘 camel|🐫
giraffe|🦒 zebra|🦓 kangaroo|🦘 hippo|🦛 rhino|🦏 bat|🦇 owl|🦉 eagle|🦅 duck|🦆 swan|🦢 chicken|🐔
rooster|🐓 turkey|🦃 parrot|🦜 peacock|🦚 penguin|🐧 bird|🐦 fish|🐟 shark|🦈 whale|🐋 dolphin|🐬
octopus|🐙 squid|🦑 crab|🦀 lobster|🦞 shrimp|🦐 snail|🐌 snake|🐍 lizard|🦎 turtle|🐢 crocodile|🐊
frog|🐸 bee|🐝 ant|🐜 butterfly|🦋 ladybird|🐞 cricket|🦗 scorpion|🦂 mosquito|🦟 dragon|🐉
unicorn|🦄 dinosaur|🦕 hedgehog|🦔 otter|🦦 sloth|🦥 flamingo|🦩 animal|🐾|trail_of_paw_prints
apple|🍎 pear|🍐 orange|🍊 lemon|🍋 banana|🍌 grape|🍇|bunch_of_grapes strawberry|🍓 cherry|🍒
peach|🍑 pineapple|🍍 mango|🥭 coconut|🥥 melon|🍉|watermelon kiwi|🥝 avocado|🥑 tomato|🍅
potato|🥔 carrot|🥕 corn|🌽|corn_cob cucumber|🥒 broccoli|🥦|head_of_broccoli onion|🧅 garlic|🧄|bulb_of_garlic
mushroom|🍄 peanut|🥜 chestnut|🌰 bread|🍞|loaf_of_bread cheese|🧀|wedge_of_cheese egg|🥚
meat|🍖|joint_of_meat ham|🍖 bacon|🥓|strip_of_bacon steak|🥩 burger|🍔 pizza|🍕 sandwich|🥪
rice|🍚|bowl_of_rice noodle|🍜|bowl_of_noodles salt|🧂|salt_shaker honey|🍯|pot_of_honey
milk|🥛|glass_of_milk tea|🍵|cup_of_tea coffee|☕|cup_of_coffee wine|🍷|glass_of_wine beer|🍺|mug_of_beer
juice|🧃|juice_box water|💧|drop_of_water ice|🧊|block_of_ice cake|🍰|slice_of_cake cookie|🍪
candy|🍬|piece_of_candy chocolate|🍫|bar_of_chocolate pie|🥧 butter|🧈|block_of_butter soup|🍲|pot_of_soup
salad|🥗|bowl_of_salad popcorn|🍿|tub_of_popcorn pretzel|🥨 lollipop|🍭 donut|🍩 food|🍔|burger
knife|🔪 fork|🍴 spoon|🥄 cup|☕ glass|🥛|drinking_glass bowl|🥣 pot|🍲|cooking_pot pan|🍳|frying_pan
bottle|🍾 jar|🏺 vase|🏺 chopsticks|🥢|pair_of_chopsticks napkin|🧻 hammer|🔨 axe|🪓 saw|🪚
wrench|🔧 screw|🔩 bolt|🔩 ladder|🪜 hook|🪝 key|🔑 lock|🔒|padlock magnet|🧲 needle|🪡
thread|🧵|spool_of_thread yarn|🧶|ball_of_yarn rope|🪢|knotted_rope knot|🪢 broom|🧹 bucket|🪣
soap|🧼|bar_of_soap sponge|🧽 bulb|💡|light_bulb torch|🔦 bell|🔔 clock|⏰|alarm_clock watch|⌚|wristwatch
hourglass|⏳ mirror|🪞 window|🪟 door|🚪 chair|🪑 box|📦|cardboard_box bag|👜|handbag basket|🧺
umbrella|☔ book|📖|open_book pencil|📝|pencil_and_notepad paper|📄|sheet_of_paper scroll|📜
mail|📬|mailbox compass|🧭 telescope|🔭 microscope|🔬 camera|📷 phone|📱 computer|💻|laptop
radio|📻 battery|🔋 plug|🔌 coin|🪙 money|💰|bag_of_money crown|👑 ring|💍 gem|💎 diamond|💎
trophy|🏆 medal|🏅 flag|🚩|red_flag drum|🥁 guitar|🎸 violin|🎻 trumpet|🎺 piano|🎹 horn|📯
ball|⚽|football kite|🪁 dice|🎲 balloon|🎈 gift|🎁|wrapped_gift mask|🎭|theatre_mask tent|⛺
anchor|⚓ bow|🏹|bow_and_arrow arrow|🏹 bomb|💣|cartoon_bomb rocket|🚀 brick|🧱 toolbox|🧰 tool|🧰|toolbox
syringe|💉 pill|💊 tube|🧪|test_tube abacus|🧮 ruler|📏 pin|📌|pushpin clip|📎|paper_clip
calendar|📅 chart|📊|bar_chart
eye|👀|pair_of_eyes ear|👂 nose|👃 mouth|👄 lip|👄|pair_of_lips tongue|👅 tooth|🦷 bone|🦴 brain|🧠
heart|🫀 lung|🫁|pair_of_lungs hand|✋ palm|✋|open_palm finger|👆|pointing_finger thumb|👍 fist|✊
arm|💪|flexing_arm muscle|💪|flexing_arm leg|🦵 foot|🦶 skull|💀 blood|🩸|drop_of_blood baby|👶
king|🤴 queen|👸 robot|🤖 ghost|👻 clown|🤡 angel|👼 nail|💅|painted_fingernail
house|🏠 home|🏠|house castle|🏰 church|⛪ school|🏫 hospital|🏥 bank|🏦 hotel|🏨 shop|🏪
factory|🏭 office|🏢|office_block tower|🗼 bridge|🌉 mountain|🗻 volcano|🌋 forest|🌲|pine_tree
tree|🌳 garden|🌷|tulip farm|🚜|tractor sea|🌊|wave ocean|🌊|wave fountain|⛲ statue|🗽
city|🌆|city_skyline station|🚉|railway_station
sun|🌞 moon|🌙|crescent_moon star|⭐ cloud|⛅ rain|☔|dripping_umbrella snow|⛄|snowman
lightning|⚡|lightning_bolt thunder|⚡|thunderbolt storm|🌀|whirling_storm wind|💨|gust_of_wind
rainbow|🌈 fire|🔥|flame flame|🔥 wave|🌊 earth|🌍|globe world|🌍|globe globe|🌐 flower|🌸
rose|🌹 leaf|🍃 cactus|🌵 seed|🌱|sprouting_seed plant|🪴|potted_plant wood|🪵|log rock|🪨
stone|🪨 shell|🐚|seashell feather|🪶
zero|🥚|egg|an_egg_is_shaped_like_a_zero one|🍔|bun|one_rhymes_with_bun two|👟|shoe|two_rhymes_with_shoe
three|🌳|tree|three_rhymes_with_tree four|🚪|door|four_rhymes_with_door five|🐝|hive_of_bees|five_rhymes_with_hive
six|🥢|bundle_of_sticks|six_rhymes_with_sticks seven|👼|angel_from_heaven|seven_rhymes_with_heaven
eight|🎣|fishing_bait|eight_rhymes_with_bait nine|🍷|glass_of_wine|nine_rhymes_with_wine
ten|🐔|hen|ten_rhymes_with_hen hundred|💯|red_hundred first|🥇|gold_medal second|🥈|silver_medal
third|🥉|bronze_medal
math|🧮|abacus science|🔬|microscope chemistry|🧪|test_tube biology|🧬|strand_of_DNA physics|🧲|magnet
history|📜|old_scroll geography|🌍|globe music|🎵|musical_note art|🎨|paint_palette
language|💬|speech_bubble medicine|💊|pill astronomy|🔭|telescope sport|⚽|football
economics|💰|bag_of_money cell|🦠|wriggling_cell virus|🦠|virus germ|🦠 dna|🧬|strand_of_DNA
gene|🧬|strand_of_DNA acid|🧪|bubbling_test_tube gas|💨|puff_of_gas electricity|⚡|lightning_bolt
energy|🔋|battery light|💡|light_bulb sound|🔊|loudspeaker time|⏳|hourglass death|💀|skull
love|💘|heart_with_an_arrow idea|💡|light_bulb
car|🚗 bus|🚌 train|🚂|steam_train plane|🛫|aeroplane ship|🚢 boat|⛵|sailboat sail|⛵|sailboat
bike|🚲 truck|🚚 tractor|🚜 canoe|🛶 sled|🛷 skateboard|🛹
hat|🎩|top_hat cap|🧢 shoe|👟 boot|👢 sock|🧦 glove|🧤|pair_of_gloves coat|🧥 shirt|👕
dress|👗 glasses|👓|pair_of_glasses scarf|🧣
`;

export const LEXICON: readonly LexEntry[] = ROWS.split(/\s+/)
  .filter(Boolean)
  .map((row) => {
    const [word, emoji, noun, why] = row.split('|');
    return {
      word,
      emoji,
      noun: (noun ?? word).replace(/_/g, ' '),
      ...(why ? { why: why.replace(/_/g, ' ') } : {}),
    };
  });

const BY_WORD = new Map<string, LexEntry>();
for (const e of LEXICON) if (!BY_WORD.has(e.word)) BY_WORD.set(e.word, e);

const STOP = new Set(
  'the a an of and or to in on at by for with from is are was were be as it its this that these those which into than then not no can may also each every very most more some such their there about over under between during after before le la les el los las un une uno una der die das il lo'.split(
    ' ',
  ),
);

/** Lowercase content words, diacritics stripped: "La cuchará" → ["la", "cuchara"]. */
export function tokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function singular(t: string): string[] {
  const out = [t];
  if (t.endsWith('ies') && t.length > 4) out.push(`${t.slice(0, -3)}y`);
  if (t.endsWith('es') && t.length > 3) out.push(t.slice(0, -2));
  if (t.endsWith('s') && t.length > 3) out.push(t.slice(0, -1));
  return out;
}

/** How a picture is tied to the fact, strongest first. */
export type LinkKind = 'meaning' | 'word' | 'sound' | 'weak';

export interface PictureMatch {
  entry: LexEntry;
  link: LinkKind;
  /** One line for the image's `reason`. */
  reason: string;
}

const commonPrefix = (a: string, b: string): number => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

/**
 * Candidate pictures for a fact, best first, one per emoji.
 * Meaning links come first (a word of the meaning or the term that is literally a
 * picture), then sound-alikes (the term starts with or contains a picture word,
 * or shares its first syllable), then a first-letter link, which is flagged as weak.
 */
export function findPictures(term: string, meaning?: string): PictureMatch[] {
  const out: PictureMatch[] = [];
  const seen = new Set<string>();
  const push = (entry: LexEntry, link: LinkKind, reason: string) => {
    if (seen.has(entry.emoji)) return;
    seen.add(entry.emoji);
    out.push({ entry, link, reason: entry.why ? `${reason} (${entry.why})` : reason });
  };

  const termTokens = tokens(term);
  const meaningTokens = meaning ? tokens(meaning) : [];

  for (const t of meaningTokens) {
    for (const s of singular(t)) {
      const e = BY_WORD.get(s);
      if (e) push(e, 'meaning', `It means "${e.word}": the picture is the meaning.`);
    }
  }
  for (const t of termTokens) {
    for (const s of singular(t)) {
      const e = BY_WORD.get(s);
      if (e) push(e, 'word', `"${e.word}" is in the fact itself.`);
    }
  }

  // The word to find a sound-alike for: the first substantial word of the term.
  const head = termTokens.find((t) => t.length >= 4) ?? termTokens[0];
  if (head) {
    const starts = LEXICON.filter((e) => e.word.length >= 3 && head.startsWith(e.word) && head !== e.word).sort(
      (a, b) => b.word.length - a.word.length,
    );
    for (const e of starts) push(e, 'sound', `Sound-alike: "${head}" starts with "${e.word}".`);

    for (const t of termTokens) {
      for (const e of LEXICON) {
        if (e.word.length >= 4 && t.length > e.word.length && t.includes(e.word)) {
          push(e, 'sound', `Sound-alike: "${t}" has "${e.word}" inside it.`);
        }
      }
    }

    const scored = LEXICON.map((e) => ({ e, n: commonPrefix(head, e.word) }))
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.n - a.n);
    for (const { e, n } of scored.slice(0, 6)) {
      if (n >= 3) push(e, 'sound', `Sound-alike: "${head}" starts like "${e.word}".`);
      else push(e, 'weak', `Weak link: "${head}" and "${e.word}" share only their first two letters. Rewrite this one.`);
    }

    for (const e of LEXICON) {
      if (out.length >= 8) break;
      if (e.word[0] === head[0]) {
        push(e, 'weak', `Weak link: "${head}" and "${e.word}" share only a first letter. Rewrite this one.`);
      }
    }
  }
  return out;
}

export const withArticle = (noun: string): string => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);
