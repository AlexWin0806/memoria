import type { Deck, Imago, ImagoAction, ItemLink } from '@/core/types';
import { palaceLayoutId, planSpec } from '@/layouts/spec';
import { KREBS } from './krebs';

/**
 * The citric acid cycle as a cycle: a showcase of relationships represented in the space.
 * The same eight intermediates, in the same order and with the same short meanings, as the
 * KREBS deck (they are taken from it, so the two cannot drift apart), but as a process: a
 * `becomes` link from each intermediate to the next and from the last back to the first, and
 * one `blocks` link for feedback regulation.
 *
 * The room plan. It stands in the Workshop kit, whose halls are machines in a line with a
 * channel running from station to station: the intermediates are the stations. A round room
 * holds five places and closes on itself, so eight steps cannot stand in one, and spread
 * over two round rooms they would read as two cycles. They stand instead in two halls of
 * four, split where the two carbons have left: citrate to succinyl-CoA (six carbons down to
 * four), then succinate to oxaloacetate (four carbons throughout). The loop is closed by
 * the one link that runs back from oxaloacetate, in the second hall, to citrate in the first.
 *
 * Every link is a statement of biochemistry. Each is standard textbook material:
 *   citrate → isocitrate              an isomerisation (aconitase)
 *   isocitrate → α-ketoglutarate      oxidative decarboxylation: CO2 leaves
 *   α-ketoglutarate → succinyl-CoA    oxidative decarboxylation: CO2 leaves, coenzyme A joins
 *   succinyl-CoA → succinate          coenzyme A is released
 *   succinate → fumarate              an oxidation (succinate dehydrogenase)
 *   fumarate → malate                 a hydration: water is added (fumarase)
 *   malate → oxaloacetate             an oxidation (malate dehydrogenase)
 *   oxaloacetate → citrate            condensation with acetyl-CoA (citrate synthase)
 *   succinyl-CoA ⊣ citrate            succinyl-CoA inhibits citrate synthase, the enzyme that makes citrate
 * The last one is drawn between two intermediates, but it acts on an enzyme: its label says so.
 *
 * The images do not lean on any piece of furniture, because the learner chooses the kit.
 * They keep the hooks of the KREBS deck (citrus, the lemon and melon anagram, amber, smoke,
 * apples, vinegar) and its honesty about which links are only by sound.
 */

const image = (scene: string, glyphs: string[], action: ImagoAction, reason: string): Imago => ({ scene, glyphs, action, reason, source: 'fixture' });

const IMAGES: readonly Imago[] = [
  image('A lemon bursts into six sizzling drops that chase each other in a ring.', ['🍋', '💦'], 'pulse', 'Citrate is named after citrus fruit, where citric acid is found; six drops for its six carbons.'),
  image('A melon spins on the spot, insisting loudly that it is a lemon.', ['🍈', '🔀'], 'spin', 'Melon is lemon with its letters rearranged, as isocitrate is citrate with its atoms rearranged.'),
  image('An alpha wolf glues a whistling kettle to its own tail and shudders.', ['🐺', '🫖'], 'shake', 'A link to the name by sound, in order: alpha wolf, kettle for keto, glue for glutarate. It says nothing about the chemistry.'),
  image('A koala swings by one arm, hugging a lump of amber.', ['🐨', '🔶'], 'swing', 'Succinyl is the amber (Latin succinum); CoA, by sound, is the Ko-A-la clinging to it. Amber with a passenger is succinyl-CoA; amber alone, next, is succinate.'),
  image('The amber drifts free and alone, a mosquito trapped inside it.', ['🔶', '🦟'], 'bob', 'Succinate is named after amber (Latin succinum). It drifts alone: coenzyme A has been removed, which is what separates it from succinyl-CoA.'),
  image('The amber smoulders, and thick smoke billows up and swallows it.', ['💨', '🔥'], 'pulse', 'Fumarate comes from Latin fumus, smoke (via the fumitory plant). The smouldering amber is succinate being oxidised: in the cell by losing two hydrogens, not by fire.'),
  image('A dripping apple shakes itself dry like a wet dog.', ['🍎', '💧'], 'shake', 'Malate is named after apples (Latin malum). The apple drips because malate is made by adding water to fumarate.'),
  image('An ox gulps a jug of vinegar, bellows, and stamps off toward the lemon.', ['🐂', '🍶'], 'hop', 'Ox for oxalo-, by sound; acetate comes from Latin acetum, vinegar. It heads for the lemon because oxaloacetate joins the next acetyl-CoA to make citrate again.'),
];

/** One bolder alternate per intermediate, for "Strengthen this image" offline: same hooks, another picture. */
const ALTERNATES: readonly Imago[] = [
  image('A giant orange rolls in a circle, spitting six pips.', ['🍊', '6️⃣'], 'orbit', 'Citrate is named after citrus fruit, here an orange; six pips for its six carbons.'),
  image('A jigsaw lemon hops about, swapping its own pieces.', ['🧩', '🍋'], 'hop', 'Isocitrate is an isomer of citrate: the same pieces in a new arrangement.'),
  image('A golden key marked alpha swells, oozing glue.', ['🔑', '🧴'], 'pulse', 'By sound: the alpha key to glue is alpha-keto-glu(tarate). A link to the name, not the chemistry.'),
  image('Amber buttoned into a huge coat twirls on the spot.', ['🧥', '🔶'], 'spin', 'Succinyl is the amber (Latin succinum); CoA, by sound, is the coat. Coat on is succinyl-CoA; bare amber, next, is succinate.'),
  image('An amber necklace snaps, and its loose beads skip away.', ['📿', '🔶'], 'hop', 'Succinate is named after amber (Latin succinum). The beads are loose because coenzyme A has been removed.'),
  image('A fuming dragon circles overhead, snorting black smoke.', ['🐉', '💨'], 'orbit', 'Fumarate comes from Latin fumus, smoke, like the word fume: the dragon is fuming.'),
  image('A green apple spins on a fingertip, spraying water everywhere.', ['🍏', '💦'], 'spin', 'Malate is named after apples (Latin malum); the spray is the water added to fumarate to make it.'),
  image('A jar of pickles swings from an ox\'s horn, dripping vinegar.', ['🥒', '🐂'], 'swing', 'Ox for oxalo-, by sound; pickles sit in vinegar, and acetate comes from Latin acetum, vinegar.'),
];

/** What happens at each step, in four words or fewer. The eighth closes the loop. */
const STEPS = ['rearranged', 'loses CO2', 'loses CO2, gains CoA', 'releases CoA', 'oxidised', 'adds water', 'oxidised', 'joins acetyl-CoA (citrate synthase)'];

/** Two halls of four stations. The names only say which intermediates stand in each. */
const HALLS = [
  { name: 'Citrate to succinyl-CoA', count: 4 },
  { name: 'Succinate to oxaloacetate', count: 4 },
];
const { spec, places } = planSpec('workshop', HALLS);
const PLACES = places.flat();
const itemId = (n: number): string => `krebs-cycle-${n + 1}`;

const links: ItemLink[] = [
  ...STEPS.map((label, n): ItemLink => ({ from: itemId(n), to: itemId((n + 1) % STEPS.length), kind: 'becomes', label })),
  // Succinyl-CoA (4) inhibits citrate synthase, which makes citrate (1).
  { from: itemId(3), to: itemId(0), kind: 'blocks', label: 'inhibits citrate synthase' },
];

export const KREBS_CYCLE: Deck = {
  id: 'fixture-krebs-cycle',
  title: 'The citric acid cycle, as a cycle',
  kind: 'list',
  layoutId: palaceLayoutId(spec),
  createdAt: 0,
  fixture: true,
  // The steps of a pathway: the walks also ask what each intermediate becomes.
  focus: 'process',
  items: KREBS.items.map((item, n) => ({ id: itemId(n), term: item.term, meaning: item.meaning, locusId: PLACES[n], imago: IMAGES[n], alternates: [ALTERNATES[n]] })),
  links,
};
