/**
 * Substantive Content Definition for STIHL Kettingzaag Start Niet Guide
 * Phase 49B — Knowledge Base Content Rebuild
 */

export const stihlKettingzaagStartNietGuide = {
  slug: 'stihl-kettingzaag-start-niet',
  title: 'STIHL Kettingzaag Start Niet? Oorzaken & Veilig Stappenplan voor Diagnose',
  shortTitle: 'Kettingzaag Start Niet',
  metaDescription: 'Start uw STIHL kettingzaag niet of is de motor verzopen? Bekijk het praktische stappenplan voor veilige controle van startprocedure, brandstof, bougie en luchtfilter.',
  lastReviewed: '2026-09-25',
  publicationStatus: 'PUBLISHED',
  publicationEligible: true,
  categoryScope: 'kettingzagen',
  fuelScope: 'PETROL_2STROKE',

  directAnswer: {
    heading: 'Kort antwoord: wat kunt u veilig direct controleren?',
    content: 'Controleer eerst de juiste startprocedure (koude start met choke vs. warme start zonder choke), de stop-/combischakelaar, verse brandstof, de bougie en het luchtfilter. Schakel altijd de kettingrem in en start op een stabiele ondergrond. Blijft de zaag weigeren of vermoedt u een verzopen motor (sterke benzinegeur, natte bougie), volg dan de officiële droogprocedure. Draai niet blindelings aan de carburateurschroeven; de vereiste instellingen verschillen per model en moderne M-Tronic kettingzagen hebben geen handmatige stelschroeven.'
  },

  warnings: [
    {
      title: 'Kettingrem altijd inschakelen vóór het starten',
      text: 'Duw de voorste handbeschermer naar voren tot deze hoorbaar vergrendelt. De zaagketting mag tijdens het starten nooit kunnen meedraaien. Start een motorzaag uitsluitend wanneer de kettingrem geblokkeerd is.',
      severity: 'danger'
    },
    {
      title: 'Stabiele startpositie verplicht',
      text: 'Plaats de kettingzaag vlak en stabiel op de grond. Zorg dat het zaagblad en de ketting vrij liggen van takken, aarde en stenen. Plaats uw rechtervoet stevig in de achterste handgreep en houd de voorste handbeugel met de linkerhand vast (duim om de beugel). Start NOOIT \'uit de hand\' (vliegende start); dit leidt tot ernstig ongevalsgevaar.',
      severity: 'danger'
    },
    {
      title: 'Brand- en ontploffingsgevaar',
      text: 'Controleer brandstof en bougies uitsluitend in de open lucht en op minimaal 3 meter afstand van de tankplek. Voer nooit een vonktest uit met een open bougiegat of in de buurt van gemorste benzine.',
      severity: 'warning'
    },
    {
      title: 'Gevaar voor ernstige motorschade bij carburateurafstelling',
      text: 'Draai nooit zonder toerenteller en modelspecifieke fabrieksgegevens aan de H- of L-stelschroeven van een klassieke carburateur. Een te arm mengsel (H-schroef te ver ingedraaid) veroorzaakt binnen enkele seconden oververhitting en een fatale zuigervreter.',
      severity: 'warning'
    }
  ],

  troubleshootingLevels: [
    {
      level: 'LEVEL 1 — USER SAFE CHECK',
      badge: 'Veilige basiscontrole',
      description: 'Handelingen die iedere gebruiker zonder speciaal gereedschap veilig kan uitvoeren:',
      items: [
        'Controleer of de kettingrem is ingeschakeld (voorste handbeschermer naar voren geduwd).',
        'Controleer de combihendel: staat deze niet per ongeluk op STOP / 0?',
        'Volg de exacte koude- of warmstartprocedure (zie onderstaand stappenplan).',
        'Controleer de brandstof: is de benzine vers? Brandstof met ethanol (Euro 95 E10) kan na circa 30 dagen verouderen en ontmengen.',
        'Controleer het brandstofniveau en de ontluchting van de brandstoftank.',
        'Controleer of het luchtfilter niet volledig dichtgeslibd is met zaagsel of kettingolie.'
      ]
    },
    {
      level: 'LEVEL 2 — EXPERIENCED USER / MANUAL REQUIRED',
      badge: 'Inspectie met gereedschap & handleiding',
      description: 'Handelingen waarvoor de bijgeleverde combinatiesleutel en de officiële handleiding vereist zijn:',
      items: [
        'Bougie uitbouwen met combinatiesleutel en visueel controleren op elektrodekleur, roetaanslag of nattigheid.',
        'Verzopen motor herstelprocedure uitvoeren conform officiële instructies (cilinder ventileren met uitgeschakelde ontsteking).',
        'Bougie vervangen door het exacte fabrieksvoorgeschreven type volgens de handleiding (controleer elektrodenafstand met voelermaat conform specificatie van uw model).',
        'Luchtfilter demonteren en voorzichtig reinigen conform de reinigingsinstructies in de handleiding (uitkloppen of wassen met speciaal reinigingsmiddel).',
        'Brandstofzuigkop (filter in de tank) voorzichtig inspecteren met een draadhaakje op vervuiling of verharding.'
      ]
    },
    {
      level: 'LEVEL 3 — SERVICE PROCEDURE',
      badge: 'Vakhandelaar / Officiële service',
      description: 'Complexe technische reparaties die uitsluitend door een erkende dealer of getrainde technicus moeten worden uitgevoerd:',
      items: [
        'Interne carburateurrevisie: vervangen van verharde stuur- en pompmembranen, vlotternaald of interne brandstofzeef.',
        'Druk- en vacuümmeting van het carter (opsporen van valse lucht via versleten krukaskeerringen of voetpakking).',
        'Elektronische diagnose van STIHL M-Tronic systemen met behulp van het officiële STIHL MDG 1 diagnoseapparaat.',
        'Ontstekingsmodule testen onder werkbelasting en inspectie van vliegwielspie en ontstekingskabel.',
        'Compressiemeting van cilinder en zuiger bij vermoeden van mechanische slijtage of zuigervraat.'
      ]
    }
  ],

  startProcedures: {
    coldStart: {
      title: 'Koude Motor Startprocedure (Choke)',
      intro: 'Gebruik deze procedure wanneer de zaag nog niet gedraaid heeft of volledig is afgekoeld:',
      steps: [
        {
          step: 1,
          title: 'Kettingrem inschakelen',
          text: 'Duw de voorste handbeschermer naar voren tot deze vastklikt.'
        },
        {
          step: 2,
          title: 'Voorbereiding (indien aanwezig)',
          text: 'Druk de decompressieklep in (op zwaardere modellen) en druk 4 tot 5 keer op de handmatige brandstofpomp / primerbalg om brandstof naar de carburateur te voeren.'
        },
        {
          step: 3,
          title: 'Combihendel op Choke zetten',
          text: 'Druk de gashendelvergrendeling en de gashendel gelijktijdig in. Druk de Master Control combihendel helemaal naar beneden in de chokestand (/|\\).'
        },
        {
          step: 4,
          title: 'Stabiel trekken tot eerste ontsteking',
          text: 'Plaats de zaag vlak op de grond, rechtervoet in de achterhandgreep, linkerhand om de beugel. Trek het startkoord rustig uit tot weerstand voelbaar is en trek vervolgens krachtig recht omhoog. Herhaal dit tot de motor een eerste hoorbare ontsteking geeft (de bekende korte "plof" of aanslag, doorgaans binnen 2 tot 5 trekbewegingen).'
        },
        {
          step: 5,
          title: 'Direct doorschakelen naar Startstand (Halfgas)',
          text: 'STOP DIRECT MET TREKKEN zodra u de eerste ontsteking hoort! Zet de combihendel één klik omhoog naar de startstand / halfgasstand (/n/). Blijft u op volle choke trekken, dan verzuipt de motor onmiddellijk.'
        },
        {
          step: 6,
          title: 'Starten in Startstand',
          text: 'Trek opnieuw krachtig aan het startkoord tot de motor aanslaat en blijft draaien.'
        },
        {
          step: 7,
          title: 'Overschakelen naar Bedrijfsstand',
          text: 'Geef direct een korte kneep in de gashendel. De combihendel springt automatisch naar de normale bedrijfsstand (I) en het verhoogde starttoerental zakt direct naar het rustige stationair toerental.'
        }
      ]
    },
    warmStart: {
      title: 'Warme Motor Startprocedure (Zonder Choke)',
      intro: 'Gebruik deze procedure wanneer de zaag reeds op bedrijfstemperatuur is of slechts enkele minuten heeft stilgestaan:',
      steps: [
        {
          step: 1,
          title: 'Kettingrem inschakelen',
          text: 'Vergrendel altijd de handbeschermer naar voren.'
        },
        {
          step: 2,
          title: 'NOOIT choke gebruiken bij een warme motor',
          text: 'Zet de combihendel NOOIT in de chokestand (/|\\). Dit zuigt vloeibare brandstof in de warme verbrandingskamer waardoor de motor direct verzuipt.'
        },
        {
          step: 3,
          title: 'Startstand of Bedrijfsstand kiezen',
          text: 'Zet de combihendel in de startstand / halfgasstand (/n/) (of bij moderne machines en M-Tronic direct in bedrijfsstand I conform de handleiding van uw uitvoering).'
        },
        {
          step: 4,
          title: 'Startkoord doortrekken',
          text: 'Trek het startkoord krachtig door tot de motor loopt. Tik kort op de gashendel om eventueel verhoogd toerental direct te deactiveren.'
        }
      ]
    }
  },

  floodedEngineRecovery: {
    title: 'Verzopen Motor Herstellen (Officiële Procedure)',
    explanation: 'Een motor raakt "verzopen" wanneer er te veel vloeibare brandstof in de cilinder en het carter aanwezig is, meestal door herhaald doortrekken op volle choke nadat de motor al een eerste ontsteking heeft gegeven. Het mengsel is dan te rijk om door een elektrische bougievonk te kunnen ontbranden.',
    safetyNotice: 'Voer deze stappen uitsluitend uit in een goed geventileerde buitenomgeving, ver van open vuur of vonkbronnen. Draag werkhandschoenen bij het hanteren van een mogelijk warme bougie.',
    steps: [
      {
        step: 1,
        title: 'Ontsteking uitschakelen',
        text: 'Zet de combihendel in de stopstand (0 / STOP).'
      },
      {
        step: 2,
        title: 'Bougiedop verwijderen',
        text: 'Trek de rubberen bougiedop voorzichtig recht van de bougie af.'
      },
      {
        step: 3,
        title: 'Bougie uitbouwen',
        text: 'Draai de bougie met de bijgeleverde combinatiesleutel linksom los en verwijder deze uit de cilinderkop.'
      },
      {
        step: 4,
        title: 'Bougie drogen en reinigen',
        text: 'Inspecteer de elektroden: deze zijn nat van vloeibare benzine. Droog de bougie zorgvuldig af met een schone, vetvrije doek. Verwijder eventuele roetaanslag voorzichtig met een zachte messingborstel.'
      },
      {
        step: 5,
        title: 'Cilinder ventileren',
        text: 'Leg een droge, schone doek losjes over het open bougiegat om opspattend brandstofmengsel op te vangen. Trek met de combihendel op 0 (geen ontstekingsspanning) het startkoord 6 tot 10 keer krachtig en rustig door. Dit pompt de overtollige brandstofdampen veilig uit het carter en de cilinder.'
      },
      {
        step: 6,
        title: 'Bougie correct monteren',
        text: 'Draai de droge bougie eerst met de hand voorzichtig met de draad mee in de cilinderkop om beschadiging van het fijne schroefdraad te voorkomen. Draai hem daarna met de bougiesleutel vast conform de aanwijzingen in uw handleiding.'
      },
      {
        step: 7,
        title: 'Bougiedop monteren & Herstarten zonder choke',
        text: 'Druk de bougiedop stevig op de bougie tot deze vastklikt. Zet de combihendel in de startstand / halfgasstand (/n/) — absoluut GEEN choke gebruiken. Trek aan het startkoord tot de motor aanslaat (dit kan enkele extra trekken vereisen tot het resterende mengsel verdampt is).'
      }
    ]
  },

  technicalInspections: {
    fuel: {
      title: 'Brandstofkwaliteit, Mengverhouding & Veroudering',
      text: 'Gebruik altijd de brandstof en de exacte mengverhouding die in de handleiding van uw specifieke model wordt voorgeschreven. Voor 2-takt kettingzagen schrijft STIHL doorgaans hoogwaardige 2-takt motorolie gemengd met loodvrije benzine voor, of kant-en-klare alkylaatbrandstof (zoals STIHL MotoMix).',
      agingWarning: 'Reguliere pompbenzine (Euro 95 E10) bevat tot 10% bio-ethanol. Ethanol trekt vocht aan uit de omgevingslucht (hygroscopische werking). Na ongeveer 30 dagen kan fase-scheiding optreden, waarbij de benzine, de 2-takt olie en het water ontmengen. Dit leidt tot verstopping van de sproeiers, zuurvorming en ernstig risico op een vastloper. Gebruik bij voorkeur verse brandstof of kant-en-klare alkylaatbenzine met een lange houdbaarheid.'
    },
    sparkPlug: {
      title: 'Bougie-inspectie & Elektrodenafstand',
      text: 'Er bestaat geen universele bougie die in iedere STIHL kettingzaag past. Verschillende modellen vereisen verschillende warmtegraden en schroefdraadlengtes (raadpleeg altijd de handleiding van uw specifieke model voor het juiste type, zoals van Bosch, NGK of Champion).',
      colors: [
        { color: 'Koffiebruin tot grijsbruin', meaning: 'Optimale verbranding en correct mengsel.' },
        { color: 'Matzwart en roetig', meaning: 'Mengsel te rijk, verstopt luchtfilter of overmatige oliebijmenging.' },
        { color: 'Nat van benzine', meaning: 'Motor is verzopen of er ontbreekt een ontstekingsvonk.' },
        { color: 'Asgrijs of wit met parelvorming', meaning: 'Mengsel te arm of verkeerde warmtegraad; acuut risico op oververhitting en motorschade!' }
      ],
      gapNotice: 'Controleer de elektrodenafstand met een voelermaat conform de specificatie in de handleiding van uw model (doorgaans circa 0,5 mm bij veel gangbare STIHL modellen; raadpleeg altijd uw specifieke handleiding).'
    },
    carburetorVsMtronic: {
      title: 'Verschil tussen Klassieke Carburateurs en M-Tronic',
      text: 'Bij klassieke STIHL zagen regelt een mechanische membraancarburateur met stelschroeven (L, H en LA) de brandstoftoevoer. Ga hier niet blindelings aan draaien: een onjuiste H-instelling kan leiden tot zuigervraat.',
      mtronicText: 'Moderne STIHL zagen met M-Tronic (herkenbaar aan de typeaanduiding C-M, zoals de MS 241 C-M, MS 261 C-M en MS 362 C-M) hebben een elektronisch geregeld motormanagementsysteem. Een microprocessor regelt het ontstekingstijdstip en de brandstofdosering via een magneetventiel. Deze zagen hebben GEEN handmatige H- en L-stelschroeven. Bij startproblemen op M-Tronic modellen kan een kalibratieprocedure helpen, of is diagnose met het STIHL MDG 1 diagnoseapparaat bij de dealer aangewezen.'
    }
  },

  troubleshootingMatrix: [
    {
      symptom: 'Zaag start koud niet',
      possibleCause: 'Onjuiste combihendelstand, choke te lang aangehouden, verouderde brandstof of vervuilde bougie.',
      safeFirstCheck: 'Controleer of de stopschakelaar niet op 0 staat. Volg de koudstartprocedure en stop direct met de choke zodra de motor een eerste keer ploft.',
      nextStep: 'Bougie inspecteren op nattigheid/roet; brandstof vervangen door verse brandstof; handleidingprocedure raadplegen.'
    },
    {
      symptom: 'Zaag start koud wel, maar slaat na 2 seconden direct af',
      possibleCause: 'Combihendel te lang op choke laten staan of te snel van de startstand afgehaald; vervuild luchtfilter.',
      safeFirstCheck: 'Schakel direct na de eerste ontsteking naar de startstand (/n/) en trek opnieuw. Controleer of het luchtfilter schoon is.',
      nextStep: 'Controleer stationairloop conform handleiding; raadpleeg dealer bij brandstoftoevoerproblemen.'
    },
    {
      symptom: 'Zaag start warm niet',
      possibleCause: 'Choke per ongeluk gebruikt bij warme motor, dampbelvorming in brandstofleiding of verzopen toestand.',
      safeFirstCheck: 'Gebruik NOOIT de chokestand bij een warme motor. Laat de zaag enkele minuten afkoelen en start in startstand / halfgas (/n/) of stand I.',
      nextStep: 'Indien verzopen: bougie drogen volgens de verzopen motor procedure. Bij aanhoudend probleem dealerdiagnose.'
    },
    {
      symptom: 'Motor verzopen (sterke benzinegeur, natte bougie)',
      possibleCause: 'Herhaald doortrekken op volle choke nadat de motor al een eerste ontsteking heeft gegeven.',
      safeFirstCheck: 'Zet de combihendel op 0, draai de bougie eruit, droog deze af en trek het koord 6 tot 10 keer door met een doek over het bougiegat.',
      nextStep: 'Bougie terugplaatsen en herstarten in startstand (/n/) ZONDER choke.'
    },
    {
      symptom: 'Motor start, maar ketting draait stationair direct mee',
      possibleCause: 'Stationair toerental (LA) te hoog afgesteld of gebroken/verslapte koppelingsveren.',
      safeFirstCheck: 'Stop de machine onmiddellijk! Schakel de kettingrem in en bedien het gas niet.',
      nextStep: 'Stationair toerental conform handleiding bijstellen; bij gebroken koppelingsveer service door dealer vereist.'
    },
    {
      symptom: 'Startkoord trekt door zonder noemenswaardige weerstand',
      possibleCause: 'Decompressieklep staat open (normaal bij indrukken) of ernstig verlies van cilindercompressie.',
      safeFirstCheck: 'Controleer of de decompressieklep niet continu open blijft hangen.',
      nextStep: 'Level 3 dealercontrole: compressiemeting van cilinder en zuigerveren.'
    }
  ],

  whenToStopAndCallDealer: [
    'U heeft meer dan 20 keer getrokken zonder resultaat na het uitvoeren van de verzopen motor herstelprocedure.',
    'Het startkoord blokkeert mechanisch of er klinkt een metaalachtig schurend geluid uit het motorhuis.',
    'Er is sprake van zichtbare benzinelekkage langs het carter, de brandstoftank of de carburateurbehuizing.',
    'De motor vertoont geen enkele compressie meer bij het rustig uittrekken van het koord.',
    'Bij M-Tronic machines blijft het motormanagement onregelmatig functioneren na een officiële herstart; diagnose via de STIHL MDG 1 analysetool is dan noodzakelijk.'
  ],

  sources: [
    {
      documentTitle: 'STIHL 026 / MS 260 Instructiehandleiding',
      publicationId: '0458-133-3021',
      sourceClass: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'Kettingzagen (o.a. STIHL 026, MS 260)',
      notes: 'Officiële veiligheids-, start- en onderhoudsvoorschriften voor benzinekettingzagen met Master Control bediening.'
    },
    {
      documentTitle: 'STIHL MS 170 / MS 180 Instructiehandleiding',
      publicationId: '0458-017-0121',
      sourceClass: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'Compacte kettingzagen (MS 170, MS 180)',
      notes: 'Basisstartprocedures, koudstart versus warmstart, bougie-inspectie en brandstofvoorschriften.'
    },
    {
      documentTitle: 'STIHL MS 261 C-M Instructiehandleiding',
      publicationId: '0458-545-0121',
      sourceClass: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'Professionele M-Tronic kettingzagen',
      notes: 'Bediening van Master Control hendel bij M-Tronic en elektronisch geregelde brandstofdosering.'
    },
    {
      documentTitle: 'STIHL Veiligheidsbrochure: Veilig werken met de motorkettingzaag',
      publicationId: 'STIHL Veiligheidsrichtlijn',
      sourceClass: 'OFFICIAL_SAFETY_GUIDE',
      modelScope: 'Alle motorkettingzagen',
      notes: 'Veilige startposities, kettingremvergrendeling en persoonlijke beschermingsmiddelen.'
    },
    {
      documentTitle: 'STIHL Technische Informatie: Brandstofkwaliteit & Houdbaarheid van Mengsmering',
      publicationId: 'TI Brandstofvoorschriften',
      sourceClass: 'OFFICIAL_TECHNICAL_INFO',
      modelScope: '2-takt benzinemotoren',
      notes: 'Fasescheiding van ethanolbenzine, houdbaarheid van 2-takt mengsels en voordelen van alkylaatbenzine.'
    }
  ],

  faq: [
    {
      question: 'Waarom start mijn STIHL kettingzaag koud wel, maar warm niet?',
      answer: 'Dit wordt meestal veroorzaakt door het per ongeluk gebruiken van de chokestand (/|\\) bij een warme motor, waardoor deze direct verzuipt. Een andere mogelijke oorzaak bij warme motoren is dampbelvorming in de brandstofleiding na zware belasting of een ontstekingsspoel die bij hoge temperatuur faalt. Laat de zaag enkele minuten afkoelen en start altijd in de startstand / halfgas (/n/) zonder choke.'
    },
    {
      question: 'Hoe herken ik een verzopen motor bij een STIHL kettingzaag?',
      answer: 'Een verzopen motor herkent u aan een sterke benzinegeur rond de zaag, herhaaldelijk trekken zonder enige ontsteking, en vooral aan een bougie waarvan de elektroden nat zijn van vloeibare brandstof. Volg in dat geval de officiële procedure: bougie uitbouwen, droogmaken, cilinder ventileren met stopknop op 0, en herstarten in de startstand zonder choke.'
    },
    {
      question: 'Kan oude benzine ervoor zorgen dat mijn kettingzaag niet start?',
      answer: 'Ja. Reguliere pompbenzine (Euro 95 E10) veroudert al na ongeveer 30 dagen doordat ethanol vocht uit de lucht aantrekt. Hierdoor ontmengt de 2-takt olie zich van de benzine en ontstaan er hars- en gomafzettingen die de fijne sproeiers van de carburateur verstoppen. Ververs oude brandstof en gebruik bij voorkeur verse mengsmering of stabiele alkylaatbenzine zoals STIHL MotoMix.'
    },
    {
      question: 'Mag ik zelf de carburateurschroeven (H en L) bijstellen als de zaag niet start?',
      answer: 'Nee, het blindelings verdraaien van de H- en L-stelschroeven wordt sterk afgeraden. Als de zaag niet start, ligt de oorzaak vrijwel altijd bij de startprocedure, oude brandstof, een verzopen motor of een vervuilde bougie. Een onjuist afgestelde H-schroef kan leiden tot een te arm mengsel en binnen enkele seconden vollast resulteren in een vastgelopen motor (zuigervreter).'
    },
    {
      question: 'Heeft een STIHL kettingzaag met M-Tronic dezelfde startknoppen en carburateurschroeven?',
      answer: 'Nee. STIHL kettingzagen met M-Tronic (C-M modellen) hebben een microprocessor en een elektronisch gestuurd magneetventiel. Zij hebben helemaal geen handmatige H- en L-stelschroeven op de carburateur. Ook de startstand op de combihendel regelt de elektronica automatisch in. Bij hardnekkige startproblemen op M-Tronic machines is dealerdiagnose met het STIHL MDG 1 diagnoseapparaat vereist.'
    }
  ],

  relevantLinks: [
    { href: '/kettingzagen/', label: 'STIHL Kettingzagen Overzicht' },
    { href: '/gidsen/serienummer-locaties/', label: 'Serienummer Locaties Gids' },
    { href: '/onderdeelnummer/', label: 'STIHL Onderdeelnummers & Series' },
    { href: '/stihl-paspoort/', label: 'STIHL Machinepaspoort (Mijn STIHL)' }
  ]
};
