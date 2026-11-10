# Phase 66A affiliate candidate audit

Offline only. No live Amazon discovery, current identity or availability checks. Only previously recorded candidates were evaluated; most parts still need external research. No production data changed.

- Queue: 250 unique catalog parts; batches of 25
- Existing active verified mappings: 8; NEW verified: 0
- Parts: VERIFIED 8, STAGED 1, REJECTED 1, RESEARCH_REQUIRED 240, NO_CANDIDATE 0
- Historical candidate mappings (not newly verified): VERIFIED 8, STAGED 1, REJECTED 2
- Unique ASINs: 9; unique part/marketplace/ASIN mappings: 11
- Manufacturers: {"Bosch Automotive Aftermarket":1,"MCHNIC":1,"MospdyGear":1,"Niterra Co., Ltd. (NGK Spark Plugs)":3,"Oregon Tool":2,"Oregon Tool, Inc.":2,"Trade-Shop":1}
- Marketplaces: {"amazon.nl":11}
- Categories: {"antivibratie":9,"bougie":11,"brandstoffilter":4,"brandstofslang":1,"carburateur":7,"carburateurdelen":13,"kettingwiel":36,"koppeling":23,"luchtfilter":22,"oliepomp":7,"pakkingen":70,"starter":47}
- Quota redistribution: none; requires permitted searches and category results.
- Sources used: output/phase56a/AMAZON_VERIFICATION_QUEUE.json, data/parts_catalog.json, data/affiliate/verified_amazon_registry.json, PHASE59F1_ACTIVATION_CANDIDATES.json, PHASE60_1_VERIFIED_OFFERS.json
- Blocked lookups: Live Amazon marketplace discovery and current identity/availability (Offline-only batch; no permitted live source or current lookup performed)
- Next verification batch (queue order, 25): 11181953500, 11284051000, 00009302208, 11131214705, 11131958200, 00001958200, 00004007026, 00003503518, 41291214700, 00009302203, 11281902900, 11236403200, 11281903400, 41400292300, 11201958200, 11071958200, 41331212700, 11256401701, 00001903400, 11231602050, 11411214730, 41804051000, 00006421234, 00006421236, 41401490602
- Staged historical evidence needs independent current verification; placeholder B000000000 excluded. Rejected historical mismatches cannot become direct links. No NO_CANDIDATE verdict without permitted searches.
- Catalog name overrides stale queue name, including 00004007000 (Spark plug NGK BPMR7A).
- Fingerprint: 7e635c26649014fb563f5c4fcf17152b8f15355f045c96c5667c21034899af09
