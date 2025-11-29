// content.js

// Enhanced Mime Type mapping
const typeMap = {
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.xml': 'image/svg+xml' // For mask-icon
};

function determineMimeType(url, typeAttr) {
    if (typeAttr && typeAttr.trim() !== '' && typeAttr.toLowerCase() !== 'unknown') return typeAttr;
    const lowerUrl = url.toLowerCase();
    for (const ext in typeMap) {
        if (lowerUrl.includes(ext)) {
            return typeMap[ext];
        }
    }
    return 'unknown';
}

function findFavicons() {
  const selectors = [
    'link[rel*="icon"]',
    'link[rel*="apple-touch-icon"]',
    'link[rel*="mask-icon"]',
    'link[rel*="fluid-icon"]',
    'link[rel*="shortcut"]'
  ];
  const links = Array.from(document.querySelectorAll(selectors.join(',')));
  const favicons = [];
  const seenUrls = new Set();

  links.forEach(link => {
    const href = link.href;
    if (!href || seenUrls.has(href)) return;
    seenUrls.add(href);

    const rel = link.getAttribute('rel') || 'icon';
    const sizes = link.getAttribute('sizes') || ''; // Keep it empty if not specified
    const type = link.getAttribute('type') || '';
    
    favicons.push({
      url: href,
      rel: rel.trim(),
      sizes: sizes.trim(),
      type: determineMimeType(href, type),
      html: link.outerHTML // Capture the full HTML tag for advanced details
    });
  });

  // Check for the default /favicon.ico location
  try {
    const defaultIcoUrl = new URL('/favicon.ico', document.location.href).href;
    if (!seenUrls.has(defaultIcoUrl)) {
        favicons.push({
            url: defaultIcoUrl,
            rel: 'Default Fallback',
            sizes: 'Any',
            type: 'image/x-icon',
            html: '<link rel="icon" href="/favicon.ico">',
            isFallback: true
        });
    }
  } catch (e) {
    // Ignore URL parsing errors
  }

  return favicons;
}

// Listen for messages from the details page
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action === "getFavicons") {
      sendResponse({ 
        favicons: findFavicons(),
        pageTitle: document.title 
      });
    }
    // Required to keep the message channel open for an asynchronous sendResponse
    return true; 
  }
);