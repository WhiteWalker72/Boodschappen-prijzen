/**
 * Lists every distinct non-pantry ingredient key in the app's bundled recipes,
 * using the app's own parser and ingredientKey(). Expects the app repo next to
 * this one (../Boodschappenlijstje).
 *
 *   npm run list-ingredients            key, count, example lines
 *   npm run list-ingredients -- --json  keys as JSON
 *   npm run check-mapping               keys missing from mapping.json (exit 1 if any)
 */
import { BOOK_RECIPES } from '../../Boodschappenlijstje/src/data/book-recipes.ts';
import { BATCHES } from '../../Boodschappenlijstje/src/data/suggestions/index.ts';
import { parseIngredient } from '../../Boodschappenlijstje/src/lib/ingredient-parser.ts';
import { ingredientKey } from '../../Boodschappenlijstje/src/lib/normalize.ts';
import { readFileSync } from 'node:fs';

import { DEFAULT_PANTRY, isPantryItem } from '../../Boodschappenlijstje/src/lib/pantry.ts';

const pantry = new Set(DEFAULT_PANTRY.map(ingredientKey));
const lines = [
  ...BOOK_RECIPES.flatMap((r) => r.ingredients),
  ...BATCHES.flatMap((b) => b.suggestions.flatMap((s) => s.recipe.ingredients)),
];
const keys = new Map<string, { names: Set<string>; count: number; examples: Set<string> }>();
for (const line of lines) {
  const parsed = parseIngredient(line);
  const key = ingredientKey(parsed.name);
  if (!key || isPantryItem(key, pantry)) continue;
  const entry = keys.get(key) ?? { names: new Set(), count: 0, examples: new Set() };
  entry.names.add(parsed.name);
  entry.examples.add(line);
  entry.count++;
  keys.set(key, entry);
}
const sorted = [...keys.entries()].sort(([a], [b]) => a.localeCompare(b));
if (process.argv.includes('--check')) {
  const mapping = JSON.parse(readFileSync(new URL('../mapping.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  const missing = sorted.map(([key]) => key).filter((key) => !mapping[key]);
  const unused = Object.keys(mapping).filter((key) => !keys.has(key));
  console.log(`${keys.size} ingredient keys, ${Object.keys(mapping).length} mapped.`);
  if (unused.length) console.log('Mapped but no longer used (fine to keep):', unused.join(', '));
  if (missing.length) {
    console.log('Missing from mapping.json:', missing.join(', '));
    process.exit(1);
  }
} else if (process.argv.includes('--json')) {
  console.log(JSON.stringify(sorted.map(([key]) => key)));
} else {
  for (const [key, e] of sorted) console.log(`${key}\t${e.count}\t${[...e.examples].slice(0, 3).join(' | ')}`);
}
