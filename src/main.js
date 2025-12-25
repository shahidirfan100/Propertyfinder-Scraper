// PropertyFinder.ae scraper - JavaScript-enabled version using PlaywrightCrawler
import { Actor, log } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';

await Actor.init();

/**
 * Main scraper function
 */
async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            startUrl,
            propertyType = 'apartment',
            location = 'dubai',
            categoryType = 1,
            minPrice,
            maxPrice,
            results_wanted: RESULTS_WANTED_RAW = 100,
            max_pages: MAX_PAGES_RAW = 20,
            collectDetails = true,
            proxyConfiguration,
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) 
            ? Math.max(1, +RESULTS_WANTED_RAW) 
            : Number.MAX_SAFE_INTEGER;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) 
            ? Math.max(1, +MAX_PAGES_RAW) 
            : 20;

        log.info('Starting PropertyFinder scraper (JS-enabled)', {
            propertyType,
            location,
            categoryType,
            resultsWanted: RESULTS_WANTED,
            maxPages: MAX_PAGES,
        });

        /**
         * Build search URL
         */
        const buildSearchUrl = (page = 1) => {
            if (startUrl) {
                const url = new URL(startUrl);
                url.searchParams.set('page', String(page));
                return url.href;
            }

            const url = new URL('https://www.propertyfinder.ae/en/search');
            url.searchParams.set('page', String(page));
            url.searchParams.set('c', String(categoryType));
            url.searchParams.set('fu', '0');
            url.searchParams.set('ob', 'mr');

            if (minPrice) url.searchParams.set('price_min', String(minPrice));
            if (maxPrice) url.searchParams.set('price_max', String(maxPrice));

            return url.href;
        };

        /**
         * Clean text helper
         */
        const cleanText = (text) => {
            if (!text) return null;
            return String(text).replace(/\s+/g, ' ').trim() || null;
        };

        /**
         * Extract number from text
         */
        const extractNumber = (text) => {
            if (!text) return null;
            const match = String(text).match(/\d+/);
            return match ? parseInt(match[0]) : null;
        };

        /**
         * Convert relative to absolute URL
         */
        const toAbsoluteUrl = (href) => {
            if (!href) return null;
            try {
                if (href.startsWith('http')) return href;
                return new URL(href, 'https://www.propertyfinder.ae').href;
            } catch {
                return null;
            }
        };

        /**
         * Extract JSON-LD structured data
         */
        const extractJsonLd = ($) => {
            try {
                const scripts = $('script[type="application/ld+json"]');
                
                for (let i = 0; i < scripts.length; i++) {
                    const content = $(scripts[i]).html();
                    if (!content) continue;

                    try {
                        const jsonData = JSON.parse(content);
                        if (jsonData['@type'] === 'RealEstateListing' || jsonData.offers) {
                            return {
                                title: jsonData.name,
                                price: jsonData.offers?.price ? parseInt(jsonData.offers.price) : null,
                                location: jsonData.address?.addressLocality,
                                url: jsonData.url,
                                bedrooms: jsonData.numberOfRooms,
                                bathrooms: null,
                                area: null,
                                agentName: null,
                                postedDate: jsonData.datePosted,
                                propertyType: 'Property',
                            };
                        }
                    } catch (parseErr) {
                        continue;
                    }
                }
            } catch (err) {
                log.debug('JSON-LD extraction failed', { error: err.message });
            }
            return null;
        };

        /**
         * Extract data from HTML
         */
        const extractFromHtml = ($, url) => {
            // Title
            const title = cleanText(
                $('h1').first().text() ||
                $('[class*="title"]').first().text()
            );

            // Price
            const priceText = cleanText(
                $('[class*="price"]').first().text() ||
                $('[data-testid*="price"]').first().text()
            );
            const price = priceText ? parseInt(priceText.replace(/[^\d]/g, '')) || null : null;

            // Location
            const location = cleanText(
                $('[class*="location"]').first().text() ||
                $('[data-testid*="location"]').first().text()
            );

            // Bedrooms
            const bedroomText = cleanText(
                $('[class*="bed"]').first().text() ||
                $('[data-testid*="bed"]').first().text()
            );
            const bedrooms = extractNumber(bedroomText);

            // Bathrooms
            const bathroomText = cleanText(
                $('[class*="bath"]').first().text() ||
                $('[data-testid*="bath"]').first().text()
            );
            const bathrooms = extractNumber(bathroomText);

            // Area
            const areaText = cleanText(
                $('[class*="area"], [class*="sqft"]').first().text() ||
                $('[data-testid*="area"]').first().text()
            );
            const area = areaText ? parseInt(areaText.replace(/[^\d]/g, '')) || null : null;

            // Agent name
            const agentName = cleanText(
                $('[class*="agent"]').first().text() ||
                $('[data-testid*="agent"]').first().text()
            );

            // Posted date
            const postedDate = cleanText(
                $('[class*="posted"], [class*="date"]').first().text()
            );

            return {
                title,
                price,
                location,
                bedrooms,
                bathrooms,
                area,
                agentName,
                postedDate,
                url,
                propertyType: 'Property',
            };
        };

        /**
         * Extract property card data from listing page
         */
        const extractListingData = ($) => {
            const properties = [];

            // Find all property cards
            const $cards = $('[class*="card"], [class*="listing"], article, [data-testid*="card"]');

            $cards.each((index, element) => {
                try {
                    const $card = $(element);
                    
                    // Extract link
                    const $link = $card.find('a').first();
                    const url = toAbsoluteUrl($link.attr('href'));
                    
                    if (!url) return;

                    // Extract title
                    const title = cleanText(
                        $card.find('h2, [class*="title"]').first().text() ||
                        $link.text()
                    );

                    // Extract price
                    const priceText = cleanText(
                        $card.find('[class*="price"]').first().text()
                    );
                    const price = priceText ? parseInt(priceText.replace(/[^\d]/g, '')) || null : null;

                    // Extract location
                    const location = cleanText(
                        $card.find('[class*="location"]').first().text()
                    );

                    // Extract bedrooms/bathrooms
                    const specs = cleanText(
                        $card.find('[class*="spec"], [class*="feature"]').text()
                    );
                    const bedrooms = specs ? extractNumber(specs) : null;

                    const property = {
                        title: title || 'Property',
                        price,
                        location: location || 'UAE',
                        bedrooms,
                        bathrooms: null,
                        area: null,
                        agentName: null,
                        postedDate: null,
                        url,
                        propertyType: propertyType || 'Property',
                    };

                    // Only add if has meaningful data
                    if (title || price || location || url) {
                        properties.push(property);
                    }
                } catch (err) {
                    log.warning('Failed to extract card', { error: err.message });
                }
            });

            return properties;
        };

        // Track stats
        let totalExtracted = 0;
        const processedUrls = new Set();

        // Create PlaywrightCrawler for JS handling
        const crawler = new PlaywrightCrawler({
            proxyConfiguration,
            maxConcurrency: 1, // Single browser for stability
            maxRequestsPerCrawl: RESULTS_WANTED,
            requestHandlerTimeoutSecs: 60,
            navigationTimeoutSecs: 30,

            // Browser launch options for stealth
            launchContext: {
                launchOptions: {
                    headless: true,
                    args: [
                        '--disable-blink-features=AutomationControlled',
                        '--disable-web-resources',
                    ],
                },
            },

            async requestHandler({ request, page, $ }) {
                const { pageNo = 1 } = request.userData;

                try {
                    log.info(`Processing page ${pageNo}: ${request.url}`);

                    // Wait for content to load
                    await page.waitForSelector('[class*="card"], article, [data-testid*="card"]', {
                        timeout: 10000,
                    }).catch(() => {
                        log.warning('Could not find property cards - using available data');
                    });

                    // Get page content
                    const html = await page.content();
                    
                    // Parse with cheerio
                    const { load } = await import('cheerio');
                    const cheerio$ = load(html);

                    // Extract properties from listing
                    const properties = extractListingData(cheerio$);

                    if (properties.length === 0) {
                        log.warning(`No properties found on page ${pageNo}`);
                        return;
                    }

                    log.info(`Extracted ${properties.length} properties from page ${pageNo}`);

                    // Save each property
                    for (const property of properties) {
                        if (processedUrls.has(property.url)) continue;
                        processedUrls.add(property.url);

                        // Try to get more details from detail page if available
                        if (collectDetails && property.url) {
                            try {
                                const detailPage = await page.goto(property.url, { 
                                    waitUntil: 'domcontentloaded',
                                    timeout: 30000,
                                }).catch(() => null);

                                if (detailPage) {
                                    const detailHtml = await page.content();
                                    const detail$ = load(detailHtml);
                                    
                                    // Try JSON-LD first
                                    const jsonLdData = extractJsonLd(detail$);
                                    if (jsonLdData && jsonLdData.title) {
                                        Object.assign(property, jsonLdData);
                                    } else {
                                        // Fallback to HTML extraction
                                        const htmlData = extractFromHtml(detail$, property.url);
                                        if (htmlData && htmlData.title) {
                                            Object.assign(property, htmlData);
                                        }
                                    }

                                    // Go back to listing
                                    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
                                }
                            } catch (detailErr) {
                                log.debug('Failed to fetch detail page', { error: detailErr.message });
                            }
                        }

                        // Save property
                        await Actor.pushData(property);
                        totalExtracted++;

                        if (totalExtracted >= RESULTS_WANTED) {
                            log.info('Reached results limit', { totalExtracted, RESULTS_WANTED });
                            break;
                        }
                    }

                    // Enqueue next page if needed
                    if (totalExtracted < RESULTS_WANTED && pageNo < MAX_PAGES) {
                        const nextPage = pageNo + 1;
                        const nextUrl = buildSearchUrl(nextPage);

                        await crawler.addRequests([{
                            url: nextUrl,
                            userData: { pageNo: nextPage },
                        }]);

                        log.info('Enqueued next page', { nextPage });
                    }

                } catch (err) {
                    log.error('Handler error', { error: err.message, url: request.url });
                    throw err;
                }
            },
        });

        // Start crawling
        const initialUrl = buildSearchUrl(1);
        await crawler.run([{
            url: initialUrl,
            userData: { pageNo: 1 },
        }]);

        log.info('Scraping completed', { totalExtracted });

    } catch (err) {
        log.exception(err, 'Main function failed');
        throw err;
    } finally {
        await Actor.exit();
    }
}

// Run the scraper
main().catch((err) => {
    log.exception(err, 'Fatal error');
    process.exit(1);
});

