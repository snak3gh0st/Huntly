import * as cheerio from 'cheerio';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CrawlResult {
  emails: string[];
  hasWhatsapp: boolean | null;
  hasChatbot: boolean | null;
  hasOnlineBooking: boolean | null;
  techSignals: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_PAGES = 5;
const TIMEOUT_MS = 15_000;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** URL or link-text patterns that indicate high-value internal pages. */
const PRIORITY_PAGE_RE = /contact|about|service|booking|appointment/i;

const WHATSAPP_PATTERNS = [
  'wa.me',
  'api.whatsapp.com',
  'whatsapp',
];

const CHATBOT_VENDORS = [
  'intercom',
  'drift',
  'tidio',
  'manychat',
  'tawk',
];

const BOOKING_PATTERNS = [
  'calendly.com',
  'cal.com',
];

const BOOKING_FORM_RE = /booking|appointment|schedule|reserve/i;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function nullResult(): CrawlResult {
  return {
    emails: [],
    hasWhatsapp: null,
    hasChatbot: null,
    hasOnlineBooking: null,
    techSignals: {},
  };
}

/**
 * Resolve a potentially-relative href against the page URL.
 * Returns null for non-HTTP(S) links, anchors, javascript:, etc.
 */
function resolveLink(href: string, pageUrl: string): string | null {
  try {
    const resolved = new URL(href, pageUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.href;
  } catch {
    return null;
  }
}

/**
 * Returns true when `link` belongs to the same origin as `baseUrl`.
 */
function isSameOrigin(link: string, baseUrl: string): boolean {
  try {
    return new URL(link).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Signal extraction — run on each page's HTML                        */
/* ------------------------------------------------------------------ */

function extractEmails($: cheerio.CheerioAPI): string[] {
  const found = new Set<string>();

  // mailto: links
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const email = href.replace(/^mailto:/i, '').split('?')[0]!.toLowerCase().trim();
    if (email && EMAIL_RE.test(email)) found.add(email);
    // reset regex lastIndex since we use the global flag
    EMAIL_RE.lastIndex = 0;
  });

  // Regex over visible text
  const bodyText = $('body').text();
  const matches = bodyText.match(EMAIL_RE) ?? [];
  for (const m of matches) {
    found.add(m.toLowerCase());
  }

  return [...found];
}

function detectWhatsapp($: cheerio.CheerioAPI): boolean {
  const html = $.html().toLowerCase();
  return WHATSAPP_PATTERNS.some((p) => html.includes(p));
}

function detectChatbot($: cheerio.CheerioAPI): { detected: boolean; vendors: string[] } {
  const html = $.html().toLowerCase();
  const vendors: string[] = [];
  for (const v of CHATBOT_VENDORS) {
    if (html.includes(v)) vendors.push(v);
  }
  return { detected: vendors.length > 0, vendors };
}

function detectBooking($: cheerio.CheerioAPI): boolean {
  const html = $.html().toLowerCase();

  // Known booking platform links / embeds
  if (BOOKING_PATTERNS.some((p) => html.includes(p))) return true;

  // Booking form heuristic — look for forms with booking-related action/class
  const forms = $('form');
  let bookingForm = false;
  forms.each((_, el) => {
    const action = $(el).attr('action') ?? '';
    const cls = $(el).attr('class') ?? '';
    const id = $(el).attr('id') ?? '';
    if (BOOKING_FORM_RE.test(action + cls + id)) bookingForm = true;
  });

  return bookingForm;
}

/**
 * Returns true when the page body contains fewer than 50 characters of
 * visible text, indicating a likely SPA that needs JS rendering.
 */
function isSpa($: cheerio.CheerioAPI): boolean {
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return text.length < 50;
}

/* ------------------------------------------------------------------ */
/*  Link discovery                                                     */
/* ------------------------------------------------------------------ */

/**
 * Discover internal links from nav and footer elements, prioritising
 * pages whose URL or anchor text matches PRIORITY_PAGE_RE.
 */
function discoverLinks($: cheerio.CheerioAPI, pageUrl: string): string[] {
  const candidates = new Map<string, number>(); // url → priority score

  const selectors = ['nav a[href]', 'footer a[href]', 'header a[href]', 'a[href]'];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const resolved = resolveLink(href, pageUrl);
      if (!resolved || !isSameOrigin(resolved, pageUrl)) return;

      // Strip hash
      const clean = resolved.split('#')[0]!;
      if (candidates.has(clean)) return;

      const text = $(el).text();
      const score = PRIORITY_PAGE_RE.test(clean) || PRIORITY_PAGE_RE.test(text) ? 1 : 0;
      candidates.set(clean, score);
    });
  }

  // Sort by priority (high-value pages first), then insertion order
  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url);
}

/* ------------------------------------------------------------------ */
/*  Page fetcher                                                       */
/* ------------------------------------------------------------------ */

async function fetchPage(
  url: string,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        'User-Agent': 'HuntlyBot/1.0 (+https://huntly.io)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('xhtml')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main crawler                                                       */
/* ------------------------------------------------------------------ */

export async function crawlWebsite(url: string): Promise<CrawlResult> {
  const result = nullResult();
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const visited = new Set<string>();
    const allEmails = new Set<string>();
    let whatsapp = false;
    let chatbot = false;
    let booking = false;
    const chatbotVendors = new Set<string>();
    let spaDetected = false;

    // Normalise the starting URL
    const startUrl = url.startsWith('http') ? url : `https://${url}`;

    // Fetch homepage
    const homepageHtml = await fetchPage(startUrl, ac.signal);
    if (!homepageHtml) {
      clearTimeout(timeout);
      return result; // all null signals
    }

    visited.add(startUrl);

    const $home = cheerio.load(homepageHtml);

    // Check for SPA
    if (isSpa($home)) {
      spaDetected = true;
      // In production we'd use Playwright here — for now mark as tech signal
      result.techSignals.spaDetected = true;
    }

    // Extract signals from homepage
    for (const email of extractEmails($home)) allEmails.add(email);
    if (detectWhatsapp($home)) whatsapp = true;
    const homeChat = detectChatbot($home);
    if (homeChat.detected) {
      chatbot = true;
      homeChat.vendors.forEach((v) => chatbotVendors.add(v));
    }
    if (detectBooking($home)) booking = true;

    // Discover internal links
    const links = discoverLinks($home, startUrl);

    // Crawl additional pages (up to MAX_PAGES total including homepage)
    for (const link of links) {
      if (visited.size >= MAX_PAGES) break;
      if (visited.has(link)) continue;

      visited.add(link);

      const html = await fetchPage(link, ac.signal);
      if (!html) continue;

      const $ = cheerio.load(html);
      for (const email of extractEmails($)) allEmails.add(email);
      if (detectWhatsapp($)) whatsapp = true;
      const chat = detectChatbot($);
      if (chat.detected) {
        chatbot = true;
        chat.vendors.forEach((v) => chatbotVendors.add(v));
      }
      if (detectBooking($)) booking = true;
    }

    // Assemble result
    result.emails = [...allEmails];
    result.hasWhatsapp = whatsapp;
    result.hasChatbot = chatbot;
    result.hasOnlineBooking = booking;

    if (chatbotVendors.size > 0) {
      result.techSignals.chatbotVendors = [...chatbotVendors];
    }
    if (spaDetected) {
      result.techSignals.spaDetected = true;
    }
    result.techSignals.pagesCrawled = visited.size;
  } catch {
    // On any error (including abort), return partial results with null for unknown signals
    if (result.emails.length === 0) result.emails = [];
    // Leave boolean signals as null if we haven't confirmed them
  } finally {
    clearTimeout(timeout);
  }

  return result;
}
