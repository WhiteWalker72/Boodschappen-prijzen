# Mapping review

Matches in `mapping.json` and `lidl-manual.json` that need a human check. Everything not listed here is a plain store-brand match in a normal pack size.

Fix a match by changing the id/label in `mapping.json`, then run `npm run fetch`.
- AH ids are the `webshopId` in the AH app, or the number in an ah.nl product URL (`/producten/product/wi<ID>/…`).
- Lidl `id` is the number after `/p` in a lidl.nl product URL.
- Lidl `receiptId` is a boodschaapje.nl product id (search `https://boodschaapje.nl/api/search?q=…`).

## 1. Lidl receipt prices are about 3 months old

55 Lidl prices come from receipt data (Checkjebon / boodschaapje.nl). They are real Lidl prices, but that source stopped updating around August 2026 (see README). Lidl prices move slowly, so they should be close. If something looks off in a store, either:
- set a better `receiptId` in `mapping.json`, or
- remove the Lidl entry and add the price to `lidl-manual.json`.

Receipt matches with a guessed pack size or product:

| Ingredient | Lidl receipt line | Question |
| --- | --- | --- |
| ei | Kipster scharreleieren €1,89 (6605422) | Assumed 6 eggs. |
| knoflooksaus | Knoflooksaus €0,98 (6606800) | Size unknown; assumed 300 ml. |
| rode linze | Rode linzen €1,49 (6614328) | Size unknown; assumed 500 g. |
| orzo | Orzo €1,49 (6612193) | Size unknown; assumed 500 g. |
| wrap | Tortilla wraps XXL 740 g (42917) | Assumed 8 wraps. |
| grote pitabroodje | Pitabroodjes XXL 800 g (6602046) | Assumed 4 per pack. |
| naanbroden | Naanbrood 260 g (5200375) | Assumed 2 per pack. |
| zwarte boon | Zwarte bonen €0,90 (178285) | Listed as 240 g (drained weight); treated as a 400 g can. |
| broccoli | Broccoliroosjes 400 g (6604598) | No whole broccoli in the data. |
| bulgur | Bio couscous-bulgur 500 g (126325) | A couscous/bulgur mix. |
| gochujang | Gochujang saus (8127763) | A sauce, not the paste. |
| sriracha, koriander | €1,99 sauce, €0,99 bunch | Counted as one pack/bunch. |

## 2. Lidl estimate left: zoete aardappel

Only fresh sweet potato has no source. `lidl-manual.json` has an estimate of €2,29/kg (`"checked": null`). Please check it.

## 3. No Lidl price at all (9)

garam masala, mango chutney, paneer, ras el hanout, sesamzaad, tacokruiden, tandoori kruiden, tikka masala kruiden, za'atar

None of these is in the receipt data or on lidl.nl as a plain product. Add an entry to `lidl-manual.json` if Lidl has it.
The app now treats the spice mixes and sesamzaad as voorraadkast, and prices paneer and mango chutney at AH for the Lidl total ("bij AH").


## 4. Live lidl.nl matches to check

| Ingredient | Lidl product | Question |
| --- | --- | --- |
| cherrytomaat | Rode snacktomaten 500 g (11029802) | No cherry tomatoes on lidl.nl; snack tomatoes are the closest. |
| paprika | Paprikamix 500 g (11151119) | Counted as 3 paprika's per pack. |
| lente-ui | Lente ui per bosje (11151058) | Counted as 6 uitjes per bosje. |
| basilicum, peterselie | Bio … in pot | Only potted herbs online; cut herbs may be cheaper. |
| citroen | Bio citroen per stuk (11214544) | The regular net of lemons has no price online. |
| rode ui | Uien rood 750 g (11151216) | |
| tomaat | Trostomaten 1 kg (11151101) | A recipe with 2 tomatoes is priced as a whole kilo. |
| wortel | Waspeen 500 g (11151141) | |
| tempeh | Vemondo Plantaardige tempehblokjes 180 g (11561840) | Possibly marinated rather than plain tempeh. |
| vegetarische balletjes | Vemondo Vega balletjes 384 g (11560292) | |

## 5. AH matches to check

| Ingredient | AH product | Question |
| --- | --- | --- |
| bloemkool | AH Biologisch Bloemkool per stuk (186629) | A regular whole cauliflower is not in the AH app search; bio is €2,99. |
| broccoli | AH Broccoli 400 g (395954) | Fine for "200 g broccoli"; "1 broccoli" is also priced as this pack. |
| rodekool | AH Biologisch Rode kool per stuk (160648) | The recipe wants 200 g shredded; a whole head is a lot. |
| bulgur | AH Biologisch Volkoren bulgur 400 g (525390) | Only bio wholegrain found. |
| griekse yoghurt | AH Yoghurt Griekse stijl 5% 500 g (177509) | Or the 10% (419839). |
| groene pesto | AH Groene pesto 190 g (170655) | €1,13 looks low for 190 g; check it is the right product. |
| groentebouillon | AH Bouillon groente 120 g (492034) | Tablets; recipes use 100–150 ml, priced as one pack. |
| mozzarella | AH Mozzarella (506235) | The API says 200 g for €0,85; a bol is usually 125 g. |
| kokosmelk | AH Kokosmelk 200 ml (161932) | A 400 ml recipe needs 2 packs (€2,54); the 500 ml pack is €2,75. |
| mayonaise | AH Mayonaise zacht en romig 170 ml (425942) | Small squeeze bottle; fine for 2 el. |
| grote pitabroodje | AH Witte pita's 5 stuks (221857) | Are these the "grote" ones? |
| naanbroden | AH Naanbrood 240 g (498341) | Counted as 2 naans per pack. |
| wrap | AH Tortilla wraps naturel medium (136836) | Counted as 8 wraps per pack. |
| lente-ui | AH Bosui per bosje (169813) | Counted as 6 uitjes per bosje. |
| tikka masala kruiden | AH Tikka masala kruidenpasta 90 g (592102) | Paste, not dry spice mix. |
| tomatensalsa | AH Salsa mild 300 g (31473) | Dip salsa in a jar. |
| vegetarische gyros | Vivera Plantaardige gyros 175 g (460410) | No AH-brand gyros; a 300 g recipe needs 2 packs. |
| garam masala, ras el hanout, tandoori kruiden, za'atar | Verstegen jars | No AH-brand version; Verstegen is pricey (€3–3,50). |
| gochujang, harissa, mango chutney, sriracha, paneer | Sempio, Souq, Patak's, Go-Tan, Param | No AH-brand version. |
