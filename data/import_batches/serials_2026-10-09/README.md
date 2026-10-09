# STIHLDecoder — MY STIHL extract 2026-10-09 (Batch 3)

## Kerncijfers
- Bronbestand: `stihl_resultaten_backup_1.csv`
- Brongrootte: 8377145 bytes
- Bron SHA256: `0987022cf96f48d392c348dcef5c5682a0177db69055ba3e4b7552d07bf3579b`
- Totaal bronregels (inclusief header): 11525
- Totaal dataregels met serienummer: 6822
- Unieke inputserienummers in batch: 6820
- Exact succesvol geparseerde positieve observaties: 6031
- Nieuwe unieke officiële anchors toegevoegd: 6029
- Bestaande anchors opnieuw bevestigd: 2
- Totaal unieke officiële anchors in productie na import: 8874
- Recheck queue (time-outs, fouten, missing identity): 789
  - Technische time-outs: 736
  - Technische fouten: 34
  - Gevonden zonder parsebare productidentity: 19
- Duplicate bronregels: 4
- Identity conflicts: 0

## Nieuwe anchors per categorie (Batch 3: 6029)
- Kettingzaag: 2566
- Bosmaaier: 1802
- Doorslijper: 738
- Heggenschaar: 334
- Zuighakselaar: 272
- Hoogsnoeier: 196
- Bladblazer: 73
- Grondboren: 48

## Nieuwe anchors per aandrijving (Batch 3: 6029)
- Benzine: 5821
- Elektrisch: 208

## Cumulatief totaal per categorie (8874 anchors)
- Kettingzaag: 4352
- Bosmaaier: 2166
- Doorslijper: 790
- Heggenschaar: 570
- Zuighakselaar: 288
- Algemeen gemotoriseerd: 260
- Hoogsnoeier: 198
- Grondboren: 146
- Bladblazer: 86
- Onbekend: 8
- Toebehoren: 5
- Combimotor: 5

## Cumulatief totaal per aandrijving (8874 anchors)
- Benzine: 8642
- Elektrisch: 224
- Onbekend: 8

## Veiligheids- & Integriteitsregels
- Alleen exacte officiële MY STIHL-resultaten zijn als anchor opgenomen.
- Er zijn geen serienummerreeksen (ranges) afgeleid uit opeenvolgende observaties.
- Time-outs, netwerkfouten en records zonder identiteit zijn geplaatst in de recheck queue en NIET als NOT_FOUND/negatieve evidence.
- Positief bewijs heeft absolute voorrang boven technische fouten.
- Bestaande geverifieerde ankers blijven onaangetast bij latere technische time-outs.
- 100% JSON en SQLite data-pariteit gegarandeerd.
