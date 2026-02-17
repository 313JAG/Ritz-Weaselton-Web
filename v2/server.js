const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, '..'))); // Serve parent dir for logo.jpg

// Path to shared codes file (in parent directory so it's shared)
const CODES_FILE = path.join(__dirname, '..', 'marriott_corporate_codes.md');

// Recommended codes (commonly work well)
const RECOMMENDED_CODES = ['AAA', 'GOV', 'S9R', 'XYD', 'IBM', 'GGL', 'AMZ', 'APL', 'MCO', '253151', 'ACC', 'PCW', 'KPM', 'ERN', 'BHP'];

// Parse markdown table to get codes
function loadCodesFromFile() {
    try {
        const content = fs.readFileSync(CODES_FILE, 'utf8');
        const lines = content.split('\n');
        const codes = [];

        for (const line of lines) {
            // Skip header rows and empty lines
            if (!line.startsWith('|') || line.includes('---') || line.includes('Code |')) continue;

            const parts = line.split('|').map(p => p.trim()).filter(p => p);
            if (parts.length >= 2) {
                const code = parts[0];
                codes.push({
                    code: code,
                    company: parts[1],
                    favorite: parts[2] === '⭐' || parts[2] === 'true',
                    recommended: RECOMMENDED_CODES.includes(code)
                });
            }
        }
        return codes;
    } catch (error) {
        console.error('Error loading codes file:', error.message);
        return [];
    }
}

// Save codes to markdown file
function saveCodesToFile(codes) {
    let content = '# Marriott Corporate Codes\n\n';
    content += '| Code | Company | Fav |\n';
    content += '|------|---------|-----|\n';

    // Sort: favorites first, then numbers, then letters
    const sorted = [...codes].sort((a, b) => {
        // Favorites first
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;
        // Numbers first, then letters
        const aIsNum = /^\d+$/.test(a.code);
        const bIsNum = /^\d+$/.test(b.code);
        if (aIsNum && !bIsNum) return -1;
        if (!aIsNum && bIsNum) return 1;
        if (aIsNum && bIsNum) return parseInt(a.code) - parseInt(b.code);
        return a.code.localeCompare(b.code);
    });

    for (const { code, company, favorite } of sorted) {
        content += `| ${code} | ${company} | ${favorite ? '⭐' : ''} |\n`;
    }

    fs.writeFileSync(CODES_FILE, content, 'utf8');
}

// Get all codes
app.get('/api/codes', (req, res) => {
    const codes = loadCodesFromFile();
    res.json({ codes });
});

// Add a new code
app.post('/api/codes', (req, res) => {
    const { code, company } = req.body;

    if (!code || !company) {
        return res.status(400).json({ error: 'Code and company are required' });
    }

    const codes = loadCodesFromFile();

    // Check if code already exists
    if (codes.some(c => c.code.toUpperCase() === code.toUpperCase())) {
        return res.status(400).json({ error: 'Code already exists' });
    }

    codes.push({ code: code.toUpperCase(), company });
    saveCodesToFile(codes);

    res.json({ success: true, codes });
});

// Update a code
app.put('/api/codes/:code', (req, res) => {
    const oldCode = req.params.code;
    const { code: newCode, company } = req.body;

    if (!newCode || !company) {
        return res.status(400).json({ error: 'Code and company are required' });
    }

    const codes = loadCodesFromFile();
    const idx = codes.findIndex(c => c.code.toUpperCase() === oldCode.toUpperCase());

    if (idx === -1) {
        return res.status(404).json({ error: 'Code not found' });
    }

    // Check if new code conflicts with existing (if changing code)
    if (oldCode.toUpperCase() !== newCode.toUpperCase() &&
        codes.some(c => c.code.toUpperCase() === newCode.toUpperCase())) {
        return res.status(400).json({ error: 'New code already exists' });
    }

    codes[idx] = { code: newCode.toUpperCase(), company };
    saveCodesToFile(codes);

    res.json({ success: true, codes });
});

// Delete a code
app.delete('/api/codes/:code', (req, res) => {
    const codeToDelete = req.params.code;

    let codes = loadCodesFromFile();
    const initialLength = codes.length;
    codes = codes.filter(c => c.code.toUpperCase() !== codeToDelete.toUpperCase());

    if (codes.length === initialLength) {
        return res.status(404).json({ error: 'Code not found' });
    }

    saveCodesToFile(codes);
    res.json({ success: true, codes });
});

// Toggle favorite status
app.post('/api/codes/:code/favorite', (req, res) => {
    const codeToToggle = req.params.code;
    const { favorite } = req.body;

    const codes = loadCodesFromFile();
    const idx = codes.findIndex(c => c.code.toUpperCase() === codeToToggle.toUpperCase());

    if (idx === -1) {
        return res.status(404).json({ error: 'Code not found' });
    }

    codes[idx].favorite = favorite !== undefined ? favorite : !codes[idx].favorite;
    saveCodesToFile(codes);

    res.json({ success: true, codes });
});

// Generate Marriott URL
function generateMarriottUrl(city, country, checkIn, checkOut, code) {
    const fromDate = formatDateForUrl(checkIn);
    const toDate = formatDateForUrl(checkOut);
    // Calculate nights by parsing date parts directly to avoid timezone issues
    const [inYear, inMonth, inDay] = checkIn.split('-').map(Number);
    const [outYear, outMonth, outDay] = checkOut.split('-').map(Number);
    const checkInDate = new Date(inYear, inMonth - 1, inDay);
    const checkOutDate = new Date(outYear, outMonth - 1, outDay);
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

    let url = `https://www.marriott.com/search/findHotels.mi?fromDate=${fromDate}&toDate=${toDate}&lengthOfStay=${nights}&destinationAddress.city=${encodeURIComponent(city)}`;

    if (country) {
        url += `&destinationAddress.country=${country}`;
    }

    if (code && code !== 'BASELINE') {
        url += `&clusterCode=corp&corporateCode=${encodeURIComponent(code)}`;
    }

    url += `&view=list&deviceType=desktop-web`;
    return url;
}

function formatDateForUrl(dateStr) {
    // Parse date string directly to avoid timezone issues
    // dateStr is in format "YYYY-MM-DD"
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
}

// ONE-CLICK SEARCH: Opens tabs, waits, parses, closes, returns results
app.post('/api/search', async (req, res) => {
    const { city, country, checkIn, checkOut, codes: requestCodes, waitTime = 15000 } = req.body;

    if (!city || !checkIn || !checkOut) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Use codes from request, or fall back to backend codes
    const codes = (requestCodes && requestCodes.length > 0) ? requestCodes : CORPORATE_CODES;

    const urls = codes.map(code => ({
        code,
        url: generateMarriottUrl(city, country, checkIn, checkOut, code)
    }));

    // Step 1: Open tabs in a new window
    const openScript = `
tell application "Google Chrome"
    set newWindow to make new window
    set bounds of newWindow to {100, 100, 1300, 900}
    set URL of active tab of newWindow to "${urls[0].url}"
    ${urls.slice(1).map(u => `make new tab at end of tabs of newWindow with properties {URL:"${u.url}"}`).join('\n    ')}
end tell
return "opened"
`;

    const openScriptFile = `/tmp/marriott-v2-open.scpt`;
    fs.writeFileSync(openScriptFile, openScript);

    try {
        // Open tabs
        await execPromise(`osascript ${openScriptFile}`, { timeout: 30000 });

        // Wait for pages to actually load (smart polling instead of fixed timer)
        await waitForTabsToLoad();

        // Step 2: Parse all tabs
        const parseResults = await parseAllTabs();

        // Step 3: Close tabs
        await closeMarriottTabs();

        res.json({ success: true, results: parseResults });

    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({ error: error.message });
    } finally {
        try { fs.unlinkSync(openScriptFile); } catch (e) {}
    }
});

// Parse all Marriott tabs - DOM-based extraction for accurate image matching
async function parseAllTabs() {
    const jsCode = `
(function() {
    var hotels = [];
    var bodyText = document.body.innerText || '';

    // Check for error states
    if (bodyText.indexOf('Access Denied') !== -1) {
        return JSON.stringify({error: 'ACCESS_DENIED'});
    }
    if (bodyText.indexOf('No results found') !== -1 || bodyText.indexOf('no hotels found') !== -1 || bodyText.indexOf('expand your search') !== -1) {
        return JSON.stringify({error: 'NO_RESULTS', hotels: []});
    }

    // Check if page is still loading
    // 1. Spinner/skeleton visible
    var loadingIndicator = document.querySelector('.m-spinner, [data-component="loading-skeleton"], .analytics-loading');
    // 2. No property cards and no "no results" message - page likely still rendering
    var hasCards = document.querySelector('.property-card-container, .t-subtitle-xl');
    var hasNoResults = bodyText.indexOf('No results found') !== -1 || bodyText.indexOf('no hotels found') !== -1;

    if (loadingIndicator || (!hasCards && !hasNoResults)) {
        return JSON.stringify({error: 'STILL_LOADING', hotels: []});
    }

    // STRATEGY: Use Marriott's actual DOM structure
    // Property cards have class 'property-card-container'
    // Hotel names are in elements with class 't-subtitle-xl'
    // Images are from 'marriotts7prod' CDN

    var skipPhrases = ['Home Rentals', 'VACATION HOME', 'Backed by Marriott', 'Credit Card', 'Credit Cards', 'Bonvoy', 'NEW!', 'Rentals'];
    var processedNames = {};

    // Method 1: Find property cards directly using Marriott's class structure
    var cards = document.querySelectorAll('.property-card-container');

    for (var c = 0; c < cards.length; c++) {
        var card = cards[c];

        // Find hotel name in this card
        var nameEl = card.querySelector('.t-subtitle-xl');
        var name = nameEl ? nameEl.innerText.trim() : '';

        // Skip invalid names
        if (!name || name.length < 5 || name.indexOf('reviews') !== -1) continue;

        // Skip unwanted entries
        var shouldSkip = false;
        for (var s = 0; s < skipPhrases.length; s++) {
            if (name.indexOf(skipPhrases[s]) !== -1) { shouldSkip = true; break; }
        }
        if (shouldSkip) continue;

        // Skip duplicates
        if (processedNames[name]) continue;
        processedNames[name] = true;

        // Extract brand name from SVG aria-label in brand container
        var brandName = '';
        var brandSvg = card.querySelector('.hotel-brand-logo-container svg');
        if (brandSvg) {
            brandName = brandSvg.getAttribute('aria-label') || '';
        }

        // Find images - prefer exterior shots for primary photo
        // Images are in a carousel listbox with options containing img elements
        var imgs = card.querySelectorAll('img');
        var imageUrl = '';
        var exteriorUrl = '';
        var firstPropertyUrl = '';

        for (var i = 0; i < imgs.length; i++) {
            var img = imgs[i];
            var src = img.src || '';
            var alt = img.alt || '';

            // Property images are from marriotts7prod CDN (skip logos, icons, etc)
            if (src.indexOf('marriotts7prod') !== -1 && src.indexOf('logo') === -1) {
                if (!firstPropertyUrl) firstPropertyUrl = src;

                // Prefer exterior shots (building photos)
                if (alt.toLowerCase().indexOf('exterior') !== -1 && !exteriorUrl) {
                    exteriorUrl = src;
                }
            }
        }

        // Use exterior if found, otherwise first property image
        imageUrl = exteriorUrl || firstPropertyUrl;

        // Extract price from card text
        var cardText = card.innerText || '';
        var price = null;
        var rating = null;

        // Find price - look for AUD pattern first
        var priceMatch = cardText.match(/([0-9,]+)\\s*AUD/i);
        if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
        }
        if (!price) {
            // Try $ pattern
            priceMatch = cardText.match(/\\$([0-9,]+)/);
            if (priceMatch) {
                price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
            }
        }

        // Only mark as N/A if we didn't find a price AND the card shows unavailable
        // (Don't override a valid price - the wrapper card may contain "Rate Unavailable" for other hotels)
        if (!price && (cardText.indexOf('Rate Unavailable') !== -1 || cardText.indexOf('Sold Out') !== -1)) {
            price = 'N/A';
        }

        // Find rating (e.g., "4.3 (1,234 reviews)")
        var ratingMatch = cardText.match(/([0-9]\\.[0-9])\\s*\\(/);
        if (ratingMatch) {
            rating = parseFloat(ratingMatch[1]);
        }

        // Add hotel to results
        hotels.push({
            name: name,
            price: price,
            rating: rating,
            imageUrl: imageUrl,
            brandName: brandName
        });
    }

    // Fallback: If property-card-container approach found nothing, try t-subtitle-xl with parent traversal
    if (hotels.length === 0) {
        var hotelKeywords = ['Marriott', 'Sheraton', 'Westin', 'W Sydney', 'W Brisbane', 'W Melbourne', 'W Hotel', 'Courtyard', 'Residence Inn', 'Fairfield', 'SpringHill', 'Aloft', 'JW ', 'Renaissance', 'Le Meridien', 'Moxy', 'Four Points', 'Autograph', 'Tribute', 'AC Hotel', 'Element', 'Ritz-Carlton', 'St. Regis', 'EDITION', 'Pier One'];

        var titleEls = document.querySelectorAll('.t-subtitle-xl');
        for (var t = 0; t < titleEls.length; t++) {
            var titleEl = titleEls[t];
            var name = titleEl.innerText ? titleEl.innerText.trim() : '';

            if (!name || name.length < 5 || name.length > 100 || processedNames[name]) continue;
            if (name.indexOf('reviews') !== -1) continue;

            // Skip promo/ad content
            var shouldSkip = false;
            for (var s = 0; s < skipPhrases.length; s++) {
                if (name.indexOf(skipPhrases[s]) !== -1) { shouldSkip = true; break; }
            }
            if (shouldSkip) continue;

            var isHotel = false;
            for (var k = 0; k < hotelKeywords.length; k++) {
                if (name.indexOf(hotelKeywords[k]) !== -1) { isHotel = true; break; }
            }
            if (!isHotel) continue;

            // Traverse up to find container with image
            var el = titleEl;
            var imageUrl = '';
            var exteriorUrl = '';
            var firstPropertyUrl = '';
            var brandName = '';

            for (var lvl = 0; lvl < 8; lvl++) {
                el = el.parentElement;
                if (!el) break;

                // Try to get brand from SVG
                var brandSvg = el.querySelector('.hotel-brand-logo-container svg');
                if (brandSvg && !brandName) {
                    brandName = brandSvg.getAttribute('aria-label') || '';
                }

                var imgs = el.querySelectorAll('img');
                for (var i = 0; i < imgs.length; i++) {
                    var img = imgs[i];
                    var src = img.src || '';
                    var alt = img.alt || '';

                    // Property images
                    if (src.indexOf('marriotts7prod') !== -1 && src.indexOf('logo') === -1) {
                        if (!firstPropertyUrl) firstPropertyUrl = src;
                        if (alt.toLowerCase().indexOf('exterior') !== -1 && !exteriorUrl) {
                            exteriorUrl = src;
                        }
                    }
                }
                if (firstPropertyUrl) break;
            }

            imageUrl = exteriorUrl || firstPropertyUrl;

            if (el) {
                var cardText = el.innerText || '';
                var price = null;
                var priceMatch = cardText.match(/([0-9,]+)\\s*AUD/i);
                if (priceMatch) price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
                if (!price) {
                    priceMatch = cardText.match(/\\$([0-9,]+)/);
                    if (priceMatch) price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
                }
                // Only mark as N/A if no price was found
                if (!price && (cardText.indexOf('Sold Out') !== -1 || cardText.indexOf('Rate Unavailable') !== -1)) {
                    price = 'N/A';
                }

                var rating = null;
                var ratingMatch = cardText.match(/([0-9]\\.[0-9])\\s*\\(/);
                if (ratingMatch) rating = parseFloat(ratingMatch[1]);

                processedNames[name] = true;
                hotels.push({ name: name, price: price, rating: rating, imageUrl: imageUrl, brandName: brandName });
            }
        }
    }

    return JSON.stringify({hotels: hotels, count: hotels.length});
})()
`;

    const escapedJs = jsCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

    const script = `
tell application "Google Chrome"
    set results to ""
    repeat with w in windows
        repeat with t in tabs of w
            set tabURL to URL of t
            if tabURL contains "marriott.com/search" then
                set corpCode to ""
                if tabURL contains "corporateCode=" then
                    set AppleScript's text item delimiters to "corporateCode="
                    set afterCode to text item 2 of tabURL
                    set AppleScript's text item delimiters to "&"
                    set corpCode to text item 1 of afterCode
                    set AppleScript's text item delimiters to ""
                end if

                set pageData to execute t javascript "${escapedJs}"

                set results to results & "CODE:" & corpCode & linefeed & pageData & linefeed & "---" & linefeed
            end if
        end repeat
    end repeat
    return results
end tell
`;

    const scriptFile = `/tmp/marriott-v2-parse.scpt`;
    fs.writeFileSync(scriptFile, script);

    try {
        const { stdout } = await execPromise(`osascript ${scriptFile}`, { timeout: 60000 });
        console.log('Raw parse output:', stdout.substring(0, 500)); // Debug

        const results = [];
        const sections = stdout.split('---').filter(s => s.trim());

        for (const section of sections) {
            const lines = section.trim().split('\n');
            const codeLine = lines.find(l => l.startsWith('CODE:'));
            const code = codeLine ? codeLine.replace('CODE:', '').trim() : 'BASELINE';

            // Find the JSON data line (now it's an object with {hotels: [...]} or {error: ...})
            const dataLine = lines.find(l => l.startsWith('{'));

            let hotels = [];
            let error = null;

            if (dataLine) {
                try {
                    const parsed = JSON.parse(dataLine);

                    if (parsed.error) {
                        error = parsed.error;
                        console.log(`Code ${code || 'BASELINE'}: ${error}`);
                    }

                    if (parsed.hotels && Array.isArray(parsed.hotels)) {
                        hotels = parsed.hotels.map(h => ({
                            name: h.name || '',
                            price: h.price && h.price !== 'N/A' ? (typeof h.price === 'number' ? h.price : parseFloat(h.price)) : (h.price === 'N/A' ? 'N/A' : null),
                            rating: h.rating ? parseFloat(h.rating) : null,
                            reviewCount: h.reviewCount ? parseInt(h.reviewCount) : null,
                            distance: h.distance || '',
                            description: h.description || '',
                            imageUrl: h.imageUrl || '',
                            brandName: h.brandName || ''
                        })).filter(h => h.name && h.name.length > 5 &&
                            !h.name.includes('Credit Card') &&
                            !h.name.includes('Bonvoy') &&
                            !h.name.includes('Rentals') &&
                            !h.name.includes('NEW!'));
                    }

                    console.log(`Code ${code || 'BASELINE'}: Found ${hotels.length} hotels`);
                    // Log details for debugging
                    if (hotels.length > 0) {
                        hotels.slice(0, 3).forEach(h => {
                            console.log(`  - ${h.name}: ${h.price}`);
                        });
                    }
                } catch (e) {
                    console.error('JSON parse error:', e.message, 'Data:', dataLine.substring(0, 200));
                }
            } else {
                console.log(`Code ${code || 'BASELINE'}: No data line found`);
            }

            results.push({
                code: code || 'BASELINE',
                hotels,
                success: !error || error === 'NO_RESULTS',
                error: error
            });
        }

        return results;

    } finally {
        try { fs.unlinkSync(scriptFile); } catch (e) {}
    }
}

// Batch config constants
const BATCH_CONFIG = {
    MAX_TABS_PER_BATCH: 10,
    MAX_WAIT_PER_BATCH: 60000,   // Max 60 seconds to wait for tabs to load
    POLL_INTERVAL: 2000,         // Check every 2 seconds
    INTER_BATCH_DELAY: 3000      // 3 seconds between batches
};

// Check loading state of all Marriott tabs
async function checkAllTabsLoadingState() {
    const script = `
tell application "Google Chrome"
    set results to {}
    set windowsToCheck to every window
    repeat with w in windowsToCheck
        repeat with t in tabs of w
            try
                if URL of t contains "marriott.com/search" then
                    set loadState to execute t javascript "
                        (function() {
                            // Page not ready at browser level
                            if (document.readyState !== 'complete') return 'LOADING';

                            // Marriott-specific loading indicators
                            var spinner = document.querySelector('.m-spinner, [data-component=\\"loading-skeleton\\"], .analytics-loading, .loading-indicator');
                            if (spinner && spinner.offsetParent !== null) return 'LOADING';

                            // Content check - must have either results or no-results message
                            var hasCards = document.querySelector('.property-card-container, .t-subtitle-xl');
                            var bodyText = document.body.innerText || '';
                            var hasNoResults = bodyText.indexOf('No results') !== -1 || bodyText.indexOf('no hotels') !== -1 || bodyText.indexOf('expand your search') !== -1;

                            if (!hasCards && !hasNoResults) return 'LOADING';

                            return 'READY';
                        })();
                    "
                    set end of results to loadState
                end if
            end try
        end repeat
    end repeat
    return results
end tell`;

    try {
        const { stdout } = await execPromise(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { timeout: 15000 });
        const states = stdout.trim().split(', ').filter(s => s);
        const stillLoading = states.filter(s => s === 'LOADING').length;
        const ready = states.filter(s => s === 'READY').length;
        return {
            total: states.length,
            ready,
            stillLoading,
            allLoaded: stillLoading === 0 && states.length > 0
        };
    } catch (error) {
        console.error('Error checking tab states:', error.message);
        return { total: 0, ready: 0, stillLoading: 0, allLoaded: false };
    }
}

// Wait for all Marriott tabs to finish loading
async function waitForTabsToLoad(maxWaitMs = BATCH_CONFIG.MAX_WAIT_PER_BATCH, pollIntervalMs = BATCH_CONFIG.POLL_INTERVAL) {
    const startTime = Date.now();
    let lastStatus = null;

    while (Date.now() - startTime < maxWaitMs) {
        const status = await checkAllTabsLoadingState();

        // Log progress if changed
        if (!lastStatus || lastStatus.stillLoading !== status.stillLoading) {
            console.log(`Tab loading: ${status.ready}/${status.total} ready, ${status.stillLoading} still loading (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
        }
        lastStatus = status;

        if (status.allLoaded) {
            console.log(`All ${status.total} tabs loaded in ${Math.round((Date.now() - startTime) / 1000)}s`);
            return true;
        }

        if (status.total === 0) {
            console.log('No Marriott tabs found, waiting...');
        }

        await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    console.log(`Timeout after ${Math.round(maxWaitMs / 1000)}s - proceeding with parse (some tabs may still be loading)`);
    return false;
}

// Get batch config
app.get('/api/batch-config', (req, res) => {
    res.json(BATCH_CONFIG);
});

// BATCH SEARCH: Opens tabs in batches, processes sequentially, closes tabs between batches
app.post('/api/search-batch', async (req, res) => {
    const { city, country, checkIn, checkOut, codes: requestCodes, batchIndex = 0, batchSize = BATCH_CONFIG.MAX_TABS_PER_BATCH } = req.body;

    if (!city || !checkIn || !checkOut) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const allCodes = (requestCodes && requestCodes.length > 0) ? requestCodes : [];

    if (allCodes.length === 0) {
        return res.status(400).json({ error: 'No codes provided' });
    }

    const totalBatches = Math.ceil(allCodes.length / batchSize);
    const startIdx = batchIndex * batchSize;
    const endIdx = Math.min(startIdx + batchSize, allCodes.length);
    const batchCodes = allCodes.slice(startIdx, endIdx);
    const isLastBatch = batchIndex >= totalBatches - 1;

    console.log(`Batch ${batchIndex + 1}/${totalBatches}: Processing codes ${startIdx + 1}-${endIdx} of ${allCodes.length}`);

    const urls = batchCodes.map(code => ({
        code,
        url: generateMarriottUrl(city, country, checkIn, checkOut, code)
    }));

    // Step 1: Close any existing Marriott tabs first
    try {
        await closeMarriottTabs();
        await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause after closing
    } catch (e) {
        console.log('Pre-close warning:', e.message);
    }

    // Step 2: Open tabs in a new window
    const openScript = `
tell application "Google Chrome"
    set newWindow to make new window
    set bounds of newWindow to {100, 100, 1300, 900}
    set URL of active tab of newWindow to "${urls[0].url}"
    ${urls.slice(1).map(u => `make new tab at end of tabs of newWindow with properties {URL:"${u.url}"}`).join('\n    ')}
end tell
return "opened"
`;

    const openScriptFile = `/tmp/marriott-v2-batch-open.scpt`;
    fs.writeFileSync(openScriptFile, openScript);

    try {
        // Open tabs
        await execPromise(`osascript ${openScriptFile}`, { timeout: 30000 });

        // Wait for pages to actually load (smart polling instead of fixed timer)
        await waitForTabsToLoad();

        // Step 3: Parse all tabs
        const parseResults = await parseAllTabs();

        // Step 4: Close ALL Marriott tabs before returning
        await closeMarriottTabs();

        res.json({
            success: true,
            results: parseResults,
            batchIndex,
            totalBatches,
            isLastBatch,
            codesProcessed: batchCodes.length,
            totalCodes: allCodes.length
        });

    } catch (error) {
        console.error('Batch search error:', error.message);
        // Try to close tabs even on error
        try { await closeMarriottTabs(); } catch (e) {}
        res.status(500).json({ error: error.message, batchIndex });
    } finally {
        try { fs.unlinkSync(openScriptFile); } catch (e) {}
    }
});

// Close all Marriott tabs
async function closeMarriottTabs() {
    const script = `
tell application "Google Chrome"
    set windowsToCheck to every window
    repeat with w in windowsToCheck
        set tabCount to count of tabs of w
        repeat with i from tabCount to 1 by -1
            try
                set t to tab i of w
                if URL of t contains "marriott.com/search" then
                    close t
                end if
            end try
        end repeat
        -- Close empty windows
        try
            if (count of tabs of w) = 0 then
                close w
            end if
        end try
    end repeat
end tell
return "closed"
`;

    const scriptFile = `/tmp/marriott-v2-close.scpt`;
    fs.writeFileSync(scriptFile, script);

    try {
        await execPromise(`osascript ${scriptFile}`, { timeout: 15000 });
    } finally {
        try { fs.unlinkSync(scriptFile); } catch (e) {}
    }
}

// Legacy endpoints for manual control (if needed)
app.post('/api/open-tabs', async (req, res) => {
    const { city, country, checkIn, checkOut, codes } = req.body;

    if (!city || !checkIn || !checkOut || !codes || codes.length === 0) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const urls = codes.map(code => ({
        code,
        url: generateMarriottUrl(city, country, checkIn, checkOut, code)
    }));

    const script = `
tell application "Google Chrome"
    activate
    set newWindow to make new window
    set URL of active tab of newWindow to "${urls[0].url}"
    ${urls.slice(1).map(u => `make new tab at end of tabs of newWindow with properties {URL:"${u.url}"}`).join('\n    ')}
end tell
return "opened"
`;

    const scriptFile = `/tmp/marriott-v2-open-manual.scpt`;
    fs.writeFileSync(scriptFile, script);

    try {
        await execPromise(`osascript ${scriptFile}`, { timeout: 30000 });
        res.json({ success: true, tabCount: urls.length, urls });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        try { fs.unlinkSync(scriptFile); } catch (e) {}
    }
});

app.post('/api/parse-tabs', async (req, res) => {
    try {
        const results = await parseAllTabs();
        res.json({ success: true, results });
    } catch (error) {
        console.error('Parse error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/close-tabs', async (req, res) => {
    try {
        await closeMarriottTabs();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Ritz-Weaselton V2 server running at http://localhost:${PORT}`);
    console.log('');
    console.log('Ensure Chrome > View > Developer > Allow JavaScript from Apple Events is enabled');
});
