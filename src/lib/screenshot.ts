import { chromium } from 'playwright';

export async function captureScreenshot(url: string): Promise<{ base64: string; mimeType: 'image/png' } | null> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    await page.goto(url, { timeout: 20_000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000); // settle any post-domcontentloaded layout
    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    return { base64: buffer.toString('base64'), mimeType: 'image/png' };
  } catch (err) {
    console.warn(`[screenshot] failed for ${url}:`, (err as Error).message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}
