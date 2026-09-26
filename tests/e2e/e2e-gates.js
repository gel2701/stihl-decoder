/**
 * E2E Security & Integrity Gates
 * Enforces Zero JavaScript Errors and Zero Failed Own-Origin Requests
 */

export function attachIntegrityGates(page, allowed404Urls = []) {
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];

  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Only ignore benign browser warnings if strictly needed, otherwise flag all errors
      consoleErrors.push(text);
    }
  });

  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();

    // Check own-origin requests
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('stihldecoder.nl')) {
      const isAllowed404 = allowed404Urls.some(allowed => url.includes(allowed));
      if ([404, 500, 502, 503].includes(status) && !isAllowed404) {
        failedRequests.push({ url, status });
      }
    }
  });

  return {
    assertClean(contextName = 'Page') {
      if (pageErrors.length > 0) {
        throw new Error(`[${contextName}] JAVASCRIPT ERROR GATE FAILED: ${pageErrors.length} unhandled page error(s):\n${pageErrors.join('\n')}`);
      }
      if (consoleErrors.length > 0) {
        throw new Error(`[${contextName}] CONSOLE ERROR GATE FAILED: ${consoleErrors.length} console.error(s):\n${consoleErrors.join('\n')}`);
      }
      if (failedRequests.length > 0) {
        const details = failedRequests.map(f => ` - ${f.status} ${f.url}`).join('\n');
        throw new Error(`[${contextName}] FAILED NETWORK REQUEST GATE: ${failedRequests.length} own-origin failed request(s):\n${details}`);
      }
    },
    getPageErrors: () => [...pageErrors],
    getConsoleErrors: () => [...consoleErrors],
    getFailedRequests: () => [...failedRequests]
  };
}
