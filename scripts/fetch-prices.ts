/**
 * Writes prices.json: today's price per mapped ingredient at Albert Heijn and Lidl.
 *
 *   npm run fetch
 *
 * - AH: unofficial mobile API (anonymous token), all products in a few batch calls.
 *   National Bonus offers are included; online-only, volume and personal offers are not.
 * - Lidl: the product page on lidl.nl for mapped `id`s (regular price from its JSON-LD), else the
 *   receipt price for `receiptId` from the Checkjebon data set, else the hand-kept lidl-manual.json.
 *   Offers (Lidl Plus prices and temporary action prices) come from the product page data for mapped
 *   `id`s, and from the weekly offers page for products it lists by id or by exact name.
 *   Personal Lidl Plus coupons are not public and are left out.
 * - A product that fails keeps its previous entry with `stale: true`.
 *
 * The output shape is read by the Boodschappenlijstje app (src/lib/prices.ts); do not change it.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type PackUnit = 'g' | 'ml' | 'stuks';
type Offer = {
  priceCents?: number;
  kind: 'price' | 'multibuy';
  label: string;
  validFrom: string;
  validUntil: string;
};
type Product = {
  label: string;
  packSize: number;
  packUnit: PackUnit;
  priceCents: number;
  stale?: boolean;
  offer?: Offer;
};
type Store = 'ah' | 'lidl';
type PriceData = {
  version: 1;
  generatedAt: string;
  products: Record<string, Partial<Record<Store, Product>>>;
};

type Pack = { size: number; unit: PackUnit };
type MappedProduct = { id: number; label: string; pack?: Pack };
/** Lidl: `id` = lidl.nl product id (live page), `receiptId` = boodschaapje.nl id in the Checkjebon data. */
type MappedLidl = { id?: number; receiptId?: string; label: string; pack: Pack };
type Mapping = Record<string, { ah?: MappedProduct; lidl?: MappedLidl }>;

/** Daily Dutch supermarket prices (MIT); its Lidl part comes from receipts via boodschaapje.nl. */
const CHECKJEBON_URL = 'https://raw.githubusercontent.com/supermarkt/checkjebon/main/data/supermarkets.json';
type ManualProduct = Omit<Product, 'stale' | 'offer'> & { checked: string | null };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'prices.json');

const AH_HEADERS = {
  'User-Agent': 'Appie/8.22.3',
  'x-application': 'AHWEBSHOP',
  'Content-Type': 'application/json',
  Accept: 'application/json',
};
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// ---------------------------------------------------------------- helpers

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1000 * (i + 1));
  }
  throw lastError;
}

const cents = (euros: number) => Math.round(euros * 100);

/** Local date in the Netherlands as YYYY-MM-DD. */
function todayNl(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());
}

/** "200 g" / "1 kg" / "0,5 l" / "15 x 10 g" / "per stuk" / "6 stuks" -> pack. */
export function parsePack(text: string | null | undefined): Pack | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(',', '.').trim();
  if (/^per (stuk|bos|bosje|krop|bol)$/.test(t)) return { size: 1, unit: 'stuks' };
  const stuks = t.match(/^(\d+)\s*(stuks?|st\.?|stk\.?)$/);
  if (stuks) return { size: Number(stuks[1]), unit: 'stuks' };
  const multi = t.match(/^(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(g|gr|gram|kg|ml|cl|l|liter)$/);
  if (multi) {
    const one = parsePack(`${multi[2]} ${multi[3]}`);
    return one && { size: Number(multi[1]) * one.size, unit: one.unit };
  }
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(g|gr|gram|kg|ml|cl|l|liter)$/);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'kg':
      return { size: Math.round(n * 1000), unit: 'g' };
    case 'l':
    case 'liter':
      return { size: Math.round(n * 1000), unit: 'ml' };
    case 'cl':
      return { size: Math.round(n * 10), unit: 'ml' };
    case 'ml':
      return { size: Math.round(n), unit: 'ml' };
    default:
      return { size: Math.round(n), unit: 'g' };
  }
}

// ---------------------------------------------------------------- Albert Heijn

type AhDiscountLabel = { code?: string; defaultDescription?: string; count?: number | null; percentage?: number | null };
type AhProduct = {
  webshopId: number;
  title: string;
  salesUnitSize?: string;
  priceBeforeBonus?: number | null;
  currentPrice?: number | null;
  isBonus?: boolean;
  bonusMechanism?: string | null;
  bonusStartDate?: string | null;
  bonusEndDate?: string | null;
  promotionType?: string | null;
  discountLabels?: AhDiscountLabel[] | null;
};

async function ahToken(): Promise<string> {
  const res = await fetchRetry('https://api.ah.nl/mobile-auth/v1/auth/token/anonymous', {
    method: 'POST',
    headers: AH_HEADERS,
    body: JSON.stringify({ clientId: 'appie' }),
  });
  if (!res.ok) throw new Error(`AH token: HTTP ${res.status}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('AH token: no access_token');
  return body.access_token;
}

/** Fetches AH products by webshop id. Ids AH doesn't know are simply absent from the result. */
async function ahProducts(ids: number[]): Promise<Map<number, AhProduct>> {
  const token = await ahToken();
  const found = new Map<number, AhProduct>();
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const query = chunk.map((id) => `ids=${id}`).join('&');
    try {
      const res = await fetchRetry(`https://api.ah.nl/mobile-services/product/search/v2/products?${query}`, {
        headers: { ...AH_HEADERS, Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = (await res.json()) as AhProduct[];
      for (const p of list) found.set(p.webshopId, p);
    } catch (error) {
      console.warn(`AH batch ${i / 30 + 1} failed:`, error);
    }
  }
  return found;
}

/** "2 voor 5.00" -> "2 voor €5,00"; "VOOR 0.99" -> "voor €0,99"; "2e Halve Prijs" -> "2e halve prijs". */
function ahOfferLabel(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ').toLowerCase();
  return t.replace(/(€\s*)?(\d+)\.(\d{2})\b/g, (_m, _e, a, b) => `€${a},${b}`);
}

const MULTIBUY_CODE = /X_FOR_Y|X_PLUS_Y|HALF|SECOND|BUNDLE|STAPEL/;

export function ahOffer(p: AhProduct, today: string): Offer | undefined {
  // NATIONAL = the weekly Bonus for everyone. AHONLINE (online-only), PERPETUAL
  // (volume discounts) and personal Bonus are left out.
  if (!p.isBonus || p.promotionType !== 'NATIONAL') return undefined;
  const validFrom = p.bonusStartDate;
  const validUntil = p.bonusEndDate;
  if (!validFrom || !validUntil || validUntil < today) return undefined;
  const labels = p.discountLabels ?? [];
  const text = p.bonusMechanism || labels[0]?.defaultDescription;
  if (!text) return undefined;
  const label = ahOfferLabel(text);
  const regular = p.priceBeforeBonus ?? null;
  const multibuy = labels.some((l) => MULTIBUY_CODE.test(l.code ?? '') || (l.count ?? 0) > 1);
  if (!multibuy && regular) {
    let price = p.currentPrice ?? null;
    const pct = labels.find((l) => l.percentage)?.percentage;
    if (price === null && pct) price = regular * (1 - pct / 100);
    if (price !== null && price < regular) {
      return { priceCents: cents(price), kind: 'price', label, validFrom, validUntil };
    }
  }
  return { kind: 'multibuy', label, validFrom, validUntil };
}

function ahToProduct(p: AhProduct, mapped: MappedProduct, today: string): Product | null {
  const euros = p.priceBeforeBonus ?? p.currentPrice;
  const pack = mapped.pack ?? parsePack(p.salesUnitSize);
  if (!euros || euros <= 0 || !pack) {
    console.warn(`AH ${mapped.id} (${mapped.label}): unusable price or pack size "${p.salesUnitSize}"`);
    return null;
  }
  const offer = ahOffer(p, today);
  return {
    label: mapped.label,
    packSize: pack.size,
    packUnit: pack.unit,
    priceCents: cents(euros),
    ...(offer ? { offer } : {}),
  };
}

// ---------------------------------------------------------------- Lidl

const LIDL_HEADERS = { 'User-Agent': BROWSER_UA, 'Accept-Language': 'nl-NL,nl;q=0.9' };
const LIDL_OFFERS_URL = 'https://www.lidl.nl/c/aanbiedingen/a10008785';

/** A Lidl price block as it appears in the page data (`regionsPrices["1"]`). */
type LidlPriceBlock = {
  price?: number;
  startDate?: string;
  endDate?: string;
  discount?: { deletedPrice?: number | null; discountText?: string | null } | null;
  packaging?: { text?: string } | null;
};
type LidlRegionPrices = {
  currentPrice?: LidlPriceBlock | null;
  currentLidlPlusPrice?: { price?: LidlPriceBlock | null; highlightText?: string | null } | null;
};
export type LidlOfferInfo = { productId: number; title: string; packaging: string | null; prices: LidlRegionPrices };

/**
 * Resolves Nuxt's serialised page data (`__NUXT_DATA__`): a flat array where
 * objects and arrays hold indices into that array.
 */
export function resolveNuxtData(flat: unknown[]): unknown {
  const seen = new Map<number, unknown>();
  const resolve = (index: number): unknown => {
    if (index < 0) return undefined;
    if (seen.has(index)) return seen.get(index);
    const value = flat[index];
    if (Array.isArray(value)) {
      // ["Reactive", i], ["ShallowReactive", i], ["Ref", i], … wrap a single value.
      if (typeof value[0] === 'string' && value.length === 2 && typeof value[1] === 'number') {
        const inner = resolve(value[1]);
        seen.set(index, inner);
        return inner;
      }
      const out: unknown[] = [];
      seen.set(index, out);
      for (const i of value) out.push(typeof i === 'number' ? resolve(i) : i);
      return out;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      seen.set(index, out);
      for (const [k, i] of Object.entries(value)) out[k] = typeof i === 'number' ? resolve(i) : i;
      return out;
    }
    seen.set(index, value);
    return value;
  };
  return resolve(0);
}

/** Finds the first object with a `regionsPrices` map (the product) anywhere in the page data. */
function findProduct(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== 'object' || depth > 40) return null;
  if (!Array.isArray(node) && 'regionsPrices' in node && 'productId' in node) return node as Record<string, unknown>;
  for (const child of Object.values(node)) {
    const found = findProduct(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function toOfferInfo(product: Record<string, unknown>): LidlOfferInfo | null {
  const regions = product.regionsPrices as Record<string, LidlRegionPrices> | undefined;
  const prices = regions?.['1'] ?? (regions ? Object.values(regions)[0] : undefined);
  const productId = Number(product.productId);
  if (!prices || !productId) return null;
  const price = product.price as { packaging?: { text?: string } } | undefined;
  return {
    productId,
    title: String(product.title ?? product.fullTitle ?? ''),
    packaging: prices.currentPrice?.packaging?.text ?? price?.packaging?.text ?? null,
    prices,
  };
}

/** Regular shelf price (JSON-LD) and the page's price data from a lidl.nl product page. */
async function lidlPage(id: number): Promise<{ price: number; info: LidlOfferInfo | null }> {
  const res = await fetchRetry(`https://www.lidl.nl/p/p${id}`, { headers: LIDL_HEADERS, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  let info: LidlOfferInfo | null = null;
  const nuxt = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nuxt) {
    try {
      const product = findProduct(resolveNuxtData(JSON.parse(nuxt[1]) as unknown[]));
      info = product ? toOfferInfo(product) : null;
    } catch (error) {
      console.warn(`Lidl ${id}: page data not readable:`, error instanceof Error ? error.message : error);
    }
  }

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]) as { '@type'?: string; sku?: string; offers?: { price?: number }[] };
      if (data['@type'] !== 'Product') continue;
      if (data.sku && data.sku !== String(id)) continue;
      const price = Number(data.offers?.[0]?.price);
      if (price > 0) return { price, info };
    } catch {
      // not JSON we understand; try the next block
    }
  }
  throw new Error('no price on page');
}

/** Every product on the weekly offers page, with its price data. */
async function lidlOffersPage(): Promise<LidlOfferInfo[]> {
  const res = await fetchRetry(LIDL_OFFERS_URL, { headers: LIDL_HEADERS, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const out: LidlOfferInfo[] = [];
  for (const m of html.matchAll(/data-grid-data="([^"]*)"/g)) {
    try {
      const info = toOfferInfo(JSON.parse(decodeHtml(m[1])) as Record<string, unknown>);
      if (info) out.push(info);
    } catch {
      // skip tiles we can't read
    }
  }
  return out;
}

function decodeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/** ISO time -> Dutch date (YYYY-MM-DD). */
function nlDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date(iso));
}

const euro = (value: number) => `€${value.toFixed(2).replace('.', ',')}`;
const MULTIBUY_TEXT = /\d\s*\+\s*\d|\d+\s*voor|2e|tweede|halve prijs/i;

/** A price block that only runs for a while (not the open-ended shelf price, which ends in 2200). */
function running(block: LidlPriceBlock | null | undefined, today: string): { from: string; until: string } | null {
  if (!block?.startDate || !block.endDate) return null;
  const until = nlDate(block.endDate);
  if (until > '2100-01-01' || until < today) return null;
  return { from: nlDate(block.startDate), until };
}

/**
 * The best offer running today for one Lidl product: a Lidl Plus price or a
 * temporary action price, whichever is lower. `regularCents` is the normal shelf price.
 */
export function lidlOffer(prices: LidlRegionPrices, regularCents: number, today: string): Offer | undefined {
  const candidates: Offer[] = [];

  const plus = prices.currentLidlPlusPrice;
  const plusDates = running(plus?.price, today);
  if (plus?.price?.price && plusDates) {
    const text = plus.highlightText ?? plus.price.discount?.discountText ?? '';
    if (MULTIBUY_TEXT.test(text)) {
      candidates.push({ kind: 'multibuy', label: `Lidl Plus ${text.trim()}`, validFrom: plusDates.from, validUntil: plusDates.until });
    } else if (cents(plus.price.price) < regularCents) {
      candidates.push({
        priceCents: cents(plus.price.price),
        kind: 'price',
        label: `Lidl Plus ${euro(plus.price.price)}`,
        validFrom: plusDates.from,
        validUntil: plusDates.until,
      });
    }
  }

  const action = prices.currentPrice;
  const actionDates = running(action, today);
  if (action?.price && actionDates) {
    const text = action.discount?.discountText ?? '';
    if (MULTIBUY_TEXT.test(text)) {
      candidates.push({ kind: 'multibuy', label: text.trim(), validFrom: actionDates.from, validUntil: actionDates.until });
    } else if (cents(action.price) < regularCents) {
      candidates.push({
        priceCents: cents(action.price),
        kind: 'price',
        label: `actie ${euro(action.price)}`,
        validFrom: actionDates.from,
        validUntil: actionDates.until,
      });
    }
  }

  const priced = candidates.filter((c) => c.kind === 'price').sort((a, b) => a.priceCents! - b.priceCents!);
  return priced[0] ?? candidates[0];
}

/** Exact name match, allowing a plural: "Citroenen" = "citroen", "Rode uien" = "rode ui". */
export function sameName(a: string, b: string): boolean {
  const norm = (t: string) =>
    t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const forms = (t: string) => {
    const n = norm(t);
    return new Set([n, n.replace(/uien$/, 'ui'), n.replace(/eren$/, ''), n.replace(/(en|s)$/, '')]);
  };
  const fa = forms(a);
  return [...forms(b)].some((f) => f.length > 2 && fa.has(f));
}

/** Lidl prices from Checkjebon, by boodschaapje.nl product id. */
async function checkjebonLidl(): Promise<Map<string, number>> {
  const res = await fetchRetry(CHECKJEBON_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const stores = (await res.json()) as { n: string; d: { l: string; p: number }[] }[];
  const lidl = stores.find((s) => s.n === 'lidl');
  if (!lidl) throw new Error('no Lidl in Checkjebon data');
  // Prices of a few cents are placeholders (bags, deposits), not products.
  return new Map(lidl.d.filter((p) => p.p >= 0.1).map((p) => [String(p.l), p.p]));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------- main

function stale(previous: Product | undefined): Product | undefined {
  return previous ? { ...previous, stale: true } : undefined;
}

async function main() {
  const mapping = await readJson<Mapping>(join(ROOT, 'mapping.json'));
  if (!mapping) throw new Error('mapping.json missing or invalid');
  const manual = (await readJson<{ products: Record<string, ManualProduct> }>(join(ROOT, 'lidl-manual.json')))?.products ?? {};
  const previous = await readJson<PriceData>(OUT);
  const today = todayNl();
  const keys = Object.keys(mapping).sort((a, b) => a.localeCompare(b));

  // AH
  const ahIds = [...new Set(keys.flatMap((k) => (mapping[k].ah ? [mapping[k].ah!.id] : [])))];
  let ahFound = new Map<number, AhProduct>();
  try {
    ahFound = await ahProducts(ahIds);
  } catch (error) {
    console.warn('AH failed completely:', error);
  }

  // Lidl (live pages)
  const lidlIds = [...new Set(keys.flatMap((k) => (mapping[k].lidl?.id ? [mapping[k].lidl!.id!] : [])))];
  const lidlFound = new Map<number, { price: number; info: LidlOfferInfo | null }>();
  await mapLimit(lidlIds, 4, async (id) => {
    try {
      lidlFound.set(id, await lidlPage(id));
    } catch (error) {
      console.warn(`Lidl ${id} failed:`, error instanceof Error ? error.message : error);
    }
  });

  // Lidl (weekly offers page: Lidl Plus and action prices)
  let lidlWeekly: LidlOfferInfo[] = [];
  try {
    lidlWeekly = await lidlOffersPage();
  } catch (error) {
    console.warn('Lidl offers page failed:', error instanceof Error ? error.message : error);
  }
  const weeklyById = new Map(lidlWeekly.map((o) => [o.productId, o]));

  // Lidl (receipt prices)
  let receipts = new Map<string, number>();
  if (keys.some((k) => mapping[k].lidl?.receiptId)) {
    try {
      receipts = await checkjebonLidl();
    } catch (error) {
      console.warn('Checkjebon failed:', error instanceof Error ? error.message : error);
    }
  }

  const products: PriceData['products'] = {};
  const counts = { ahFresh: 0, ahStale: 0, ahMissing: 0, lidlLive: 0, lidlReceipt: 0, lidlManual: 0, lidlStale: 0, ahOffers: 0, lidlOffers: 0 };

  for (const key of keys) {
    const entry: Partial<Record<Store, Product>> = {};
    const prev = previous?.products?.[key];

    const ah = mapping[key].ah;
    if (ah) {
      const raw = ahFound.get(ah.id);
      const product = raw ? ahToProduct(raw, ah, today) : null;
      if (product) {
        entry.ah = product;
        counts.ahFresh++;
        if (product.offer) counts.ahOffers++;
      } else {
        const old = stale(prev?.ah);
        if (old) {
          entry.ah = old;
          counts.ahStale++;
        } else counts.ahMissing++;
        console.warn(`AH ${ah.id} for "${key}" not found${old ? ' (kept as stale)' : ''}`);
      }
    }

    const lidl = mapping[key].lidl;
    const livePrice = lidl?.id ? lidlFound.get(lidl.id) : undefined;
    const receiptPrice = lidl?.receiptId ? receipts.get(lidl.receiptId) : undefined;
    const price = livePrice ?? (receiptPrice ? { price: receiptPrice, info: null } : undefined);
    if (lidl && price) {
      entry.lidl = { label: lidl.label, packSize: lidl.pack.size, packUnit: lidl.pack.unit, priceCents: cents(price.price) };
      if (livePrice) counts.lidlLive++;
      else counts.lidlReceipt++;

      // Offer: from the product page, else the offers page by id, else by exact name and same pack.
      const info =
        livePrice?.info ??
        (lidl.id ? weeklyById.get(lidl.id) : undefined) ??
        lidlWeekly.find((o) => {
          if (!sameName(o.title, key) && !sameName(o.title, lidl.label)) return false;
          const pack = parsePack(o.packaging);
          return pack !== null && pack.unit === lidl.pack.unit && pack.size === lidl.pack.size;
        });
      if (info) {
        // During an action the shelf price on the page is the action price; use the struck-through
        // or previous regular price instead.
        const action = info.prices.currentPrice;
        const deleted = action?.discount?.deletedPrice;
        if (running(action, today) && action?.price && cents(action.price) >= entry.lidl.priceCents) {
          const regular = deleted ? cents(deleted) : prev?.lidl && !prev.lidl.stale ? prev.lidl.priceCents : 0;
          if (regular > entry.lidl.priceCents) entry.lidl.priceCents = regular;
        }
        const offer = lidlOffer(info.prices, entry.lidl.priceCents, today);
        if (offer) {
          entry.lidl.offer = offer;
          counts.lidlOffers++;
          const how = livePrice?.info ? 'page' : lidl.id && weeklyById.has(lidl.id) ? 'offers page, id' : `offers page, name "${info.title}"`;
          console.log(`Lidl offer for "${key}": ${offer.label} t/m ${offer.validUntil} (${how})`);
        }
      }
    } else if (lidl && prev?.lidl && prev.lidl.label === lidl.label) {
      // Fetching failed: keep the last price rather than fall back to an estimate.
      entry.lidl = stale(prev.lidl);
      counts.lidlStale++;
    } else if (manual[key]) {
      const { label, packSize, packUnit, priceCents } = manual[key];
      entry.lidl = { label, packSize, packUnit, priceCents };
      counts.lidlManual++;
    }

    if (entry.ah || entry.lidl) products[key] = entry;
  }

  console.log(
    `AH: ${counts.ahFresh} fresh (${counts.ahOffers} with an offer), ${counts.ahStale} stale, ${counts.ahMissing} missing. ` +
      `Lidl: ${counts.lidlLive} live, ${counts.lidlReceipt} from receipts, ${counts.lidlManual} manual, ${counts.lidlStale} stale, ${counts.lidlOffers} with an offer ` +
      `(${lidlWeekly.length} products on the offers page).`,
  );

  if (counts.ahFresh === 0 && counts.lidlLive === 0) {
    console.error('Nothing could be fetched; leaving prices.json as it is.');
    process.exit(1);
  }

  // Keep generatedAt when nothing changed, so the workflow only commits real changes.
  const unchanged = previous && JSON.stringify(previous.products) === JSON.stringify(products);
  const data: PriceData = {
    version: 1,
    generatedAt: unchanged ? previous.generatedAt : new Date().toISOString(),
    products,
  };
  await writeFile(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log(unchanged ? 'prices.json unchanged.' : `Wrote ${Object.keys(products).length} ingredients to prices.json.`);
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) main().catch((error) => {
  console.error(error);
  process.exit(1);
});
