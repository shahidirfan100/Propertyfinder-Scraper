// PropertyFinder.ae scraper - Production-ready implementation
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';

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

        log.info('Starting PropertyFinder scraper', {
            propertyType,
            location,
            categoryType,
            resultsWanted: RESULTS_WANTED,
            maxPages: MAX_PAGES,
        });

        /**
         * Build search URL from parameters
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
         * Convert relative URL to absolute
         */
        const toAbsoluteUrl = (href, base = 'https://www.propertyfinder.ae') => {
            if (!href) return null;
            try {
                if (href.startsWith('http')) return href;
                return new URL(href, base).href;
            } catch {
                return null;
            }
        };

        /**
         * Clean and normalize text
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
            const match = String(text).match(/(\d+)/);
            return match ? parseInt(match[1], 10) : null;
        };

        /**
         * Try to find and use internal API
         * PropertyFinder might have GraphQL or REST endpoints
         */
        const tryApiExtraction = async (url, proxyUrl) => {
            try {
                // Check for Next.js data or GraphQL endpoints
                const apiUrls = [
                    url.replace('/en/search', '/api/search'),
                    url.replace('/en/search', '/_next/data'),
                ];

                for (const apiUrl of apiUrls) {
                    try {
                        const response = await gotScraping({
                            url: apiUrl,
                            responseType: 'json',
                            proxyUrl,
                            headers: {
                                'accept': 'application/json',
                                'referer': url,
                            },
                        });

                        if (response.body && typeof response.body === 'object') {
                            log.info(`Found API endpoint: ${apiUrl}`);
                            return response.body;
                        }
                    } catch (err) {
                        log.debug(`API endpoint ${apiUrl} failed: ${err.message}`);
                    }
                }
            } catch (err) {
                log.debug('API extraction failed, falling back to HTML');
            }
            return null;
        };

        /**
         * Extract property links from listing page
         */
        const extractPropertyLinks = ($) => {
            const links = new Set();
            
            // Multiple selector strategies for robustness
            const selectors = [
                'a[href*="/plp/buy/"]',
                'a[href*="/plp/rent/"]',
                'a[href*="for-sale"]',
                'a[href*="for-rent"]',
                '[data-testid="property-card"] a',
                '.property-card a',
                'article a',
            ];

            selectors.forEach(selector => {
                $(selector).each((_, el) => {
                    const href = $(el).attr('href');
                    if (href && (href.includes('/plp/') || href.includes('for-sale') || href.includes('for-rent'))) {
                        const absUrl = toAbsoluteUrl(href);
                        if (absUrl) links.add(absUrl);
                    }
                });
            });

            return Array.from(links);
        };

        /**
         * Extract basic property info from listing card
         */
        const extractPropertyFromCard = ($card) => {
            // Extract title
            const title = cleanText(
                $card.find('h2, h3, [class*="title"], [data-testid="title"]').first().text()
            );

            // Extract price
            const priceText = cleanText(
                $card.find('[class*="price"], [data-testid="price"]').first().text()
            );

            // Extract location
            const locationText = cleanText(
                $card.find('[class*="location"], [data-testid="location"]').first().text()
            );

            // Extract bedrooms, bathrooms, area
            let bedrooms = null;
            let bathrooms = null;
            let area = null;

            $card.find('[class*="bed"], [class*="bath"], [class*="area"], [class*="sqft"]').each((_, el) => {
                const text = $(el).text();
                const icon = $(el).find('svg, img, i').attr('class') || '';
                
                if (text.includes('bed') || icon.includes('bed')) {
                    bedrooms = extractNumber(text);
                } else if (text.includes('bath') || icon.includes('bath')) {
                    bathrooms = extractNumber(text);
                } else if (text.includes('sqft') || text.includes('sq ft') || icon.includes('area')) {
                    area = cleanText(text);
                }
            });

            // Extract agent info
            const agentName = cleanText(
                $card.find('[class*="agent"], [data-testid="agent"]').first().text()
            );

            // Extract posted date
            const postedDate = cleanText(
                $card.find('[class*="listed"], [class*="posted"], [class*="date"]').first().text()
            );

            // Extract URL
            const url = toAbsoluteUrl($card.find('a').first().attr('href'));

            return {
                title,
                propertyType: propertyType || 'Property',
                price: priceText,
                location: locationText,
                bedrooms,
                bathrooms,
                area,
                agentName,
                postedDate,
                url,
            };
        };

        /**
         * Extract property details from detail page
         */
        const extractPropertyDetails = ($, url) => {
            // Try JSON-LD first (Priority 1)
            const jsonLd = extractJsonLd($);
            if (jsonLd && (jsonLd.title || jsonLd.price)) {
                return { ...jsonLd, url };
            }

            // Fallback to HTML parsing (Priority 2)
            return extractFromHtml($, url);
        };

        /**
         * Extract data from JSON-LD structured data (Priority 1)
         */
        const extractJsonLd = ($) => {
            try {
                const scripts = $('script[type="application/ld+json"]');
                
                for (let i = 0; i < scripts.length; i++) {
                    const content = $(scripts[i]).html();
                    if (!content) continue;

                    try {
                        const data = JSON.parse(content);
                        const items = Array.isArray(data) ? data : [data];

                        for (const item of items) {
                            if (!item) continue;
                            const type = item['@type'] || item.type;
                            
                            // Check for real estate related types
                            if (
                                type === 'RealEstateListing' || 
                                type === 'Product' || 
                                type === 'Offer' || 
                                type === 'Residence' ||
                                type === 'Apartment' ||
                                type === 'House'
                            ) {
                                const result = {
                                    title: cleanText(item.name || item.title),
                                    price: cleanText(item.price || item.offers?.price || item.offers?.[0]?.price),
                                    location: cleanText(
                                        item.address?.addressLocality || 
                                        item.address?.streetAddress ||
                                        item.address?.addressRegion
                                    ),
                                    description: cleanText(item.description),
                                    propertyType: cleanText(item.category || item['@type']),
                                    bedrooms: item.numberOfRooms || item.numberOfBedrooms || null,
                                    bathrooms: item.numberOfBathroomsTotal || item.numberOfBathrooms || null,
                                    area: cleanText(item.floorSize?.value || item.floorSize),
                                    agentName: cleanText(item.provider?.name || item.seller?.name),
                                    postedDate: cleanText(item.datePosted),
                                };

                                // Only return if we have meaningful data
                                if (result.title || result.price) {
                                    log.debug('Extracted data from JSON-LD');
                                    return result;
                                }
                            }
                        }
                    } catch (parseErr) {
                        log.debug('JSON-LD parse error', { error: parseErr.message });
                    }
                }
            } catch (err) {
                log.debug('JSON-LD extraction failed', { error: err.message });
            }
            return null;
        };

        /**
         * Extract data from HTML when JSON-LD is not available (Priority 2)
         */
        const extractFromHtml = ($, url) => {
            // Title
            const title = cleanText(
                $('h1').first().text() ||
                $('[class*="title"]').first().text()
            );

            // Price
            const price = cleanText(
                $('[class*="price"]').first().text() ||
                $('[data-testid="price"]').first().text()
            );

            // Location
            const location = cleanText(
                $('[class*="location"]').first().text() ||
                $('[data-testid="location"]').first().text()
            );

            // Description
            const description = cleanText(
                $('[class*="description"]').first().text() ||
                $('[data-testid="description"]').first().text()
            );

            // Extract specs
            let bedrooms = null;
            let bathrooms = null;
            let area = null;
            let propertyType = null;
            let agentName = null;
            let postedDate = null;

            // Try to find property features
            $('[class*="property-"], [class*="feature"], [class*="spec"], [data-testid*="spec"]').each((_, el) => {
                const text = $(el).text().toLowerCase();
                const fullText = $(el).text();
                
                if (text.includes('bed') && !bedrooms) {
                    bedrooms = extractNumber(fullText);
                }
                if (text.includes('bath') && !bathrooms) {
                    bathrooms = extractNumber(fullText);
                }
                if ((text.includes('sqft') || text.includes('sq ft')) && !area) {
                    area = cleanText(fullText);
                }
            });

            // Property type
            propertyType = cleanText(
                $('[class*="property-type"]').first().text() ||
                $('[data-testid="property-type"]').first().text()
            );

            // Agent info
            agentName = cleanText(
                $('[class*="agent"]').first().text() ||
                $('[data-testid="agent"]').first().text()
            );

            // Posted date
            postedDate = cleanText(
                $('[class*="listed"], [class*="posted"], [class*="date"]').first().text() ||
                $('[data-testid="posted-date"]').first().text()
            );

            log.debug('Extracted data from HTML parsing');

            return {
                title,
                propertyType: propertyType || propertyType,
                price,
                location,
                description,
                bedrooms,
                bathrooms,
                area,
                agentName,
                postedDate,
                url,
            };
        };

        // Setup proxy configuration
        const proxyConf = proxyConfiguration 
            ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) 
            : undefined;

        let savedCount = 0;
        const seenUrls = new Set();

        // Initialize crawler with stealth settings
        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 3,
            useSessionPool: true,
            maxConcurrency: 3, // Lower for stealth
            requestHandlerTimeoutSecs: 90,
            
            // Add stealth headers
            preNavigationHooks: [
                async ({ request }, goToOptions) => {
                    goToOptions.headers = {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'DNT': '1',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Cache-Control': 'max-age=0',
                        ...goToOptions.headers,
                    };
                },
            ],
            
            async requestHandler({ request, $, enqueueLinks, log: crawlerLog }) {
                const { label = 'LIST', pageNo = 1 } = request.userData;

                // Handle listing pages
                if (label === 'LIST') {
                    crawlerLog.info(`Processing listing page ${pageNo}: ${request.url}`);
                    
                    // Try API first
                    const proxyUrl = await proxyConf?.newUrl();
                    const apiData = await tryApiExtraction(request.url, proxyUrl);
                    
                    if (apiData) {
                        crawlerLog.info('Successfully extracted data from API');
                        // Process API data if available
                        // TODO: Implement API data processing based on actual API structure
                    }
                    
                    // Extract property links
                    const propertyLinks = extractPropertyLinks($);
                    crawlerLog.info(`Found ${propertyLinks.length} property links on page ${pageNo}`);

                    if (propertyLinks.length === 0) {
                        crawlerLog.warning('No property links found - page structure may have changed');
                    }

                    if (collectDetails) {
                        // Enqueue property detail pages
                        const remaining = RESULTS_WANTED - savedCount;
                        const linksToEnqueue = propertyLinks
                            .filter(link => !seenUrls.has(link))
                            .slice(0, Math.max(0, remaining));

                        linksToEnqueue.forEach(link => seenUrls.add(link));

                        if (linksToEnqueue.length > 0) {
                            await enqueueLinks({
                                urls: linksToEnqueue,
                                userData: { label: 'DETAIL' },
                            });
                            crawlerLog.info(`Enqueued ${linksToEnqueue.length} detail pages`);
                        }
                    } else {
                        // Extract basic info from listing cards
                        const properties = [];
                        
                        $('article, [class*="card"], [data-testid*="card"]').each((_, card) => {
                            if (savedCount >= RESULTS_WANTED) return false;
                            
                            const $card = $(card);
                            const propUrl = $card.find('a').first().attr('href');
                            
                            if (propUrl) {
                                const absUrl = toAbsoluteUrl(propUrl);
                                if (absUrl && !seenUrls.has(absUrl)) {
                                    seenUrls.add(absUrl);
                                    const propInfo = extractPropertyFromCard($card);
                                    if (propInfo.title || propInfo.price) {
                                        properties.push(propInfo);
                                        savedCount++;
                                    }
                                }
                            }
                        });

                        if (properties.length > 0) {
                            await Dataset.pushData(properties);
                            crawlerLog.info(`Saved ${properties.length} properties from listing page`);
                        } else {
                            crawlerLog.warning('No properties extracted from listing page');
                        }
                    }

                    // Handle pagination
                    if (savedCount < RESULTS_WANTED && pageNo < MAX_PAGES) {
                        const nextPageUrl = buildSearchUrl(pageNo + 1);
                        await enqueueLinks({
                            urls: [nextPageUrl],
                            userData: { label: 'LIST', pageNo: pageNo + 1 },
                        });
                        crawlerLog.info(`Enqueued next page: ${pageNo + 1}`);
                    } else {
                        crawlerLog.info('Pagination complete', {
                            reason: savedCount >= RESULTS_WANTED ? 'Results limit reached' : 'Max pages reached',
                            savedCount,
                            pageNo,
                        });
                    }
                }

                // Handle property detail pages
                if (label === 'DETAIL') {
                    if (savedCount >= RESULTS_WANTED) {
                        crawlerLog.debug('Skipping detail page - results limit reached');
                        return;
                    }

                    crawlerLog.info(`Processing property detail: ${request.url}`);

                    try {
                        const propertyData = extractPropertyDetails($, request.url);
                        
                        if (propertyData && (propertyData.title || propertyData.price)) {
                            await Dataset.pushData(propertyData);
                            savedCount++;
                            crawlerLog.info(`Saved property (${savedCount}/${RESULTS_WANTED}): ${propertyData.title || 'Untitled'}`);
                        } else {
                            crawlerLog.warning('No property data extracted from detail page');
                        }
                    } catch (err) {
                        crawlerLog.error(`Failed to extract property details: ${err.message}`);
                    }
                }
            },

            async failedRequestHandler({ request }, error) {
                log.error(`Request ${request.url} failed after ${request.retryCount} retries`, { 
                    error: error.message,
                    url: request.url,
                });
            },
        });

        // Start crawling
        const initialUrl = buildSearchUrl(1);
        log.info(`Starting from: ${initialUrl}`);
        
        await crawler.run([{
            url: initialUrl,
            userData: { label: 'LIST', pageNo: 1 },
        }]);

        log.info(`Scraping complete. Total properties saved: ${savedCount}`);

        if (savedCount === 0) {
            log.warning('No properties were saved. This might indicate:');
            log.warning('1. Website structure has changed');
            log.warning('2. Anti-bot protection is blocking requests');
            log.warning('3. Search parameters returned no results');
            log.warning('4. Proxy configuration issues');
        }

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

