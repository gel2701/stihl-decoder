/**
 * Content Definition for STIHL M-Tronic Resetten Guide
 * Phase 49B — Knowledge Base Content Rebuild
 * Status: READY_FOR_REVIEW (Gated, Not Publicly Indexed)
 */

export const stihlMTronicResettenGuide = {
  slug: 'stihl-m-tronic-resetten',
  title: 'STIHL M-Tronic Kalibreren & Resetten: Generatieafhankelijke Procedures & Diagnose',
  shortTitle: 'M-Tronic Resetten',
  metaDescription: 'Hoe werkt het kalibreren van een STIHL M-Tronic motor? Ontdek waarom resetprocedures generatieafhankelijk zijn en wanneer dealerdiagnose met MDG 1 nodig is.',
  lastReviewed: '2026-09-25',
  publicationStatus: 'READY_FOR_REVIEW',
  publicationEligible: false,
  categoryScope: 'kettingzagen',
  fuelScope: 'PETROL_2STROKE',

  directAnswer: {
    heading: 'Kort antwoord: bestaat er één universele M-Tronic resetprocedure?',
    content: 'Nee. De reset- en kalibratieprocedure is generatieafhankelijk. STIHL heeft door de jaren heen meerdere generaties van het M-Tronic motormanagementsysteem ontwikkeld (M-Tronic 1.0, 2.0, 2.1 en 3.0). De procedure voor een vroege MS 241 C-M of MS 261 C-M verschilt wezenlijk van latere versies met een specifieke kalibratiestand (driehoekje ▲) op de Master Control combihendel. Er mag nooit één algemene resetprocedure worden gepresenteerd.'
  },

  warnings: [
    {
      title: 'Koppelingsschade bij langdurig stationair draaien met kettingrem',
      text: 'Laat een kettingzaag met ingeschakelde kettingrem nooit langer dan strikt voorgeschreven stationair draaien. Bij verhoogd stationair toerental kan de centrifugaalkoppeling gaan slepen, wat leidt tot extreme hitteontwikkeling, verbranding van de koppelingsvoering en smelten van het kettingtandwieldeksel en carter.',
      severity: 'danger'
    },
    {
      title: 'M-Tronic is geen conventionele carburateur',
      text: 'Draai nooit met conventioneel gereedschap aan onderdelen van de M-Tronic regeleenheid. Het systeem bevat een elektronisch magneetventiel en sensoren. Foutdiagnose gebeurt via de geautoriseerde STIHL MDG 1 diagnose-interface bij de dealer.',
      severity: 'warning'
    }
  ],

  generationModelData: [
    {
      generation: 'M-Tronic 1.0 (Vroege generatie zonder ▲ kalibratiestand)',
      models: ['MS 241 C-M (vroeg)', 'MS 261 C-M (vroeg)', 'MS 362 C-M (vroeg)', 'FS 460 C-EM (vroeg)'],
      characteristics: 'Combihendel heeft alleen standaard standen (0, I, Start/Halfgas). Geen driehoekig kalibratiesymbool.',
      procedureOverview: 'Vereist warmdraaien tot bedrijfstemperatuur (minimaal 1 minuut) gevolgd door minimaal 5 opeenvolgende zaagsneden in dik rondhout onder continue vollast zonder onderbreking om de vollastkarakteristiek opnieuw in te leren.',
      sourceDocument: 'STIHL Technische Informatie TI 26.2015 / Instruction Manual MS 241 C-M',
      section: 'Carburetor Adjustment / M-Tronic Control',
      publicationEligibility: 'DOCUMENTED_REFERENCE'
    },
    {
      generation: 'M-Tronic 2.0 / 2.1 (Met ▲ kalibratiestand op Master Control)',
      models: ['MS 261 C-M (vanaf serienummerwijziging)', 'MS 362 C-M (facelift)', 'MS 462 C-M', 'MS 661 C-M'],
      characteristics: 'Combihendel is voorzien van een specifiek kalibratiesymbool (driehoekje ▲).',
      procedureOverview: 'Kettingrem inschakelen. Combihendel in de start-/kalibratiestand (▲) zetten. Motor starten ZONDER gas te geven. Laat de motor exact 90 seconden (niet korter en niet overmatig langer) in deze stand stationair draaien. Schakel de motor daarna direct uit (combihendel naar 0). De basiskalibratiedata is opgeslagen in het geheugen.',
      sourceDocument: 'STIHL Gebruiksaanwijzing MS 261 C-M (0458-545-0121) / TI 41.2017',
      section: 'M-Tronic kalibratiecyclus',
      publicationEligibility: 'DOCUMENTED_REFERENCE'
    },
    {
      generation: 'M-Tronic 3.0 / Nieuwste generatie',
      models: ['MS 261 C-M (nieuwste revisie)', 'MS 400 C-M (Magnesium zuiger)'],
      characteristics: 'Volledig continu zelflerend adaptief regelsysteem. Snelle automatische fijnafstelling binnen enkele seconden vollast.',
      procedureOverview: 'Geen handmatige tijdscyclus meer vereist. Systeem past zich adaptief aan na filtervervanging of brandstofwissel tijdens de eerste vollastsneden.',
      sourceDocument: 'STIHL Technische Documentatie M-Tronic 3.0',
      section: 'Elektronisch motormanagement',
      publicationEligibility: 'DOCUMENTED_REFERENCE'
    }
  ],

  sources: [
    {
      documentTitle: 'STIHL MS 241 C-M Instruction Manual',
      publicationId: '292074624',
      sourceClass: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'MS 241 C-M',
      notes: 'M-Tronic bediening en koud-/warmstartvoorschriften.'
    },
    {
      documentTitle: 'STIHL MS 261 C-M Instruction Manual',
      publicationId: '0458-545-0121',
      sourceClass: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'MS 261 C-M',
      notes: 'Kalibratieprocedure met driehoekssymbool op combihendel.'
    }
  ],

  faq: [
    {
      question: 'Waarom loopt mijn M-Tronic zaag na een filterwissel soms onregelmatig?',
      answer: 'Het M-Tronic motormanagementsysteem past de brandstoftoevoer continu aan op basis van luchtdruk, temperatuur en filterweerstand. Wanneer een ernstig vervuild luchtfilter wordt vervangen door een nieuw, schoon filter, krijgt de motor plotseling aanzienlijk meer lucht. Het systeem heeft dan enkele vollastsneden of een kalibratiecyclus nodig om de nieuwe mengverhouding in te leren.'
    },
    {
      question: 'Wat is de functie van de STIHL MDG 1 diagnosetool?',
      answer: 'De STIHL MDG 1 is een officiële dealer-diagnose-interface die via een diagnosestekker met de M-Tronic regeleenheid wordt verbonden. Hiermee kan de servicemonteur het foutgeheugen uitlezen, het aantal bedrijfsuren bekijken, de status van het magneetventiel testen en firmware-updates installeren.'
    }
  ]
};
