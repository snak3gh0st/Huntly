import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CrawlResult } from '../../src/services/crawler.service.js';

/* ------------------------------------------------------------------ */
/*  Global fetch mock                                                  */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn<(...args: unknown[]) => Promise<Response>>();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function htmlResponse(body: string, contentType = 'text/html'): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

function htmlPage(bodyContent: string, head = ''): string {
  return `<!DOCTYPE html><html><head>${head}</head><body>${bodyContent}</body></html>`;
}

/**
 * Configure mockFetch to return different HTML for different URLs.
 * Accepts a map of URL-prefix → HTML string.
 * Any URL not in the map returns a 404.
 */
function setupMultiPageFetch(pages: Record<string, string>): void {
  mockFetch.mockImplementation(async (url: unknown) => {
    const urlStr = String(url);
    for (const [prefix, html] of Object.entries(pages)) {
      if (urlStr.includes(prefix)) return htmlResponse(html);
    }
    return new Response('Not Found', { status: 404 });
  });
}

/* ------------------------------------------------------------------ */
/*  Import the module under test (after mocks)                         */
/* ------------------------------------------------------------------ */

// We import dynamically so the module picks up the stubbed global fetch.
// Since the module doesn't cache fetch at import time we can also just
// import statically — the stub is in place before each test runs.
import { crawlWebsite } from '../../src/services/crawler.service.js';

/* ------------------------------------------------------------------ */
/*  Tests: Email extraction                                            */
/* ------------------------------------------------------------------ */

describe('crawlWebsite — email extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts emails from mailto: links', async () => {
    const html = htmlPage(`
      <a href="mailto:info@example.com">Email us</a>
      <a href="mailto:Sales@Example.COM">Sales</a>
      <p>Some text here with enough characters to avoid SPA detection heuristics padding</p>
    `);
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.emails).toContain('info@example.com');
    expect(result.emails).toContain('sales@example.com'); // lowercased
  });

  it('extracts emails from page text via regex', async () => {
    const html = htmlPage(`
      <p>Reach us at hello@business.io or support@business.io for help.</p>
      <p>Some text here with enough characters to avoid SPA detection heuristics padding</p>
    `);
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://business.io');

    expect(result.emails).toContain('hello@business.io');
    expect(result.emails).toContain('support@business.io');
  });

  it('deduplicates emails', async () => {
    const html = htmlPage(`
      <a href="mailto:info@example.com">Email</a>
      <p>Contact info@example.com for details. This is enough text padding for body.</p>
    `);
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.emails).toEqual(['info@example.com']);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: WhatsApp detection                                          */
/* ------------------------------------------------------------------ */

describe('crawlWebsite — WhatsApp detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects wa.me links', async () => {
    const html = htmlPage(`
      <a href="https://wa.me/5511999999999">Chat on WhatsApp</a>
      <p>Padding text to ensure we have more than fifty characters of body content.</p>
    `);
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.hasWhatsapp).toBe(true);
  });

  it('detects api.whatsapp.com links', async () => {
    const html = htmlPage(`
      <a href="https://api.whatsapp.com/send?phone=5511999999999">WhatsApp</a>
      <p>Padding text to ensure we have more than fifty characters of body content.</p>
    `);
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.hasWhatsapp).toBe(true);
  });

  it('returns false when no WhatsApp presence', async () => {
    const html = htmlPage(`
      <p>This is a plain website with no messaging integration at all in its markup.</p>
    `);
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.hasWhatsapp).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Chatbot detection                                           */
/* ------------------------------------------------------------------ */

describe('crawlWebsite — chatbot detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects Intercom widget script', async () => {
    const html = htmlPage(
      '<p>Padding text to ensure we have more than fifty characters of body content here.</p>',
      '<script src="https://widget.intercom.io/widget/abc123"></script>',
    );
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.hasChatbot).toBe(true);
    expect(result.techSignals.chatbotVendors).toContain('intercom');
  });

  it('detects Drift widget', async () => {
    const html = htmlPage(
      '<p>Padding text to ensure we have more than fifty characters of body content here.</p>',
      '<script>!function(){var t=window.driftt=window.drift=window.driftt||[]}</script>',
    );
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.hasChatbot).toBe(true);
    expect(result.techSignals.chatbotVendors).toContain('drift');
  });

  it('detects Tidio widget', async () => {
    const html = htmlPage(
      '<p>Padding text to ensure we have more than fifty characters of body content here.</p>',
      '<script src="//code.tidio.co/xyz.js"></script>',
    );
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.hasChatbot).toBe(true);
    expect(result.techSignals.chatbotVendors).toContain('tidio');
  });

  it('returns false when no chatbot detected', async () => {
    const html = htmlPage(`
      <p>This is a clean website with absolutely no chatbot scripts embedded anywhere.</p>
    `);
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.hasChatbot).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Booking detection                                           */
/* ------------------------------------------------------------------ */

describe('crawlWebsite — booking detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects Calendly embed', async () => {
    const html = htmlPage(`
      <div class="calendly-inline-widget" data-url="https://calendly.com/acme/30min"></div>
      <p>Padding text to ensure we have more than fifty characters of body content here.</p>
    `);
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.hasOnlineBooking).toBe(true);
  });

  it('detects Cal.com links', async () => {
    const html = htmlPage(`
      <a href="https://cal.com/dr-smith/consultation">Book now</a>
      <p>Padding text to ensure we have more than fifty characters of body content here.</p>
    `);
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.hasOnlineBooking).toBe(true);
  });

  it('returns false when no booking widget found', async () => {
    const html = htmlPage(`
      <p>This is a website without any booking functionality or calendar integration.</p>
    `);
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://example.com');

    expect(result.hasOnlineBooking).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Multi-page crawling                                         */
/* ------------------------------------------------------------------ */

describe('crawlWebsite — multi-page crawling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('follows internal links to contact/about pages and extracts signals', async () => {
    const homepageHtml = htmlPage(`
      <nav>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/services">Services</a>
      </nav>
      <p>Welcome to our clinic. We provide excellent dental care for the whole family.</p>
    `);

    const contactHtml = htmlPage(`
      <p>Contact us at clinic@dental.com or call 555-0100. This is a long enough page.</p>
      <a href="https://wa.me/15550100">WhatsApp us</a>
    `);

    const aboutHtml = htmlPage(`
      <p>We have been serving the community for many many years in the dental industry sector.</p>
    `);

    setupMultiPageFetch({
      'example.com/contact': contactHtml,
      'example.com/about': aboutHtml,
      'example.com': homepageHtml,
    });

    const result = await crawlWebsite('https://example.com');

    // Email from contact page
    expect(result.emails).toContain('clinic@dental.com');
    // WhatsApp from contact page
    expect(result.hasWhatsapp).toBe(true);
    // Should have crawled multiple pages
    expect(result.techSignals.pagesCrawled).toBeGreaterThan(1);
  });

  it('limits to 5 pages maximum', async () => {
    // Homepage with many internal links
    const links = Array.from({ length: 10 }, (_, i) => `<a href="/page-${i}">Page ${i}</a>`);
    const homepageHtml = htmlPage(`
      <nav>${links.join('\n')}</nav>
      <p>Homepage with many links for testing the page limit crawl functionality.</p>
    `);

    const pageHtml = htmlPage(`
      <p>This is an internal page with enough text content to not trigger SPA detection.</p>
    `);

    mockFetch.mockImplementation(async () => htmlResponse(pageHtml));
    // Override first call for homepage
    mockFetch.mockResolvedValueOnce(htmlResponse(homepageHtml));

    const result = await crawlWebsite('https://example.com');

    // Homepage + at most 4 more = 5 total
    expect(result.techSignals.pagesCrawled).toBeLessThanOrEqual(5);
    // fetch called at most 5 times (homepage + 4 subpages)
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Error handling                                              */
/* ------------------------------------------------------------------ */

describe('crawlWebsite — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null signals on fetch timeout', async () => {
    mockFetch.mockImplementation(async () => {
      throw new DOMException('The operation was aborted', 'AbortError');
    });

    const result = await crawlWebsite('https://slow-site.com');

    expect(result.emails).toEqual([]);
    expect(result.hasWhatsapp).toBeNull();
    expect(result.hasChatbot).toBeNull();
    expect(result.hasOnlineBooking).toBeNull();
  });

  it('returns null signals on fetch network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    const result = await crawlWebsite('https://down-site.com');

    expect(result.emails).toEqual([]);
    expect(result.hasWhatsapp).toBeNull();
    expect(result.hasChatbot).toBeNull();
    expect(result.hasOnlineBooking).toBeNull();
  });

  it('never throws — always returns a CrawlResult', async () => {
    mockFetch.mockRejectedValue(new Error('Unexpected catastrophe'));

    const result = await crawlWebsite('https://broken.com');

    expect(result).toBeDefined();
    expect(result).toHaveProperty('emails');
    expect(result).toHaveProperty('hasWhatsapp');
    expect(result).toHaveProperty('hasChatbot');
    expect(result).toHaveProperty('hasOnlineBooking');
    expect(result).toHaveProperty('techSignals');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: SPA detection                                               */
/* ------------------------------------------------------------------ */

describe('crawlWebsite — SPA detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flags SPA when body has < 50 chars of text', async () => {
    const html = htmlPage('<div id="root"></div>');
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://spa-app.com');

    expect(result.techSignals.spaDetected).toBe(true);
  });

  it('does not flag SPA when body has substantial text', async () => {
    const html = htmlPage(`
      <p>Welcome to our dental practice. We serve the entire family with comprehensive care.</p>
    `);
    mockFetch.mockResolvedValue(htmlResponse(html));

    const result = await crawlWebsite('https://normal-site.com');

    expect(result.techSignals.spaDetected).toBeUndefined();
  });
});
