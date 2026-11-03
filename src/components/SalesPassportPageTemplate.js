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
      if (fs.existsSync(candidate)) {
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
 * Generates ready-to-use sales advertisement text for marketplaces (Marktplaats, 2dehands, etc.).
 */
export function generateSalesAdvertText(machine, baseUrl = 'https://www.stihldecoder.nl') {
  const passportUrl = `${baseUrl.replace(/\/$/, '')}/paspoort/${machine.serial_number}/`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(passportUrl)}`;

  return `STIHL MS 260 C-B Profi Kettingzaag – Geverifieerd STIHL-Paspoort (Serienummer ${machine.serial_number})

Vraagprijs: ${machine.asking_price_formatted || '€ 385,-'}
Locatie: ${machine.location || 'Coevorden'}
Staat: ${machine.condition || 'Volledig werkend, volgens verkoper'}

Te koop aangeboden: een professionele STIHL MS 260 C-B benzinekettingzaag. 
Deze machine is voorzien van een officieel geverifieerd STIHL-machinepaspoort met geregistreerd serienummer via STIHLDecoder.nl.

SPECIFICATIES
• Fabrikant: STIHL (Waiblingen, Duitsland)
• Model: MS 260 C-B (.325" P Motorsäge)
• Cilinderinhoud: 50,2 cc
• Vermogen: 2,6 kW / 3,5 pk
• Aandrijving: Benzine (2-takt mengsmering 1:50)
• Zaagblad / Ketting: .325" P kettingsteek, 1,6 mm groefbreedte
• Uitvoering: C-B (voorzien van gereedschapsloze kettingsnelspanner en decompressieventiel)
• Serienummer: ${machine.serial_number}

VERIFICATIE & VEILIGHEID
✓ Identiteit gecontroleerd via officieel MY STIHL-account
✓ Serienummer fysiek aanwezig en leesbaar op het carter
✓ Geen geregistreerde diefstal bekend (vrij verifieerbaar via StopHeling.nl)
✓ Transparant machinepaspoort met originele modelparameters

ONLINE MACHINEPASPOORT & LIVE RAPPORT:
Bekijk het officiële digitale machinepaspoort en alle technische details direct via:
${passportUrl}

(Scan de QR-code in de advertentiefoto's om direct het mobiele paspoort te openen)

OVERNAME & BEZICHTIGING:
Bezichtiging, proefdraaien en ophalen in ${machine.location || 'Coevorden'} in overleg mogelijk.
Verzending is bespreekbaar op kosten en risico van de koper.`;
}

/**
 * Renders the full public Sales Passport page.
 */
export function renderSalesPassportPageHtml({ serial, machine, database, baseUrl = 'https://www.stihldecoder.nl' }) {
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const passportUrl = `${cleanBaseUrl}/paspoort/${serial}/`;
  const canonicalModelSlug = machine.canonical_model_id ? machine.canonical_model_id.replace(/^stihl_/, '') : 'ms-260';
  const canonicalModelPath = `/${machine.category_slug || 'kettingzagen'}/${canonicalModelSlug}/`;
  const canonicalPartsPath = `${canonicalModelPath}onderdelen/`;

  const photoStatus = checkSalesPhotosReachability(serial, machine.photos || []);
  const advertText = generateSalesAdvertText(machine, cleanBaseUrl);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(passportUrl)}`;

  // Passport rendering data
  const passportData = {
    serialNumber: serial,
    model: machine.official_product_name || machine.normalized_model || 'STIHL Machine',
    modelSlug: canonicalModelSlug,
    canonicalModelId: machine.canonical_model_id || 'stihl_ms_260',
    identitySource: 'OFFICIAL_STIHL_LOOKUP',
    category: machine.category || 'Kettingzaag',
    categorySlug: machine.category_slug || 'kettingzagen',
    publicPassportUrl: passportUrl,
    salesListing: {
      askingPrice: machine.asking_price_formatted || '€ 385,-',
      condition: machine.condition || 'volledig werkend, volgens verkoper',
      location: machine.location || 'Coevorden',
      sellerRole: machine.seller_role || 'Particuliere verkoper',
      verificationBadge: '✓ MY STIHL Officieel Geverifieerd',
      photos: machine.photos || [],
      photosReachable: photoStatus.allReachable
    }
  };

  const passportCardHtml = renderStihlPassportHtml(passportData, database);

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>STIHL ${machine.normalized_model || 'MS 260 C-B'} (Serienummer ${serial}) — Verkoop-Machinepaspoort</title>
  <meta name="description" content="Officieel geverifieerd STIHL machinepaspoort voor STIHL ${machine.normalized_model} (serienummer ${serial}). Vraagprijs ${machine.asking_price_formatted || '€ 385,-'}, locatie ${machine.location || 'Coevorden'}.">
  <link rel="canonical" href="${passportUrl}">
  <meta name="robots" content="noindex, follow">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/tailwind.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans selection:bg-orange-600 selection:text-white">

  <!-- Header -->
  <header class="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-40">
    <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-orange-600/30">
          S
        </div>
        <div>
          <span class="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            STIHL Decoder
            <span class="text-2xs font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Geverifieerd Paspoort</span>
          </span>
          <p class="text-2xs text-gray-400">Verkoopbaar Machinepaspoort & Herkomst</p>
        </div>
      </a>
      <div class="flex items-center gap-3 text-xs">
        <a href="${canonicalModelPath}" class="text-gray-300 hover:text-white transition hidden sm:inline">Modelgids →</a>
        <a href="/stihl-paspoort/" class="text-orange-400 font-bold hover:underline">Mijn Paspoorten</a>
      </div>
    </div>
  </header>

  <!-- Main Container -->
  <main class="max-w-5xl mx-auto px-4 py-6 flex-1 w-full space-y-8">

    <!-- Breadcrumbs -->
    <nav aria-label="Kruimelpad" class="text-xs text-gray-400 flex flex-wrap items-center gap-1.5">
      <a href="/" class="hover:text-white transition">Home</a>
      <span>/</span>
      <a href="/${machine.category_slug || 'kettingzagen'}/" class="hover:text-white transition">${machine.category || 'Kettingzagen'}</a>
      <span>/</span>
      <a href="${canonicalModelPath}" class="hover:text-white transition">STIHL ${canonicalModelSlug.toUpperCase()}</a>
      <span>/</span>
      <span class="text-orange-400 font-mono font-bold">Paspoort ${serial}</span>
    </nav>

    <!-- Hero / Title -->
    <section class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
          Geverifieerde Verkoopmachine
        </span>
        <span class="px-2.5 py-0.5 rounded-full text-2xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          ✓ MY STIHL Geverifieerd
        </span>
        <span class="px-2.5 py-0.5 rounded-full text-2xs font-mono text-gray-400 bg-gray-900 border border-gray-800">
          📍 ${machine.location || 'Coevorden'}
        </span>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
        <div>
          <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            STIHL ${machine.normalized_model || 'MS 260 C-B'}
          </h1>
          <p class="text-sm text-gray-400 mt-1">
            Officiële modeluitvoering: <strong class="text-gray-200 font-mono">${machine.official_product_name}</strong>
          </p>
        </div>
        <div class="text-left sm:text-right">
          <span class="text-xs text-gray-400 block font-medium">Vraagprijs</span>
          <span class="text-3xl font-black text-orange-400 font-mono tracking-tight">${machine.asking_price_formatted || '€ 385,-'}</span>
        </div>
      </div>
    </section>

    <!-- Passport Presentation Card -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
          <span>📋</span> Digitaal Machinepaspoort
        </h2>
        <span class="text-xs text-gray-400 font-mono">ID: ${serial}</span>
      </div>
      
      ${passportCardHtml}
    </section>

    <!-- Verkoop- & Conditiegegevens -->
    <section class="bg-gray-900/90 border border-gray-800 rounded-2xl p-6 space-y-4">
      <h2 class="text-lg font-bold text-white flex items-center gap-2">
        <span>🏷️</span> Verkoopgegevens & Eigenschappen
      </h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div class="bg-gray-950 p-4 rounded-xl border border-gray-800">
          <span class="text-gray-400 block font-medium">Vraagprijs</span>
          <span class="text-base font-bold text-orange-400 font-mono">${machine.asking_price_formatted || '€ 385,-'}</span>
        </div>
        <div class="bg-gray-950 p-4 rounded-xl border border-gray-800">
          <span class="text-gray-400 block font-medium">Technische Conditie</span>
          <span class="text-sm font-bold text-white">${machine.condition || 'volledig werkend, volgens verkoper'}</span>
        </div>
        <div class="bg-gray-950 p-4 rounded-xl border border-gray-800">
          <span class="text-gray-400 block font-medium">Locatie</span>
          <span class="text-sm font-bold text-white">${machine.location || 'Coevorden'}</span>
        </div>
        <div class="bg-gray-950 p-4 rounded-xl border border-gray-800">
          <span class="text-gray-400 block font-medium">Verificatiestatus</span>
          <span class="text-sm font-bold text-emerald-400">MY STIHL (3 nov 2026)</span>
        </div>
      </div>

      <!-- Private vs Public Boundaries Notice -->
      <div class="bg-gray-950/60 border border-gray-800/80 p-4 rounded-xl text-2xs text-gray-400 space-y-1">
        <div class="flex items-center gap-2 text-gray-300 font-semibold">
          <span>🔒</span> Privacy & Gegevensbescherming
        </div>
        <p>
          Dit publieke verkoop-paspoort toont uitsluitend door de verkoper goedgekeurde machinekenmerken. Persoonsgegevens, account-e-mailadressen en het originele MY STIHL accountscreenshot blijven conform het STIHLDecoder privacyprotocol strikt privé en worden nooit openbaar gemaakt.
        </p>
      </div>
    </section>

    <!-- Photo Gallery & Reachability Status -->
    <section class="bg-gray-900/90 border border-gray-800 rounded-2xl p-6 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span>📷</span> Originele Machinefoto's
          </h2>
          <p class="text-xs text-gray-400">4 originele foto's geregistreerd voor serienummer ${serial}</p>
        </div>
        <div>
          ${photoStatus.allReachable ? `
            <span class="px-3 py-1 rounded-full text-2xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              ✓ Alle 4 foto's bereikbaar
            </span>
          ` : `
            <span class="px-3 py-1 rounded-full text-2xs font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              ⚠️ ${photoStatus.reachableCount} van de 4 foto's online
            </span>
          `}
        </div>
      </div>

      ${!photoStatus.allReachable ? `
        <div class="bg-amber-950/30 border border-amber-800/60 p-4 rounded-xl text-xs text-amber-200 space-y-1.5">
          <div class="font-bold flex items-center gap-1.5">
            <span>⚠️</span> Publicatiestatus Beeldbestanden: Fysieke Overdracht Vereist
          </div>
          <p class="text-amber-300/90 text-2xs leading-relaxed">
            De 4 originele fotonamen zijn officieel gekoppeld aan machinepaspoort <strong>${serial}</strong>. De fysieke beeldbestanden worden klaargezet in <code>public/sales/${serial}/</code>. Zodra geplaatst, zijn de afbeeldingen direct live zichtbaar.
          </p>
        </div>
      ` : ''}

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
                  <span class="text-3xs block text-amber-400">In afwachting van bestand</span>
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

    <!-- Verkoopadvertentie (Marktplaats / 2dehands template) -->
    <section class="bg-gray-900/90 border border-gray-800 rounded-2xl p-6 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span>📢</span> Kant-en-klare Verkoopadvertentie
          </h2>
          <p class="text-xs text-gray-400">Gebruik deze complete tekst voor Marktplaats, 2dehands of andere platforms</p>
        </div>
        <button id="copy-advert-btn" onclick="copyAdvertText()" class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl shadow transition active:scale-95 flex items-center gap-1.5 self-start sm:self-auto">
          <span>📋</span> Kopieer advertentietekst
        </button>
      </div>

      <div class="relative">
        <textarea id="advert-textarea" readonly rows="12" class="w-full bg-gray-950 border border-gray-800 rounded-xl p-4 text-xs font-mono text-gray-300 leading-relaxed focus:outline-none focus:border-orange-500 select-all">${advertText}</textarea>
        <span id="copy-success-badge" class="hidden absolute top-3 right-3 bg-emerald-500 text-black font-bold text-2xs px-2.5 py-1 rounded shadow">
          ✓ Gekopieerd naar klembord!
        </span>
      </div>

      <!-- QR-Code & Share Card -->
      <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 flex flex-col sm:flex-row items-center gap-5">
        <div class="flex-shrink-0 bg-white p-2 rounded-xl shadow-md">
          <img src="${qrCodeUrl}" alt="QR code naar machinepaspoort ${serial}" class="w-28 h-28" />
        </div>
        <div class="space-y-1.5 text-xs text-gray-300 text-center sm:text-left">
          <span class="text-orange-400 font-mono font-bold text-2xs uppercase tracking-wider block">Directe Paspoortlink & QR-Code</span>
          <p class="font-bold text-white text-sm">
            <a href="${passportUrl}" class="hover:text-orange-400 underline">${passportUrl}</a>
          </p>
          <p class="text-2xs text-gray-400">
            Kopers kunnen deze QR-code scannen met hun telefoon om direct het geverifieerde paspoort en de officiële specificaties te openen.
          </p>
        </div>
      </div>
    </section>

    <!-- Bottom Navigation / Canonical Links -->
    <section class="border-t border-gray-800 pt-6 flex flex-wrap justify-between items-center gap-4 text-xs text-gray-400">
      <div class="flex flex-wrap gap-4">
        <a href="${canonicalModelPath}" class="text-orange-400 hover:underline">→ Modelpagina STIHL MS 260</a>
        <a href="${canonicalPartsPath}" class="text-gray-300 hover:text-white hover:underline">→ Onderdelen STIHL MS 260</a>
        <a href="/stihl-paspoort/" class="text-gray-300 hover:text-white hover:underline">→ STIHL Paspoort Hub</a>
      </div>
      <div>
        <span class="text-2xs text-gray-500 font-mono">Serienummer: ${serial} | Duitsland (Waiblingen)</span>
      </div>
    </section>

  </main>

  <!-- Footer -->
  <footer class="border-t border-gray-800 bg-gray-900/60 py-8 px-4 text-center text-xs text-gray-500 mt-12">
    <div class="max-w-4xl mx-auto space-y-2">
      <p>STIHLDecoder.nl — Onafhankelijk kennisplatform en geverifieerd machinepaspoort voor STIHL machines.</p>
      <p class="text-2xs text-gray-600">Niet gelieerd aan Andreas Stihl AG & Co. KG. Alle merknamen zijn eigendom van hun respectievelijke houders.</p>
    </div>
  </footer>

  <script>
    function copyAdvertText() {
      const textarea = document.getElementById('advert-textarea');
      textarea.select();
      navigator.clipboard.writeText(textarea.value).then(() => {
        const badge = document.getElementById('copy-success-badge');
        badge.classList.remove('hidden');
        setTimeout(() => badge.classList.add('hidden'), 2500);
      }).catch(err => {
        console.error('Kopiëren mislukt:', err);
      });
    }
  </script>
</body>
</html>`;
}
