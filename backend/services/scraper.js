import { chromium } from 'playwright';

/**
 * Deep scraper using Playwright.
 * Captures: page structure, HTTP headers, cookies, forms, API calls, JS sinks, scripts.
 */
export async function scrapeWebsite(url) {
    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            ignoreHTTPSErrors: true,
        });

        const page = await context.newPage();

        // Intercept all network requests to enumerate API endpoints
        const apiCalls = [];
        const externalScripts = [];
        let responseHeaders = {};

        page.on('response', async (response) => {
            const reqUrl = response.url();
            const reqMethod = response.request().method();
            const status = response.status();

            // Capture main page response headers (first full HTML response)
            if (reqUrl === url || reqUrl === url + '/' || reqUrl.startsWith(url.replace(/\/$/, ''))) {
                try {
                    const hdrs = response.headers();
                    if (hdrs['content-type'] && hdrs['content-type'].includes('text/html')) {
                        responseHeaders = hdrs;
                    }
                } catch (e) { /* ignore */ }
            }

            // Capture API/XHR calls
            const resourceType = response.request().resourceType();
            if (['xhr', 'fetch'].includes(resourceType)) {
                apiCalls.push({
                    url: reqUrl,
                    method: reqMethod,
                    status,
                    contentType: response.headers()['content-type'] || '',
                });
            }

            // Capture external JS sources
            if (resourceType === 'script' && !reqUrl.startsWith(url.replace(/https?:\/\/[^/]+/, ''))) {
                externalScripts.push(reqUrl);
            }
        });

        let navigationError = null;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            // Give JS-heavy pages time to hydrate
            await page.waitForTimeout(3000);
        } catch (navErr) {
            navigationError = navErr.message;
            console.warn(`Navigation warning for ${url}: ${navErr.message}`);
        }

        // ── Page basics ──────────────────────────────────────────────────────
        const pageTitle = await page.title().catch(() => '');
        const finalUrl = page.url();

        // ── DOM deep extraction ───────────────────────────────────────────────
        const domData = await page.evaluate(() => {
            const getTags = (sel, attr) =>
                Array.from(document.querySelectorAll(sel)).map(el =>
                    attr ? el.getAttribute(attr) : (el.innerText || el.textContent || '').trim().substring(0, 80)
                ).filter(Boolean);

            // Forms: action, method, inputs
            const forms = Array.from(document.querySelectorAll('form')).map(f => ({
                action: f.action || '',
                method: f.method || 'GET',
                inputs: Array.from(f.querySelectorAll('input, select, textarea')).map(i => ({
                    name: i.name || i.id || '',
                    type: i.type || 'text',
                    required: i.required,
                    autocomplete: i.autocomplete || '',
                })),
            }));

            // Meta tags
            const metas = {};
            document.querySelectorAll('meta').forEach(m => {
                const name = m.name || m.httpEquiv || m.getAttribute('property') || '';
                if (name) metas[name] = m.content || '';
            });

            // Inline scripts (first 300 chars each, up to 10)
            const inlineScripts = Array.from(document.querySelectorAll('script:not([src])')).slice(0, 10)
                .map(s => s.textContent.trim().substring(0, 300));

            // JS sinks scan
            const fullScriptText = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent).join('\n');
            const xssSinks = [];
            const sinkPatterns = [
                { pattern: /innerHTML\s*=/, sink: 'innerHTML assignment' },
                { pattern: /document\.write\s*\(/, sink: 'document.write()' },
                { pattern: /eval\s*\(/, sink: 'eval()' },
                { pattern: /setTimeout\s*\(\s*['"`]/, sink: 'setTimeout(string)' },
                { pattern: /setInterval\s*\(\s*['"`]/, sink: 'setInterval(string)' },
                { pattern: /location\.href\s*=/, sink: 'location.href redirect' },
                { pattern: /dangerouslySetInnerHTML/, sink: 'React dangerouslySetInnerHTML' },
                { pattern: /postMessage\s*\(/, sink: 'postMessage' },
            ];
            sinkPatterns.forEach(({ pattern, sink }) => {
                if (pattern.test(fullScriptText)) xssSinks.push(sink);
            });

            // Check for exposed secrets in scripts
            const secretPatterns = [
                { pattern: /api[_-]?key\s*[:=]\s*['"`]([^'"`]+)['"`]/i, label: 'API Key' },
                { pattern: /token\s*[:=]\s*['"`]([^'"`]{16,})['"`]/i, label: 'Token' },
                { pattern: /secret\s*[:=]\s*['"`]([^'"`]+)['"`]/i, label: 'Secret' },
                { pattern: /password\s*[:=]\s*['"`]([^'"`]+)['"`]/i, label: 'Password' },
                { pattern: /aws_access_key/i, label: 'AWS Key' },
            ];
            const exposedSecrets = [];
            secretPatterns.forEach(({ pattern, label }) => {
                const match = fullScriptText.match(pattern);
                if (match) exposedSecrets.push({ label, preview: match[0].substring(0, 60) });
            });

            return {
                h1: getTags('h1'),
                h2: getTags('h2'),
                h3: getTags('h3'),
                buttons: getTags('button'),
                inputs: Array.from(document.querySelectorAll('input')).map(i => ({
                    name: i.name || '', type: i.type || 'text', id: i.id || '', placeholder: i.placeholder || ''
                })),
                linksCount: document.querySelectorAll('a[href]').length,
                externalLinks: Array.from(document.querySelectorAll('a[href^="http"]')).slice(0, 20).map(a => a.href),
                imagesWithoutAlt: document.querySelectorAll('img:not([alt]), img[alt=""]').length,
                forms,
                metas,
                inlineScripts,
                xssSinks,
                exposedSecrets,
                totalScripts: document.querySelectorAll('script').length,
                iframes: Array.from(document.querySelectorAll('iframe')).map(f => f.src || ''),
                metaViewport: document.querySelector('meta[name="viewport"]')?.content || '',
                hasRobotsMeta: !!document.querySelector('meta[name="robots"]'),
                cookieCount: document.cookie.split(';').filter(c => c.trim()).length,
            };
        });

        // ── Cookies ───────────────────────────────────────────────────────────
        const cookies = await context.cookies();

        // ── Inline scripts for token sniffing ─────────────────────────────────
        // (Already captured in domData)

        // ── Truncated HTML ─────────────────────────────────────────────────────
        const partialHtml = await page.evaluate(() =>
            document.body.innerHTML
                .replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '')
                .replace(/<style[^>]*>([\S\s]*?)<\/style>/gmi, '')
                .replace(/<svg[^>]*>([\S\s]*?)<\/svg>/gmi, '')
                .substring(0, 10000)
        );

        return {
            title: pageTitle,
            finalUrl,
            navigationError,
            structure: domData,
            html: partialHtml,
            responseHeaders,
            cookies: cookies.map(c => ({
                name: c.name,
                domain: c.domain,
                secure: c.secure,
                httpOnly: c.httpOnly,
                sameSite: c.sameSite,
                expires: c.expires,
                path: c.path,
            })),
            apiCalls: apiCalls.slice(0, 30),
            externalScripts: externalScripts.slice(0, 20),
        };
    } catch (error) {
        console.error('Scraping error:', error);
        throw new Error(`Failed to scrape ${url}: ${error.message}`);
    } finally {
        if (browser) await browser.close();
    }
}
