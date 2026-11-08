/**
 * Substantive, Source-Bound Content Definition for STIHL Bougie Vervangen & Onderhoudsgids
 * Phase 68.1 — Final Hardening, Source-Bound Specifications & OEM Distinction
 * Covers Google Search Console Priority Models: MS 440, MS 210, MS 170, MS 461, BG 86, MS 390, BR 600, MS 361, MS 261, HS 45, FS 350, FS 460
 */

export const stihlBougieVervangenGuide = {
  slug: 'stihl-bougie-vervangen',
  title: 'STIHL Bougie Vervangen & Kiezen: Warmtegraad, Elektrodenafstand & Tabel per Model',
  shortTitle: 'Bougie Kiezen & Vervangen',
  metaDescription: 'Welke bougie past op uw STIHL machine? Overzicht van bougiespecificaties (Bosch WSR6F, NGK BPMR7A, NGK CMR6H), elektrodenafstand (0,5 mm), aanhaalmomenten en onderhoud voor MS 170, MS 210, MS 261, MS 440, BG 86 en BR 600.',
  lastReviewed: '2026-11-08',
  publicationStatus: 'PUBLISHED',
  publicationEligible: true,
  categoryScope: 'onderhoud',
  fuelScope: 'PETROL_2STROKE',

  targetModels: [
    'MS 440',
    'MS 210',
    'MS 170',
    'MS 461',
    'BG 86',
    'MS 390',
    'BR 600',
    'MS 361',
    'MS 261',
    'HS 45',
    'FS 350',
    'FS 460'
  ],

  sources: [
    {
      id: 'src-stihl-ms170-manual-spark',
      source_id: 'src-stihl-ms170-manual-spark',
      canonical_document_id: '0458-207-8321-B',
      publicationId: '0458-207-8321-B',
      publication_id: '0458-207-8321-B',
      documentTitle: 'STIHL MS 170, MS 170 C, MS 180, MS 180 C Instruction Manual',
      document_title: 'STIHL MS 170, MS 170 C, MS 180, MS 180 C Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'MS 170, MS 180',
      model_scope: ['MS 170', 'MS 180'],
      locator: {
        page: 40,
        section: 'Maintenance and Care',
        heading: 'Spark Plug'
      },
      notes: 'Fabriekshandleiding STIHL MS 170/180: ontstoringsbougie Bosch WSR6F / NGK BPMR7A, elektrodenafstand 0,5 mm, schroefdraad M14x1.25, aanhaalmoment 25 Nm.'
    },
    {
      id: 'src-stihl-ms210-manual-spark',
      source_id: 'src-stihl-ms210-manual-spark',
      canonical_document_id: '0458-208-0121',
      publicationId: '0458-208-0121',
      publication_id: '0458-208-0121',
      documentTitle: 'STIHL MS 210 / MS 230 / MS 250 Instruction Manual',
      document_title: 'STIHL MS 210 / MS 230 / MS 250 Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'MS 210, MS 230, MS 250',
      model_scope: ['MS 210', 'MS 230', 'MS 250'],
      locator: {
        page: 38,
        section: 'Maintenance and Care',
        heading: 'Checking the Spark Plug'
      },
      notes: 'Fabriekshandleiding STIHL MS 210/230/250: ontstoringsbougie Bosch WSR6F / NGK BPMR7A, sleutelwijdte 19 mm, elektrodenafstand 0,5 mm, aandraaimoment 25 Nm.'
    },
    {
      id: 'src-stihl-ms261-manual-spark',
      source_id: 'src-stihl-ms261-manual-spark',
      canonical_document_id: '0458-573-8621-D',
      publicationId: '0458-573-8621-D',
      publication_id: '0458-573-8621-D',
      documentTitle: 'STIHL MS 261, MS 261 C-M Instruction Manual',
      document_title: 'STIHL MS 261, MS 261 C-M Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'MS 261, MS 261 C-M',
      model_scope: ['MS 261', 'MS 261 C-M'],
      locator: {
        page: 44,
        section: 'Specifications',
        heading: 'Ignition System'
      },
      notes: 'Fabriekshandleiding STIHL MS 261 (C-M): compacte bougie NGK CMR6H / Bosch USR7AC (M10x1.0, 16 mm zeskant, 12 Nm aandraaimoment, elektrodenafstand 0,5 mm).'
    },
    {
      id: 'src-stihl-ms440-manual-spark',
      source_id: 'src-stihl-ms440-manual-spark',
      canonical_document_id: '0458-440-0121',
      publicationId: '0458-440-0121',
      publication_id: '0458-440-0121',
      documentTitle: 'STIHL MS 440 Instruction Manual',
      document_title: 'STIHL MS 440 Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'MS 440',
      model_scope: ['MS 440'],
      locator: {
        page: 42,
        section: 'Specifications',
        heading: 'Ignition System'
      },
      notes: 'Fabriekshandleiding STIHL MS 440: bougie Bosch WSR6F of NGK BPMR7A, 0,5 mm elektrodenafstand, 25 Nm aanhaalmoment.'
    },
    {
      id: 'src-stihl-026-manual-spark',
      source_id: 'src-stihl-026-manual-spark',
      canonical_document_id: '0458-133-3021',
      publicationId: '0458-133-3021',
      publication_id: '0458-133-3021',
      documentTitle: 'STIHL 026 Instruction Manual',
      document_title: 'STIHL 026 Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: '026',
      model_scope: ['026'],
      locator: {
        page: 38,
        section: 'Specifications',
        heading: 'Spark Plug'
      },
      notes: 'Fabriekshandleiding STIHL 026: bougie Bosch WSR6F of NGK BPMR7A, 19 mm sleutel, 0,5 mm elektrodenafstand, 25 Nm.'
    },
    {
      id: 'src-stihl-bg86-manual-spark',
      source_id: 'src-stihl-bg86-manual-spark',
      canonical_document_id: '0458-751-0121',
      publicationId: '0458-751-0121',
      publication_id: '0458-751-0121',
      documentTitle: 'STIHL BG 86 / SH 86 Instruction Manual',
      document_title: 'STIHL BG 86 / SH 86 Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'BG 86',
      model_scope: ['BG 86'],
      locator: {
        page: 36,
        section: 'Specifications',
        heading: 'Spark Plug'
      },
      notes: 'Fabriekshandleiding STIHL BG 86 handblazer: bougie NGK CMR6H (STIHL 0000 400 7011), elektrodenafstand 0,5 mm, 12 Nm aanhaalmoment.'
    },
    {
      id: 'src-stihl-br600-manual-spark',
      source_id: 'src-stihl-br600-manual-spark',
      canonical_document_id: '0458-428-0123',
      publicationId: '0458-428-0123',
      publication_id: '0458-428-0123',
      documentTitle: 'STIHL BR 500 / BR 550 / BR 600 Instruction Manual',
      document_title: 'STIHL BR 500 / BR 550 / BR 600 Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'BR 600',
      model_scope: ['BR 600'],
      locator: {
        page: 48,
        section: '4-MIX Engine Maintenance',
        heading: 'Spark Plug'
      },
      notes: 'Fabriekshandleiding STIHL BR 600 4-MIX rugblazer: bougie NGK CMR6H, 0,5 mm elektrodenafstand, aandraaimoment 12 Nm.'
    }
  ],

  warnings: [
    {
      severity: 'danger',
      title: 'Verbrandings- en Brandveiligheid bij Bougiewerkzaamheden',
      text: 'Laat de cilinder en uitlaat altijd volledig afkoelen vóór u de bougie demonteert. Test NOOIT een vonk bij een open bougiegat of in de buurt van gemorste benzine. Ontstekende brandstofdampen kunnen ernstige brandwonden veroorzaken.'
    },
    {
      severity: 'warning',
      title: 'Juiste Schroefdraad & Aandraaimomenten Respecteren',
      text: 'Draai een bougie altijd eerst handmatig enkele slagen in de cilinderkop om beschadiging van de aluminium schroefdraad (cross-threading) te voorkomen. Gebruik het juiste aanhaalmoment: 25 Nm voor M14 bougies (WSR6F / BPMR7A) en 12 Nm voor M10 compacte bougies (CMR6H).'
    }
  ],

  troubleshootingLevels: [
    {
      level: 'Niveau 1: Visuele Inspectie & Reiniging',
      badge: 'Veilig voor Eigenaar',
      description: 'Regelmatige controle van de elektroden en isolatorneus.',
      items: [
        'Bougiedop voorzichtig recht lostrekken (niet aan de ontstekingskabel wrikken).',
        'Cilinderomgeving schoonvegen vóór demontage zodat er geen zaagsel in de verbrandingskamer valt.',
        'Kleur van de isolatorneus beoordelen: reebruin duidt op een correct brandstofmengsel (1:50) en goede verbranding.',
        'Koolafzettingen voorzichtig verwijderen met een messing draadborsteltje.'
      ]
    },
    {
      level: 'Niveau 2: Elektrodenafstand Meten & Afstellen',
      badge: 'Veilig met Voelermaat',
      description: 'Controle van de fabrieksspecificatie (0,5 mm speling).',
      items: [
        'Meet de afstand tussen midden- en massa-elektrode met een precisie-voelermaat van 0,5 mm.',
        'Wanneer de speling te wijd is door elektrodeslijtage (> 0,7 mm), moet de bougie worden vervangen.',
        'Buig bij lichte afwijking uitsluitend de buitenste massa-elektrode voorzichtig bij. Oefen nooit druk uit op de centrale keramische isolator.'
      ]
    },
    {
      level: 'Niveau 3: Vervanging bij Ontstekingsproblemen',
      badge: 'Regulier Seizoensonderhoud',
      description: 'Vervanging volgens STIHL onderhoudsschema (elke 100 bedrijfsuren of jaarlijks).',
      items: [
        'Vervang de bougie direct bij een gebroken of gebarsten keramische isolator.',
        'Vervang bij ernstig ingebrande of afgeronde elektroden.',
        'Kies altijd de exacte warmtegraad conform de fabriekshandleiding (Bosch 6 / NGK 7 voor M14; NGK 6 voor M10 compact).'
      ]
    }
  ],

  modelSparkPlugTable: [
    {
      modelGroup: 'Klassieke & Populaire Kettingzagen met M14 Schroefdraad',
      models: 'MS 170, MS 180, MS 210, MS 230, MS 250, MS 361, MS 390, MS 440, MS 461, 026',
      thread: 'M14 x 1,25 (9,5 mm bereik)',
      hexSize: '19 mm',
      gap: '0,5 mm',
      torque: '25 Nm',
      recommendedPlugs: 'Bosch WSR6F (STIHL 1110 400 7005) / NGK BPMR7A',
      notes: 'Klassieke M14 schroefdraad met 9,5 mm schroefdraadlengte. Uitsluitend van toepassing op machines met originele M14 cilinderkop; controleer altijd het typeplaatje en de markering op de gedemonteerde bougie.'
    },
    {
      modelGroup: 'Moderne Kettingzagen met compacte M10 Cilinderkop',
      models: 'MS 261, MS 261 C-M',
      thread: 'M10 x 1,0 (12,7 mm bereik)',
      hexSize: '16 mm (compact)',
      gap: '0,5 mm',
      torque: '12 Nm',
      recommendedPlugs: 'NGK CMR6H (STIHL 0000 400 7011) / Bosch USR7AC',
      notes: 'Compacte M10 bougie (12,7 mm schroefdraadlengte). Vereist een slanke 16 mm bougiesleutel. Niet compatibel met oudere M14 cilinderkoppen.'
    },
    {
      modelGroup: 'Bladblazers (Hand- & Ruggedragen)',
      models: 'BG 86, BG 86 C-E, SH 86, BR 500, BR 550, BR 600, BR 700',
      thread: 'M10 x 1,0 (12,7 mm bereik)',
      hexSize: '16 mm (compact)',
      gap: '0,5 mm',
      torque: '12 Nm',
      recommendedPlugs: 'NGK CMR6H (STIHL 0000 400 7011)',
      notes: 'Compacte bougie voor zowel 2-MIX handblazers (BG 86) als 4-MIX ruggedragen blazers (BR 600).'
    },
    {
      modelGroup: 'Heggenscharen & Bosmaaiers',
      models: 'HS 45, FS 350, FS 460 C-EM',
      thread: 'HS 45 & FS 350: M14x1.25 (19mm) · FS 460: M10x1.0 (16mm)',
      hexSize: 'HS 45/FS 350: 19 mm · FS 460: 16 mm',
      gap: '0,5 mm',
      torque: 'M14: 25 Nm · M10: 12 Nm',
      recommendedPlugs: 'HS 45 / FS 350: NGK BPMR7A / Bosch WSR6F · FS 460: NGK CMR6H',
      notes: 'Let op: controleer of uw bosmaaier een klassieke M14 kop (zoals FS 350) of een moderne compacte M10 kop (zoals FS 460 C-EM) heeft.'
    }
  ],

  verifiedParts: [
    {
      asin: 'B0068M5NAG',
      title: 'Bosch WSR6F Bougie (0242240506)',
      manufacturer: 'Robert Bosch GmbH',
      brand: 'Bosch',
      mpn: '0242240506 / WSR6F',
      stihl_part_number: '1110 400 7005',
      oem_classification: 'OEM_SUPPLIER_EQUIVALENT',
      thread_spec: 'M14 x 1,25 (19 mm zeskant, 9,5 mm reach)',
      url: 'https://www.amazon.nl/dp/B0068M5NAG?tag=srihldecoder2-21',
      badge: '✓ Geverifieerd Product (Directe Link)',
      suitable_for: 'MS 170, MS 210, MS 250, MS 361, MS 390, MS 440, MS 461, 026',
      description: 'OEM-toeleverancierskwaliteit van Bosch (eerste montage toeleverancier). Geleverd in officiële Bosch-merkverpakking (0242240506 / WSR6F), met identieke technische specificaties aan STIHL onderdeelnummer 1110 400 7005. Dit is een origineel Bosch merkproduct, geen door STIHL verpakt artikel.'
    },
    {
      asin: 'B001RM8J76',
      title: 'NGK BPMR7A Bougie (Stock 6703)',
      manufacturer: 'Niterra Co., Ltd. (NGK)',
      brand: 'NGK',
      mpn: 'BPMR7A / 6703',
      stihl_part_number: '0000 400 7000',
      oem_classification: 'OEM_SUPPLIER_EQUIVALENT',
      thread_spec: 'M14 x 1,25 (19 mm zeskant, 9,5 mm reach)',
      url: 'https://www.amazon.nl/dp/B001RM8J76?tag=srihldecoder2-21',
      badge: '✓ Geverifieerd Product (Directe Link)',
      suitable_for: 'MS 170, MS 210, MS 250, MS 390, MS 440, MS 461, HS 45, FS 350',
      description: 'OEM-toeleverancierskwaliteit van NGK / Niterra. Geleverd in officiële NGK-merkverpakking (BPMR7A / 6703), met specificaties conform STIHL onderdeelnummer 0000 400 7000. Dit is een origineel NGK merkproduct, geen door STIHL verpakt artikel.'
    },
    {
      asin: 'B001RMA5S2',
      title: 'NGK CMR6H Compacte Bougie (Stock 3365)',
      manufacturer: 'Niterra Co., Ltd. (NGK)',
      brand: 'NGK',
      mpn: 'CMR6H / 3365',
      stihl_part_number: '0000 400 7011',
      oem_classification: 'OEM_SUPPLIER_EQUIVALENT',
      thread_spec: 'M10 x 1,0 (16 mm zeskant, 12,7 mm reach)',
      url: 'https://www.amazon.nl/dp/B001RMA5S2?tag=srihldecoder2-21',
      badge: '✓ Geverifieerd Product (Directe Link)',
      suitable_for: 'BG 86, BR 600, MS 261, MS 261 C-M, FS 460 C-EM',
      description: 'OEM-toeleverancierskwaliteit van NGK / Niterra voor compacte M10 cilinderkoppen en 4-MIX motoren. Geleverd in officiële NGK-merkverpakking (CMR6H / 3365), met specificaties conform STIHL onderdeelnummer 0000 400 7011. Dit is een origineel NGK merkproduct, geen door STIHL verpakt artikel.'
    }
  ],

  stepByStepGuide: [
    {
      step: 1,
      title: 'Voorbereiding & Veiligheid',
      description: 'Zet de machine op een vlakke, stabiele ondergrond. Schakel de ontstekingsschakelaar uit en laat de motor minimaal 15 minuten afkoelen. Maak het gebied rondom de bougie schoon met een zachte borstel of perslucht om te voorkomen dat er zaagsel in de cilinder valt.'
    },
    {
      step: 2,
      title: 'Bougiedop Verwijderen & Oude Bougie Losdraaien',
      description: 'Trek de bougiedop recht en voorzichtig van de bougie af. Plaats de passende bougiesleutel (19 mm voor M14 bougies op MS 170/210/440; 16 mm voor compacte M10 bougies op MS 261/BG 86) recht op de zeskant en draai linksom (tegen de klok in) los.'
    },
    {
      step: 3,
      title: 'Bougiekleur & Verbrandingsbeeld Beoordelen',
      description: 'Reebruin: uitstekende verbranding en juiste brandstofverhouding (1:50). Zwart/roetig: te rijk mengsel, vervuild luchtfilter of te veel olie. Wit/grijs/aangekoekt: te arm mengsel of te hete bougie (kans op motorschade!). Vervang de bougie direct bij scheurtjes in het porselein of afgesleten elektroden.'
    },
    {
      step: 4,
      title: 'Elektrodenafstand van de Nieuwe Bougie Controleren',
      description: 'Controleer met een voelermaat of de afstand tussen de elektroden exact 0,5 mm is (zoals voorgeschreven door STIHL). Stel zo nodig de massa-elektrode uiterst voorzichtig bij.'
    },
    {
      step: 5,
      title: 'Nieuwe Bougie Monteren & Aandraaien',
      description: 'Draai de nieuwe bougie met de hand in de schroefdraad tot deze handvast zit. Draai vervolgens vast met de bougiesleutel: M14 bougies (WSR6F / BPMR7A) op 25 Nm (ca. 1/4 slag na contact bij een nieuwe afdichtring); M10 bougies (CMR6H) op 12 Nm. Druk de bougiedop stevig aan tot deze hoorbaar vastklikt.'
    }
  ],

  relevantLinks: [
    { label: 'STIHL Kettingzaag Start Niet Gids', href: '/gidsen/stihl-kettingzaag-start-niet/' },
    { label: 'Carburateur Afstellen & Membraan Diagnose', href: '/gidsen/stihl-carburateur-afstellen/' },
    { label: 'STIHL M-Tronic Resetten', href: '/gidsen/stihl-m-tronic-resetten/' },
    { label: 'Onderdelen & Tekeningen MS 170', href: '/kettingzagen/ms-170/onderdelen/' },
    { label: 'Onderdelen & Tekeningen MS 210', href: '/kettingzagen/ms-210/onderdelen/' },
    { label: 'Onderdelen & Tekeningen MS 261', href: '/kettingzagen/ms-261/onderdelen/' },
    { label: 'Onderdelen & Tekeningen MS 440', href: '/kettingzagen/ms-440/onderdelen/' },
    { label: 'Onderdelen & Tekeningen BG 86', href: '/bladblazers/bg-86/onderdelen/' }
  ]
};
