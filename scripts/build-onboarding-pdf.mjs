/**
 * Render ONBOARDING-QA-FLUJO.html -> ONBOARDING-QA-FLUJO.pdf (A4, print styles).
 * Run with Node (Bun hangs on Playwright's pipe transport on Windows):
 *   node scripts/build-onboarding-pdf.mjs
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const htmlPath = resolve(root, 'ONBOARDING-QA-FLUJO.html');
const pdfPath = resolve(root, 'ONBOARDING-QA-FLUJO.pdf');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', bottom: '16mm', left: '13mm', right: '13mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#8792a2;font-family:Segoe UI,Arial,sans-serif;padding:0 13mm;display:flex;justify-content:space-between;align-items:center;">'
      + '<span>Onboarding QA Ag&#233;ntico &#8212; MAGIIS</span>'
      + '<span>P&#225;g. <span class="pageNumber"></span> / <span class="totalPages"></span></span>'
      + '</div>',
  });
  console.log(`OK -> ${pdfPath}`);
}
finally {
  await browser.close();
}
