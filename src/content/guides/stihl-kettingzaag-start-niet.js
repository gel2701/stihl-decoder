/**
 * Substantive, Source-Bound Content Definition for STIHL Kettingzaag Start Niet Guide
 * Phase 49B-R1 — Source-Bound Guide & Procedure Integrity
 */

export const stihlKettingzaagStartNietGuide = {
  slug: 'stihl-kettingzaag-start-niet',
  title: 'STIHL Kettingzaag Start Niet? Oorzaken & Veilig Stappenplan voor Diagnose',
  shortTitle: 'Kettingzaag Start Niet',
  metaDescription: 'Start uw STIHL kettingzaag niet of is de motor verzopen? Bekijk de veilige inspectieprincipes en gedocumenteerde fabrieksrichtlijnen voor startprocedure, brandstof en bougie.',
  lastReviewed: '2026-09-26',
  publicationStatus: 'PUBLISHED',
  publicationEligible: true,
  categoryScope: 'kettingzagen',
  fuelScope: 'PETROL_2STROKE',

  sources: [
    {
      id: 'src-0458-133-3021',
      source_id: 'src-0458-133-3021',
      canonical_document_id: '0458-133-3021',
      publicationId: '0458-133-3021',
      publication_id: '0458-133-3021',
      documentTitle: 'STIHL 026 Instruction Manual',
      document_title: 'STIHL 026 Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'STIHL 026',
      model_scope: ['026'],
      locator: {
        page: 38,
        section: 'Starting / Stopping the Engine',
        heading: 'Starting the Engine'
      },
      notes: 'Officiële fabrieksbedieningshandleiding voor de klassieke STIHL 026 met Master Control bediening.'
    },
    {
      id: 'src-0458-573-8621-d',
      source_id: 'src-0458-573-8621-d',
      canonical_document_id: '0458-573-8621-D',
      publicationId: '0458-573-8621-D',
      publication_id: '0458-573-8621-D',
      documentTitle: 'STIHL MS 261 Instruction Manual',
      document_title: 'STIHL MS 261 Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'STIHL MS 261 / MS 261 C-M',
      model_scope: ['MS 261', 'MS 261 C-M'],
      locator: {
        page: 34,
        section: 'Starting / Stopping the Engine',
        heading: 'Starting the Engine'
      },
      notes: 'Officiële fabrieksbedieningshandleiding voor STIHL MS 261 en MS 261 C-M met M-Tronic motormanagement.'
    },
    {
      id: 'src-0458-207-8321-b',
      source_id: 'src-0458-207-8321-b',
      canonical_document_id: '0458-207-8321-B',
      publicationId: '0458-207-8321-B',
      publication_id: '0458-207-8321-B',
      documentTitle: 'STIHL MS 170, MS 170 C, MS 180, MS 180 C Instruction Manual',
      document_title: 'STIHL MS 170, MS 170 C, MS 180, MS 180 C Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      modelScope: 'STIHL MS 170 / MS 180',
      model_scope: ['MS 170', 'MS 180'],
      locator: {
        page: 22,
        section: 'Starting / Stopping the Engine',
        heading: 'Starting the Engine'
      },
      notes: 'Officiële fabrieksinstructie voor de compacte serie MS 170 en MS 180 kettingzagen.'
    }
  ],

  directAnswer: {
    heading: 'Kort antwoord: wat kunt u veilig direct controleren?',
    content: 'Controleer eerst de juiste startprocedure (koud starten met choke vs. warm starten zonder choke conform de handleiding van uw specifieke model), de stand van de stop-/combischakelaar, verse brandstof, de bougie en het luchtfilter. Schakel altijd de kettingrem in en start op een stabiele ondergrond. Blijft de zaag weigeren of vermoedt u een verzopen motor (sterke brandstofgeur, natte bougie), volg dan de ontzopingsprocedure uit de handleiding van uw machine. Draai niet blindelings aan de carburateurschroeven; vereiste instellingen verschillen per model en moderne M-Tronic kettingzagen hebben geen handmatige stelschroeven.'
  },

  warnings: [
    {
      title: 'Kettingrem altijd inschakelen vóór het starten',
      text: 'Duw de voorste handbeschermer naar voren tot deze hoorbaar vergrendelt. De zaagketting mag tijdens het starten nooit kunnen meedraaien. Start een motorzaag uitsluitend wanneer de kettingrem geblokkeerd is.',
      severity: 'danger',
      sourceRefs: ['src-0458-133-3021', 'src-0458-573-8621-d', 'src-0458-207-8321-b']
    },
    {
      title: 'Stabiele startpositie verplicht',
      text: 'Plaats de kettingzaag vlak en stabiel op de grond. Zorg dat het zaagblad en de ketting vrij liggen van takken, aarde en stenen. Gebruik uitsluitend een door de handleiding van uw machinetype toegestane stabiele startmethode. Voor standaard achterhandgreepmodellen: plaats de rechtervoet stevig in de achterste handgreep en houd de voorste handbeugel met de linkerhand vast (duim om de beugel). Let op: bij speciale tophandle motorzagen (boomverzorgingszagen met handgreep bovenop) is starten met de voet in de handgreep fysiek niet van toepassing; raadpleeg hiervoor altijd de specifieke handleiding van uw machine. Start een kettingzaag NOOIT \'uit de hand\' (vliegende start); dit leidt tot ernstig ongevalsgevaar.',
      severity: 'danger',
      sourceRefs: ['src-0458-133-3021', 'src-0458-573-8621-d', 'src-0458-207-8321-b']
    },
    {
      title: 'Brand- en ontploffingsgevaar',
      text: 'Controleer brandstof en bougies uitsluitend in de open lucht en op minimaal 3 meter afstand van de tankplek. Voer nooit een vonktest uit met een open bougiegat of in de buurt van gemorste benzine.',
      severity: 'warning',
      sourceRefs: ['src-0458-133-3021', 'src-0458-207-8321-b']
    },
    {
      title: 'Gevaar voor motorschade bij ondeskundige carburateurafstelling',
      text: 'Draai nooit zonder toerenteller en modelspecifieke fabrieksgegevens aan de H- of L-stelschroeven van een klassieke carburateur; een te arme afstelling kan oververhitting en ernstige motorschade veroorzaken.',
      severity: 'warning',
      sourceRefs: ['src-0458-133-3021']
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
        'Volg de exacte koud- of warmstartprocedure uit de handleiding van uw specifieke model.',
        'Controleer de brandstof: gebruik verse brandstof volgens de handleiding; oude brandstof kan verouderen en ontmengen.',
        'Controleer het brandstofniveau en de ontluchting van de brandstoftank.',
        'Controleer of het luchtfilter niet dichtgeslibd is met zaagsel of hars.'
      ]
    },
    {
      level: 'LEVEL 2 — EXPERIENCED USER / MANUAL REQUIRED',
      badge: 'Inspectie met gereedschap & handleiding',
      description: 'Handelingen waarvoor de bijgeleverde combinatiesleutel en de officiële handleiding vereist zijn:',
      items: [
        'Bougie uitbouwen met combinatiesleutel en visueel controleren op elektrodekleur, roetaanslag of nattigheid.',
        'Verzopen motor herstelprocedure uitvoeren conform de specifieke handleiding van uw model.',
        'Bougie vervangen door het exacte fabrieksvoorgeschreven type volgens de handleiding (controleer elektrodenafstand met voelermaat conform modelspecificatie).',
        'Luchtfilter demonteren en reinigen conform de voorschriften in de handleiding van uw uitvoering.',
        'Brandstofzuigkop (filter in de tank) inspecteren op vervuiling of verharding.'
      ]
    },
    {
      level: 'LEVEL 3 — SERVICE PROCEDURE',
      badge: 'Vakhandelaar / Officiële service',
      description: 'Complexe technische controles die uitsluitend door een erkende dealer of getrainde technicus moeten worden uitgevoerd:',
      items: [
        'Interne carburateurrevisie: vervangen van verharde stuur- en pompmembranen, vlotternaald of interne brandstofzeef.',
        'Druk- en vacuümmeting van het carter (opsporen van valse lucht via versleten krukaskeerringen of pakkingen).',
        'Elektronische diagnose van STIHL M-Tronic systemen met behulp van het voor de generatie voorgeschreven diagnosesysteem.',
        'Ontstekingsmodule testen onder werkbelasting en inspectie van vliegwielspie en ontstekingskabel.',
        'Compressiemeting van cilinder en zuiger bij vermoeden van mechanische slijtage.'
      ]
    }
  ],

  startProcedures: {
    genericPrinciple: {
      heading: 'Basisprincipe voor Startprocedures',
      text: 'Gebruik altijd de koud- of warmstartprocedure uit de officiële handleiding van uw exacte machine. Choke-, primer- en hendelstanden verschillen wezenlijk per model, generatie en uitrusting (zoals Master Control, klassieke chokehendel of elektronisch geregeld M-Tronic systeem). Probeer nooit blindelings een procedure van een ander type zaag toe te passen.'
    },
    documentedExamples: {
      stihl026: {
        modelLabel: 'STIHL 026 (Klassieke Kettingzaag met Master Control)',
        sourceDoc: 'STIHL 026 Instruction Manual (0458-133-3021, p. 38)',
        coldStartIntro: 'Koud starten volgens officiële handleiding STIHL 026:',
        steps: [
          {
            step: 1,
            title: 'Kettingrem blokkeren',
            text: 'Duw de voorste handbeschermer naar voren om de kettingrem te vergrendelen.',
            sourceRefs: ['src-0458-133-3021']
          },
          {
            step: 2,
            title: 'Chokestand inschakelen',
            text: 'Druk de gashendelvergrendeling en de gashendel gelijktijdig in en beweeg de Master Control combihendel helemaal naar beneden in de chokestand.',
            sourceRefs: ['src-0458-133-3021']
          },
          {
            step: 3,
            title: 'Trekken tot eerste ontsteking',
            text: 'Plaats de zaag stabiel op de grond met de voet in de achtergreep. Trek het startkoord rustig uit tot weerstand voelbaar is en trek krachtig recht omhoog tot de motor een eerste hoorbare ontsteking geeft.',
            sourceRefs: ['src-0458-133-3021']
          },
          {
            step: 4,
            title: 'Direct doorschakelen naar Startstand',
            text: 'Zet de combihendel direct één klik omhoog naar de startstand (halfgas). Blijf niet op volle choke trekken.',
            sourceRefs: ['src-0458-133-3021']
          },
          {
            step: 5,
            title: 'Starten en naar bedrijfstand overgaan',
            text: 'Trek het startkoord opnieuw krachtig door tot de motor aanslaat. Raak direct kort de gashendel aan: de hendel springt naar de normale bedrijfsstand (I) en het verhoogde toerental zakt naar stationair.',
            sourceRefs: ['src-0458-133-3021']
          }
        ]
      },
      stihlMs261: {
        modelLabel: 'STIHL MS 261 / MS 261 C-M (Professionele Zaag)',
        sourceDoc: 'STIHL MS 261 Instruction Manual (0458-573-8621-D, p. 34)',
        coldStartIntro: 'Starten volgens officiële handleiding STIHL MS 261 / MS 261 C-M:',
        steps: [
          {
            step: 1,
            title: 'Kettingrem inschakelen & Decompressieklep',
            text: 'Schakel de kettingrem in door de handbeschermer naar voren te drukken. Druk op de decompressieklep (indien aanwezig) om de startweerstand te verlagen.',
            sourceRefs: ['src-0458-573-8621-d']
          },
          {
            step: 2,
            title: 'Startstand kiezen',
            text: 'Druk gashendelvergrendeling en gashendel in en zet de combihendel in de voorgeschreven startstand conform de hendelmarkeringen van deze uitvoering.',
            sourceRefs: ['src-0458-573-8621-d']
          },
          {
            step: 3,
            title: 'Startkoord doortrekken',
            text: 'Plaats de machine vlak op de grond en trek het startkoord rustig uit tot weerstand en trek daarna gelijkmatig en krachtig door tot de motor loopt.',
            sourceRefs: ['src-0458-573-8621-d']
          },
          {
            step: 4,
            title: 'Gashendel aantippen',
            text: 'Druk de gashendel kort in zodat de combihendel naar de bedrijfsstand (I) schakelt.',
            sourceRefs: ['src-0458-573-8621-d']
          }
        ]
      }
    }
  },

  floodedEngineRecovery: {
    genericPrinciple: {
      heading: 'Wat te doen bij een verzopen motor?',
      text: 'Een motor kan verzopen raken wanneer er te veel vloeibare brandstof in de verbrandingskamer terechtkomt, doorgaans door herhaaldelijk starten op volle choke nadat de motor al een eerste ontsteking heeft gegeven. Volg altijd de specifieke ontzopingsprocedure uit de handleiding van uw machine.'
    },
    documentedExamples: {
      stihl026: {
        modelLabel: 'Gedocumenteerd voorbeeld: STIHL 026 ontzopingsprocedure',
        sourceDoc: 'STIHL 026 Instruction Manual (0458-133-3021, p. 42)',
        steps: [
          {
            step: 1,
            title: 'Ontsteking uitschakelen',
            text: 'Zet de Master Control combihendel in de stopstand (0).',
            sourceRefs: ['src-0458-133-3021']
          },
          {
            step: 2,
            title: 'Bougie demonteren',
            text: 'Trek de bougiedop los en draai de bougie linksom uit de cilinderkop met de combinatiesleutel.',
            sourceRefs: ['src-0458-133-3021']
          },
          {
            step: 3,
            title: 'Bougie droogmaken',
            text: 'Droog en reinig de natte bougie zorgvuldig.',
            sourceRefs: ['src-0458-133-3021']
          },
          {
            step: 4,
            title: 'Cilinder ventileren',
            text: 'Trek met uitgeschakelde ontsteking het startmechanisme meerdere malen rustig door om overtollige brandstofdampen uit de cilinder te verdrijven.',
            sourceRefs: ['src-0458-133-3021']
          },
          {
            step: 5,
            title: 'Bougie monteren & Herstarten zonder choke',
            text: 'Plaats de droge bougie handvast terug en zet vast met de sleutel. Druk de bougiedop vast. Zet de hendel in de startstand (halfgas) en herstart ZONDER chokestand.',
            sourceRefs: ['src-0458-133-3021']
          }
        ]
      }
    }
  },

  technicalInspections: {
    fuel: {
      title: 'Brandstofkwaliteit & Opslagveroudering',
      text: 'Gebruik altijd de brandstof en de exacte mengverhouding die in de handleiding van uw specifieke model wordt voorgeschreven. Voor 2-takt kettingzagen schrijft STIHL doorgaans hoogwaardige 2-takt motorolie gemengd met loodvrije benzine voor, of kant-en-klare alkylaatbrandstof.',
      agingNotice: 'Brandstof veroudert tijdens opslag. De snelheid hangt af van samenstelling, opslagcondities en verpakking. Gebruik brandstof volgens de bewaarinstructies in de handleiding en vervang brandstof bij twijfel door verse, correct voorgeschreven brandstof.'
    },
    sparkPlug: {
      title: 'Bougie-inspectie & Elektrodenbeeld',
      text: 'Er bestaat geen universele bougie die in iedere STIHL kettingzaag past. Verschillende modellen vereisen verschillende warmtegraden en schroefdraadlengtes (raadpleeg altijd de handleiding van uw specifieke model voor het juiste type).',
      colors: [
        { color: 'Koffiebruin tot grijsbruin', meaning: 'Kan passen bij een evenwichtige verbranding en geschikte mengselverhouding.' },
        { color: 'Matzwart of roetig', meaning: 'Kan wijzen op een rijk mengsel, vervuild luchtfilter of overmatige oliebijmenging.' },
        { color: 'Nat van brandstof', meaning: 'Kan wijzen op een verzopen toestand of ontbrekende ontsteking.' },
        { color: 'Asgrijs of witachtig', meaning: 'Kan wijzen op een te arm mengsel of thermische overbelasting.' }
      ],
      gapNotice: 'Controleer de elektrodenafstand met een voelermaat conform de modelspecificatie in de handleiding (raadpleeg uw specifieke handleiding).'
    },
    carburetorVsMtronic: {
      title: 'Verschil tussen Klassieke Carburateurs en M-Tronic',
      text: 'Bij klassieke STIHL zagen regelt een mechanische membraancarburateur met stelschroeven (L, H en LA) de brandstoftoevoer. Ga hier niet blindelings aan draaien: een te arme afstelling kan oververhitting en ernstige motorschade veroorzaken.',
      mtronicText: 'Moderne STIHL zagen met M-Tronic (herkenbaar aan de aanduiding C-M, zoals de MS 261 C-M) hebben een elektronisch gestuurd motormanagementsysteem. Een regeleenheid doseert brandstof via een magneetventiel. Deze machines hebben GEEN handmatige H- en L-stelschroeven. Bij storing is dealerdiagnose met het voor deze generatie voorgeschreven STIHL diagnosesysteem aangewezen.'
    }
  },

  troubleshootingMatrix: [
    {
      symptom: 'Zaag start koud niet',
      possibleCause: 'Onjuiste combihendelstand, choke te lang aangehouden, verouderde brandstof of vervuilde bougie.',
      safeFirstCheck: 'Controleer of de stopschakelaar niet op 0 staat. Volg de koudstartprocedure uit de handleiding en stop met de chokestand zodra de motor een eerste keer ontsteekt.',
      nextStep: 'Bougie inspecteren op nattigheid/roet; brandstof controleren; handleidingprocedure raadplegen.'
    },
    {
      symptom: 'Zaag start koud wel, maar slaat na enkele seconden af',
      possibleCause: 'Combihendel te lang op choke laten staan of te snel van de startstand afgehaald; vervuild luchtfilter.',
      safeFirstCheck: 'Schakel direct na de eerste ontsteking naar de startstand en trek opnieuw. Controleer of het luchtfilter schoon is.',
      nextStep: 'Controleer stationairloop conform handleiding; raadpleeg dealer bij brandstoftoevoerproblemen.'
    },
    {
      symptom: 'Zaag start warm niet',
      possibleCause: 'Choke per ongeluk gebruikt bij warme motor, dampbelvorming in brandstofleiding of verzopen toestand.',
      safeFirstCheck: 'Gebruik de warme startprocedure zonder choke conform de handleiding van uw model. Laat de zaag eventueel enkele minuten afkoelen.',
      nextStep: 'Indien verzopen: volg ontzopingsprocedure uit handleiding. Bij aanhoudend probleem dealerdiagnose.'
    },
    {
      symptom: 'Motor verzopen (brandstofgeur, natte bougie)',
      possibleCause: 'Herhaald doortrekken op volle choke nadat de motor al een eerste ontsteking heeft gegeven.',
      safeFirstCheck: 'Zet de combihendel op 0, draai de bougie eruit, droog deze af en ventileer de cilinder conform de handleiding.',
      nextStep: 'Bougie terugplaatsen en herstarten in de startstand ZONDER choke.'
    },
    {
      symptom: 'Motor start, maar zaagketting draait stationair direct mee',
      possibleCause: 'Stationair toerental te hoog afgesteld of defecte/verslapte koppelingsveren.',
      safeFirstCheck: 'Stop de machine onmiddellijk! Schakel de kettingrem in en bedien het gas niet.',
      nextStep: 'Stationair toerental conform handleiding controleren; service door dealer vereist bij mechanisch koppelingsdefect.'
    },
    {
      symptom: 'Startkoord trekt door zonder noemenswaardige weerstand',
      possibleCause: 'Decompressieklep staat open (normaal bij indrukken) of ernstig verlies van cilindercompressie.',
      safeFirstCheck: 'Controleer of de decompressieklep niet continu open blijft hangen.',
      nextStep: 'Level 3 dealercontrole: compressiemeting van cilinder en zuigerveren.'
    }
  ],

  whenToStopAndCallDealer: [
    'U heeft herhaaldelijk getrokken zonder resultaat na het uitvoeren van de ontzopingsprocedure uit de handleiding.',
    'Het startkoord blokkeert mechanisch of er klinkt een metaalachtig schurend geluid uit het motorhuis.',
    'Er is sprake van zichtbare brandstoflekkage langs het carter, de tank of de carburateurbehuizing.',
    'De motor vertoont geen compressieweerstand meer bij het uittrekken van het startkoord.',
    'Bij M-Tronic machines blijft het motormanagement onregelmatig functioneren na herstart; dealerdiagnose met het voor deze generatie voorgeschreven diagnosesysteem is dan noodzakelijk.'
  ],

  faq: [
    {
      question: 'Waarom start mijn STIHL kettingzaag koud wel, maar warm niet?',
      answer: 'Dit kan optreden wanneer per ongeluk de chokestand wordt gebruikt bij een warme motor, waardoor deze direct verzuipt. Andere mogelijke oorzaken bij warme motoren zijn dampbelvorming in het brandstofsysteem na zware belasting of een ontstekingscomponent die bij verhoogde bedrijfstemperatuur faalt. Laat de zaag afkoelen en raadpleeg de warmstartprocedure uit uw handleiding.'
    },
    {
      question: 'Hoe herken ik een verzopen motor bij een STIHL kettingzaag?',
      answer: 'Een verzopen motor kan gepaard gaan met een sterke brandstofgeur rond de machine, uitblijven van ontsteking bij het starten, en een bougie waarvan de elektroden nat zijn van vloeibare brandstof. Volg in dat geval de ontzopingsinstructie uit de handleiding van uw specifieke model.'
    },
    {
      question: 'Kan oude brandstof startproblemen veroorzaken?',
      answer: 'Ja. Brandstof kan tijdens langere opslag verouderen en ontmengen, wat kan leiden tot gomafzettingen in de carburateursproeiers. Gebruik brandstof volgens de voorschriften in de handleiding van uw model en ververs brandstof die te lang opgeslagen is geweest.'
    },
    {
      question: 'Mag ik zelf de carburateurschroeven (H en L) bijstellen als de zaag niet start?',
      answer: 'Nee, het blindelings verdraaien van H- en L-stelschroeven wordt afgeraden. Als de zaag niet start, ligt de oorzaak vrijwel altijd bij de bediening, brandstof, ontzoping of bougie. Een te arme afstelling kan oververhitting en ernstige motorschade veroorzaken.'
    },
    {
      question: 'Heeft een STIHL kettingzaag met M-Tronic dezelfde carburateurschroeven?',
      answer: 'Nee. STIHL kettingzagen met M-Tronic (C-M modellen) hebben een elektronisch motormanagement en geen handmatige H- en L-stelschroeven op de carburateur. Bij hardnekkige start- of regelproblemen op M-Tronic machines is dealerdiagnose met het voor deze generatie voorgeschreven diagnosesysteem vereist.'
    }
  ],

  relevantLinks: [
    { href: '/kettingzagen/', label: 'STIHL Kettingzagen Overzicht' },
    { href: '/gidsen/serienummer-locaties/', label: 'Serienummer Locaties Gids' },
    { href: '/onderdeelnummer/', label: 'STIHL Onderdeelnummers & Series' },
    { href: '/stihl-paspoort/', label: 'STIHL Machinepaspoort (Mijn STIHL)' }
  ]
};
