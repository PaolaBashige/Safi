import { isShortenerDomain, registrableDomain } from './urlAnalysis';

/**
 * Sender-domain versus link-domain analysis.
 *
 * Question: given who the message says it is from, is it plausible that this link belongs to them?
 * Only a `From:` header at the very top of the pasted text is used. Nothing is inferred from the body.
 * With no header, or a header without an address, every function here returns "unknown" and the
 * rest of the detector behaves as it did before.
 *
 * No organization is named anywhere in this file. The comparison uses only the domains in the message.
 * A link to a different domain is NOT suspicious by itself: legitimate mail links to payment processors,
 * survey tools and identity providers all the time. Callers combine the result with what the message asks for.
 */

export interface SenderInfo {
  /** Display name from the From line ("Hollis State Weekly"), or null. */
  name: string | null;
  /** Lower-cased words of the display name. */
  nameWords: string[];
  address: string | null;
  domain: string | null;
  registrable: string | null;
  /** First label of the registrable domain, for example "corp-acme" for corp-acme.example. */
  label: string | null;
  /** The sender uses a free-mail provider, so its domain says nothing about an organization. */
  freemail: boolean;
}

const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com',
]);

const HEADER_LINE = /^[A-Za-z][A-Za-z-]{1,30}:\s?/;

/** Reads the From header from the contiguous header block at the top of the text, if there is one. */
export function parseSender(content: string): SenderInfo | null {
  const lines = content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  for (let n = 0; i < lines.length && n < 20; i++, n++) {
    const line = lines[i]!;
    if (!HEADER_LINE.test(line)) break;
    const m = /^from:\s*(.*)$/i.exec(line);
    if (m) return parseFromValue(m[1] ?? '');
  }
  return null;
}

function parseFromValue(value: string): SenderInfo {
  const angle = /^(.*?)<\s*([^<>\s@]+)@([^<>\s@]+)\s*>/.exec(value);
  const bare = /([^\s<>@,;"]+)@([^\s<>@,;"]+)/.exec(value);
  let name: string | null = null;
  let address: string | null = null;
  let domain: string | null = null;
  if (angle) {
    name = (angle[1] ?? '').replace(/["']/g, '').replace(/,\s*$/, '').trim() || null;
    address = `${angle[2]}@${angle[3]}`;
    domain = angle[3] ?? null;
  } else if (bare) {
    address = `${bare[1]}@${bare[2]}`;
    domain = bare[2] ?? null;
  } else {
    name = value.replace(/["']/g, '').trim() || null;
  }
  domain = domain ? domain.toLowerCase().replace(/[.>]+$/, '') : null;
  if (domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) domain = null;
  const registrable = domain ? registrableDomain(domain) : null;
  return {
    name,
    nameWords: (name ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    address: domain ? address : null,
    domain,
    registrable,
    label: registrable ? (registrable.split('.')[0] ?? null) : null,
    freemail: registrable ? FREEMAIL.has(registrable) : false,
  };
}

// Words that describe a function or kind of organization rather than name one. They are not distinctive
// enough to say "this domain imitates that organization".
const GENERIC_WORDS = new Set([
  'support', 'service', 'services', 'security', 'university', 'college', 'institute', 'academy', 'school', 'online',
  'program', 'programs', 'programme', 'partners', 'partner', 'talent', 'document', 'documents', 'sharing', 'benefits',
  'resources', 'human', 'notifications', 'newsletter', 'customer', 'accounts', 'account', 'receivable', 'payable',
  'billing', 'helpdesk', 'admissions', 'registrar', 'financial', 'office', 'department', 'weekly', 'alerts', 'alert',
  'team', 'group', 'company', 'solutions', 'global', 'international', 'national', 'official', 'learning', 'training',
  'digital', 'finance', 'recruiting', 'recruiter', 'recruitment', 'careers', 'payments', 'payroll', 'success',
  'senior', 'associate', 'manager', 'director', 'president', 'continuing', 'education', 'graduate', 'business',
]);

/** Distinctive name words from the display name: long enough and not generic ("westbrook", not "support"). */
export function claimedNameTokens(sender: SenderInfo): string[] {
  return sender.nameWords.filter((w) => w.length >= 6 && !GENERIC_WORDS.has(w));
}

const INSTITUTION_WORDS = ['university', 'college', 'institute', 'academy'];

/** .edu, .ac.xx and .edu.xx domains: the namespaces education institutions normally use. */
export function isEducationDomain(hostname: string): boolean {
  return /\.(edu|ac\.[a-z]{2}|edu\.[a-z]{2})$/.test(hostname);
}

const labelTokens = (label: string): string[] => label.split('-').filter(Boolean);

/**
 * Does `label` contain `name` (a whole word, or whole hyphen-separated run of words) plus something extra?
 * "university-login-security" contains "university" plus extras. "university" does not (it is the same).
 */
function containsWithExtras(label: string, name: string, allowedExtras: Set<string>): boolean {
  if (label === name) return false;
  const wrapped = `-${label}-`;
  if (wrapped.includes(`-${name}-`)) {
    const rest = labelTokens(label.replace(name, '')).filter((t) => !allowedExtras.has(t));
    return rest.length > 0;
  }
  // Glued on without a hyphen: "corpacmelogin" for "corpacme". Only for names long enough to be distinctive.
  if (name.length >= 6 && (label.startsWith(name) || label.endsWith(name)) && label.length - name.length >= 3) return true;
  return false;
}

export type LinkRelation =
  | 'unknown' // no usable sender, or a free-mail sender
  | 'same' // same registrable domain as the sender
  | 'tenant' // a third-party service with the sender's name in a subdomain (corp-acme.vendor.example)
  | 'shortener' // destination hidden; the shortener rule already covers this
  | 'lookalike' // contains the sender's or the claimed organization's name but is a different domain
  | 'unrelated'; // a different domain with no visible connection

export function relateLink(hostname: string, sender: SenderInfo | null): LinkRelation {
  if (!sender || !sender.registrable || !sender.label || sender.freemail) return 'unknown';
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const reg = registrableDomain(host);
  if (reg === sender.registrable) return 'same';
  if (isShortenerDomain(reg)) return 'shortener';

  const linkLabel = reg.split('.')[0] ?? '';
  const allowed = new Set(sender.nameWords);

  // A tenant on a shared service: the sender's name is a subdomain of someone else's domain.
  const subLabels = host.slice(0, Math.max(0, host.length - reg.length)).split('.').filter(Boolean);
  if (sender.label.length >= 4 && subLabels.some((l) => l === sender.label || l.includes(sender.label!))) return 'tenant';

  // Same name, different ending (university.example vs university.net), or the sender's name with extras added.
  if (linkLabel === sender.label) return 'lookalike';
  if (containsWithExtras(linkLabel, sender.label, allowed)) return 'lookalike';
  // The organization the display name claims to be, with extras added.
  for (const token of claimedNameTokens(sender)) {
    if (containsWithExtras(linkLabel, token, allowed)) return 'lookalike';
  }
  return 'unrelated';
}

export type SenderSelfCheck = 'none' | 'lookalike' | 'pseudo-education';

/**
 * Is the sender's own domain suspicious given the name it displays? Used only when the message also asks for
 * something sensitive.
 *  - lookalike: the domain is the displayed organization's name with extra words added ("firstharbor-secure"
 *    for "FirstHarbor Bank Security").
 *  - pseudo-education: the name says university/college, the domain also says so with extras, but it is not
 *    in an education namespace ("westbrook-university-programs.example").
 */
export function checkSenderDomain(sender: SenderInfo | null): SenderSelfCheck {
  if (!sender?.registrable || !sender.label || sender.freemail) return 'none';
  const allowed = new Set(sender.nameWords);
  for (const token of claimedNameTokens(sender)) {
    if (containsWithExtras(sender.label, token, allowed)) return 'lookalike';
  }
  const claimsInstitution = sender.nameWords.some((w) => INSTITUTION_WORDS.includes(w));
  const tokens = labelTokens(sender.label);
  if (claimsInstitution && tokens.length >= 2 && tokens.some((t) => INSTITUTION_WORDS.includes(t)) && !isEducationDomain(sender.registrable)) {
    return 'pseudo-education';
  }
  return 'none';
}
