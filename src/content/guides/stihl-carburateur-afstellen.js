/**
 * Content Definition for STIHL Carburateur Afstellen Guide
 * Phase 49B — Knowledge Base Content Rebuild
 * Status: READY_FOR_REVIEW (Gated, Not Publicly Indexed)
 */

export const stihlCarburateurAfstellenGuide = {
  slug: 'stihl-carburateur-afstellen',
  title: 'STIHL Carburateur Afstellen: Werking, Risico\'s & Waarom Instellingen per Model Verschillen',
  shortTitle: 'Carburateur Afstellen',
  metaDescription: 'Hoe werkt het afstellen van een STIHL carburateur met L, H en LA schroeven? Begrijp het gevaar van lean seizure, limiter caps en het verschil met M-Tronic.',
  lastReviewed: '2026-09-25',
  publicationStatus: 'READY_FOR_REVIEW',
  publicationEligible: false,
  categoryScope: 'kettingzagen',
  fuelScope: 'PETROL_2STROKE',

  directAnswer: {
    heading: 'Kort antwoord: bestaat er een universele carburateurafstelling?',
    content: 'Nee. Er bestaat géén universele instelling (zoals "altijd 1 slag open") voor STIHL carburateurs. De exacte fabrieksbasisafstelling verschilt per motortype, carburateurfabrikant (Walbro, Zama, Tillotson) en bouwjaar. Bovendien beschikken veel nieuwere modellen over fabrieksmatige limiter caps (begrenzingsdoppen) of vaste sproeiers. Moderne M-Tronic machines hebben helemaal geen H- en L-stelschroeven. Verkeerd afstellen leidt snel tot een te arm mengsel (lean condition), met binnen enkele seconden een vastgelopen zuiger als gevolg.'
  },

  warnings: [
    {
      title: 'Acuut risico op onherstelbare motorschade (Lean Seizure)',
      text: 'Als de H-schroef (hoofdsproeier voor vollast) te ver wordt ingedraaid, krijgt de motor te weinig brandstof en te veel lucht. Doordat de 2-takt olie in de brandstof zit, valt ook de smering weg. Het motortoerental stijgt ongecontroleerd en de zuiger vreet zich binnen seconden vast in de cilinderwand.',
      severity: 'danger'
    },
    {
      title: 'Toerenteller verplicht voor eindafstelling',
      text: 'Het maximale toerental (max. RPM) mag nooit op het gehoor worden afgesteld. Een geijkte elektronische toerenteller en de fabrieksspecificaties uit de handleiding van het exacte model zijn strikt noodzakelijk.',
      severity: 'warning'
    },
    {
      title: 'Emissievoorschriften & Limiter Caps',
      text: 'Het gewelddadig verwijderen of forceren van kunststof begrenzingsdoppen (limiter caps) schendt officiële emissievoorschriften en vervalt fabrieksgarantie. Deze caps zijn aangebracht om te voorkomen dat het mengsel buiten wettelijke milieugrenzen wordt afgesteld.',
      severity: 'warning'
    }
  ],

  troubleshootingLevels: [
    {
      level: 'LEVEL 1 — USER SAFE CHECK',
      badge: 'Basiscontrole vóór enig afstelwerk',
      description: 'Stel een carburateur NOOIT af wanneer basisvoorwaarden niet in orde zijn:',
      items: [
        'Controleer en reinig het luchtfilter grondig (een vuil filter zorgt voor een vals rijk mengsel).',
        'Controleer op verse brandstof en juiste mengverhouding conform de handleiding.',
        'Controleer of de vonkenvanger in de uitlaatdemper niet verstopt zit met roet.',
        'Laat de motor eerst 3 tot 5 minuten warmdraaien op bedrijfstemperatuur alvorens afstellingen te beoordelen.'
      ]
    },
    {
      level: 'LEVEL 2 — EXPERIENCED USER / MANUAL REQUIRED',
      badge: 'Stationaircontrole (LA-schroef)',
      description: 'Handelingen die met standaard carburateursleutel en handleiding kunnen:',
      items: [
        'Bijstellen van de LA-schroef (aanslag van de gasklep): stelt het stationair toerental in.',
        'Veiligheidsregel: bij correct afgesteld stationair toerental mag het snijgereedschap (zaagketting of maaikop) NOOIT meedraaien!',
        'Raadpleeg de modelspecifieke handleiding voor de fabrieksbasispositie.'
      ]
    },
    {
      level: 'LEVEL 3 — SERVICE PROCEDURE',
      badge: 'Vakhandelaar / Serviceprocedure',
      description: 'Complexe afstellingen en revisies:',
      items: [
        'Vollast H- en deellast L-afstelling met geijkte toerenteller.',
        'Vervangen van limiter caps met speciaal STIHL uittrekgereedschap.',
        'Revisie van membranen, naalden en druktesten van de carburateurbehuizing.',
        'Diagnose van valse lucht (krukaskeerringen, inlaatspruitstuk).'
      ]
    }
  ],

  sources: [
    {
      documentTitle: 'STIHL Service Manual: Carburetors',
      publicationId: 'STIHL SM Carburetor',
      sourceClass: 'OFFICIAL_SERVICE_MANUAL',
      modelScope: 'Carburateurmodellen algemeen',
      notes: 'Werking van membraancarburateurs, limiter cap procedures en druktests.'
    },
    {
      documentTitle: 'STIHL 028 / 038 Service Manual',
      publicationId: '1008738745',
      sourceClass: 'OFFICIAL_SERVICE_MANUAL',
      modelScope: 'Klassieke professionele kettingzagen',
      notes: 'Carburateur basisafstellingen en stationairregulering.'
    }
  ],

  faq: [
    {
      question: 'Wat betekenen de letters L, H en LA op een STIHL carburateur?',
      answer: 'L staat voor Low speed (stationairmengsel en oppakken bij gasgeven), H staat voor High speed (hoofdsproeier die het mengsel bij vollast regelt), en LA staat voor Leerlauf Anschlag (de mechanische aanslagschroef van de gasklep die het stationair toerental bepaalt).'
    },
    {
      question: 'Kan ik mijn STIHL zaag afstellen op "1 slag open voor H en L"?',
      answer: 'Nee. Hoewel sommige oudere klassieke modellen dit als ruwe uitgangspositie vermeldden om een gereviseerde zaag te starten, is dit géén universele instelling. Veel carburateurs vereisen 3/4 slag, 1/4 slag of hebben vaste sproeiers. Zonder toerenteller en de handleiding van uw specifieke model riskeert u ernstige motorschade.'
    },
    {
      question: 'Heeft mijn STIHL met M-Tronic ook H- en L-stelschroeven?',
      answer: 'Nee. STIHL zagen met M-Tronic (C-M) hebben een elektronisch gestuurde carburateur zonder handmatige H- en L-stelschroeven. De microprocessor regelt de brandstoftoevoer continu automatisch via een magneetventiel.'
    }
  ]
};
