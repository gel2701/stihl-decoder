# Phase 77E — Affiliate fast-track resultaten

Datum: 2026-11-12T23:34:48.429Z
Batchmodus: CLASSIFY_ONLY · register gewijzigd: nee

## Samenvatting

| Uitkomst | Aantal |
|---|---|
| Automatisch verwerkt | 25 |
| READY_TO_ACTIVATE | 0 |
| Daadwerkelijk geactiveerd | 0 |
| READY maar geblokkeerd door de 100-limiet | 0 |
| NEEDS_EVIDENCE | 22 |
| REJECTED | 2 |
| Al actief (geen actie) | 1 |
| ACTIVE-offers na batch | 99 |

## Geactiveerd

| Onderdeel | Model | Marktplaats | ASIN |
|---|---|---|---|
| — | — | — | — |

## Register en limieten

- Max ACTIVE: 100 (NL 100, DE 50).
- Vóór: 99 ACTIVE-offers (53 NL / 46 DE). Na: 99.
- De limiet is **niet verhoogd**: de bestaande tests eisen `ACTIVE <= 100` en `policy.max_active_offers_allowed <= 100`, dus verhogen zou regressies opleveren. Er is ook geen capaciteitsblokkade opgetreden, omdat geen enkel onderdeel door de bewijspoort kwam; met 99/100 was er bovendien maar één plaats vrij geweest.

## Per prioriteitsmodel: directe links vóór/na

| Model | Catalogusonderdelen | Direct vóór | Direct na | Dekking |
|---|---|---|---|---|
| MS 440 | 277 | 10 | 10 | 3.61% |
| MS 170 | 248 | 17 | 17 | 6.85% |
| BG 86 | 169 | 8 | 8 | 4.73% |
| MS 461 | 263 | 8 | 8 | 3.04% |
| BR 600 | 239 | 2 | 2 | 0.84% |
| MS 390 | 213 | 5 | 5 | 2.35% |
| MS 361 | 278 | 6 | 6 | 2.16% |
| HS 45 | 205 | 6 | 6 | 2.93% |
| MS 250 | 276 | 14 | 14 | 5.07% |

## Uitslag per startonderdeel

| # | Onderdeel | Model | Uitkomst | Reden |
|---|---|---|---|---|
| 1 | 42821410300 | BR 600 | NEEDS_EVIDENCE | Two-Gate passes, but the ASIN identity is not admissible under the repository evidence rules. |
| 2 | 11280292301 | MS 440 | REJECTED | Two-Gate failed on product identity/consistency. |
| 3 | 11281201602 | MS 440 | REJECTED | Two-Gate failed on product identity/consistency. |
| 4 | 11280802104 | MS 440 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 5 | 00004007000 | MS 440 | ALREADY_ACTIVE | Already has 1 direct ACTIVE offer(s). |
| 6 | 11300074101 | MS 170 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 7 | 11300074103 | MS 170 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 8 | 11281903400 | MS 440 | NEEDS_EVIDENCE | Two-Gate passes, but the ASIN identity is not admissible under the repository evidence rules. |
| 9 | 11300802110 | MS 170 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 10 | 42411200606 | BG 86 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 11 | 42411401002 | BG 86 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 12 | 42411402800 | BG 86 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 13 | 42411402803 | BG 86 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 14 | 42411404401 | BG 86 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 15 | 42414051000 | BG 86 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 16 | 11300201207 | MS 170 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 17 | 11201958200 | BG 86 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 18 | 42410802110 | BG 86 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 19 | 42414001320 | BG 86 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 20 | 00001410601 | MS 440 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 21 | 00006421239 | MS 440 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 22 | 11226480403 | MS 440 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 23 | 11256401701 | MS 440 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 24 | 11280071000 | MS 440 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |
| 25 | 11280071001 | MS 440 | NEEDS_EVIDENCE | NO_CANDIDATE: no stored offer for this part in any marketplace. |

## Werkelijke blokkades

1. **Geen kandidaat (20)** — geen enkele opgeslagen aanbieding voor deze onderdelen. Zonder toegestane productbron (Creators API is niet geconfigureerd, geen productfeed) kan hier geen ASIN onderbouwd worden.
2. **Bewijs onvoldoende (2)** — Two-Gate passeert wel, maar de ASIN-identiteit is niet toelaatbaar volgens de bewijsregels (zelfcertificering of alleen een kale fabrikant-URL).
3. **Afgekeurd (2)** — sequentiële GTIN-patronen; die zijn tegenstrijdig met echte productidentiteit.
4. **Capaciteit (0)** — een geverifieerd, toelaatbaar onderdeel past niet meer onder de 100-limiet.

## Kooplinks gecontroleerd

- Nieuw geactiveerd onderdeel `11104007005`: resolver direct = true, NL-tag = true, indexeerbare onderdeelpagina = true, directe knop op onderdeelpagina = true, directe link aanwezig = true.
- Modelpagina BR 600 bevat het geactiveerde onderdeel met directe koopknop = n.v.t..
- Modelpagina MS 440: directe knop = true, zoekknop = true, directe knop boven de eerste zoekfallback = true.
- Fallbackvoorbeeld `42821410300`: geen directe link, wel zoekfallback = true.
- Indexeerbare ACTIVE-onderdelen: 22 van 86. Alleen die hebben een eigen SEO-onderdeelnummerpagina; de rest verschijnt op de modelpagina en in de zoeker.

## Conclusie

Geen enkel onderdeel is geactiveerd: de twee kandidaten die Two-Gate passeert, rusten op hun eigen Amazon-vermelding en een eerdere audit markeerde hun identiteit als onbewezen. Dat is een bewuste weigering, geen technisch falen. De rest is afgewezen (zwakke GTIN) of heeft geen enkele kandidaat.
De grootste resterende blokkade is niet de techniek maar het ontbreken van een toegestane, onafhankelijke productbron voor de 20 onderdelen zonder kandidaat en voor de twee kandidaten met alleen een eigen Amazon-vermelding.
