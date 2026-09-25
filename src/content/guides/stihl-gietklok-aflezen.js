/**
 * Content Definition for STIHL Gietklok Aflezen Guide
 * Phase 49B — Knowledge Base Content Rebuild
 * Status: READY_FOR_REVIEW (Gated, Not Publicly Indexed)
 */

export const stihlGietklokAflezenGuide = {
  slug: 'stihl-gietklok-aflezen',
  title: 'STIHL Gietklok Aflezen: Maand- en Jaarindicatie van het Onderdeel vs. Bouwjaar Machine',
  shortTitle: 'Gietklok Aflezen',
  metaDescription: 'Hoe leest u de gietklok (Gussuhr) op een STIHL onderdeel af? Begrijp het cruciale verschil tussen de gietdatum van een onderdeel en het bouwjaar van de machine.',
  lastReviewed: '2026-09-25',
  publicationStatus: 'READY_FOR_REVIEW',
  publicationEligible: false,
  categoryScope: 'general',
  fuelScope: 'ALL',

  directAnswer: {
    heading: 'Kort antwoord: wat vertelt de gietklok u wél en wat niet?',
    content: 'De gietklok (in het Duits: Gussuhr) op een kunststof kap of magnesium carterdeel geeft uitsluitend de gietdatum of productiedatum van DAT SPECIFIEKE ONDERDEEL aan. Dit bewijst NIET automatisch het assemblagejaar, het verkoopjaar of het bouwjaar van de complete machine. Onderdelen kunnen maandenlang in het magazijn hebben gelegen alvorens te worden geassembleerd, of later tijdens onderhoud of na schade zijn vervangen door een nieuw reserveonderdeel.'
  },

  warnings: [
    {
      title: 'Gietdatum is géén machinebouwjaar',
      text: 'Verwar de gietdatum op een deksel, carterhelft of kap nooit met het officiële bouwjaar van de complete zaag. Een cilinderkap kan bijvoorbeeld een gietstempel uit 2021 tonen op een machine die al in 2015 is geproduceerd, wanneer de kap na een breuk is vervangen.',
      severity: 'warning'
    },
    {
      title: 'Geen uniform wereldwijd gietklokformaat',
      text: 'STIHL en toeleveranciers van spuitgiet- en persgietmatrijzen hebben in de loop der decennia verschillende datumklokformaten gebruikt (pijl met cijfers, puntjes rond het jaartal, of kwartaalsegmenten). Generaliseer één formaat niet als universeel geldend voor alle bouwjaren.',
      severity: 'info'
    }
  ],

  distinctionFramework: {
    partCastDateVsMachineAssembly: {
      title: 'Cruciaal onderscheid: Onderdeel-gietdatum vs. Machine-bouwjaar',
      points: [
        {
          label: 'Gietdatum van het onderdeel (Gussuhr)',
          description: 'Geeft aan in welke maand en welk jaar de matrijs in de spuitgiet- of persgietfabriek is gebruikt om het betreffende onderdeel (bijvoorbeeld een starterdeksel, handbeschermer of carterhelft) te gieten.'
        },
        {
          label: 'Assemblagejaar van de complete machine',
          description: 'Het moment waarop alle componenten in de fabriek (zoals in Waiblingen of Virginia Beach) zijn samengebouwd tot een werkende machine. Dit kan maanden na de gietdatum van individuele onderdelen liggen.'
        },
        {
          label: 'Verkoop- / Ingebruiknamedatum',
          description: 'Het moment waarop de machine door de geautoriseerde dealer aan de eindgebruiker is geleverd en in het STIHL garantiesysteem is geregistreerd. Dit kan een tot twee jaar na productie plaatsvinden.'
        }
      ]
    },
    mouldDateFormats: {
      title: 'Hoe leest u een typische gietklok af?',
      description: 'Een gietklok bestaat meestal uit een ronde verzonken cirkel in het gietwerk:',
      elements: [
        'Centrum: bevat vaak een tweecijferig jaartal (bijvoorbeeld "18" voor 2018, of "04" voor 2004).',
        'Rondom het centrum: 12 segmenten of cijfers (1 t/m 12) corresponderend met de maanden van het kalenderjaar.',
        'Pijl: een ingegoten pijl wijst naar het specifieke cijfer van de productiemaand.',
        'Puntjesmarkering (bij sommige toeleveranciers): kleine verzonken puntjes in segmenten geven aan in welk kwartaal of welke maand de matrijs werd ingezet.'
      ]
    },
    replacedPartsNotice: {
      title: 'Vervangen onderdelen herkennen',
      text: 'Wanneer u verschillende onderdelen van dezelfde machine inspecteert en bijvoorbeeld op het carter "12" (2012) aantreft, maar op de bovenkap "20" (2020), is dat een sterke indicatie dat de bovenkap in een later stadium is vervangen als herstelonderdeel na schade.'
    }
  },

  sources: [
    {
      documentTitle: 'Matrijsdatumcoderingsnormen (DIN EN ISO normeringen voor persgiet- en spuitgietmatrijzen)',
      publicationId: 'ISO Matrijsconventies',
      sourceClass: 'TECHNICAL_STANDARD',
      modelScope: 'Gegoten onderdelen en behuizingscomponenten',
      notes: 'Conventies voor datumstempels en maandindicaties op spuitgietonderdelen.'
    }
  ],

  faq: [
    {
      question: 'Waarom kan de gietklok op mijn STIHL zaag afwijken van het bouwjaar op het typeplaatje?',
      answer: 'Onderdelen zoals carters en kappen worden in batches gegoten en kunnen geruime tijd in het magazijn liggen voordat ze in de fabriek worden geassembleerd tot een complete machine. Bovendien kan een onderdeel tijdens het gebruik van de machine zijn vervangen door een nieuwer reserveonderdeel.'
    },
    {
      question: 'Is een gietnummer hetzelfde als een onderdeelnummer?',
      answer: 'Nee. Een ingegoten nummer kan een intern matrijsnummer of een 11-cijferig STIHL onderdeelnummer (Teilenummer) zijn, maar de termen zijn niet automatisch synoniem. Het onderdeelnummer identificeert het onderdeeltype; het unieke serienummer van de complete machine is apart ingeslagen of op een sticker aangebracht.'
    }
  ]
};
