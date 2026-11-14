/**
 * The "without a palace" arm of the in-app A/B test: an ordered eight-item list studied
 * as plain text, to compare with the eight carpal bones learned in the palace.
 *
 * Chosen list: the eight intermediates of the citric acid (Krebs) cycle, in order,
 * starting from citrate. Like the carpals it is exactly eight unfamiliar technical
 * names in a fixed, standard order, from the same pre-medical domain, and it contains
 * a confusable pair (succinyl-CoA / succinate) as the carpals do (trapezium / trapezoid).
 * The short-lived, enzyme-bound cis-aconitate is left out, as in the standard eight-item list.
 *
 * No images and no loci on purpose. This is a demonstration, not a controlled study:
 * the two lists differ, and one learner is not a sample.
 */
export interface ControlList {
  id: string;
  title: string;
  items: { term: string; meaning: string }[];
}

export const CONTROL_LIST: ControlList = {
  id: 'control-krebs',
  title: 'The eight intermediates of the citric acid cycle',
  items: [
    { term: 'Citrate', meaning: 'Six carbons: made when acetyl-CoA joins oxaloacetate. Named after citrus fruit.' },
    { term: 'Isocitrate', meaning: 'An isomer of citrate: the same atoms, rearranged.' },
    { term: 'Alpha-ketoglutarate', meaning: 'Five carbons: what is left after the first carbon dioxide is released.' },
    { term: 'Succinyl-CoA', meaning: 'Four carbons bound to coenzyme A, after the second carbon dioxide is released.' },
    { term: 'Succinate', meaning: 'Four carbons with coenzyme A removed. Named after amber (Latin succinum).' },
    { term: 'Fumarate', meaning: 'Made by oxidising succinate.' },
    { term: 'Malate', meaning: 'Made by adding water to fumarate. Named after apples (Latin malum).' },
    { term: 'Oxaloacetate', meaning: 'Four carbons: made by oxidising malate, ready to join the next acetyl-CoA.' },
  ],
};
