# Boodschappen-prijzen

Daily Lidl and Albert Heijn prices for the ingredients in the Boodschappenlijstje app. A GitHub Action writes `prices.json` every morning; the app downloads it from

```
https://raw.githubusercontent.com/WhiteWalker72/Boodschappen-prijzen/main/prices.json
```

There is no backend: this repo is the whole pipeline.

## Files

| File | What |
| --- | --- |
| `prices.json` | The output. Written by the script, committed by the workflow. |
| `mapping.json` | Ingredient key → AH and Lidl product. Edited by hand. |
| `lidl-manual.json` | Lidl prices kept by hand, for ingredients lidl.nl doesn't list. |
| `mapping-review.md` | Matches and estimates that still need a human check. |
| `scripts/fetch-prices.ts` | Fetches prices and writes `prices.json`. |
| `scripts/list-ingredients.ts` | Lists the app's ingredient keys and checks the mapping covers them (needs the app repo next to this one). |
| `.github/workflows/prices.yml` | Daily cron + manual run; commits `prices.json` when it changed. |

## prices.json

```ts
{
  version: 1,
  generatedAt: string, // ISO time of the last change
  products: {
    [ingredientKey: string]: { ah?: Product, lidl?: Product },
  },
}

type Product = {
  label: string,
  packSize: number,
  packUnit: 'g' | 'ml' | 'stuks',
  priceCents: number,          // regular price per pack
  stale?: boolean,             // fetching failed; this is the last known entry
  offer?: {
    priceCents?: number,       // offer price per pack (kind 'price' only)
    kind: 'price' | 'multibuy',
    label: string,             // "voor €0,99", "2 voor €5,00", "1 + 1 gratis", "2e halve prijs"
    validFrom: 'YYYY-MM-DD',
    validUntil: 'YYYY-MM-DD',
  },
}
```

The app (`src/lib/prices.ts`) depends on this shape. Don't change it without changing the app.

`generatedAt` only changes when the products change, so the workflow only commits real changes.

## Ingredient keys

Keys are the app's `ingredientKey()` (`src/lib/normalize.ts`) of each parsed ingredient name: lowercase, no accents, singular (`"Rode Uien"` → `rode ui`). Pantry items (`DEFAULT_PANTRY` in `src/lib/pantry.ts`: zout, olie, oregano…) are skipped.

`scripts/list-ingredients.ts` imports the app's own parser, `ingredientKey()` and recipes through a relative path (`../Boodschappenlijstje`), so the keys always match. It covers `src/data/book-recipes.ts` and `src/data/suggestions/*.ts`. After adding recipes to the app:

```sh
npm run check-mapping      # lists keys missing from mapping.json
npm run list-ingredients   # every key with an example line
```

## mapping.json

```json
"avocado": {
  "ah":   { "id": 169797, "label": "AH Avocado per stuk" },
  "lidl": { "id": 11150914, "label": "Avocado per stuk", "pack": { "size": 1, "unit": "stuks" } }
}
```

- `ah.id` is the AH webshop id. The pack size comes from AH (`salesUnitSize`); add `pack` to override it, e.g. wraps sold as "320 g" but used per stuk.
- `lidl.id` is the lidl.nl product id; `pack` is required, because lidl.nl's product page doesn't give a machine-readable pack size.
- Prefer the store's own brand in a normal pack size. The `label` is what the app shows.

## How prices are fetched (spike findings, 2026-11-19)

### Albert Heijn: works, including Bonus

The unofficial mobile API works without an account:

1. `POST https://api.ah.nl/mobile-auth/v1/auth/token/anonymous` with `{"clientId":"appie"}` and headers `User-Agent: Appie/8.22.3`, `x-application: AHWEBSHOP` → `access_token` (valid 7 days).
2. `GET https://api.ah.nl/mobile-services/product/search/v2/products?ids=1&ids=2…` with `Authorization: Bearer <token>` → an array of products (unknown ids are left out). We ask for 30 ids per call.
   Search, for finding ids: `GET …/product/search/v2?query=feta&sortOn=RELEVANCE&size=10&page=0`.
   The old `…/product/detail/v4/fir/<id>` endpoint returns 404.

Fields used: `title`, `salesUnitSize` ("200 g", "1 kg", "per stuk", "6 stuks"), `priceBeforeBonus` (regular price), `currentPrice` (offer price, if any), `isBonus`, `bonusMechanism` ("VOOR 0.99", "2 voor 5.00", "1 + 1 gratis", "2e Halve Prijs"), `bonusStartDate`, `bonusEndDate`, `promotionType`, `discountLabels[].code`.

Offers:

- Only `promotionType: "NATIONAL"` (the weekly Bonus). Skipped: `AHONLINE` (online-only "x% volume voordeel" on multipacks, runs to 2999-12-31), `PERPETUAL` (permanent volume discounts) and personal Bonus.
- `kind: 'price'`: a straight cut (`DISCOUNT_FIXED_PRICE`, percentages, amount off), with `priceCents` = `currentPrice`, or the regular price minus the percentage when `currentPrice` is missing.
- `kind: 'multibuy'`: `DISCOUNT_X_FOR_Y` (2 voor €5), `DISCOUNT_X_PLUS_Y_FREE` (1+1), `DISCOUNT_ONE_HALF_PRICE` (2e halve prijs) and anything else needing more than one item. No `priceCents`.

### Lidl: partly works, no offers

lidl.nl isn't a grocery webshop. It lists part of the food range (fruit and veg, Vemondo, some fresh and frozen products) plus the weekly folder, but not staples like feta, tofu, kikkererwten, komkommer or eggs.

- `https://www.lidl.nl/p/p<id>` (redirects to the full product URL) has a JSON-LD `Product` block with the regular shelf price (`offers[0].price`). Lidl Plus prices aren't in it. **This is what the script uses**, for the 25 mapped products found online.
- `https://www.lidl.nl/q/api/search?assortment=NL&locale=nl_NL&version=2.1.0&q=<term>` works without auth (the `version=v2.0.0` variant gives 401) and is handy for finding ids. `xPayload.keywordResults.num_items_found` says how many of the `items` actually match. The rest are filler.
- Offers are in the folder pages (`/c/aanbiedingen/a10008785`, as `data-grid-data` JSON with `regionsPrices`), but they're mostly non-recipe items, often Lidl Plus only, and they don't link up with the regular range. So **Lidl offers are skipped**.
- Everything else comes from `lidl-manual.json`, which is kept by hand. The first version is estimates; see `mapping-review.md`.

### Failures

- A product that can't be fetched keeps its previous entry with `stale: true`.
- When a live Lidl page fails, the last live price is kept (stale) instead of falling back to the manual estimate.
- When nothing at all can be fetched, the script exits with an error and leaves `prices.json` alone, so the workflow run shows as failed.

## Running locally

```sh
npm install
npm run fetch          # writes prices.json
npm run typecheck
```

Node 22+.
