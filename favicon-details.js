// favicon-details.js

const loadingElement = document.getElementById('loading');
const dashboardSection = document.getElementById('favicon-dashboard');
const listContainer = document.getElementById('favicons-list');
const pageTitleDisplay = document.getElementById('page-title');
const urlDisplay = document.getElementById('current-url');
const noFaviconsMsg = document.getElementById('no-favicons-message');
const faviconCount = document.getElementById('favicon-count');
const settingsContainer = document.getElementById('settings-container');
const inaccessibleMessage = document.getElementById('inaccessible-message');
const sidebar = document.getElementById('sidebar-menu');
const sidebarToggle = document.getElementById('sidebar-toggle');
const infoModal = document.getElementById('info-modal');
const modalBody = document.getElementById('modal-body');
const modalCloseButton = infoModal.querySelector('.close-button');

let currentTabId = null;
let currentFavicons = [];
let appSettings = {}; // Centralized settings object

// --- Utility Functions ---

/** Creates an element safely, setting text content and attributes. */
function createElement(tag, attributes = {}, textContent = '') {
    const el = document.createElement(tag);
    for (const key in attributes) {
        if (attributes[key] !== undefined) {
            el.setAttribute(key, attributes[key]);
        }
    }
    if (textContent) {
        el.textContent = textContent;
    }
    return el;
}

/** Copies text to clipboard. */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Copy failed: ', err);
        return false;
    }
}

/** Copies an image from a URL to the clipboard (FIXED and Robust). */
async function copyImage(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed with status: ${response.status}`);
        
        const blob = await response.blob();
        await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
        ]);
        return true;
    } catch (error) {
        console.error('Copy Image failed:', error);
        return false;
    }
}

/** Downloads the image at the given URL. */
function downloadImage(url, type) {
    let filename = url.substring(url.lastIndexOf('/') + 1).split('?')[0] || 'favicon';
    
    if (!filename.includes('.')) {
        const extMap = {
            'image/x-icon': 'ico', 'image/png': 'png', 'image/jpeg': 'jpg',
            'image/svg+xml': 'svg', 'image/webp': 'webp'
        };
        const ext = extMap[type.toLowerCase()] || 'bin';
        filename = `favicon.${ext}`;
    }
    
    chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false
    }, (downloadId) => {
        if (chrome.runtime.lastError) {
            console.error('Download initiation failed:', chrome.runtime.lastError.message);
        }
    });
}

/** Provides visual feedback on button actions. */
function handleCopyFeedback(button, success, successText = 'Copied!') {
    const originalText = button.textContent;
    const originalIconClass = button.dataset.iconClass;
    
    button.textContent = success ? successText : 'Error!';
    button.classList.add(success ? 'copy-success' : 'error-state');
    
    setTimeout(() => {
        button.textContent = originalText;
        // Check if the icon class is set (only for main action buttons)
        if (originalIconClass) {
            const iconSpan = createElement('span', { class: `icon ${originalIconClass}` });
            button.prepend(iconSpan);
        }
        button.classList.remove('copy-success', 'error-state');
    }, 1500);
}

// --- Data Analysis (Size and Format) ---

async function analyzeFavicon(favicon) {
    const defaultData = {
        detectedSize: favicon.sizes || 'Unknown',
        detectedType: favicon.type || 'Unknown'
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(favicon.url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Status: ${response.status}`);

        const contentType = response.headers.get('content-type') || response.headers.get('Content-Type');
        if (contentType) {
            defaultData.detectedType = contentType.split(';')[0].toLowerCase();
        }

        const isRaster = !defaultData.detectedType.includes('svg') && !defaultData.detectedType.includes('x-icon');

        if (isRaster) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            
            await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    defaultData.detectedSize = `${img.width}x${img.height} px`;
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    defaultData.detectedSize = 'Error getting dimensions';
                    resolve();
                };
                img.src = url;
            });
        } else if (defaultData.detectedType.includes('svg')) {
             defaultData.detectedSize = favicon.sizes || 'Vector (Scalable)';
        } else if (defaultData.detectedType.includes('x-icon')) {
             defaultData.detectedSize = favicon.sizes || 'Multiple Sizes (ICO)';
        }

    } catch (error) {
        console.warn(`Analysis failed for ${favicon.url}:`, error.message);
        if (error.message.includes('Status: 404') || favicon.isFallback) {
            defaultData.detectedSize = 'Not Found (404)';
            defaultData.detectedType = 'Not Found (404)';
        } else {
            defaultData.detectedSize = 'Fetch Error';
            defaultData.detectedType = 'Fetch Error';
        }
    }

    return defaultData;
}


// --- UI Generation & Modal Logic (Enhanced) ---

/** Helper function to create a detail item element. */
function createDetailItem(label, value, tooltip, labelAttribute) {
    const defaultText = 'N/A';
    const item = createElement('div', { class: 'detail-item', 'data-label': labelAttribute });
    const labelEl = createElement('span', { class: 'detail-label' }, label);
    
    if (tooltip) {
        const tooltipTrigger = createElement('span', { class: 'tooltip-trigger', title: tooltip }, '?');
        const tooltipContent = createElement('span', { class: 'tooltip-content' }, tooltip);
        labelEl.appendChild(tooltipTrigger);
        labelEl.appendChild(tooltipContent);
    }

    item.appendChild(labelEl);

    const valueEl = createElement('span', { class: 'detail-value' });
    if (label === 'Full URL') {
         const anchor = createElement('a', { 
            href: value, 
            target: '_blank', 
            rel: 'noopener noreferrer', 
            title: 'Open image in new tab' 
        }, value);
         anchor.appendChild(createElement('span', { class: 'icon icon-link url-icon' }));
         valueEl.appendChild(anchor);
    } else {
        valueEl.textContent = value || defaultText;
    }
    
    item.appendChild(valueEl);
    return item;
}

/** Opens the advanced details modal for a favicon. */
function openAdvancedInfoModal(favicon) {
    while (modalBody.firstChild) {
        modalBody.removeChild(modalBody.firstChild);
    }
    
    // Header Info
    const modalHeaderInfo = createElement('div', { class: 'modal-header-info' });
    
    const modalPreviewContainer = createElement('div', { class: `modal-preview-container ${appSettings.showCheckerboard ? 'checkerboard' : ''}` });
    const modalImage = createElement('img', { 
        src: favicon.url, 
        alt: `Preview of favicon from ${favicon.url}`, 
        loading: 'lazy',
        class: 'favicon-preview-modal'
    });
    modalPreviewContainer.appendChild(modalImage);
    modalHeaderInfo.appendChild(modalPreviewContainer);

    const titleAndType = createElement('div', { class: 'modal-title-type' });
    titleAndType.appendChild(createElement('h4', { class: 'modal-favicon-title' }, `Favicon: ${favicon.detectedSize}`));
    titleAndType.appendChild(createElement('p', { class: 'modal-favicon-type' }, favicon.detectedType));
    
    modalHeaderInfo.appendChild(titleAndType);
    modalBody.appendChild(modalHeaderInfo);

    // Details Grid
    const detailsGrid = createElement('div', { class: 'modal-details-grid' });
    modalBody.appendChild(detailsGrid);

    // List of detailed properties for the modal
    const details = [
        { 
            label: 'Full URL', 
            value: favicon.url, 
            copy: true, 
            type: 'link',
            tooltip: 'The exact path to the favicon resource.'
        },
        { 
            label: 'HTML Tag (Source)', 
            value: favicon.html, 
            copy: true, 
            type: 'code',
            tooltip: 'The full HTML tag found in the document head.'
        },
        { 
            label: 'Original HTML Sizes', 
            value: favicon.sizes || 'Not specified in HTML', 
            copy: true, 
            type: 'text',
            tooltip: 'The sizes attribute value from the HTML link tag.'
        },
        { 
            label: 'Original HTML Relation', 
            value: favicon.rel, 
            copy: true, 
            type: 'text',
            tooltip: 'The rel attribute value from the HTML link tag (e.g., icon, apple-touch-icon).'
        },
        { 
            label: 'Inspector Detected Format', 
            value: favicon.detectedType, 
            copy: true, 
            type: 'text',
            tooltip: 'The MIME type detected by the inspector from HTTP headers.'
        },
        { 
            label: 'Inspector Detected Size', 
            value: favicon.detectedSize, 
            copy: true, 
            type: 'text',
            tooltip: 'The actual dimensions of the image file (measured upon fetch).'
        }
    ];

    details.forEach((detail, index) => {
        const item = createElement('div', { class: 'modal-detail-item' });
        const info = createElement('div', { class: 'modal-detail-info' });
        
        info.appendChild(createElement('div', { class: 'modal-detail-label' }, detail.label));
        
        let valueEl;
        if (detail.type === 'code' || detail.type === 'text') {
            valueEl = createElement('code', { 
                class: 'modal-detail-value', 
                'data-copy-index': index 
            }, detail.value);
        } else if (detail.type === 'link') {
            valueEl = createElement('a', { 
                class: 'modal-detail-value modal-link', 
                href: detail.value, 
                target: '_blank', 
                rel: 'noopener noreferrer' 
            }, detail.value);
            valueEl.prepend(createElement('span', { class: 'icon icon-link url-icon-small' }));
        }

        info.appendChild(valueEl);
        item.appendChild(info);

        if (detail.copy) {
            const copyBtn = createElement('button', { 
                class: 'modal-copy-btn', 
                'data-value': detail.value, 
                title: `Copy ${detail.label}` 
            });
            copyBtn.appendChild(createElement('span', { class: 'icon icon-copy' }));
            
            copyBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const success = await copyToClipboard(detail.value);
                handleCopyFeedback(copyBtn, success, ''); // Empty text, icon only feedback
                // Restore icon after feedback
                setTimeout(() => {
                    if (!copyBtn.querySelector('.icon-copy')) {
                         copyBtn.appendChild(createElement('span', { class: 'icon icon-copy' }));
                    }
                }, 1500);
            });
            item.appendChild(copyBtn);
        }
        
        // Add tooltip if available
        if (detail.tooltip) {
            const tooltipTrigger = createElement('span', { class: 'tooltip-trigger', title: detail.tooltip }, '?');
            item.querySelector('.modal-detail-label').appendChild(tooltipTrigger);
        }

        detailsGrid.appendChild(item);
    });

    // Display modal
    infoModal.classList.add('active');
    infoModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden'; // Prevent body scroll
    
    // Trap focus in modal for accessibility
    const focusableElements = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const firstFocusableElement = infoModal.querySelector('.close-button'); 
    const focusableContent = infoModal.querySelectorAll(focusableElements);
    const lastFocusableElement = focusableContent[focusableContent.length - 1];

    firstFocusableElement.focus();

    function trapFocus(e) {
        if (e.key === 'Tab') {
            if (e.shiftKey) { // Shift + Tab
                if (document.activeElement === firstFocusableElement) {
                    lastFocusableElement.focus();
                    e.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastFocusableElement) {
                    firstFocusableElement.focus();
                    e.preventDefault();
                }
            }
        }
        if (e.key === 'Escape') {
            closeModal();
        }
    }

    document.addEventListener('keydown', trapFocus);
    infoModal.dataset.trapListener = 'true'; // Mark listener is attached
    infoModal.dataset.focusTrap = trapFocus; // Store function reference

}

/** Closes the advanced details modal. */
function closeModal() {
    infoModal.classList.remove('active');
    infoModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = ''; // Restore body scroll

    // Remove focus trap listener
    if (infoModal.dataset.trapListener === 'true') {
        document.removeEventListener('keydown', infoModal.dataset.focusTrap);
        delete infoModal.dataset.trapListener;
        delete infoModal.dataset.focusTrap;
    }
}

// Attach listeners for modal close
modalCloseButton.addEventListener('click', closeModal);
infoModal.addEventListener('click', (e) => {
    // Close when clicking outside the modal content
    if (e.target === infoModal) {
        closeModal();
    }
});


/** Creates a single favicon list item. */
function createFaviconListItem(favicon, settings) {
    const li = createElement('li', { 
        class: 'favicon-item', 
        role: 'listitem',
        'aria-labelledby': `favicon-url-${favicon.url.slice(-5)}`
    });

    // 1. Preview Container (Fixed Size)
    const previewContainer = createElement('div', { 
        class: `preview-container ${settings.showCheckerboard ? 'checkerboard' : ''}` 
    });
    // The CSS limits the size of the preview-container and the image inside it.
    const img = createElement('img', { 
        src: favicon.url, 
        alt: `Preview of favicon at ${favicon.detectedSize} (${favicon.detectedType})`,
        loading: 'lazy',
        class: 'favicon-preview'
    });
    previewContainer.appendChild(img);
    li.appendChild(previewContainer);

    // 2. Details Grid (Main Info)
    const detailsGrid = createElement('div', { class: 'details-grid' });

    // Title/URL Item
    const titleItem = createDetailItem(
        'Source Tag', 
        favicon.rel, 
        'The relation attribute specified in the HTML <link> tag.',
        'Source Tag'
    );
    titleItem.setAttribute('id', `favicon-url-${favicon.url.slice(-5)}`);
    detailsGrid.appendChild(titleItem);
    
    // Size Item
    detailsGrid.appendChild(createDetailItem(
        'Size (Detected)', 
        favicon.detectedSize, 
        'The actual dimensions of the image file (measured upon fetch).',
        'Detected Size'
    ));

    // Format Item
    detailsGrid.appendChild(createDetailItem(
        'Format (Detected)', 
        favicon.detectedType, 
        'The MIME type detected from the HTTP response headers.',
        'Detected Format'
    ));
    
    // View More Buttons
    const urlItem = createDetailItem('Full URL', favicon.url, 'The direct URL path to the favicon file. Click the value to open the image in a new tab.', 'Full URL');
    urlItem.style.gridColumn = 'span 2';
    detailsGrid.appendChild(urlItem);

    const viewMoreItem = createElement('div', { class: 'detail-item' });
    viewMoreItem.style.gridColumn = 'span 2';
    const viewMoreButton = createElement('button', { 
        class: 'action-button view-more-btn', 
        'data-action': 'view-more', 
        title: 'View advanced information including HTML source code' 
    }, 'View More Details');
    viewMoreButton.prepend(createElement('span', { class: 'icon icon-eye' }));
    viewMoreButton.addEventListener('click', () => openAdvancedInfoModal(favicon));
    viewMoreItem.appendChild(viewMoreButton);
    detailsGrid.appendChild(viewMoreItem);


    li.appendChild(detailsGrid);

    // 3. Actions Group
    const actionsGroup = createElement('div', { class: 'actions-group' });

    function createActionButton(text, iconClass, dataUrl, actionType) {
        const iconSpan = createElement('span', { class: `icon ${iconClass}` });
        const button = createElement('button', { 
            class: 'action-button', 
            'data-url': dataUrl, 
            'data-icon-class': iconClass, 
            'data-action': actionType, 
            title: `${text} this favicon` 
        }, text);
        button.prepend(iconSpan);
        return button;
    }

    const isICO = favicon.detectedType.includes('x-icon');

    const copyImageButton = createActionButton(
        'Copy Image', 
        'icon-copy', 
        favicon.url, 
        'copy-image'
    );
    copyImageButton.addEventListener('click', async (e) => {
        e.preventDefault();
        const success = await copyImage(e.currentTarget.dataset.url);
        handleCopyFeedback(copyImageButton, success);
    });

    const downloadButton = createActionButton(
        'Download', 
        'icon-download', 
        favicon.url, 
        'download'
    );
    downloadButton.addEventListener('click', (e) => {
        e.preventDefault();
        downloadImage(e.currentTarget.dataset.url, favicon.detectedType);
        handleCopyFeedback(downloadButton, true, 'Downloading...');
    });
    
    actionsGroup.appendChild(copyImageButton);
    actionsGroup.appendChild(downloadButton);

    li.appendChild(actionsGroup);

    return li;
}

/** Renders the list of favicons after analysis. */
async function renderFaviconList(favicons, settings) {
    while (listContainer.firstChild) {
        listContainer.removeChild(listContainer.firstChild);
    }
    
    if (favicons.length === 0) {
        noFaviconsMsg.style.display = 'block';
        faviconCount.textContent = '0';
        dashboardSection.style.display = 'block';
        return;
    }

    // Run analysis concurrently
    const analysisPromises = favicons.map(analyzeFavicon);
    const analysisResults = await Promise.all(analysisPromises);
    
    // Combine original data with analysis results
    const finalFavicons = favicons.map((f, i) => ({ ...f, ...analysisResults[i] }));
    currentFavicons = finalFavicons;

    // Filter out 404s before rendering (UX improvement)
    const renderableFavicons = finalFavicons.filter(f => f.detectedType !== 'Not Found (404)');

    renderableFavicons.forEach(favicon => {
        const listItem = createFaviconListItem(favicon, settings);
        listContainer.appendChild(listItem);
    });
    
    faviconCount.textContent = renderableFavicons.length;
    dashboardSection.style.display = 'block';
    noFaviconsMsg.style.display = 'none';

    // Show a warning if some favicons were filtered
    if (renderableFavicons.length < finalFavicons.length) {
        const notFoundCount = finalFavicons.length - renderableFavicons.length;
        const li = createElement('li', { class: 'info-message warning-message', role: 'alert' });
        li.appendChild(createElement('span', { class: 'icon icon-info' }));
        li.appendChild(document.createTextNode(`Note: ${notFoundCount} favicon(s) returned a 404 Not Found error and have been omitted from the list.`));
        listContainer.appendChild(li);
    }
}


// --- Settings UI (Enhanced and Consolidated) ---

const settingDefinitions = [
    { 
        id: 'showCheckerboard', 
        text: 'Show Checkerboard Background', 
        desc: 'Helps visualize transparent favicons in the preview.', 
        checked: true, 
        icon: 'icon-grid' 
    },
    { 
        id: 'sidebarCollapsed', 
        text: 'Start with Sidebar Collapsed', 
        desc: 'Hides the settings menu by default for more screen space.', 
        checked: false, 
        icon: 'icon-collapse' 
    },
    { 
        id: 'themeMode', 
        text: 'Dark Mode', 
        desc: 'Switch the interface to a dark theme.', 
        iconLight: 'icon-sun', 
        iconDark: 'icon-moon' 
    },
    { 
        id: 'reduceMotion', 
        text: 'Reduce Animations', 
        desc: 'Disables non-essential CSS transitions for performance and accessibility.', 
        checked: false, 
        icon: 'icon-motion-off' 
    }
];

function saveSettings(settings) {
    // FIX: Ensure that we save the *full* settings object.
    appSettings = settings;
    chrome.storage.local.set({ settings });
    applySettings(settings); 
    
    // Re-render only if checkerboard setting changes
    // Check against the OLD setting before it was updated
    if (currentFavicons.length > 0 && settings.showCheckerboard !== appSettings.showCheckerboard) { 
        renderFaviconList(currentFavicons, settings);
    }
}

function applySettings(settings) {
    // FIX: Apply the theme and motion classes directly to the body based on the current settings
    const isDark = settings.themeMode === 'dark';
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.body.classList.toggle('reduce-motion', settings.reduceMotion);

    // Apply Sidebar State
    const isCollapsed = settings.sidebarCollapsed;
    sidebar.classList.toggle('collapsed', isCollapsed);
    sidebarToggle.setAttribute('aria-expanded', !isCollapsed);
    sidebarToggle.querySelector('.icon').className = `icon ${isCollapsed ? 'icon-menu' : 'icon-close'}`;

    // Update global appSettings object
    appSettings = settings;
}

function renderSettingsUI(currentSettings) {
    while (settingsContainer.firstChild) {
        settingsContainer.removeChild(settingsContainer.firstChild);
    }
    
    settingDefinitions.forEach(def => {
        const item = createElement('div', { class: 'setting-item' });
        
        // Icon
        const iconSpan = createElement('span', { class: `icon ${def.icon || def.iconLight}` });
        item.appendChild(iconSpan);

        const info = createElement('div', { class: 'setting-info' });
        
        const label = createElement('label', { 
            for: def.id, 
            class: 'setting-label' 
        }, def.text);

        const desc = createElement('p', { class: 'setting-description' }, def.desc);
        
        info.appendChild(label);
        info.appendChild(desc);
        item.appendChild(info);

        let input;
        
        if (def.id === 'themeMode') {
            // Theme switch (toggle button)
            const mode = currentSettings[def.id] || 'light';
            const switchBtn = createElement('button', { 
                id: def.id,
                class: `theme-toggle-switch ${mode === 'dark' ? 'dark' : 'light'}`,
                'aria-label': 'Toggle Dark Mode'
            });
            const themeIcon = createElement('span', { 
                class: `icon ${mode === 'dark' ? def.iconDark : def.iconLight}` 
            });
            switchBtn.appendChild(themeIcon);

            switchBtn.addEventListener('click', () => {
                const newMode = switchBtn.classList.contains('light') ? 'dark' : 'light';
                const newIconClass = newMode === 'dark' ? def.iconDark : def.iconLight;
                
                switchBtn.classList.remove('light', 'dark');
                switchBtn.classList.add(newMode);
                themeIcon.className = `icon ${newIconClass}`;
                
                saveSettings({ ...appSettings, [def.id]: newMode });
            });
            input = switchBtn;

        } else {
            // Standard Checkbox
            const isChecked = currentSettings[def.id] !== undefined ? currentSettings[def.id] : (def.checked || false);
            input = createElement('input', { 
                type: 'checkbox', 
                id: def.id, 
                role: 'switch', // For accessibility
                ...(isChecked ? { checked: 'checked' } : {}) 
            });

            input.addEventListener('change', (e) => {
                saveSettings({ ...appSettings, [def.id]: e.target.checked });
            });
            
            // Create the custom toggle switch
            const toggleWrapper = createElement('div', { class: 'toggle-wrapper' });
            toggleWrapper.appendChild(input);
            toggleWrapper.appendChild(createElement('span', { class: 'slider' }));
            input = toggleWrapper;
            
            // Re-map the icon for standard settings to be on the label to ensure correct display
            iconSpan.remove(); // Remove icon from original position
            label.prepend(createElement('span', { class: `icon ${def.icon}` }));
        }

        item.appendChild(input);
        settingsContainer.appendChild(item);
    });
}


// --- Event Handlers & Initialization ---

sidebarToggle.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    sidebarToggle.setAttribute('aria-expanded', !isCollapsed);
    sidebarToggle.querySelector('.icon').className = `icon ${isCollapsed ? 'icon-menu' : 'icon-close'}`;
    saveSettings({ ...appSettings, sidebarCollapsed: isCollapsed });
});

/** Initializes the application on load. */
function init() {
    // 1. Get current tab ID and URL from query params
    const params = new URLSearchParams(window.location.search);
    const tabId = params.get('tabId');
    const url = params.get('url');
    const error = params.get('error');

    if (tabId) {
        currentTabId = parseInt(tabId);
    }
    
    // Set URL Display and show error if restricted page
    urlDisplay.textContent = url || 'Inaccessible Page';

    if (error === 'inaccessible') {
        loadingElement.style.display = 'none';
        inaccessibleMessage.style.display = 'block';
        return;
    }
    
    if (!currentTabId) {
        console.error('No tabId found in URL parameters.');
        loadingElement.style.display = 'none';
        noFaviconsMsg.style.display = 'block';
        return;
    }

    // 2. Load settings and fetch favicons
    chrome.storage.local.get('settings', async (result) => {
        // Default settings, applied in order of priority: default -> stored -> local
        const loadedSettings = {
            showCheckerboard: true, 
            reduceMotion: false,
            themeMode: 'light',
            sidebarCollapsed: false,
            ...result.settings
        };
        
        appSettings = loadedSettings; // Initialize global settings
        
        applySettings(appSettings);
        renderSettingsUI(appSettings);

        try {
            const response = await chrome.tabs.sendMessage(currentTabId, { action: "getFavicons" });

            loadingElement.style.display = 'none';
            
            if (response && response.favicons) {
                pageTitleDisplay.textContent = response.pageTitle || 'No Title Found';

                // Deduplicate favicons by URL
                const uniqueFavicons = response.favicons.filter((favicon, index, self) => 
                    index === self.findIndex((f) => f.url === favicon.url)
                );

                await renderFaviconList(uniqueFavicons, appSettings);

            } else {
                noFaviconsMsg.style.display = 'block';
            }
        } catch (error) {
            console.error("Failed to communicate with content script:", error);
            loadingElement.style.display = 'none';
            
            // Display connection/communication error to user
            const li = createElement('li', { class: 'info-message error-message', role: 'alert' });
            li.appendChild(createElement('span', { class: 'icon icon-info' }));
            li.appendChild(document.createTextNode('Error: Failed to retrieve data. The page may be restricted (CSP), or the source tab was closed.'));
            listContainer.appendChild(li);
        }
    });
}

init();