/**
 * HTML Breadcrumb Component for STIHLDecoder.nl
 */

export function renderBreadcrumbsHtml(items = []) {
  if (!items || items.length === 0) return '';

  const listItems = items.map((item, index) => {
    const isLast = index === items.length - 1;
    const isClickable = Boolean(!isLast && item.url);
    return `
      <li class="inline-flex items-center gap-1.5">
        ${index > 0 ? `<svg class="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>` : ''}
        ${!isClickable ? `
          <span class="text-gray-300 font-semibold truncate">${item.name}</span>
        ` : `
          <a href="${item.url}" class="text-orange-400 hover:text-orange-300 transition font-medium">${item.name}</a>
        `}
      </li>
    `;
  }).join('');

  return `
    <nav aria-label="Breadcrumb" class="py-2.5 px-4 bg-gray-900/60 border border-gray-800/80 rounded-xl text-xs">
      <ol class="flex flex-wrap items-center gap-1.5">
        ${listItems}
      </ol>
    </nav>
  `;
}
