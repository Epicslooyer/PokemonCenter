const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

const urlsToMonitor = [
    'https://www.pokemoncenter.com/en-ca/category/elite-trainer-box',
    'https://www.pokemoncenter.com/en-ca/category/booster-packs'
];
const queueResourceUrl = 'https://www.pokemoncenter.com/_Incapsula_Resource?SWWRGTS=868';


let productStates = {};

function getHeaders() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/112.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ];

    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.google.com/', 
        'DNT': '1', 
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site', 
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
    };
}

async function checkPokemonCenter() {
    let notifications = [];
    let allProductsThisScan = []; 
    let fetchErrors = []; 
    let overallSiteInQueue = false;
    let queueMessages = [];
    let queuePositionInfo = null;


    const processingPromises = urlsToMonitor.map(async (categoryUrl) => {
        try {
            console.log(`Fetching ${categoryUrl}`);
            const response = await axios.get(categoryUrl, {
                headers: getHeaders(), 
                timeout: 20000 
            });
            const htmlContent = response.data;
            const finalUrl = response.request.res.responseUrl || (response.request.protocol + '//' + response.request.host + response.request.path);

            const $ = cheerio.load(htmlContent);

            const isLikelyQueuePage = finalUrl.includes('_Incapsula_') ||
                                     ($('div.category-products-grid--i8w9U').length === 0 && 
                                      (htmlContent.toLowerCase().includes('queue') || htmlContent.toLowerCase().includes('wait')));

            if (isLikelyQueuePage) {
                overallSiteInQueue = true;
                queueMessages.push(`Page ${categoryUrl} (final: ${finalUrl}) appears to be in a queue.`);
                
                try {
                    console.log(`Fetching queue resource: ${queueResourceUrl}`);
                    const { data: queueHtml } = await axios.get(queueResourceUrl, { 
                        headers: getHeaders(), // Use dynamic headers for queue check too
                        timeout: 15000 
                    });
                    const queue$ = cheerio.load(queueHtml);
                    const queueText = queue$('body').text(); 
                    
                    const positionMatch = queueText.match(/your number in line.*?(\d+)/i) ||
                                          queueText.match(/queue position.*?(\d+)/i) ||
                                          queueText.match(/estimated wait time.*?(\d+\s*(minutes?|seconds?))/i) ||
                                          queueText.match(/you are in.*?queue.*?(\d+)/i); 
                                          
                    if (positionMatch && positionMatch[1]) {
                        const currentPos = positionMatch[1].trim();
                        queuePositionInfo = queuePositionInfo ? `${queuePositionInfo}; ${currentPos}` : currentPos;
                    } else {
                        queueMessages.push(`Could not determine specific queue position from ${queueResourceUrl}. Check its content manually if queue is active.`);
                    }
                } catch (queueError) {
                    console.error(`Error fetching/parsing queue resource ${queueResourceUrl}:`, queueError.message);
                    queueMessages.push(`Error fetching queue resource: ${queueError.message}`);
                }
                return; 
            }

            $('div.product--feNDW').each((index, element) => {
                const productScript = $(element).find('script[type="application/ld+json"]');
                if (productScript.length > 0) {
                    try {
                        const productData = JSON.parse(productScript.html());
                        const mpn = productData.mpn;
                        const name = productData.name;
                        const productPageUrl = productData.url;
                        const currentInStock = productData.offers && productData.offers.availability === "http://schema.org/InStock";

                        if (!mpn) {
                            console.warn("Product found without MPN:", name, "on page", categoryUrl);
                            return; 
                        }

                        allProductsThisScan.push({
                            name,
                            mpn,
                            inStock: currentInStock,
                            url: productPageUrl,
                            sourcePage: categoryUrl
                        });

                        const previousState = productStates[mpn];
                        if (previousState !== undefined) {
                            if (!previousState.inStock && currentInStock) {
                                notifications.push({
                                    name: name,
                                    status: 'NOW IN STOCK',
                                    url: productPageUrl,
                                    mpn: mpn,
                                    sourcePage: categoryUrl
                                });
                            }
                        }
                        productStates[mpn] = { name, inStock: currentInStock, url: productPageUrl, lastSeenOn: categoryUrl };
                    } catch (parseError) {
                        console.error('Error parsing product JSON:', parseError.message, "on page", categoryUrl);
                    }
                }
            });

        } catch (error) {
            console.error(`Error processing ${categoryUrl}:`, error.message);
            if (error.response && error.response.status === 403) {
                fetchErrors.push(`Access to ${categoryUrl} was forbidden (403). The server is likely blocking automated requests. This may be due to JavaScript challenges or IP-based blocking, which require more advanced scraping techniques (e.g., using a headless browser like Puppeteer, or proxy rotation).`);
            } else if (error.response && error.response.status === 503) { 
                overallSiteInQueue = true;
                queueMessages.push(`Page ${categoryUrl} returned 503 Service Unavailable, likely in queue.`);
            } else {
                fetchErrors.push(`Failed to fetch or process ${categoryUrl}: ${error.message}`);
            }
        }
    });

    await Promise.all(processingPromises);

    let finalMessage = '';
    if (notifications.length === 0 && allProductsThisScan.length === 0 && fetchErrors.length === 0 && queueMessages.length === 0) {
        finalMessage = 'No products found or stock changes detected.';
    } else if (notifications.length > 0) {
        finalMessage = 'Stock changes detected.';
    } else if (allProductsThisScan.length > 0) {
        finalMessage = 'Products scanned, no new stock changes.';
    } else if (fetchErrors.some(err => err.includes("(403)"))) {
        finalMessage = 'Scan completed with 403 errors. The site is blocking requests. See fetchErrors for details. Advanced scraping techniques may be needed.';
    } else if (fetchErrors.length > 0) {
        finalMessage = 'Scan completed with errors. See fetchErrors for details.';
    } else if (queueMessages.length > 0 && !overallSiteInQueue) { 
        finalMessage = 'Scan complete, some queue messages encountered.';
    } else {
        finalMessage = 'Scan complete.';
    }


    if (overallSiteInQueue) {
        return { 
            inQueue: true, 
            queuePosition: queuePositionInfo || "Not specifically determined", 
            messages: queueMessages,
            fetchErrors, 
            summaryMessage: `Site appears to be in a queue. ${queuePositionInfo ? `Position: ${queuePositionInfo}.` : ''} See messages for details.`
        };
    }

    return {
        notifications,
        allProductsFoundThisScan: allProductsThisScan,
        productStatesSnapshot: { ...productStates },
        fetchErrors,
        message: finalMessage
    };
}

app.get('/check-stock', async (req, res) => {
    try {
        const result = await checkPokemonCenter();
        res.json(result);
    } catch (error) {
        console.error("Error in /check-stock endpoint:", error);
        res.status(500).json({ error: 'Failed to check stock.', details: error.message });
    }
});

app.get('/current-states', (req, res) => {
    res.json(productStates);
});

app.listen(PORT, () => {
    console.log(`Pokemon Center stock checker running on http://localhost:${PORT}`);
    console.log(`Access /check-stock to trigger a check.`);
    console.log(`Access /current-states to view all known product states.`);
});
