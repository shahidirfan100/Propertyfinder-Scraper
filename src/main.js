// PropertyFinder.ae scraper - Playwright for listings, HTTP+Cheerio for detail pages
import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { chromium } from 'playwright';
import { load } from 'cheerio';
import { gotScraping } from 'got-scraping';

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

const buildSearchUrl = ({ startUrl, location, propertyType, categoryType, page = 1 }) => {
    if (startUrl) {
        const url = new URL(startUrl);
        url.searchParams.set('page', String(page));
        return url.href;
    }

    if (!location) throw new Error('Provide either "startUrl" or "location".');

    const categorySlug = categoryType === 2 ? 'rent' : 'buy';
    const actionSlug = categorySlug === 'buy' ? 'for-sale' : 'for-rent';
    const normalize = (value) =>
        value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

    const locSlug = normalize(location);
    const typeSlug = normalize(propertyType || 'property');
    const base = `https://www.propertyfinder.ae/en/${categorySlug}/${typeSlug}-${actionSlug}-${locSlug}.html`;
    const url = new URL(base);
    url.searchParams.set('page', String(page));
    return url.href;
};

const extractListingCards = ($) => {
    const cards = [];
    const selectors =
        'article, [data-testid*="card"], [data-testid*="result"], [class*="ResultCard"], [class*="card"]';

    $(selectors)
        .toArray()
        .forEach((el) => {
            try {
                const card = $(el);
                const link = card.find('a[href*="/en/"]').first().attr('href') || card.attr('href');
                const url = toAbsoluteUrl(link);
                if (!url) return;

                const title =
                    cleanText(
                        card
                            .find('h2, h3, [class*="title"], [data-testid*="title"]')
                            .first()
                            .text(),
                    ) || 'Property';

                const priceText =
                    cleanText(card.find('[data-testid*="price"], [class*="price"]').first().text()) || '';
                const { price, currency } = parsePrice(priceText);

                const location =
                    cleanText(
                        card
                            .find('[data-testid*="location"], [class*="location"], [class*="address"]')
                            .first()
                            .text(),
                    ) || null;

                const bedrooms = numberFromText(
                    card.find('[data-testid*="bed"], [class*="bed"]').first().text(),
                );
                const bathrooms = numberFromText(
                    card.find('[data-testid*="bath"], [class*="bath"]').first().text(),
                );

                const areaText = cleanText(
                    card.find('[data-testid*="area"], [class*="area"], [class*="sqft"], [class*="meter"]').first()
                        .text(),
                );
                const area = numberFromText(areaText);
                const areaUnit =
                    (areaText && (areaText.match(/sq ?ft|ft2/i)?.[0] || areaText.match(/m2|sqm|sq ?m/i)?.[0])) ||
                    null;

                const agentName = cleanText(
                    card.find('[data-testid*="agent"], [class*="agent"]').first().text(),
                );

                cards.push({
                    title,
                    price,
                    currency,
                    location,
                    bedrooms,
                    bathrooms,
                    area,
                    areaUnit,
                    agentName,
                    url,
                });
            } catch (err) {
                log.debug('Failed to extract card', { error: err.message });
            }
        });

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

const fetchDetailWithCheerio = async (url, proxyInfo) => {
    const options = {
        url,
        headers: {
            'user-agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
            'accept-language': 'en-US,en;q=0.9',
        },
        timeout: 30000,
    };
    if (proxyInfo?.url) {
        options.proxyUrl = proxyInfo.url;
    }
    const response = await gotScraping(options);
    const $ = load(response.body);
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
    let proxyInfo;
    try {
        proxyConfig = await Actor.createProxyConfiguration(proxyConfiguration || {});
        proxyInfo = await proxyConfig.newProxyInfo();
    } catch (err) {
        log.warning('Proxy configuration invalid; proceeding without proxy', { error: err.message });
    }

    log.info('Starting PropertyFinder scraper (Playwright listings + HTTP detail)', {
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

    const crawler = new PlaywrightCrawler({
        proxyConfiguration: proxyConfig,
        headless: true,
        maxConcurrency: 3,
        maxRequestRetries: 2,
        navigationTimeoutSecs: 35,
        requestHandlerTimeoutSecs: 90,
        launchContext: {
            launcher: chromium,
            launchOptions: {
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-features=IsolateOrigins,site-per-process',
                ],
            },
        },
        preNavigationHooks: [
            async ({ page, request }) => {
                await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,css,font,woff,woff2}', (route) => route.abort());
                await page.context().setExtraHTTPHeaders({
                    'accept-language': 'en-US,en;q=0.9',
                    'user-agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
                });
                log.info('Navigating', { url: request.url });
            },
        ],
        async requestHandler({ page, request, crawler }) {
            const pageNo = request.userData.pageNo || 1;
            await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2500);

            const html = await page.content();
            const $ = load(html);
            const cards = extractListingCards($);

            if (!cards.length) {
                log.warning('No cards found even with JS', { url: request.url, pageNo });
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
                    const detailData = await fetchDetailWithCheerio(card.url, proxyInfo);
                    const record = { ...baseRecord, ...detailData };
                    await Actor.pushData(record);
                    totalSaved++;
                } catch (err) {
                    log.warning('Detail fetch failed', { url: card.url, error: err.message });
                }

                if (totalSaved >= RESULTS_WANTED) {
                    log.info('Reached desired results', { totalSaved });
                    await crawler.autoscaledPool?.abort();
                    return;
                }
            }

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
                    log.info('Enqueued next page', { nextPage });
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
