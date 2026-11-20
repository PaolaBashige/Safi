import type { UrlSignals } from './types';

/**
 * Deterministic URL checks. Pure string analysis only: no network calls, no DNS,
 * no threat-intelligence lookups. Every result is a *signal*, never proof.
 */

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly',
  'shorturl.at', 'tiny.cc', 'rb.gy', 'lnkd.in', 's.id', 't.ly', 'bl.ink', 'v.gd', 'shorte.st', 'adf.ly',
]);

// TLDs that are cheap/free and over-represented in abuse reports. Many legitimate sites use them too.
const SUSPICIOUS_TLDS = new Set([
  'zip', 'mov', 'top', 'xyz', 'click', 'link', 'tk', 'ml', 'ga', 'cf', 'gq', 'work', 'support', 'country',
  'kim', 'loan', 'icu', 'cyou', 'buzz', 'monster', 'rest', 'fit', 'surf', 'cam',
]);

const SECOND_LEVEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'co.in', 'com.br',
  'co.za', 'com.mx', 'com.ng', 'co.ke', 'com.sg', 'com.hk', 'com.tr', 'com.cn',
]);

// Distinctive brand tokens frequently impersonated in phishing. Short names need an exact label match.
const BRANDS = [
  'paypal', 'amazon', 'microsoft', 'netflix', 'facebook', 'instagram', 'whatsapp', 'linkedin', 'coinbase',
  'binance', 'docusign', 'wellsfargo', 'bankofamerica', 'citibank', 'americanexpress', 'dropbox', 'google',
  'apple', 'icloud', 'chase', 'fedex', 'usps', 'dhl', 'irs', 'venmo', 'zelle', 'steam', 'outlook', 'office365',
];

// Registrable domains that legitimately contain a brand token but are not the brand's consumer site.
const BRAND_SAFE_REGISTRABLE = new Set([
  'amazonaws.com', 'microsoftonline.com', 'googleapis.com', 'googleusercontent.com', 'gstatic.com',
  'google.org', 'withgoogle.com', 'office.com', 'office365.com',
]);

const CREDENTIAL_PATH =
  /(login|log-in|signin|sign-in|verify|verification|password|passwd|credential|unlock|suspend|confirm|authenticate|2fa|mfa|otp)/i;

export function registrableDomain(hostname: string): string {
  const labels = hostname.split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  if (SECOND_LEVEL_SUFFIXES.has(lastTwo)) return labels.slice(-3).join('.');
  return lastTwo;
}

/** Undo common character-substitution tricks (paypa1, micr0soft, arnazon). */
function normalizeLookalike(text: string): string {
  return text
    .toLowerCase()
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/0/g, 'o')
    .replace(/[1|]/g, 'l')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/[5$]/g, 's');
}

function detectLookalike(hostname: string): string | null {
  const registrable = registrableDomain(hostname);
  if (BRAND_SAFE_REGISTRABLE.has(registrable)) return null;
  const sld = registrable.split('.')[0] ?? '';
  const rawTokens = hostname.toLowerCase().split(/[.-]/).filter(Boolean);
  const normTokens = normalizeLookalike(hostname).split(/[.-]/).filter(Boolean);

  for (const brand of BRANDS) {
    // The real brand site: the registrable label is exactly the brand (e.g. paypal.com, login.microsoft.com).
    if (sld === brand) continue;
    const exactToken = rawTokens.includes(brand) || normTokens.includes(brand);
    const embedded = brand.length >= 6 && (normalizeLookalike(hostname).includes(brand) || hostname.includes(brand));
    if (exactToken || embedded) return brand;
  }
  return null;
}

/** Shown when a link path mentions login or verification steps. Exported so callers can tell it apart. */
export const CREDENTIAL_PATH_SIGNAL = 'The address mentions login, verification or password steps.';

export function isShortenerDomain(registrable: string): boolean {
  return SHORTENERS.has(registrable);
}

const emptySignals = (): UrlSignals => ({
  valid: false,
  hostname: null,
  isHttps: false,
  usesIpAddress: false,
  isShortened: false,
  hasPunycode: false,
  hasExcessiveSubdomains: false,
  hasSuspiciousTld: false,
  hasSuspiciousEncoding: false,
  hasUserInfo: false,
  isUnusuallyLong: false,
  hasCredentialPath: false,
  lookalikeOf: null,
  score: 0,
  hostScore: 0,
  pathScore: 0,
  signals: [],
});

export function analyzeUrl(raw: string): UrlSignals {
  const out = emptySignals();
  const input = raw.trim();
  if (!input || /\s/.test(input)) {
    out.signals.push('The text is not a single, well-formed link.');
    return out;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(input) && /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
  const explicitScheme = hasScheme ? input.slice(0, input.indexOf(':')).toLowerCase() : null;

  // Non-web schemes (javascript:, data:, file:) are never legitimate "website links" to click.
  if (!hasScheme && /^(javascript|data|vbscript|file):/i.test(input)) {
    out.signals.push('Uses a non-web link type (such as javascript: or data:), which is not a normal website address.');
    out.score = 4;
    return out;
  }
  if (explicitScheme && explicitScheme !== 'http' && explicitScheme !== 'https') {
    out.signals.push(`Uses an unusual link type (${explicitScheme}://) instead of a normal web address.`);
    out.score = 3;
    return out;
  }

  let url: URL;
  try {
    url = new URL(hasScheme ? input : `https://${input}`);
  } catch {
    out.signals.push('The link could not be read as a valid web address.');
    return out;
  }

  out.valid = true;
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  out.hostname = hostname;
  out.isHttps = explicitScheme === 'https';

  // `kind` splits the score so callers can reason about the host separately from the path. The total
  // `score` is unchanged. A login-style path word alone says little about a host; the host says more.
  const add = (points: number, text: string, kind: 'host' | 'path' | 'other' = 'other') => {
    out.score += points;
    out.signals.push(text);
    if (kind === 'host') out.hostScore += points;
    if (kind === 'path') out.pathScore += points;
  };

  if (explicitScheme === 'http') add(1, 'Does not use HTTPS, so the connection is not encrypted.');

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[')) {
    out.usesIpAddress = true;
    add(3, 'Uses a raw IP address instead of a website name.', 'host');
  }

  const registrable = registrableDomain(hostname);
  if (SHORTENERS.has(registrable)) {
    out.isShortened = true;
    add(2, 'Uses a link shortener, which hides the real destination.', 'host');
  }

  if (hostname.split('.').some((label) => label.startsWith('xn--'))) {
    out.hasPunycode = true;
    add(2, 'Contains punycode (xn--), which can disguise look-alike characters.', 'host');
  }

  const labelCount = hostname.split('.').length;
  const registrableCount = registrable.split('.').length;
  if (!out.usesIpAddress && labelCount - registrableCount >= 3) {
    out.hasExcessiveSubdomains = true;
    add(1, 'Has an unusually long chain of subdomains, a trick used to bury the real domain.', 'host');
  }

  const tld = hostname.split('.').pop() ?? '';
  if (!out.usesIpAddress && SUSPICIOUS_TLDS.has(tld)) {
    out.hasSuspiciousTld = true;
    add(1, `Ends in .${tld}, an ending that is often abused (many legitimate sites also use it).`, 'host');
  }

  const hostAndPath = `${url.hostname}${url.pathname}`;
  const percentCount = (hostAndPath.match(/%[0-9a-f]{2}/gi) ?? []).length;
  if (percentCount >= 4 || /%25|%00|%2e%2e/i.test(url.href) || /%/.test(url.hostname) || input.includes('\\')) {
    out.hasSuspiciousEncoding = true;
    add(1, 'Contains unusual character encoding that can hide the real address.', 'host');
  }

  if (url.username || url.password) {
    out.hasUserInfo = true;
    add(3, 'Contains an "@" or embedded login section, a trick that makes a link appear to go somewhere it does not.', 'host');
  }

  if (input.length > 150) {
    out.isUnusuallyLong = true;
    add(1, 'The link is unusually long.');
  }

  if (CREDENTIAL_PATH.test(`${url.pathname}${url.search}`)) {
    out.hasCredentialPath = true;
    add(2, CREDENTIAL_PATH_SIGNAL, 'path');
  }

  if (!out.usesIpAddress) {
    const brand = detectLookalike(hostname);
    if (brand) {
      out.lookalikeOf = brand;
      add(4, `The domain resembles "${brand}" but does not appear to be its official website.`, 'host');
    }
  }

  return out;
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/gi;

// Shortener links pasted without a scheme (for example "bit.ly/abc123"). Only known shorteners are
// matched this way, so ordinary text such as "e.g." or "node.js" is never treated as a link.
const BARE_SHORTENER = new RegExp(
  '(?<![\\w@./-])(?:' + Array.from(SHORTENERS).map((d) => d.replace(/\./g, '\\.')).join('|') + ')/[^\\s<>"\')\\]]+',
  'gi',
);

function cleanUrl(raw: string): string {
  return raw
    .replace(/[\p{Extended_Pictographic}‍️]+$/u, '')
    .replace(/[.,;:!?…»›]+$/u, '');
}

/**
 * Find links inside free text, including Markdown links, links glued to arrows or emoji, and
 * scheme-less links on known shorteners. Other bare domains are not guessed at.
 */
export function extractUrls(text: string): string[] {
  const found = [
    ...(text.match(URL_IN_TEXT) ?? []),
    ...(text.replace(URL_IN_TEXT, ' ').match(BARE_SHORTENER) ?? []).map((m) => `https://${m}`),
  ].map(cleanUrl);
  return Array.from(new Set(found)).filter((u) => u.length > 8).slice(0, 5);
}

/** True when a link's hostname contains one of the given name fragments (dots and hyphens ignored). */
export function hostnameMentionsAny(hostname: string, tokens: string[]): boolean {
  const flat = hostname.toLowerCase().replace(/[.-]/g, '');
  return tokens.some((t) => flat.includes(t.toLowerCase()));
}

