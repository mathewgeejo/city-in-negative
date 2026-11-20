// Shared Chrome/Edge launcher for the playthrough and benchmark scripts (real GPU, no vsync cap).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export async function launch({ width = 1920, height = 1080, headless = true } = {}) {
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) throw new Error('No Chrome/Edge found; set CHROME_PATH');
  const browser = await puppeteer.launch({
    executablePath,
    headless: headless ? 'new' : false,
    defaultViewport: { width, height, deviceScaleFactor: 1 },
    args: [
      `--window-size=${width},${height}`,
      '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11',
      '--disable-gpu-vsync', '--disable-frame-rate-limit',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (['error', 'warn'].includes(m.type())) console.log(`[page ${m.type()}]`, m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  return { browser, page };
}

export const URL_BASE = process.env.CIN_URL ?? 'http://127.0.0.1:5173/';

export async function gpuInfo(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { vendor: gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR), renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER), ua: navigator.userAgent };
  });
}
