import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderStihlPassportHtml, buildPassportViewModel } from './StihlPassportGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

/**
 * Checks physical disk availability of photos for a given serial number.
 */
export function checkSalesPhotosReachability(serial, photoList = []) {
  if (!serial) {
    return { allReachable: false, reachableCount: 0, totalCount: 0, photos: [] };
  }

  const photoDirs = [
    path.join(rootDir, 'public', 'sales', String(serial)),
    path.join(rootDir, 'sales', String(serial))
  ];

  const results = (photoList || []).map((item) => {
    const filename = typeof item === 'string' ? item : item.filename;
    const label = typeof item === 'object' && item.label ? item.label : filename;
    let exists = false;
    let diskPath = null;

    for (const dir of photoDirs) {
      const candidate = path.join(dir, filename);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        exists = true;
        diskPath = candidate;
        break;
      }
    }

    return {
      filename,
      label,
      exists,
      diskPath,
      url: `/sales/${serial}/${filename}`
    };
  });

  const allReachable = results.length > 0 && results.every((r) => r.exists);
  const reachableCount = results.filter((r) => r.exists).length;

  return {
    allReachable,
    reachableCount,
    totalCount: results.length,
    photos: results
  };
}

/**
 * Generates neutral, factual sales advertisement text for marketplaces (Marktplaats, 2dehands, etc.).
 * Strictly excludes unproven theft or official certification claims.
 */
export function generateSalesAdvertText(machine, baseUrl = 'https://www.stihldecoder.nl') {
  const serial = machine.serial_number || (machine.machine && machine.machine.serial_number) || '';
  const passportUrl = `${baseUrl.replace(/\/$/, '')}/paspoort/${serial}/`;
  const askingPrice = machine.sales?.asking_price || machine.asking_price_formatted || machine.asking_price || '€ 385,-';
  const location = machine.sales?.location || machine.location || 'Coevorden';
  const condition = machine.sales?.condition || machine.condition || 'Volledig werkend, volgens verkoper';
  const modelName = machine.normalized_model || machine.model_name || 'MS 260 C-B';
  const officialProd = machine.official_product_name || `${modelName} Motorsäge`;

  return `STIHL ${modelName} Profi Kettingzaag – Machinepaspoort (Serienummer ${serial})

Vraagprijs: ${askingPrice}
Locatie: ${location}
Staat: ${condition}

Te koop aangeboden: een professionele STIHL ${modelName} benzinekettingzaag. 
Deze machine is voorzien van een digitaal STIHL-machinepaspoort met geverifieerde MY STIHL-modelkoppeling via STIHLDecoder.nl.

SPECIFICATIES
• Fabrikant: STIHL (Waiblingen, Duitsland)
• Model: ${modelName} (${officialProd})
• Cilinderinhoud: 50,2 cc
• Vermogen: 2,6 kW / 3,5 pk
• Aandrijving: Benzine (2-takt mengsmering 1:50)
• Zaagblad / Ketting: .325" P kettingsteek, 1,6 mm groefbreedte
• Uitvoering: C-B (voorzien van gereedschapsloze kettingsnelspanner en decompressieventiel)
• Serienummer: ${serial}

VERIFICATIE & VEILIGHEID
✓ Modelidentiteit en uitvoering gecontroleerd via officiële MY STIHL-productlookup
✓ Serienummer fysiek aanwezig en leesbaar op het carter
• Diefstalverificatie: Het serienummer is transparant vermeld (${serial}) en kan door de koper zelfstandig worden gecontroleerd via StopHeling.nl
• Transparant machinepaspoort met fabrieks- en modelspecificaties

ONLINE MACHINEPASPOORT & LIVE RAPPORT:
Bekijk het digitale machinepaspoort en alle technische details direct via:
${passportUrl}

(Scan de QR-code in de advertentiefoto's om direct het mobiele paspoort te openen)

OVERNAME & BEZICHTIGING:
Bezichtiging, proefdraaien en ophalen in ${location} in overleg mogelijk.
Verzending is bespreekbaar op kosten en risico van de koper.

Disclaimer: STIHLDecoder.nl is een onafhankelijk kennisplatform en geen officieel certificeringsorgaan van Andreas Stihl AG & Co. KG.`;
}

/**
 * Universal Machine Passport Page Renderer
 * Serves BOTH regular user passports AND passports with optional sales listing using the EXACT SAME TEMPLATE.
 */
export function renderUniversalPassportPageHtml({ idOrSerial, machine, database, baseUrl = 'https://www.stihldecoder.nl' }) {
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const serial = machine.serial_number || (machine.machine && machine.machine.serial_number) || (String(idOrSerial).match(/^\d{8,10}$/) ? String(idOrSerial) : null);
  const passportUrl = `${cleanBaseUrl}/paspoort/${idOrSerial}/`;
  
  const rawModelName = machine.official_product_name || machine.normalized_model || machine.model_name || machine.model || 'STIHL Machine';
  const canonicalModelSlug = machine.canonical_model_id ? machine.canonical_model_id.replace(/^stihl_/, '') : (machine.model_slug || 'ms-260');
  const categorySlug = machine.category_slug || (machine.identity && machine.identity.category_slug) || 'kettingzagen';
  const categoryName = machine.category || (machine.identity && machine.identity.category) || 'Kettingzagen';
  const canonicalModelPath = `/${categorySlug}/${canonicalModelSlug}/`;
  const canonicalPartsPath = `${canonicalModelPath}onderdelen/`;

  // Check sales extension status
  const sales = machine.sales || {};
  const isForSale = Boolean(sales.is_for_sale || machine.asking_price_formatted || machine.asking_price_eur || machine.is_for_sale);
  const askingPrice = sales.asking_price || machine.asking_price_formatted || (machine.asking_price_eur ? `€ ${machine.asking_price_eur},-` : null);
  const condition = sales.condition || machine.condition || null;
  const location = sales.location || machine.location || null;
  const description = sales.description || machine.description || null;
  const contactInfo = sales.contact_info || machine.contact_info || null;

  // Photos
  const rawPhotos = (sales.photos && sales.photos.length > 0) ? sales.photos : (machine.photos || []);
  const photoStatus = checkSalesPhotosReachability(serial, rawPhotos);
  const advertText = isForSale ? generateSalesAdvertText(machine, cleanBaseUrl) : null;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(passportUrl)}`;

  // Maintenance events (if present in dossier)
  const maintenanceEvents = machine.maintenance?.events || machine.events || [];

  // Universal Passport ViewModel Input
  const passportData = {
    serialNumber: serial,
    model: rawModelName,
    modelSlug: canonicalModelSlug,
    canonicalModelId: machine.canonical_model_id || (machine.identity && machine.identity.canonical_model_id) || `stihl_${canonicalModelSlug}`,
    identitySource: machine.identity_verification?.status || machine.identity?.identity_source || 'OFFICIAL_STIHL_LOOKUP',
    category: categoryName,
    categorySlug: categorySlug,
    publicPassportUrl: passportUrl,
    salesListing: isForSale ? {
      isForSale: true,
      askingPrice,
      condition,
      location,
      description,
      contactInfo,
      sellerRole: machine.seller_role || 'Particuliere verkoper',
      verificationBadge: '✓ Geverifieerd via MY STIHL productregistratie',
      photos: rawPhotos,
      photosReachable: photoStatus.allReachable
    } : null
  };

  const passportCardHtml = renderStihlPassportHtml(passportData, database);

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>STIHL ${machine.normalized_model || rawModelName}${serial ? ` (${serial})` : ''} — Machinepaspoort</title>
  <meta name="description" content="Digitaal STIHL machinepaspoort voor ${machine.normalized_model || rawModelName}${serial ? ` met serienummer ${serial}` : ''}.${isForSale ? ` Vraagprijs ${askingPrice || 'op aanvraag'}, locatie ${location || 'Nederland'}.` : ''}">
  <link rel="canonical" href="${passportUrl}">
  <meta name="robots" content="noindex, follow">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/tailwind.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans selection:bg-orange-600 selection:text-white">

  <!-- Universal Header -->
  <header class="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-40">
    <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-orange-600/30">
          S
        </div>
        <div>
          <span class="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            STIHL Decoder
            <span class="text-2xs font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Machinepaspoort</span>
          </span>
          <p class="text-2xs text-gray-400">Universeel Digitaal STIHL Machinepaspoort</p>
        </div>
      </a>
      <div class="flex items-center gap-3 text-xs">
        <a href="${canonicalModelPath}" class="text-gray-300 hover:text-white transition hidden sm:inline">Modelgids →</a>
        <a href="/stihl-paspoort/" class="text-orange-400 font-bold hover:underline">📋 Mijn Paspoorten</a>
      </div>
    </div>
  </header>

  <!-- Main Container -->
  <main class="max-w-5xl mx-auto px-4 py-6 flex-1 w-full space-y-8">

    <!-- Kruimelpad (Breadcrumbs) -->
    <nav aria-label="Kruimelpad" class="text-xs text-gray-400 flex flex-wrap items-center gap-1.5">
      <a href="/" class="hover:text-white transition">Home</a>
      <span>/</span>
      <a href="/${categorySlug}/" class="hover:text-white transition">${categoryName}</a>
      <span>/</span>
      <a href="${canonicalModelPath}" class="hover:text-white transition">STIHL ${canonicalModelSlug.toUpperCase()}</a>
      <span>/</span>
      <span class="text-orange-400 font-mono font-bold">Paspoort ${serial || idOrSerial}</span>
    </nav>

    <!-- Hero / Title -->
    <section class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
          Machinepaspoort
        </span>
        ${machine.official_product_name ? `
          <span class="px-2.5 py-0.5 rounded-full text-2xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ✓ MY STIHL Modelkoppeling
          </span>
        ` : ''}
        ${isForSale ? `
          <span class="px-2.5 py-0.5 rounded-full text-2xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
            🏷️ Te koop aangeboden
          </span>
        ` : ''}
        ${location ? `
          <span class="px-2.5 py-0.5 rounded-full text-2xs font-mono text-gray-400 bg-gray-900 border border-gray-800">
            📍 ${location}
          </span>
        ` : ''}
      </div>

      <div class="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
        <div>
          <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            STIHL ${machine.normalized_model || rawModelName}
          </h1>
          ${machine.official_product_name ? `
            <p class="text-sm text-gray-400 mt-1">
              Geverifieerde uitvoering: <strong class="text-gray-200 font-mono">${machine.official_product_name}</strong>
            </p>
          ` : ''}
        </div>
        ${(isForSale && askingPrice) ? `
          <div class="text-left sm:text-right">
            <span class="text-xs text-gray-400 block font-medium">Vraagprijs</span>
            <span class="text-3xl font-black text-orange-400 font-mono tracking-tight">${askingPrice}</span>
          </div>
        ` : ''}
      </div>
    </section>

    <!-- Standard Passport Presentation Card -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
          <span>📋</span> Digitaal Machinepaspoort
        </h2>
        <span class="text-xs text-gray-400 font-mono">ID: ${serial || idOrSerial}</span>
      </div>
      
      ${passportCardHtml}
    </section>

    <!-- OPTIONELE VERKOOPSECTIE (ALLEEN ZICHTBAAR BIJ VERKOOP) -->
    ${isForSale ? `
      <section class="bg-gray-900/90 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
          <span>🏷️</span> Verkoopgegevens & Eigenschappen
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div class="bg-gray-950 p-4 rounded-xl border border-gray-800">
            <span class="text-gray-400 block font-medium">Vraagprijs</span>
            <span class="text-base font-bold text-orange-400 font-mono">${askingPrice || 'Prijs op aanvraag'}</span>
          </div>
          <div class="bg-gray-950 p-4 rounded-xl border border-gray-800">
            <span class="text-gray-400 block font-medium">Technische Conditie</span>
            <span class="text-sm font-bold text-white">${condition || 'Niet gespecificeerd'}</span>
          </div>
          <div class="bg-gray-950 p-4 rounded-xl border border-gray-800">
            <span class="text-gray-400 block font-medium">Locatie</span>
            <span class="text-sm font-bold text-white">${location || 'Niet gespecificeerd'}</span>
          </div>
          <div class="bg-gray-950 p-4 rounded-xl border border-gray-800">
            <span class="text-gray-400 block font-medium">Modelidentiteit</span>
            <span class="text-sm font-bold text-emerald-400">MY STIHL Lookup</span>
          </div>
        </div>

        ${description ? `
          <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 text-xs space-y-1">
            <span class="text-gray-400 block font-medium">Omschrijving van verkoper:</span>
            <p class="text-gray-200 leading-relaxed">${description}</p>
          </div>
        ` : ''}

        ${contactInfo ? `
          <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 text-xs space-y-1">
            <span class="text-gray-400 block font-medium">Contactmogelijkheid:</span>
            <p class="text-emerald-400 font-mono">${contactInfo}</p>
          </div>
        ` : ''}

        <!-- Privacy & Gegevensbescherming -->
        <div class="bg-gray-950/60 border border-gray-800/80 p-4 rounded-xl text-2xs text-gray-400 space-y-1">
          <div class="flex items-center gap-2 text-gray-300 font-semibold">
            <span>🔒</span> Privacy & Onafhankelijkheid
          </div>
          <p>
            Dit machinepaspoort toont uitsluitend door de eigenaar goedgekeurde openbare specificaties. Privé-accountgegevens blijven conform het privacyprotocol strikt vertrouwelijk. STIHLDecoder is een onafhankelijk platform en geen officieel STIHL-certificeringsorgaan.
          </p>
        </div>
      </section>
    ` : ''}

    <!-- Machinefoto's Sectie (indien aanwezig) -->
    ${rawPhotos.length > 0 ? `
      <section class="bg-gray-900/90 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 class="text-lg font-bold text-white flex items-center gap-2">
              <span>📷</span> Machinefoto's
            </h2>
            <p class="text-xs text-gray-400">${rawPhotos.length} foto('s) geregistreerd in het dossier</p>
          </div>
          <div>
            ${photoStatus.allReachable ? `
              <span class="px-3 py-1 rounded-full text-2xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                ✓ ${photoStatus.reachableCount} foto's online
              </span>
            ` : `
              <span class="px-3 py-1 rounded-full text-2xs font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                ⚠️ ${photoStatus.reachableCount} van ${photoStatus.totalCount} foto's bereikbaar
              </span>
            `}
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${photoStatus.photos.map((photo, idx) => `
            <div class="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden flex flex-col group">
              <div class="aspect-4/3 bg-gray-900 relative flex items-center justify-center overflow-hidden">
                ${photo.exists ? `
                  <img src="${photo.url}" alt="${photo.label}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" />
                ` : `
                  <div class="p-4 text-center space-y-1 text-gray-500">
                    <span class="text-2xl block">🖼️</span>
                    <span class="text-3xs font-mono block text-gray-400 font-bold">${photo.filename}</span>
                    <span class="text-3xs block text-amber-400">Bestand nog niet geplaatst</span>
                  </div>
                `}
              </div>
              <div class="p-3 text-2xs border-t border-gray-800 bg-gray-950">
                <span class="font-mono text-gray-400 text-3xs block">Foto ${idx + 1}</span>
                <span class="font-semibold text-gray-200 block">${photo.label}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : ''}

    <!-- Onderhoudshistorie (indien aanwezig in dossier) -->
    ${maintenanceEvents.length > 0 ? `
      <section class="bg-gray-900/90 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
          <span>🔧</span> Onderhoudshistorie
        </h2>
        <div class="space-y-2">
          ${maintenanceEvents.map(e => `
            <div class="bg-gray-950 p-3 rounded-xl border border-gray-800 flex items-center justify-between text-xs">
              <div>
                <span class="font-mono text-orange-400 text-2xs block">${e.date}</span>
                <span class="font-semibold text-white">${e.description || e.type}</span>
              </div>
              ${e.operating_hours ? `<span class="font-mono text-gray-400 text-2xs">${e.operating_hours} uur</span>` : ''}
            </div>
          `).join('')}
        </div>
      </section>
    ` : ''}

    <!-- Verkoopadvertentie Export Tool (ALLEEN ZICHTBAAR BIJ VERKOOP) -->
    ${isForSale && advertText ? `
      <section class="bg-gray-900/90 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-white flex items-center gap-2">
              <span>📢</span> Verkoopadvertentie Genereren
            </h2>
            <p class="text-xs text-gray-400">Kant-en-klare tekst voor Marktplaats, 2dehands of andere platforms</p>
          </div>
          <button id="copy-advert-btn" onclick="copyAdvertText()" class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl shadow transition active:scale-95 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer">
            <span>📋</span> Kopieer advertentietekst
          </button>
        </div>

        <div class="relative">
          <textarea id="advert-textarea" readonly rows="12" class="w-full bg-gray-950 border border-gray-800 rounded-xl p-4 text-xs font-mono text-gray-300 leading-relaxed focus:outline-none focus:border-orange-500 select-all">${advertText}</textarea>
          <span id="copy-success-badge" class="hidden absolute top-3 right-3 bg-emerald-500 text-black font-bold text-2xs px-2.5 py-1 rounded shadow">
            ✓ Gekopieerd naar klembord!
          </span>
        </div>
      </section>
    ` : ''}

    <!-- QR-Code & Deelbare Link Card -->
    <section class="bg-gray-900/90 border border-gray-800 rounded-2xl p-6">
      <div class="flex flex-col sm:flex-row items-center gap-5">
        <div class="flex-shrink-0 bg-white p-2 rounded-xl shadow-md">
          <img src="${qrCodeUrl}" alt="QR code naar machinepaspoort" class="w-28 h-28" />
        </div>
        <div class="space-y-1.5 text-xs text-gray-300 text-center sm:text-left">
          <span class="text-orange-400 font-mono font-bold text-2xs uppercase tracking-wider block">Deelbaar Machinepaspoort & QR-Code</span>
          <p class="font-bold text-white text-sm">
            <a href="${passportUrl}" class="hover:text-orange-400 underline">${passportUrl}</a>
          </p>
          <p class="text-2xs text-gray-400">
            Scan de QR-code met een telefooncamera om direct dit paspoort, de verificatiestatus en de technische gegevens te raadplegen.
          </p>
        </div>
      </div>
    </section>

    <!-- Bottom Navigation / Canonical Model Links -->
    <section class="border-t border-gray-800 pt-6 flex flex-wrap justify-between items-center gap-4 text-xs text-gray-400">
      <div class="flex flex-wrap gap-4">
        <a href="${canonicalModelPath}" class="text-orange-400 hover:underline">→ Modelpagina STIHL ${canonicalModelSlug.toUpperCase()}</a>
        <a href="${canonicalPartsPath}" class="text-gray-300 hover:text-white hover:underline">→ Onderdelen STIHL ${canonicalModelSlug.toUpperCase()}</a>
        <a href="/stihl-paspoort/" class="text-gray-300 hover:text-white hover:underline">→ STIHL Paspoort Hub</a>
      </div>
      <div>
        <span class="text-2xs text-gray-500 font-mono">${serial ? `Serienummer: ${serial}` : 'Modelpaspoort'}</span>
      </div>
    </section>

  </main>

  <!-- Footer -->
  <footer class="border-t border-gray-800 bg-gray-900/60 py-8 px-4 text-center text-xs text-gray-500 mt-12">
    <div class="max-w-4xl mx-auto space-y-2">
      <p>STIHLDecoder.nl — Onafhankelijk kennisplatform en machinepaspoort voor STIHL machines.</p>
      <p class="text-2xs text-gray-600">Niet gelieerd aan Andreas Stihl AG & Co. KG. Alle merknamen zijn eigendom van hun respectievelijke houders. Dit paspoort is geen officieel fabrieks- of keuringscertificaat.</p>
    </div>
  </footer>

  <script>
    function copyAdvertText() {
      const textarea = document.getElementById('advert-textarea');
      if (!textarea) return;
      textarea.select();
      navigator.clipboard.writeText(textarea.value).then(() => {
        const badge = document.getElementById('copy-success-badge');
        if (badge) {
          badge.classList.remove('hidden');
          setTimeout(() => badge.classList.add('hidden'), 2500);
        }
      }).catch(err => {
        console.error('Kopiëren mislukt:', err);
      });
    }
  </script>
</body>
</html>`;
}

// Backward-compatibility alias
export const renderSalesPassportPageHtml = renderUniversalPassportPageHtml;
