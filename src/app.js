import { decodeStihlCode, cleanInput } from './decoder.js';

let database = null;
let currentMonth = 6;
let currentYear = 18; // 2018

document.addEventListener('DOMContentLoaded', async () => {
  // Load database
  try {
    const res = await fetch('/api/database');
    if (res.ok) {
      database = await res.json();
    } else {
      database = window.STIHL_DATABASE || {};
    }
  } catch (err) {
    console.warn('Could not fetch /api/database, fallback to window.STIHL_DATABASE', err);
    database = window.STIHL_DATABASE || {};
  }

  // Ensure database is populated fallback
  if (!database || !database.part_family_prefixes) {
    database = window.STIHL_DATABASE || {};
  }

  setupDecoderForm();
  setupGietklokInteractive();
  setupCatalogCardListeners();
  setupExampleButtons();
});

function setupDecoderForm() {
  const inputEl = document.getElementById('code-input');
  const searchBtn = document.getElementById('search-btn');
  const clearBtn = document.getElementById('clear-btn');
  const resultCard = document.getElementById('result-card');
  const warningCard = document.getElementById('warning-card');
  const emptyState = document.getElementById('empty-state');
  const errorAlert = document.getElementById('error-alert');

  function handleDecode() {
    const val = inputEl.value.trim();
    if (!val) {
      showEmptyState();
      return;
    }

    const dbToUse = database && database.part_family_prefixes ? database : (window.STIHL_DATABASE || {});
    const result = decodeStihlCode(val, dbToUse);
    
    // Hide all first
    resultCard.classList.add('hidden');
    warningCard.classList.add('hidden');
    emptyState.classList.add('hidden');
    errorAlert.classList.add('hidden');

    if (!result.success) {
      document.getElementById('error-text').innerText = result.error;
      errorAlert.classList.remove('hidden');
      return;
    }

    if (result.type === 'PART_NUMBER') {
      renderPartNumberWarning(result);
    } else {
      renderSerialNumberResult(result);
    }
  }

  inputEl.addEventListener('input', () => {
    if (inputEl.value.trim().length >= 4) {
      handleDecode();
    } else if (inputEl.value.trim().length === 0) {
      showEmptyState();
    }
  });

  searchBtn.addEventListener('click', handleDecode);
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleDecode();
  });

  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    showEmptyState();
    inputEl.focus();
  });
}

function showEmptyState() {
  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('warning-card').classList.add('hidden');
  document.getElementById('error-alert').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');
}

function renderSerialNumberResult(data) {
  const card = document.getElementById('result-card');
  
  document.getElementById('res-serial-display').innerText = data.cleaned;
  document.getElementById('res-country').innerText = `${data.factory.country} (${data.factory.location})`;
  document.getElementById('res-factory-digit').innerText = `Fabriekscode: Digit ${data.factory.digit}`;
  document.getElementById('res-factory-details').innerText = data.factory.details;
  
  document.getElementById('res-model').innerText = data.model;
  document.getElementById('res-years').innerText = data.estimatedYears || "Reeksgebaseerd";
  
  // Confidence badge
  const confBadge = document.getElementById('res-confidence-badge');
  confBadge.innerText = data.confidence;
  if (data.confidence === 'Exact') {
    confBadge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  } else if (data.confidence === 'Hoge waarschijnlijkheid') {
    confBadge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30';
  } else {
    confBadge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30';
  }

  // Technical specs
  const specsBox = document.getElementById('res-specs-box');
  if (data.familyDetails) {
    document.getElementById('spec-type').innerText = data.familyDetails.type || '-';
    document.getElementById('spec-disp').innerText = data.familyDetails.displacement || '-';
    document.getElementById('spec-power').innerText = data.familyDetails.power || '-';
    document.getElementById('spec-era').innerText = data.familyDetails.era || '-';
    specsBox.classList.remove('hidden');
  } else {
    specsBox.classList.add('hidden');
  }

  document.getElementById('res-notes').innerText = data.notes;
  document.getElementById('res-gietklok-tip').innerText = data.castingClockTip;

  // Stop Heling Link
  const stopHelingBtn = document.getElementById('stopheling-link-btn');
  if (stopHelingBtn && data.stopHelingUrl) {
    stopHelingBtn.href = data.stopHelingUrl;
  }

  card.classList.remove('hidden');
}

function renderPartNumberWarning(data) {
  const card = document.getElementById('warning-card');
  
  document.getElementById('warn-part-no').innerText = data.formattedPartNo || data.cleaned;
  document.getElementById('warn-message').innerText = data.warningMessage;
  document.getElementById('warn-model-group').innerText = data.modelGroup;
  
  if (data.machineType) {
    document.getElementById('warn-specs').innerText = `Type: ${data.machineType} | Motor: ${data.displacement || ''} (${data.power || ''}) | Productieperiode: ${data.era || ''}`;
    document.getElementById('warn-specs').classList.remove('hidden');
  } else {
    document.getElementById('warn-specs').classList.add('hidden');
  }

  document.getElementById('warn-advice').innerText = data.advice;
  
  card.classList.remove('hidden');
}

function setupGietklokInteractive() {
  const monthSlider = document.getElementById('gietklok-month-slider');
  const yearInput = document.getElementById('gietklok-year-input');
  
  if (!monthSlider || !yearInput) return;

  function updateClock() {
    currentMonth = parseInt(monthSlider.value, 10);
    currentYear = parseInt(yearInput.value, 10) % 100; // last 2 digits
    const fullYear = 2000 + currentYear;

    document.getElementById('clock-year-display').textContent = `'${currentYear < 10 ? '0' + currentYear : currentYear}`;
    document.getElementById('clock-result-text').innerHTML = `Gietdatum: <strong>${getMonthName(currentMonth)} 20${currentYear < 10 ? '0' + currentYear : currentYear}</strong>`;

    renderClockSVG(currentMonth, currentYear);
  }

  monthSlider.addEventListener('input', updateClock);
  yearInput.addEventListener('change', updateClock);
  updateClock();
}

function getMonthName(m) {
  const names = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
  return names[m - 1] || 'Maand ' + m;
}

function renderClockSVG(month, year) {
  const svg = document.getElementById('gussuhr-svg');
  if (!svg) return;

  // Clear previous
  svg.innerHTML = '';

  const cx = 100;
  const cy = 100;
  const radius = 75;

  // Outer ring
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', cx);
  circle.setAttribute('cy', cy);
  circle.setAttribute('r', radius);
  circle.setAttribute('fill', '#111827');
  circle.setAttribute('stroke', '#FF6600');
  circle.setAttribute('stroke-width', '4');
  svg.appendChild(circle);

  // Center Year Text
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', cx);
  text.setAttribute('y', cy + 8);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', '#FFFFFF');
  text.setAttribute('font-size', '24');
  text.setAttribute('font-weight', 'bold');
  text.setAttribute('font-family', 'sans-serif');
  text.textContent = `'${year < 10 ? '0' + year : year}`;
  svg.appendChild(text);

  // 12 Month Dot Indicators around circle
  for (let i = 1; i <= 12; i++) {
    const angle = (i * 30 - 90) * (Math.PI / 180);
    const dotRadius = radius - 15;
    const dx = cx + dotRadius * Math.cos(angle);
    const dy = cy + dotRadius * Math.sin(angle);

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', dx);
    dot.setAttribute('cy', dy);

    if (i <= month) {
      // Raised dot (active month mark)
      dot.setAttribute('r', '5');
      dot.setAttribute('fill', '#FF6600');
      dot.setAttribute('stroke', '#FFFFFF');
      dot.setAttribute('stroke-width', '1.5');
    } else {
      // Empty dot position
      dot.setAttribute('r', '2.5');
      dot.setAttribute('fill', '#4B5563');
    }
    svg.appendChild(dot);
  }
}

function setupCatalogCardListeners() {
  document.querySelectorAll('.catalog-card').forEach(card => {
    card.addEventListener('click', () => {
      const code = card.getAttribute('data-code');
      if (code) {
        document.getElementById('code-input').value = `${code} 021 0800`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.getElementById('search-btn').click();
      }
    });
  });
}

function setupExampleButtons() {
  document.querySelectorAll('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-code');
      if (code) {
        const inputEl = document.getElementById('code-input');
        inputEl.value = code;
        document.getElementById('search-btn').click();
      }
    });
  });
}
