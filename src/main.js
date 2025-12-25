// PropertyFinder.ae scraper - Fast HTTP + JSON extraction with Cheerio fallback
import { Actor, log } from 'apify';
import { CheerioCrawler } from 'crawlee';
import { load } from 'cheerio';

const cleanText = (text) => {
    if (!text) return null;
    const cleaned = String(text).replace(/\s+/g, ' ').trim();
    return cleaned.length ? cleaned : null;
};

const toAbsoluteUrl = (href) => {
    if (!href) return null;
    try {
        if (href.startsWith('http')) return href;
        return new URL(href, 'https://www.propertyfinder.ae').href;
    } catch {
        return null;
    }
};

const numberFromText = (text) => {
    if (!text) return null;
    const match = String(text).replace(/,/g, '').match(/[\d.]+/);
    return match ? Number(match[0]) : null;
};

const parsePrice = (text) => {
    const price = numberFromText(text);
    const currencyMatch = (text || '').match(/AED|DHS|DH/i);
    const currency = currencyMatch ? currencyMatch[0].toUpperCase() : 'AED';
    return { price, currency };
};

// NEW: Updated URL builder with correct structure
const buildSearchUrl = ({ startUrl, location, propertyType, categoryType, page = 1 }) => {
    if (startUrl) {
        const url = new URL(startUrl);
        url.searchParams.set('page', String(page));
        return url.href;
    }

    if (!location) throw new Error('Provide either "startUrl" or "location".');

    const action = categoryType === 2 ? 'rent' : 'sale';
    const actionPath = categoryType === 2 ? 'rent' : 'buy';

    const normalize = (value) =>
        value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

    const locSlug = normalize(location);
    const typeSlug = normalize(propertyType || 'property');

    // New pattern: /en/{buy|rent}/{location}/{type}s-for-{sale|rent}.html
    const base = `https://www.propertyfinder.ae/en/${actionPath}/${locSlug}/${typeSlug}s-for-${action}.html`;
    const url = new URL(base);
    url.searchParams.set('page', String(page));
    return url.href;
};

// NEW: Extract __NEXT_DATA__ from script tag (Priority 1)
const extractNextData = (html) => {
    try {
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
        if (!match) return null;

        const data = JSON.parse(match[1]);
        const properties = data?.props?.pageProps?.searchResult?.properties;

        if (!Array.isArray(properties) || !properties.length) return null;

        log.info('Extracted properties from __NEXT_DATA__', { count: properties.length });

        return properties.map(prop => {
            const priceValue = prop.price || prop.price_value;
            return {
                title: prop.name || prop.title,
                price: typeof priceValue === 'number' ? priceValue : numberFromText(priceValue),
                currency: prop.currency || 'AED',
                location: prop.location?.name || prop.location_name || prop.location,
                bedrooms: prop.bedrooms || prop.bedroom,
                bathrooms: prop.bathrooms || prop.bathroom,
                area: prop.area || prop.size,
                areaUnit: prop.area_unit || 'sqft',
                agentName: prop.broker?.name || prop.agent?.name || prop.contact_name,
                url: toAbsoluteUrl(prop.slug || prop.url || prop.property_url),
                propertyType: prop.category?.name || prop.property_type,
                verified: prop.verified || false,
                featured: prop.featured || false,
            };
        }).filter(p => p.url); // Only keep properties with valid URLs
    } catch (err) {
        log.debug('__NEXT_DATA__ extraction failed', { error: err.message });
        return null;
    }
};

// UPDATED: Improved HTML parsing with data-testid selectors
const extractListingCards = ($) => {
    const cards = [];

    // Priority 1: Use data-testid selectors
    $('article[data-testid="property-card"]').each((_, el) => {
        try {
            const card = $(el);

            const link = card.find('a[data-testid="property-card-link"]').attr('href');
            const url = toAbsoluteUrl(link);
            if (!url) return;

            const title = cleanText(card.find('h3').text()) || 'Property';
            const priceText = cleanText(card.find('[data-testid="property-card-price"]').text());
            const { price, currency } = parsePrice(priceText);

            const location = cleanText(card.find('[data-testid="property-card-location"]').text());
            const bedrooms = numberFromText(card.find('[data-testid="property-card-spec-bedroom"]').text());
            const bathrooms = numberFromText(card.find('[data-testid="property-card-spec-bathroom"]').text());
            const areaText = cleanText(card.find('[data-testid="property-card-spec-area"]').text());
            const area = numberFromText(areaText);
            const areaUnit = areaText?.match(/sq ?ft|ft2/i)?.[0] || areaText?.match(/m2|sqm/i)?.[0] || null;

            cards.push({
                title, price, currency, location,
                bedrooms, bathrooms, area, areaUnit, url
            });
        } catch (err) {
            log.debug('Failed to extract card', { error: err.message });
        }
    });

    // Fallback: Try generic selectors if no data-testid cards found
    if (!cards.length) {
        $('article, [class*="ResultCard"], [class*="card"]').each((_, el) => {
            try {
                const card = $(el);
                const link = card.find('a[href*="/en/"]').first().attr('href');
                const url = toAbsoluteUrl(link);
                if (!url) return;

                const title = cleanText(card.find('h2, h3, [class*="title"]').first().text()) || 'Property';
                const priceText = cleanText(card.find('[class*="price"]').first().text()) || '';
                const { price, currency } = parsePrice(priceText);
                const location = cleanText(card.find('[class*="location"], [class*="address"]').first().text());
                const bedrooms = numberFromText(card.find('[class*="bed"]').first().text());
                const bathrooms = numberFromText(card.find('[class*="bath"]').first().text());
                const areaText = cleanText(card.find('[class*="area"], [class*="sqft"]').first().text());
                const area = numberFromText(areaText);
                const areaUnit = areaText?.match(/sq ?ft|ft2/i)?.[0] || areaText?.match(/m2|sqm/i)?.[0] || null;

                cards.push({
                    title, price, currency, location,
                    bedrooms, bathrooms, area, areaUnit, url
                });
            } catch (err) {
                log.debug('Failed to extract fallback card', { error: err.message });
            }
        });
    }

    return cards;
};

const extractJsonLd = ($) => {
    try {
        const scripts = $('script[type="application/ld+json"]').toArray().slice(0, 5);
        for (const script of scripts) {
            const content = $(script).contents().text();
            if (!content) continue;
            try {
                const parsed = JSON.parse(content);
                const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
                if (!candidate || typeof candidate !== 'object') continue;
                if (candidate['@type'] && /RealEstateListing|Offer/i.test(candidate['@type'])) {
                    const offers = Array.isArray(candidate.offers) ? candidate.offers[0] : candidate.offers;
                    const areaValue = candidate.floorSize?.value ?? candidate.floorSize;
                    return {
                        title: candidate.name || candidate.headline,
                        description: candidate.description,
                        location: candidate.address?.streetAddress || candidate.address?.addressLocality,
                        city: candidate.address?.addressRegion,
                        price: offers?.price ? Number(offers.price) : null,
                        currency: offers?.priceCurrency || 'AED',
                        bedrooms: candidate.numberOfRooms || candidate.numberOfBedrooms,
                        bathrooms: candidate.numberOfBathroomsTotal || candidate.numberOfBathrooms,
                        area: typeof areaValue === 'number' ? areaValue : numberFromText(areaValue),
                        areaUnit: candidate.floorSize?.unitText,
                        url: candidate.url,
                        postedDate: candidate.datePosted || candidate.datePublished,
                        agentName: candidate.seller?.name || candidate.agent?.name,
                    };
                }
            } catch {
                continue;
            }
        }
    } catch (err) {
        log.debug('JSON-LD extraction failed', { error: err.message });
    }
    return null;
};

const extractDetailFromHtml = ($, url) => {
    const title =
        cleanText($('h1, [data-testid*="title"]').first().text()) ||
        cleanText($('[class*="title"]').first().text());

    const priceText =
        cleanText(
            $('[data-testid*="price"], [class*="price"]').first().text() ||
            $('meta[itemprop="price"]').attr('content'),
        ) || '';
    const { price, currency } = parsePrice(priceText);

    const location =
        cleanText(
            $('[data-testid*="location"], [class*="location"], [class*="address"]').first().text() ||
            $('meta[itemprop="address"]').attr('content'),
        ) || null;

    const bedrooms = numberFromText(
        $('[data-testid*="bed"], [class*="bed"], [itemprop="numberOfRooms"]').first().text(),
    );
    const bathrooms = numberFromText(
        $('[data-testid*="bath"], [class*="bath"], [itemprop="numberOfBathroomsTotal"]').first().text(),
    );

    const areaText =
        cleanText(
            $('[data-testid*="area"], [class*="area"], [class*="sqft"], [class*="meter"]').first().text() ||
            $('[itemprop="floorSize"]').text(),
        ) || '';
    const area = numberFromText(areaText);
    const areaUnit =
        (areaText && (areaText.match(/sq ?ft|ft2/i)?.[0] || areaText.match(/m2|sqm|sq ?m/i)?.[0])) || null;

    const agentName = cleanText(
        $('[data-testid*="agent"], [class*="agent"], [itemprop="seller"]').first().text(),
    );

    const postedDate =
        cleanText(
            $('[data-testid*="posted"], [class*="posted"], [class*="date"]').first().text() ||
            $('meta[itemprop="datePosted"]').attr('content'),
        ) || null;

    const description =
        cleanText(
            $('[data-testid*="description"], [class*="description"]').text() ||
            $('meta[name="description"]').attr('content'),
        ) || null;

    return {
        title,
        price,
        currency,
        location,
        bedrooms,
        bathrooms,
        area,
        areaUnit,
        agentName,
        postedDate,
        description,
        url,
    };
};

const fetchDetailWithCheerio = async (url, proxyUrl) => {
    const $ = load(await Actor.sendRequest({
        url,
        proxyUrl,
        headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
            'accept-language': 'en-US,en;q=0.9',
        },
    }).then(r => r.body));

    const jsonLd = extractJsonLd($) || {};
    const htmlData = extractDetailFromHtml($, url);
    return { ...htmlData, ...jsonLd, url };
};

await Actor.init();

async function main() {
    const input = (await Actor.getInput()) || {};
    const {
        startUrl,
        propertyType = 'apartment',
        location,
        categoryType = 1,
        results_wanted: resultsWantedRaw = 100,
        max_pages: maxPagesRaw = 20,
        collectDetails = true,
        proxyConfiguration,
    } = input;

    if (categoryType !== 1 && categoryType !== 2) {
        throw new Error('categoryType must be 1 (sale) or 2 (rent).');
    }
    if (!startUrl && !location) {
        throw new Error('Provide either "startUrl" or "location".');
    }

    const RESULTS_WANTED = Number.isFinite(+resultsWantedRaw)
        ? Math.max(1, +resultsWantedRaw)
        : Number.MAX_SAFE_INTEGER;
    const MAX_PAGES = Number.isFinite(+maxPagesRaw) ? Math.max(1, +maxPagesRaw) : 20;

    let proxyConfig;
    let proxyUrl;
    try {
        proxyConfig = await Actor.createProxyConfiguration(proxyConfiguration || {});
        const proxyInfo = await proxyConfig.newProxyInfo();
        proxyUrl = proxyInfo?.url;
    } catch (err) {
        log.warning('Proxy configuration invalid; proceeding without proxy', { error: err.message });
    }

    log.info('Starting PropertyFinder scraper (HTTP + JSON extraction)', {
        categoryType,
        propertyType,
        location,
        resultsWanted: RESULTS_WANTED,
        maxPages: MAX_PAGES,
        collectDetails,
    });

    const seenUrls = new Set();
    const enqueuedPages = new Set();
    let totalSaved = 0;

    const crawler = new CheerioCrawler({
        proxyConfiguration: proxyConfig,
        maxConcurrency: 5,
        maxRequestRetries: 3,
        requestHandlerTimeoutSecs: 90,

        async requestHandler({ $, request, body }) {
            const pageNo = request.userData.pageNo || 1;
            const html = body.toString();

            // Priority 1: Try __NEXT_DATA__ extraction
            let cards = extractNextData(html);

            // Priority 2: Fallback to HTML parsing
            if (!cards || !cards.length) {
                cards = extractListingCards($);
                if (cards.length) {
                    log.info('Extracted cards from HTML', { count: cards.length, pageNo });
                }
            }

            if (!cards || !cards.length) {
                log.warning('No cards found on page', { url: request.url, pageNo });
                return;
            }

            for (const card of cards) {
                if (!card.url || seenUrls.has(card.url)) continue;
                seenUrls.add(card.url);

                const baseRecord = {
                    ...card,
                    propertyType: card.propertyType || propertyType,
                    url: card.url,
                };

                if (!collectDetails) {
                    await Actor.pushData(baseRecord);
                    totalSaved++;
                    if (totalSaved >= RESULTS_WANTED) {
                        log.info('Reached desired results from listings only', { totalSaved });
                        await crawler.autoscaledPool?.abort();
                        return;
                    }
                    continue;
                }

                try {
                    const detailData = await fetchDetailWithCheerio(card.url, proxyUrl);
                    const record = { ...baseRecord, ...detailData };
                    await Actor.pushData(record);
                    totalSaved++;
                    log.info('Saved property', { url: card.url, totalSaved });
                } catch (err) {
                    log.warning('Detail fetch failed, saving listing data only', { url: card.url, error: err.message });
                    await Actor.pushData(baseRecord);
                    totalSaved++;
                }

                if (totalSaved >= RESULTS_WANTED) {
                    log.info('Reached desired results', { totalSaved });
                    await crawler.autoscaledPool?.abort();
                    return;
                }
            }

            // Pagination
            if (pageNo < MAX_PAGES && totalSaved < RESULTS_WANTED) {
                const nextPage = pageNo + 1;
                const nextUrl = buildSearchUrl({
                    startUrl,
                    location,
                    propertyType,
                    categoryType,
                    page: nextPage,
                });
                if (!enqueuedPages.has(nextUrl)) {
                    enqueuedPages.add(nextUrl);
                    await crawler.addRequests([{ url: nextUrl, userData: { pageNo: nextPage } }]);
                    log.info('Enqueued next page', { nextPage, url: nextUrl });
                }
            }
        },
    });

    const initialUrl = buildSearchUrl({
        startUrl,
        location,
        propertyType,
        categoryType,
        page: 1,
    });
    enqueuedPages.add(initialUrl);

    log.info('Starting with URL', { url: initialUrl });

    await crawler.run([
        {
            url: initialUrl,
            userData: { pageNo: 1 },
        },
    ]);

    log.info('Scraping completed', { totalSaved });
}

main()
    .catch((err) => {
        log.exception(err, 'Fatal error');
        process.exit(1);
    })
    .finally(async () => {
        await Actor.exit();
    });
