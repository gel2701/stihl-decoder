/**
 * Content Definition for Namaak STIHL Herkennen Guide
 * Phase 49B — Knowledge Base Content Rebuild
 * Status: READY_FOR_REVIEW (Gated, Not Publicly Indexed)
 */

export const namaakStihlHerkennenGuide = {
  slug: 'namaak-stihl-herkennen',
  title: 'Namaak STIHL Herkennen: Inspectiechecklist, Kenmerken van Klones & Betrouwbaarheidsanalyse',
  shortTitle: 'Namaak STIHL Herkennen',
  metaDescription: 'Hoe herkent u een imitatie STIHL zaag of machine? Praktische checklist voor serienummer, typeplaatje, afwerking en waarom StopHeling geen echtheidscertificaat is.',
  lastReviewed: '2026-09-25',
  publicationStatus: 'READY_FOR_REVIEW',
  publicationEligible: false,
  categoryScope: 'general',
  fuelScope: 'ALL',

  directAnswer: {
    heading: 'Kort antwoord: hoe stelt u vast of een STIHL machine authentiek is?',
    content: 'Controleer systematisch het serienummer, het fabriekstypeplaatje, de kwaliteit van het gietwerk, de werking van de kettingrem en de aankoopdocumentatie. Doe nooit een overhaaste uitspraak op basis van één enkel uiterlijk kenmerk. Gebruik een gestructureerde categorisering (Geen duidelijke afwijkingen, Inconsistentie gevonden, of Handmatige dealerinspectie aanbevolen) in plaats van blind te oordelen. Let op: een StopHeling-controle toont uitsluitend of een nummer als gestolen geregistreerd staat; het is géén bewijs van authenticiteit.'
  },

  warnings: [
    {
      title: 'Levensgevaarlijk veiligheidsrisico bij illegale imitaties',
      text: 'Namaak STIHL zagen en klonen voldoen vrijwel nooit aan Europese veiligheidsnormen (CE). Veelvoorkomende levensgevaarlijke gebreken zijn: een niet-werkende kettingrem (geen bescherming bij terugslag / kickback), breekbare handbeschermers, inferieur kettingmateriaal en brandgevaarlijke brandstoftanks.',
      severity: 'danger'
    },
    {
      title: 'StopHeling is géén authenticiteitscontrole',
      text: 'Een controle via het officiële StopHeling-register toont alleen aan of een serienummer bij de Nederlandse politie als gestolen gemeld staat. Het garandeert op geen enkele wijze dat de machine een origineel STIHL product is.',
      severity: 'warning'
    }
  ],

  resultCategories: [
    {
      category: 'NO_OBVIOUS_ISSUE',
      label: 'Geen duidelijke afwijkingen vastgesteld',
      description: 'Het serienummer, het typeplaatje, het lettertype van het logo en de gietkwaliteit komen overeen met bekende STIHL fabriekskenmerken voor dit model.'
    },
    {
      category: 'INCONSISTENCY_FOUND',
      label: 'Inconsistentie gevonden',
      description: 'Er zijn duidelijke afwijkingen geconstateerd, zoals een ontbrekend of onlogisch serienummerformaat, afwijkende stickers, ondeugdelijk cartermateriaal of schroeven die niet overeenkomen met fabrieksspecificaties.'
    },
    {
      category: 'MANUAL_REVIEW_RECOMMENDED',
      label: 'Handmatige dealerinspectie aanbevolen',
      description: 'Er is gerede twijfel door slijtage, ontbrekende typeplaatjes of afwijkende onderdelen. Fysieke beoordeling door een erkende STIHL servicedealer met behulp van officiële onderdelencatalogi is noodzakelijk.'
    }
  ],

  inspectionChecklist: [
    {
      topic: '1. Serienummer & Inslaging',
      text: 'Originele STIHL machines hebben een uniek serienummer (veelal 9 cijfers) dat zuiver en scherp is ingeslagen in het carter of op een officiële fabriekstypeplaat staat. Bij klonen ontbreekt het nummer vaak geheel, is het slordig met de hand geponst, of wordt één enkel gerecycled nummer op honderden replica\'s gebruikt.'
    },
    {
      topic: '2. Typeplaatje & Markeringen',
      text: 'Controleer het modelnummer, CE-markeringen en waarschuwingssymbolen. Originele STIHL typeplaatjes zijn slijtvast en scherp bedrukt; imitaties hebben vaak dunne plastic stickers met spelfouten of afwijkende lettertypes.'
    },
    {
      topic: '3. STIHL Logo & Typografie',
      text: 'Het STIHL woordmerk heeft een strikt beschermde geometrie en typografie. Let op afwijkende letterdiktes, foute spatiëring of fantasienamen die op STIHL lijken.'
    },
    {
      topic: '4. Materiaalkwaliteit & Gietnaden',
      text: 'Originele STIHL machines gebruiken hoogwaardig magnesium-persgietwerk en slagvast polyamide. Imitaties vertonen vaak scherpe bramen, grove gietnaden, dun broos plastic en goedkope kruiskopschroeven waar STIHL Torx/IS-veiligheidsbouten toepast.'
    },
    {
      topic: '5. Kettingrem & Veiligheidsmechanisme',
      text: 'Test de werking van de voorste handbeschermer. Bij originele zagen vergrendelt de rem met een duidelijke mechanische klik en blokkeert de ketting onwrikbaar. Bij namaak ontbreekt de remband in het binnenwerk soms zelfs volledig!'
    },
    {
      topic: '6. Aankoopkanaal & Documentatie',
      text: 'STIHL levert uitsluitend via geautoriseerde vakhandelaren. Machines die op parkeerplaatsen, vanuit kofferbakken of via schimmige advertenties voor een fractie van de nieuwprijs worden aangeboden zijn vrijwel zonder uitzondering imitaties.'
    },
    {
      topic: '7. Digitale Productregistratie (Mijn STIHL / STIHL Paspoort)',
      text: 'Raadpleeg het officiële STIHL registratiesysteem via een geautoriseerde dealer om na te gaan of het serienummer correspondeert met het exacte productmodel en de verkoopdatum in de fabrieksdatabase.'
    }
  ],

  sources: [
    {
      documentTitle: 'STIHL Brand Protection: Waarschuwing tegen merkvervalsing en namaakproducten',
      publicationId: 'STIHL Merkvervalsing Richtlijn',
      sourceClass: 'OFFICIAL_BRAND_PROTECTION',
      modelScope: 'Alle motorgereedschappen',
      notes: 'Kenmerken van nagemaakte machines en veiligheidsrisico\'s van imitatiekettingzagen.'
    }
  ],

  faq: [
    {
      question: 'Geeft een check op StopHeling zekerheid dat mijn zaag echt is?',
      answer: 'Nee. StopHeling is een database van de Nederlandse politie voor goederen die als gestolen zijn geregistreerd. Een imitatiezaag staat daar doorgaans niet in geregistreerd als gestolen, maar is desondanks een illegale en onveilige replica. Het is dus géén authenticiteitsbewijs.'
    },
    {
      question: 'Wat zijn de meest nagemaakte STIHL modellen?',
      answer: 'Met name zware professionele kettingzagen (zoals replica\'s van de legendarische STIHL MS 070, MS 381, MS 660) en populaire tophandle zagen (zoals MS 200T klonen) worden veelvuldig geïmiteerd door illegale fabrikanten.'
    }
  ]
};
