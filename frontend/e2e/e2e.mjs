import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const SITE = process.env.SAFI_SITE ?? 'http://localhost:4173';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`console.${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
const out = [];
const step = (name, ok, extra = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);

await page.goto(SITE, { waitUntil: 'networkidle0' });
step('Home loads', (await page.title()).includes('Safi'), await page.title());
step('Hero + warning visible', (await page.$eval('body', (b) => b.innerText)).includes('Never submit passwords'));

// Phishing example via the UI
const chip = await page.evaluateHandle(() => [...document.querySelectorAll('.chip-btn')].find((b) => b.textContent.includes('Account suspended')));
await chip.click();
await page.click('button[type=submit]');
await page.waitForSelector('.risk-card', { timeout: 20000 });
const card = await page.$eval('.risk-card', (c) => c.innerText);
step('Risk Card appears', true);
step('HIGH RISK shown', card.includes('HIGH RISK'));
step('Why / What to do / Learn / Test yourself present', ['Why Safi thinks this', 'What to do', 'Learn', 'Test yourself'].every((t) => card.includes(t)));
step('Disclaimer present', card.includes('educational tool'));
step('Focus moved to result (a11y)', await page.evaluate(() => document.activeElement?.classList.contains('risk-card')));
await page.screenshot({ path: 'e2e-riskcard.png', fullPage: true });

// URL tab
await page.click('#tab-url');
const urlChip = await page.evaluateHandle(() => [...document.querySelectorAll('.chip-btn')].find((b) => b.textContent.includes('Look-alike')));
await urlChip.click();
await page.click('button[type=submit]');
await page.waitForFunction(() => document.querySelector('.risk-card')?.innerText.includes('Credential phishing'), { timeout: 20000 });
step('URL tab analysis works', true);

// Ordinary message -> LOW RISK, not "safe"
await page.click('#tab-message');
const okChip = await page.evaluateHandle(() => [...document.querySelectorAll('.chip-btn')].find((b) => b.textContent.includes('Ordinary team')));
await okChip.click();
await page.click('button[type=submit]');
await page.waitForFunction(() => document.querySelector('.risk-card')?.innerText.includes('LOW RISK'), { timeout: 20000 });
const low = await page.$eval('.risk-card', (c) => c.innerText);
step('LOW RISK message, no "safe" claim', !/definitely safe|100% safe|this is safe/i.test(low));

// Regression: a polished "partnership portal" email with no obvious phishing phrases must not be LOW RISK.
const stark = readFileSync(new URL('../../backend/test/fixtures/stark-email.txt', import.meta.url), 'utf8');
await page.click('#tab-message');
await page.$eval('#msg', (el, v) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, stark);
await page.click('button[type=submit]');
await page.waitForFunction(() => document.querySelector('.risk-card')?.innerText.includes('Credential phishing'), { timeout: 20000 });
const starkCard = await page.$eval('.risk-card', (c) => c.innerText);
step('Partnership-portal email is not LOW RISK', !starkCard.includes('LOW RISK') && starkCard.includes('HIGH RISK'));
step('Partnership-portal email explains why', /link shortener/i.test(starkCard) && /sign in/i.test(starkCard) && /deadline/i.test(starkCard) && /eligibility/i.test(starkCard));
if (process.env.SAFI_PRINT_CARD) console.log(`\n--- Risk Card for the partnership-portal email ---\n${starkCard}\n---\n`);

// Screenshot tab: client-side validation of a non-image
await page.click('#tab-screenshot');
step('Screenshot tab renders upload + privacy note', (await page.$eval('#input-panel', (p) => p.innerText)).includes('not stored'));

// Learn
await page.click('nav a[href="#/learn"]');
await page.waitForSelector('.lesson');
step('Learn shows 6 lessons', (await page.$$('.lesson')).length === 6);

// Practice
await page.click('nav a[href="#/practice"]');
await page.waitForSelector('.choice');
await page.click('.choice');
await page.waitForSelector('.feedback');
const fb = await page.$eval('.feedback', (f) => f.innerText);
step('Practice gives feedback + lesson', /Safer|Riskier/.test(fb) && fb.includes('Lesson'));

// About
await page.click('nav a[href="#/about"]');
await page.waitForFunction(() => document.body.innerText.includes('AI-powered cybersecurity education and preparedness coach'));
step('About page', true);

// Mobile layout
await page.setViewport({ width: 390, height: 844, isMobile: true });
await page.goto(SITE + '/#/analyze', { waitUntil: 'networkidle0' });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
step('No horizontal scroll at 390px', !overflow);
await page.screenshot({ path: 'e2e-mobile.png' });

// Error state: block the API
await page.setViewport({ width: 1280, height: 900 });
await page.setRequestInterception(true);
page.on('request', (r) => (/execute-api|\/analyze$/.test(r.url()) ? r.abort() : r.continue()));
await page.goto(SITE, { waitUntil: 'networkidle0' });
await page.type('#msg', 'Please verify your password at this link now');
await page.click('button[type=submit]');
await page.waitForSelector('.status.error', { timeout: 15000 });
step('Friendly error when API unreachable', (await page.$eval('.status.error', (e) => e.innerText)).includes('Could not reach Safi'));

console.log(out.join('\n'));
const expected = problems.filter((p) => p.includes('execute-api') || p.includes('ERR_FAILED') || p.includes('Failed to load resource'));
const unexpected = problems.filter((p) => !expected.includes(p));
console.log('\nUnexpected console/network problems:', unexpected.length ? '\n' + unexpected.join('\n') : 'none');
console.log('Expected (from the deliberate API block):', expected.length);
await browser.close();
