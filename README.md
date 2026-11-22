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
| `lidl-manual.json` | Lidl prices kept by hand, for ingredients no source has. |
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
- Lidl has either `id` (lidl.nl product id, read live) or `receiptId` (boodschaapje.nl product id, read from the Checkjebon data). `pack` is required for Lidl: neither source gives a reliable pack size.
  Find a `receiptId` by searching `lidl` → `d[].n` in the Checkjebon file, or at `https://boodschaapje.nl/api/search?q=feta` (which also lists pack sizes from Open Food Facts).
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

### Lidl: lidl.nl plus receipt prices, with Lidl Plus offers

lidl.nl isn't a grocery webshop. It lists part of the food range (fruit and veg, Vemondo, some fresh and frozen products) plus the weekly folder, but not staples like feta, tofu, kikkererwten, komkommer or eggs.

- `https://www.lidl.nl/p/p<id>` (redirects to the full product URL) has a JSON-LD `Product` block with the regular shelf price (`offers[0].price`). Lidl Plus prices aren't in it. **This is what the script uses**, for the 25 mapped products found online.
- `https://www.lidl.nl/q/api/search?assortment=NL&locale=nl_NL&version=2.1.0&q=<term>` works without auth (the `version=v2.0.0` variant gives 401) and is handy for finding ids. `xPayload.keywordResults.num_items_found` says how many of the `items` actually match. The rest are filler.
- **Offers (added 2026-11-22).** Product pages carry their full price data in `__NUXT_DATA__` (Nuxt's serialised payload: a flat array of values whose objects point at other entries by index). Under `regionsPrices["1"]` (one region for the whole country) are `currentPrice` and `currentLidlPlusPrice`, each with `price`, `startDate` and `endDate`. The open-ended shelf price ends in 2200; anything ending earlier is a temporary price.
  - The weekly offers page (`/c/aanbiedingen/a10008785`) has the same data per tile in `data-grid-data` (about 60 products, mostly Lidl Plus prices).
  - The script takes the offer from the product page for mapped `id`s. Otherwise it uses the offers page: by `id`, or by an exact name match (plural allowed) with the same pack size. It is deliberately strict: "Bio courgette" is not "courgette", and a 700 g net of avocados is not "avocado per stuk".
  - Lidl Plus prices become `kind: 'price'` with the label "Lidl Plus €1,89". Temporary action prices become "actie €…", and x-for-y texts become `multibuy`. When both apply, the lowest price wins.
  - During an action the shelf price on the page is the action price, so the regular price is taken from the struck-through price, or from yesterday's `prices.json`.
  - Personal Lidl Plus coupons (activated in the app) are not public and are left out.
- **Receipt prices (55 items).** [Checkjebon](https://github.com/supermarkt/checkjebon) (MIT) publishes a daily `data/supermarkets.json` with prices for 12 Dutch supermarkets. Its Lidl part (about 22,000 products, receipt names like "Feta kaas") comes from [boodschaapje.nl](https://boodschaapje.nl), which reads Lidl receipts. The script downloads the file once per run (about 10 MB) and looks up each `receiptId`.
  - **These prices are real, but not fresh.** The Lidl part stopped changing around August 2026: no Lidl price changed between 2026-09-01 and 2026-11-19, while about 2,800 changed between May and November. boodschaapje.nl's own API gives the same numbers, so the source itself has stopped. If it starts updating again, the daily run picks that up without any change here.
  - There is no date per price, and some receipt lines have several ids with different prices (old and new). The mapping picks the plain own-brand line with a known pack size.
- `lidl-manual.json` is the last resort, for ingredients no source has (now only zoete aardappel, an estimate).

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
