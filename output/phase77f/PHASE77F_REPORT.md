# Phase 77F (final) — ASIN-identiteitsherstel

Datum: 2026-11-13T00:41:09.651Z
Modus: APPLY

## 1. Uitkomst

| Metric | Waarde |
|---|---|
| Werkelijk nieuwe ACTIVE-links | **0** |
| Kandidaten naar NEEDS_EVIDENCE | 2 |
| Totaal ACTIVE-aanbiedingen | 99 (NL 53 · DE 46) |
| Capaciteitsplafond | totaal 110 · NL 110 · DE 50 |

## 2. Bewijs per ASIN

### 42821410300 → B079DM989K

- Opgeslagen GTIN: `0886661160136`
- Bewijsbronnen: AMAZON_PRODUCT_PAGE https://www.amazon.nl/dp/B079DM989K
- Onafhankelijke bronnen: 0 · daarvan noemen de ASIN: 0
- OEM/variant/bundel: GENUINE_STIHL · quantity 1 · multipack false → single piece, geen bundel of multiverpakking in titel/verpakking
- Two-Gate na herbeoordeling: FAIL — ASIN_IDENTITY_UNVERIFIED: ASIN B079DM989K lacks external machine-verifiable proof linking it to physical product.; Missing verifiable Amazon product listing URL or proof.
- Verdict: **NEEDS_EVIDENCE**
- Toelichting: STIHL-documentatie en distributeurs (DIY Spare Parts, L&S, OakTen) bevestigen 4282 141 0300 en BR 500/550/600/700, maar noemen de ASIN niet.

### 11281903400 → B079DNL88M

- Opgeslagen GTIN: `0795711104948` · extern opgegeven GTIN: `795711121587` (wijkt af)
- Bewijsbronnen: AMAZON_PRODUCT_PAGE https://www.amazon.nl/dp/B079DNL88M
- Onafhankelijke bronnen: 0 · daarvan noemen de ASIN: 0
- OEM/variant/bundel: GENUINE_STIHL · quantity 1 · multipack false → single piece, geen bundel of multiverpakking in titel/verpakking
- Two-Gate na herbeoordeling: FAIL — ASIN_IDENTITY_UNVERIFIED: ASIN B079DNL88M lacks external machine-verifiable proof linking it to physical product.; Missing verifiable Amazon product listing URL or proof.
- Verdict: **NEEDS_EVIDENCE**
- Toelichting: Techniekwebshop bevestigt EAN 795711121587 voor 1128 190 3400; deze bron noemt de ASIN niet en wijkt af van de opgeslagen GTIN.


## 3. Bronzoektocht (geen fictieve verificatie)

- web_search index — "B079DM989K" / "B079DNL88M" / 795711121587 → NO_ASIN_CITING_PAGE
- amazon.nl/dp/<ASIN> — directe productpagina → HTTP 200 maar Captcha-pagina (geen productinhoud)
- lite/html.duckduckgo.com — beide ASINs → HTTP 202 zonder resultaten (bot-challenge)
- bing.com/search — beide ASINs + EAN → irrelevante resultaten (gedegradeerde SERP)
- mojeek.com — beide ASINs → HTTP 403
- Creators API — ASIN → GTIN/MPN → NIET_GECONFIGUREERD (geen credentials, niet gesimuleerd)

De externe bronnen bevestigen het STIHL-onderdeel en de machinecompatibiliteit, maar geen enkele bron koppelt de ASIN aan MPN/GTIN. Omdat de eigen Amazon-vermelding niet als onafhankelijk bewijs mag gelden, blijven beide kandidaten behouden als NEEDS_EVIDENCE en zijn ze niet geactiveerd.

## 4. Dekking per prioriteitsmodel (directe kooplinks)

| Model | Onderdelen | Directe aanbiedingen | Dekking |
|---|---|---|---|
| MS 440 | 277 | 10 | 3.61% |
| MS 170 | 248 | 17 | 6.85% |
| BG 86 | 169 | 8 | 4.73% |
| MS 461 | 263 | 8 | 3.04% |
| BR 600 | 239 | 2 | 0.84% |
| MS 390 | 213 | 5 | 2.35% |
| MS 361 | 278 | 6 | 2.16% |
| HS 45 | 205 | 6 | 2.93% |
| MS 250 | 276 | 14 | 5.07% |

## 5. Resterende NEEDS_EVIDENCE

- `42821410300` (B079DM989K) — wacht op een externe catalogus/merchant die ASIN + MPN/GTIN samen noemt.
- `11281903400` (B079DNL88M) — wacht op een externe catalogus/merchant die ASIN + MPN/GTIN samen noemt.

## 6. Capaciteit en veiligheid

- Plafond totaal/NL 110, DE 50; DE-erft nooit een hoger globaal plafond.
- Two-Gate, kill-switches, NL-shipping-eis voor DE en de autorisatielijst zijn niet versoepeld.
