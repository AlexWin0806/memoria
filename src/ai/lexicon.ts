/**
 * Offline picture lexicon for the local planner: common concrete words → one emoji.
 * Every emoji here is a single code point from Unicode 13 or earlier, so it draws
 * everywhere. Text-style symbols get the emoji variation selector when the rows are read.
 *
 * Row format: word|emoji|picture noun|why   (the last two are optional).
 * The picture noun is what the scene sentence says ("a glass of milk" for "milk"). It is
 * always one singular thing ("a pencil on a notepad", not "a pencil and notepad"), because
 * the scene templates give it a singular verb.
 */

export interface LexEntry {
  word: string;
  emoji: string;
  /** Noun phrase without an article, ready for "a/an …". */
  noun: string;
  /** Why the picture fits. A note for number rhymes; a full, true sentence for known things. */
  why?: string;
  /** True for the "known things" table: the picture is tied to what the thing is. */
  known?: boolean;
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
umbrella|☔ book|📖|open_book pencil|📝|pencil_on_a_notepad paper|📄|sheet_of_paper scroll|📜
mail|📬|mailbox compass|🧭 telescope|🔭 microscope|🔬 camera|📷 phone|📱 computer|💻|laptop
radio|📻 battery|🔋 plug|🔌 coin|🪙 money|💰|bag_of_money crown|👑 ring|💍 gem|💎 diamond|💎
trophy|🏆 medal|🏅 flag|🚩|red_flag drum|🥁 guitar|🎸 violin|🎻 trumpet|🎺 piano|🎹 horn|📯
ball|⚽|football kite|🪁 dice|🎲 balloon|🎈 gift|🎁|wrapped_gift mask|🎭|theatre_mask tent|⛺
anchor|⚓ bow|🏹|drawn_bow arrow|🏹 bomb|💣|cartoon_bomb rocket|🚀 brick|🧱 toolbox|🧰 tool|🧰|toolbox
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

/**
 * Things the planner knows by name: planets, common elements, months, countries, and
 * school-subject vocabulary. Same row format, but here the fourth field is a true,
 * complete one-line reason, so a bare list ("Mercury, Venus, …") gets a picture tied to
 * what the thing is instead of to its first two letters. Nothing here is an etymology
 * unless it is a well-attested one. A word may have several rows: the planner takes the
 * next one when a glyph is already used in the deck.
 */
const KNOWN_ROWS = `
mercury|👟|winged_running_shoe|Mercury_was_the_Roman_messenger_god,_and_it_is_the_fastest_planet.
venus|💘|heart_with_an_arrow|Venus_was_the_Roman_goddess_of_love.
mars|🥊|red_boxing_glove|Mars_is_the_red_planet,_named_after_the_Roman_god_of_war.
jupiter|👑|giant_crown|Jupiter_was_king_of_the_Roman_gods,_and_it_is_the_largest_planet.
saturn|🪐|ringed_planet|Saturn_is_the_planet_with_the_bright_rings.
uranus|🧊|giant_ball_of_ice|Uranus_is_an_ice_giant_that_orbits_tipped_on_its_side.
neptune|🔱|trident|Neptune_was_the_Roman_god_of_the_sea,_who_carries_a_trident.
pluto|⛄|snowman|Pluto_is_a_small_frozen_world_far_from_the_Sun.
ceres|🌾|sheaf_of_grain|Ceres_was_the_Roman_goddess_of_grain;_cereal_is_named_after_her.
hydrogen|💧|drop_of_water|Hydrogen_means_water-former:_water_is_made_with_it.
hydrogen|🚀|rocket|Liquid_hydrogen_is_rocket_fuel.
helium|🎈|balloon|Helium_is_the_gas_in_party_balloons.
lithium|🔋|battery|Lithium_is_the_metal_in_rechargeable_batteries.
beryllium|🟢|green_emerald|Emerald_is_a_beryllium_mineral_(beryl).
boron|🧼|bar_of_borax_soap|Borax,_an_old_laundry_cleaner,_is_a_boron_compound.
carbon|💎|diamond|Diamond_is_pure_carbon.
carbon|📝|pencil_on_a_notepad|Pencil_lead_is_graphite,_which_is_pure_carbon.
nitrogen|🌬|gust_of_air|Nitrogen_makes_up_most_of_the_air.
oxygen|🫁|pair_of_lungs|Oxygen_is_what_your_lungs_take_from_the_air.
fluorine|🪥|toothbrush|Fluoride_in_toothpaste_is_a_fluorine_compound.
neon|🚨|flashing_red_light|Neon_is_the_gas_that_glows_red_in_neon_signs.
sodium|🧂|salt_shaker|Table_salt_is_sodium_chloride.
magnesium|🎆|burst_of_fireworks|Magnesium_burns_brilliant_white_in_fireworks_and_flares.
aluminium|🥫|drinks_can|Aluminium_is_the_metal_of_drinks_cans_and_foil.
aluminum|🥫|drinks_can|Aluminum_is_the_metal_of_drinks_cans_and_foil.
silicon|💻|laptop|Computer_chips_are_made_of_silicon.
phosphorus|🧨|firecracker|Phosphorus_catches_fire_easily;_match_strikers_use_it.
sulfur|🌋|volcano|Yellow_sulfur_crusts_form_around_volcanic_vents.
sulphur|🌋|volcano|Yellow_sulphur_crusts_form_around_volcanic_vents.
chlorine|🏊|swimmer|Chlorine_keeps_swimming_pools_clean.
argon|💡|light_bulb|Argon_is_the_gas_inside_ordinary_light_bulbs.
potassium|🍌|banana|Bananas_are_rich_in_potassium.
calcium|🦴|bone|Bones_and_teeth_are_built_with_calcium.
calcium|🥛|glass_of_milk|Milk_is_rich_in_calcium.
titanium|🛫|aeroplane|Titanium_is_a_strong,_light_metal_used_in_aircraft.
iron|🧲|magnet|Iron_is_the_metal_that_magnets_pull.
iron|⚓|anchor|Anchors_and_chains_are_made_of_iron.
cobalt|🔵|deep_blue_ball|Cobalt_gives_cobalt_blue_its_colour.
nickel|🪙|coin|Nickel_is_a_coin_metal;_a_US_five-cent_coin_is_a_nickel.
copper|🔌|electric_plug|Copper_is_the_metal_inside_electric_wires.
zinc|🧴|bottle_of_sunscreen|Zinc_oxide_is_the_white_in_sunscreen.
silver|🥈|silver_medal|Silver_is_the_metal_of_second-place_medals.
gold|🥇|gold_medal|Gold_is_the_metal_of_first-place_medals.
krypton|🙈|monkey_covering_its_eyes|Krypton_means_the_hidden_one_(Greek_kryptos).
xenon|📸|camera_flash|Xenon_is_the_gas_in_camera_flash_tubes.
radon|☢|radiation_sign|Radon_is_a_radioactive_gas.
uranium|☢|radiation_sign|Uranium_is_radioactive:_it_fuels_nuclear_reactors.
january|🎆|burst_of_fireworks|January_opens_with_New_Year_fireworks.
february|💌|love_letter|February_has_Valentine's_Day.
march|🪁|kite|March_is_known_for_its_winds_(in_the_north).
april|☔|dripping_umbrella|April_is_known_for_its_showers_(in_the_north).
june|🌞|blazing_sun|June_has_the_longest_days_(in_the_north).
july|🍦|melting_ice_cream|July_is_high_summer_(in_the_north).
august|🌻|sunflower|Sunflowers_bloom_in_August_(in_the_north).
september|🎒|school_backpack|September_is_back_to_school_(in_the_north).
october|🎃|carved_pumpkin|October_ends_with_Halloween.
november|🍂|pile_of_fallen_leaves|The_last_leaves_fall_in_November_(in_the_north).
december|🎄|Christmas_tree|December_has_Christmas.
france|🥖|baguette|France_is_known_for_its_baguettes.
italy|🍕|pizza|Pizza_comes_from_Italy.
japan|🗻|snow-capped_Mount_Fuji|Mount_Fuji_is_in_Japan.
china|🐼|giant_panda|Giant_pandas_live_in_China.
india|🐅|tiger|The_Bengal_tiger_is_India's_national_animal.
america|🗽|Statue_of_Liberty|The_Statue_of_Liberty_stands_in_New_York.
usa|🗽|Statue_of_Liberty|The_Statue_of_Liberty_stands_in_New_York.
canada|🍁|maple_leaf|The_maple_leaf_is_on_Canada's_flag.
mexico|🌮|taco|Tacos_come_from_Mexico.
brazil|⚽|football|Brazil_is_famous_for_football.
egypt|🐫|camel|Camels_cross_Egypt's_deserts,_past_the_pyramids.
australia|🦘|kangaroo|Kangaroos_live_in_Australia.
russia|🪆|nesting_doll|Nesting_dolls_come_from_Russia.
germany|🥨|pretzel|Pretzels_are_a_German_bake.
spain|💃|flamenco_dancer|Flamenco_comes_from_Spain.
england|💂|royal_guard|Royal_guards_in_bearskin_hats_stand_in_London.
britain|💂|royal_guard|Royal_guards_in_bearskin_hats_stand_in_London.
greece|🏛|ancient_temple|Greece_is_the_land_of_ancient_temples.
netherlands|🌷|tulip|The_Netherlands_is_famous_for_tulips.
switzerland|⌚|wristwatch|Switzerland_is_famous_for_watches.
peru|🦙|llama|Llamas_live_in_the_Andes_of_Peru.
kenya|🦒|giraffe|Giraffes_roam_Kenya's_savannah.
ireland|☘|shamrock|The_shamrock_is_Ireland's_emblem.
antarctica|🐧|penguin|Penguins_live_in_Antarctica.
krebs|🦀|crab|Krebs_is_the_German_word_for_crab.
cycle|🚲|bicycle|Word-play:_a_cycle,_as_in_bicycle.
citric|🍋|lemon|Citric_acid_is_the_acid_in_lemons.
citrate|🍋|lemon|Citrate_is_named_after_citrus_fruit.
citrate|🍊|orange|Citrate_is_named_after_citrus_fruit.
atp|🪙|gold_coin|ATP_is_the_cell's_energy_currency.
mitochondria|🔋|battery|Mitochondria_supply_most_of_the_cell's_energy.
mitochondrion|🔋|battery|Mitochondria_supply_most_of_the_cell's_energy.
mitochondrial|🔋|battery|Mitochondria_supply_most_of_the_cell's_energy.
glucose|🍬|piece_of_candy|Glucose_is_a_sugar.
sugar|🍬|piece_of_candy|Candy_is_mostly_sugar.
protein|🥩|steak|Meat_is_rich_in_protein.
photosynthesis|🌱|sprouting_seed|Photosynthesis_is_how_plants_make_sugar_from_light.
chloroplast|🍃|green_leaf|Chloroplasts_are_what_make_leaves_green.
chlorophyll|🍃|green_leaf|Chlorophyll_is_the_green_pigment_of_leaves.
atom|⚛|atom_symbol|The_atom_symbol_stands_for_atoms.
nerve|⚡|lightning_bolt|Nerves_carry_electrical_signals.
`;

/** General picture words that the first table lacks: kitchen, body, civics, cooking verbs. */
const MORE_ROWS = `
plate|🍽|dinner_plate oven|🥧|hot_oven_with_a_pie_inside oven|🧁|oven_full_of_cupcakes fridge|🧊|fridge_packed_with_ice
refrigerator|🧊|fridge_packed_with_ice freezer|🧊|freezer_packed_with_ice kettle|🫖 sink|🚰|running_tap tap|🚰|running_tap
whisk|🥣|whisk_in_a_mixing_bowl mix|🥣|mixing_bowl stir|🥄|stirring_spoon bake|🧁|cupcake_fresh_from_the_oven
chop|🔪|chopping_knife fry|🍳|frying_pan flour|🌾|sack_of_flour
head|🗣|talking_head face|😀|grinning_face hair|💈|barber's_pole neck|🦒|giraffe's_neck shoulder|🤷|shrugging_figure
wrist|⌚|wristwatch knee|🦵|bent_knee toe|🦶|foot skin|🧴|bottle_of_skin_lotion spine|🦴|backbone throat|🧣|scarf
war|⚔|pair_of_crossed_swords peace|🕊|dove law|⚖|pair_of_scales court|⚖|pair_of_scales trial|⚖|pair_of_scales
jury|⚖|pair_of_scales vote|🗳|ballot_box election|🗳|ballot_box soldier|🪖|soldier's_helmet army|🪖|soldier's_helmet
speech|📣|megaphone press|📰|newspaper religion|⛪|church freedom|🗽|Statue_of_Liberty tax|💰|bag_of_money
constitution|📜|old_scroll treaty|🤝|handshake trade|🤝|handshake empire|🏛|ancient_temple revolution|✊|raised_fist
gun|🔫|water_pistol search|🔍|magnifying_glass galaxy|🌌|spiral_of_stars planet|🪐|ringed_planet comet|☄|comet
`;

const needsVs16 = (emoji: string): boolean => Array.from(emoji).length === 1 && !/\p{Emoji_Presentation}/u.test(emoji);

function parseRows(rows: string, known: boolean): LexEntry[] {
  return rows
    .split(/\s+/)
    .filter(Boolean)
    .map((row) => {
      const [word, emoji, noun, why] = row.split('|');
      return {
        word,
        // Text-style symbols (⚖, ☢) need the variation selector to draw as emoji.
        emoji: needsVs16(emoji) ? `${emoji}️` : emoji,
        noun: (noun ?? word).replace(/_/g, ' '),
        ...(why ? { why: why.replace(/_/g, ' ') } : {}),
        ...(known ? { known: true } : {}),
      };
    });
}

export const LEXICON: readonly LexEntry[] = [...parseRows(KNOWN_ROWS, true), ...parseRows(ROWS, false), ...parseRows(MORE_ROWS, false)];

/** Every row for a word, in table order: the planner moves to the next when a glyph is taken. */
const BY_WORD = new Map<string, LexEntry[]>();
for (const e of LEXICON) BY_WORD.set(e.word, [...(BY_WORD.get(e.word) ?? []), e]);

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

/**
 * How a picture is tied to the fact, strongest first.
 *   meaning  the picture is what the fact means (a vocabulary answer, a short definition)
 *   known    the planner knows the thing by name and why the picture fits (Helium → balloon)
 *   word     a picture word is in the thing to remember itself
 *   gloss    a picture word is somewhere in a longer meaning or sentence
 *   sound    the term starts with, contains or starts like a picture word
 *   weak     the term and the picture share two letters; always flagged
 *   none     no picture: a plain object carries the written word; always flagged
 */
export type LinkKind = 'meaning' | 'known' | 'word' | 'gloss' | 'sound' | 'weak' | 'none';

export interface PictureMatch {
  entry: LexEntry;
  link: LinkKind;
  /** One line for the image's `reason`. */
  reason: string;
}

/**
 * Pictures for the words of a text, in reading order, one per emoji. Words in
 * brackets come last: in "glass (for drinking)" the glass is the thing.
 */
export function lookup(text: string): LexEntry[] {
  const out: LexEntry[] = [];
  const seen = new Set<string>();
  for (const t of [...tokens(text.replace(/\([^)]*\)/g, ' ')), ...tokens(text)]) {
    for (const s of singular(t)) {
      for (const e of BY_WORD.get(s) ?? []) {
        if (seen.has(e.emoji)) continue;
        seen.add(e.emoji);
        out.push(e);
      }
    }
  }
  return out;
}

const commonPrefix = (a: string, b: string): number => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

/**
 * Sound-alike pictures for a term, best first, one per emoji: the term starts with or
 * contains a picture word, or shares its first three letters; then two shared letters,
 * which is flagged as weak. A single shared letter is not offered at all.
 */
export function soundAlikes(term: string): PictureMatch[] {
  const out: PictureMatch[] = [];
  const seen = new Set<string>();
  const push = (entry: LexEntry, link: LinkKind, reason: string) => {
    if (seen.has(entry.emoji)) return;
    seen.add(entry.emoji);
    out.push({ entry, link, reason });
  };
  const termTokens = tokens(term);
  // The word to find a sound-alike for: the first substantial word of the term.
  const head = termTokens.find((t) => t.length >= 4) ?? termTokens[0];
  if (!head) return out;
  // Named things (Mercury, France) are pictures of themselves, not sounds to borrow.
  const plain = LEXICON.filter((e) => !e.known);

  const starts = plain.filter((e) => e.word.length >= 3 && head.startsWith(e.word) && head !== e.word).sort((a, b) => b.word.length - a.word.length);
  for (const e of starts) push(e, 'sound', `Sound-alike: "${head}" starts with "${e.word}". It does not show the meaning.`);
  for (const t of termTokens) {
    for (const e of plain) {
      if (e.word.length >= 4 && t.length > e.word.length && t.includes(e.word)) {
        push(e, 'sound', `Sound-alike: "${t}" has "${e.word}" inside it. It does not show the meaning.`);
      }
    }
  }
  const scored = plain
    .map((e) => ({ e, n: commonPrefix(head, e.word) }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n);
  for (const { e, n } of scored.slice(0, 6)) {
    if (n >= 3) push(e, 'sound', `Sound-alike: "${head}" starts like "${e.word}". It does not show the meaning.`);
    else push(e, 'weak', `Weak link: "${head}" and "${e.word}" share only their first two letters. Rewrite this one.`);
  }
  return out;
}

export const withArticle = (noun: string): string => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);
