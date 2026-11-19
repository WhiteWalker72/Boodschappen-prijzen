# Mapping review

Matches in `mapping.json` and `lidl-manual.json` that need a human check. Everything not listed here is a plain store-brand match in a normal pack size.

Fix a match by changing the id/label in `mapping.json` (AH ids come from the `webshopId` in the AH app or the number in an ah.nl product URL, `/producten/product/wi<ID>/…`; Lidl ids are the number after `/p` in a lidl.nl product URL). Then run `npm run fetch`.

## 1. Lidl manual prices are estimates (most important)

lidl.nl lists only part of the food range online, so 42 Lidl prices come from `lidl-manual.json`. **They are my estimates, not prices I saw.** Each has `"checked": null`. Please check them in a store or the Lidl app and set `checked` to the date:

aardappelkroketjes, broccoli, courgette, creme fraiche, ei, falafelballetjes, feta, gepelde tomaat, geraspte cheddar, geraspte mozzarella, geraspte oude kaas, gnocchi, granaatappel, griekse yoghurt, groene pesto, groentebouillon, halloumi, hummus, kikkererwt, knoflooksaus, kokosmelk, komkommer, linze, mais, mayonaise, mozzarella, passata, rijst, rode linze, roerbakgroenten, rucola, sambal, snelkookrijst, tofu, tzatziki, ui, vastkokende aardappel, witte boon, wrap, zoete aardappel, zure room, zwarte boon

The product names (Milbona, Freshona, Golden Sun, Baresa, Kania, Vemondo, Vitasia…) and pack sizes are also guesses at the usual Lidl own-brand product.

## 2. No Lidl price at all (23)

Not on lidl.nl and either not in the regular Lidl range or not something I could estimate. Add an entry to `lidl-manual.json` if Lidl has it:

bulgur, diepvries edamame, garam masala, gochujang, grote pitabroodje, harissa, koriander, mango chutney, naanbroden, orzo, paneer, ras el hanout, sesamzaad, sriracha, sushirijst, tacokruiden, tandoori kruiden, teriyakisaus, tikka masala kruiden, tomatensalsa, vegetarische gyros, verse munt, za'atar

Note: the app only names a cheaper store when both stores have the same number of items priced, so every missing Lidl item hides the comparison for recipes that use it.

## 3. Live Lidl matches to check

| Ingredient | Lidl product | Question |
| --- | --- | --- |
| cherrytomaat | Rode snacktomaten 500 g (11029802) | No cherry tomatoes on lidl.nl; snack tomatoes are the closest. |
| paprika | Paprikamix 500 g (11151119) | Counted as 3 paprika's per pack. |
| pitabroodje | Tastino Pitabroodjes 400 g (11317685) | Counted as 6 broodjes per pack; how many are in it? |
| lente-ui | Lente ui per bosje (11151058) | Counted as 6 uitjes per bosje. |
| basilicum, peterselie | Bio … in pot | Only potted herbs online; cut herbs may be cheaper. |
| citroen | Bio citroen per stuk (11214544) | The regular net of lemons has no price online. |
| rode ui | Uien rood 750 g (11151216) | |
| tomaat | Trostomaten 1 kg (11151101) | A recipe with 2 tomatoes is priced as a whole kilo. |
| wortel | Waspeen 500 g (11151141) | |
| tempeh | Vemondo Plantaardige tempehblokjes 180 g (11561840) | Possibly marinated rather than plain tempeh. |
| vegetarische balletjes | Vemondo Vega balletjes 384 g (11560292) | |

## 4. AH matches to check

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
