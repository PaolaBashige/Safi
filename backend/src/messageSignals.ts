import { classifyCredentialLanguage, requestsIdentityDocuments } from './credentialLanguage';
import { detectFraudFlags } from './fraudSignals';
import { checkSenderDomain, isEducationDomain, parseSender, relateLink, type LinkRelation, type SenderInfo } from './senderDomain';
import { analyzeUrl, CREDENTIAL_PATH_SIGNAL, extractUrls, hostnameMentionsAny } from './urlAnalysis';
import type { UrlSignals } from './types';

export type MessageCategory =
  | 'urgency'
  | 'credential'
  | 'fear'
  | 'payment'
  | 'prize'
  | 'greeting'
  | 'secrecy'
  | 'clickPrompt'
  | 'delivery'
  | 'deadline'
  | 'attractiveOffer'
  | 'employmentVerification'
  | 'authRequest'
  | 'institutionMismatch'
  | 'senderLookalike'
  | 'senderDomainMismatch'
  | 'identityDocRequest'
  | 'highCompensation'
  | 'fastHire'
  | 'paymentInstruction'
  | 'changedBankDetails'
  | 'executivePretext'
  | 'urgentPayment';

/**
 * Compound signals: several independent categories that together are much stronger than any one alone.
 * They are only produced by combining categories, never by a single keyword.
 */
export type CompoundSignal =
  | 'authViaUnverifiedLink'
  | 'offerWithVerification'
  | 'socialEngineeringChain'
  | 'recruitmentScamPattern'
  | 'paymentFraudPattern'
  | 'paymentViaUnverifiedLink';

export interface MessageSignals {
  urls: string[];
  /**
   * Worst-scoring URL found in the message, if any. Its score and signals are the ones that count for this
   * message: login-style path wording is dropped when nothing else makes the link suspicious.
   */
  worstUrl: UrlSignals | null;
  categories: MessageCategory[];
  /** Combinations of categories that raise the score further. */
  compounds: CompoundSignal[];
  /** Name fragments of institutions the message claims to speak for (used for the link comparison). */
  claimedInstitutions: string[];
  /** The From header, when the pasted text starts with one. Null otherwise. */
  sender: SenderInfo | null;
  /** How each link relates to the sender's domain (all 'unknown' when there is no sender domain). */
  linkRelations: Array<{ url: string; relation: LinkRelation }>;
  /** Indicators in plain language. */
  indicators: string[];
  /** Characters of text left after removing links. */
  textLength: number;
  score: number;
}

const WEIGHTS: Record<MessageCategory, number> = {
  urgency: 2,
  credential: 3,
  fear: 2,
  payment: 2,
  prize: 2,
  greeting: 1,
  secrecy: 1,
  clickPrompt: 1,
  delivery: 1,
  // Each of these is common in legitimate mail on its own, so they are weighted low. The risk comes from
  // the compound signals below.
  deadline: 1,
  attractiveOffer: 1,
  employmentVerification: 1,
  authRequest: 1,
  institutionMismatch: 1,
  // Domain signals. A link to another domain is ordinary; these only fire together with a sensitive request.
  senderLookalike: 2,
  senderDomainMismatch: 2,
  // Recruitment and payment-fraud building blocks. Ordinary on their own.
  identityDocRequest: 1,
  highCompensation: 1,
  fastHire: 1,
  paymentInstruction: 1,
  // Changed bank details are rare in legitimate mail and the central trick of invoice fraud, so on its own it
  // earns "check before you act" (SUSPICIOUS) but never a high-risk verdict.
  changedBankDetails: 3,
  executivePretext: 1,
  urgentPayment: 1,
};

const COMPOUND_WEIGHTS: Record<CompoundSignal, number> = {
  authViaUnverifiedLink: 3,
  offerWithVerification: 2,
  socialEngineeringChain: 3,
  recruitmentScamPattern: 3,
  paymentFraudPattern: 3,
  paymentViaUnverifiedLink: 3,
};

export const COMPOUND_REASONS: Record<CompoundSignal, string> = {
  authViaUnverifiedLink: 'It asks you to sign in through a link whose real destination is hidden or unrelated to who the message claims to be.',
  offerWithVerification: 'A very attractive offer is paired with a request to verify your job or eligibility, a common way to get you to sign in.',
  socialEngineeringChain: 'It walks you through a familiar scam sequence: attractive offer, deadline, eligibility check, link, then sign-in.',
  recruitmentScamPattern: 'It combines a very attractive job offer, little or no interview, a request for ID or personal details, and pressure to finish quickly.',
  paymentFraudPattern: 'It asks for a payment with the hallmarks of invoice or executive-impersonation fraud: changed bank details, urgency, secrecy, or a sender who cannot be called.',
  paymentViaUnverifiedLink: 'It asks you to pay or transfer money through a link whose real destination is hidden or imitates a name you may trust.',
};

const DESCRIPTIONS: Record<MessageCategory, string> = {
  urgency: 'Creates urgency or a deadline to rush you into acting.',
  credential: 'Asks you to verify, confirm or share account details, passwords or codes.',
  fear: 'Uses fear, such as a suspended account or a threat of consequences.',
  payment: 'Pushes for a payment, transfer or an unusual payment method.',
  prize: 'Promises a prize, reward or windfall you did not ask for.',
  greeting: 'Uses a generic greeting instead of your name.',
  secrecy: 'Asks you to keep the request secret or not to check with anyone.',
  clickPrompt: 'Pressures you to click a link or open something.',
  delivery: 'Mentions a package or delivery problem, a common scam theme.',
  deadline: 'Sets a deadline or limited availability to rush your decision.',
  attractiveOffer: 'Offers an unusually generous benefit (discounts, savings, easy admission, exclusivity).',
  employmentVerification: 'Asks you to verify your job, employer or eligibility.',
  authRequest: 'Asks you to sign in or use single sign-on (SSO) credentials through its own link.',
  institutionMismatch: 'Names an institution but the link does not appear to belong to it.',
  senderLookalike: 'Uses a web address that imitates the sender or a name it claims to be, but is a different domain.',
  senderDomainMismatch: "Asks for something important but sends you to a different website than the sender's own.",
  identityDocRequest: 'Asks for an ID document or sensitive personal details such as your date of birth.',
  highCompensation: 'Advertises unusually high pay.',
  fastHire: 'Promises a job with little or no interview or screening.',
  paymentInstruction: 'Asks you to send or process a payment or transfer.',
  changedBankDetails: 'Says bank or payment details have changed, a common invoice-fraud tactic.',
  executivePretext: 'Says the sender is busy or cannot be called, so the request is hard to check.',
  urgentPayment: 'Pushes for a payment to be made right away.',
};

/** Categories decided by a single pattern on the message text. The others are computed below. */
type PatternCategory =
  | 'urgency'
  | 'fear'
  | 'payment'
  | 'prize'
  | 'greeting'
  | 'secrecy'
  | 'clickPrompt'
  | 'delivery'
  | 'deadline'
  | 'employmentVerification'
  | 'authRequest';

const PATTERNS: Record<PatternCategory, RegExp> = {
  urgency:
    /\b(urgent(ly)?|immediately|right away|asap|within \d+ ?(hours?|hrs?|minutes?|mins?|days?)|final notice|last chance|act now|act fast|expires?( today| soon| in)?|limited time|today only|before it'?s too late)\b/i,
  fear:
    /((account|access|card|profile|service).{0,25}\b(suspended|closed|locked|terminated|compromised|disabled|deactivated|restricted|limited)\b)|legal action|\barrest(ed)?\b|\bpenalt(y|ies)\b|unauthori[sz]ed (log-?in|activity|access|transaction)|we noticed (unusual|suspicious)|will be (closed|deleted|suspended|terminated)/i,
  payment:
    /gift ?cards?|wire transfer|bitcoin|\bcrypto(currency)?\b|western union|send (me |us )?(the )?money|payment (is )?(due|overdue|required|pending|failed)|pay (now|immediately|today)|overdue (invoice|payment|balance)|unpaid (invoice|balance|toll|fine)/i,
  prize: /you('ve| have)? (just )?won|\bwinner\b|\bprize\b|\blottery\b|claim your|free (gift|iphone|reward)|congratulations!?.{0,30}(selected|chosen|won)/i,
  greeting: /^\s*(dear|hello|hi) (customer|user|client|member|valued|account holder|sir\/madam|sir or madam|intern|employee|colleague|student|applicant|candidate)\b/im,
  secrecy: /(don'?t tell|do not tell|keep (this|it) (confidential|secret|between us)|do not (share|discuss) this|tell no one)/i,
  clickPrompt: /\b(click|tap) (here|the link|below|this link|on the link)\b|\b(follow|use) the link\b|open the attachment/i,
  delivery: /(package|parcel|shipment|delivery).{0,40}(could not|couldn'?t|unable|failed|held|on hold|reschedul|missed|pending|customs)/i,
  deadline:
    /\bdeadline\b|\b(application|enrol?lment|registration|offer|window|portal|sale|promotion)\b.{0,30}\b(closes?|closing|ends?|expires?)\b|\bsecure your (spot|place|seat|offer)\b|\b\d+ days? (from now|left|remaining)\b|\bonly \d+ (spots?|seats?|places?|days?) (left|remaining)\b|\bclos(es|ing) (on|in|by)\b/i,
  employmentVerification:
    /\b(verify|confirm|validate|check)\b.{0,25}\b(employment|employer|enrol?lment|eligibility|affiliation|work status)\b|\beligibility (assessment|check|verification)\b|\bemployment (status|verification)\b|\byour (organi[sz]ation|employer|company) (has been|was) selected\b/i,
  authRequest:
    /\b(single[- ]sign[- ]?on|sso)\b|\b(sign|log)[- ]?in (with|using|via|through|to)\b|\b(enterprise|corporate|work|company|school|university|employer) (credentials|log-?in|account)\b|\bcredentials\b|\bauthenticat(e|ion|ing)\b/i,
};

/** The order categories are reported in. New categories go at the end so earlier output stays stable. */
const ORDER: MessageCategory[] = [
  'urgency', 'credential', 'fear', 'payment', 'prize', 'greeting', 'secrecy', 'clickPrompt', 'delivery', 'deadline',
  'attractiveOffer', 'employmentVerification', 'authRequest', 'institutionMismatch',
  'senderLookalike', 'senderDomainMismatch', 'identityDocRequest', 'highCompensation', 'fastHire',
  'paymentInstruction', 'changedBankDetails', 'executivePretext', 'urgentPayment',
];

/** Independent groups of "too good to be true" language. A message needs several different groups, not one keyword. */
const OFFER_GROUPS: RegExp[] = [
  /\b\d{1,3}% (off|discount)\b|\b\d{1,3}% [a-z]+ discount\b|\bdiscount\b.{0,30}\b(sav(e|ing|ings)|\$\s?\d)|\bsav(e|ing|ings)\b.{0,12}\$\s?\d/i,
  /\bdirect (admission|entry|acceptance)\b|\bguaranteed (admission|acceptance|spot|place|job|interview)\b|\bno (gmat|gre|sat|exam|test|interview|competitive application|application fee)\b|\bfast[- ]track\b|\bpre-?approved\b/i,
  /\bexclusive\b|\bselected (as|for)\b|\bhand-?picked\b|\binvitation[- ]only\b|\blimited to (select|a few|eligible)\b|\bonly (select|eligible|chosen) (employees|members|people|candidates)\b/i,
  /\b(tuition|scholarship|grant|stipend|fellowship|free (course|degree|training|laptop))\b/i,
];
const OFFER_GROUPS_REQUIRED = 3;

// Words that describe a kind of institution rather than name one; they are not useful for comparing with a domain.
const INSTITUTION_STOPWORDS = new Set([
  'university', 'college', 'institute', 'school', 'academy', 'business', 'of', 'the', 'and', 'for', 'our', 'your',
  'dear', 'from', 'with', 'this', 'that', 'master', 'masters', 'program', 'programme',
]);
const INSTITUTION_PATTERNS: RegExp[] = [
  /\b(?:University|College|Institute|School|Academy) of ((?:[A-Z][\w&'-]*)(?: [A-Z][\w&'-]*){0,2})/g,
  /\b((?:[A-Z][\w&'-]*) (?:[A-Z][\w&'-]* ){0,2})(?:University|College|Institute|Academy|School of [A-Z]\w+)\b/g,
];

/** Name fragments (lower-case) of institutions the text says it represents, such as "berkeley" or "haas". */
export function institutionNameFragments(text: string): string[] {
  const out = new Set<string>();
  for (const re of INSTITUTION_PATTERNS) {
    for (const m of text.matchAll(re)) {
      for (const w of (m[1] ?? '').split(/[^A-Za-z0-9]+/)) {
        const t = w.toLowerCase();
        if (t.length >= 4 && !INSTITUTION_STOPWORDS.has(t)) out.add(t);
      }
    }
  }
  return Array.from(out).slice(0, 8);
}

function offerGroupsMatched(text: string): number {
  return OFFER_GROUPS.filter((re) => re.test(text)).length;
}

export function analyzeMessage(content: string): MessageSignals {
  const urls = extractUrls(content);
  // Remove link text before matching wording, so words inside a URL path are not read as message language.
  const text = urls.reduce((t, u) => t.split(u).join(' '), content).replace(/https?:\/\/[^\s<>"')\]]+/gi, ' ');
  const textLength = text.replace(/\s+/g, ' ').trim().length;

  const found = new Set<MessageCategory>();
  for (const cat of Object.keys(PATTERNS) as PatternCategory[]) {
    if (PATTERNS[cat].test(text)) found.add(cat);
  }
  if (offerGroupsMatched(text) >= OFFER_GROUPS_REQUIRED) found.add('attractiveOffer');

  // Does the message ask for a secret, or only mention one? See credentialLanguage.ts.
  const credentialLanguage = classifyCredentialLanguage(text);
  if (credentialLanguage.request) found.add('credential');
  if (requestsIdentityDocuments(text)) found.add('identityDocRequest');

  // Recruitment and payment-fraud building blocks. See fraudSignals.ts.
  const fraud = detectFraudFlags(text);
  if (fraud.highCompensation) found.add('highCompensation');
  if (fraud.fastHire) found.add('fastHire');
  if (fraud.paymentInstruction) found.add('paymentInstruction');
  if (fraud.changedBankDetails) found.add('changedBankDetails');
  if (fraud.executivePretext) found.add('executivePretext');
  if (fraud.urgentPayment) found.add('urgentPayment');

  // Links, analysed on their own first.
  const analysed = urls.map((u) => ({ url: u, signals: analyzeUrl(u) }));

  // Does the message claim to speak for an institution while sending you somewhere unrelated?
  // Generic: it compares the names the text mentions with the link hostnames, with no list of institutions.
  const claimedInstitutions = institutionNameFragments(text);
  const valid = analysed.filter((a) => a.signals.valid && a.signals.hostname);
  const linkUnrelated =
    claimedInstitutions.length > 0 &&
    valid.length > 0 &&
    valid.every((a) => !isEducationDomain(a.signals.hostname as string) && !hostnameMentionsAny(a.signals.hostname as string, claimedInstitutions));
  if (linkUnrelated) found.add('institutionMismatch');

  // Sender domain versus link domains. Only when the pasted text starts with a From header that has an address.
  const sender = parseSender(content);
  const linkRelations = analysed.map((a) => ({
    url: a.url,
    relation: a.signals.valid && a.signals.hostname ? relateLink(a.signals.hostname, sender) : ('unknown' as LinkRelation),
  }));
  // A link to another domain is ordinary. It only matters when the message also asks for something sensitive.
  // The generic `payment` category ("your invoice is due") is deliberately not on this list: legitimate invoices
  // link to payment processors. An instruction to send money, or changed bank details, is.
  const sensitiveRequest =
    found.has('authRequest') ||
    found.has('credential') ||
    found.has('paymentInstruction') ||
    found.has('changedBankDetails') ||
    found.has('identityDocRequest') ||
    found.has('employmentVerification');
  const anyLookalikeLink = linkRelations.some((r) => r.relation === 'lookalike');
  const senderCheck = sensitiveRequest ? checkSenderDomain(sender) : 'none';
  if (anyLookalikeLink || senderCheck !== 'none') found.add('senderLookalike');
  if (sensitiveRequest && linkRelations.some((r) => r.relation === 'unrelated')) found.add('senderDomainMismatch');

  // A login-style word in a link path is weak evidence. It counts when the host or the sender relationship
  // gives a reason to distrust the link, or when the text itself asks for a secret. Otherwise a normal company
  // link ending in /mfa or /login would be rated as suspicious because of its path.
  const effective = analysed.map((a, i) => {
    const relation = linkRelations[i]!.relation;
    const pathCounts = a.signals.hostScore > 0 || relation === 'lookalike' || relation === 'unrelated' || found.has('credential');
    if (pathCounts || a.signals.pathScore === 0) return { ...a, relation };
    const signals: UrlSignals = {
      ...a.signals,
      score: a.signals.score - a.signals.pathScore,
      pathScore: 0,
      signals: a.signals.signals.filter((s) => s !== CREDENTIAL_PATH_SIGNAL),
    };
    return { ...a, signals, relation };
  });

  let worstUrl: UrlSignals | null = null;
  for (const e of effective) {
    if (!worstUrl || e.signals.score > worstUrl.score) worstUrl = e.signals;
  }

  const categories = ORDER.filter((c) => found.has(c));
  const indicators = categories.map((c) => DESCRIPTIONS[c]);
  let score = categories.reduce((sum, c) => sum + WEIGHTS[c], 0);

  if (urls.length > 0) {
    score += 1; // a link is present
    indicators.push('Contains a link you are being asked to follow.');
    if (worstUrl) {
      score += Math.min(worstUrl.score, 4);
      indicators.push(...worstUrl.signals);
    }
  }

  // Compound signals: combinations of independent categories. No single keyword can trigger these.
  const has = (c: MessageCategory) => found.has(c);
  const compounds: CompoundSignal[] = [];
  const hostHidden = effective.some((e) => e.signals.isShortened || e.signals.hostScore >= 2);
  const linkIsOpaque = hostHidden || has('institutionMismatch') || has('senderLookalike');
  if ((has('authRequest') || has('credential')) && urls.length > 0 && linkIsOpaque) compounds.push('authViaUnverifiedLink');
  if (has('attractiveOffer') && (has('employmentVerification') || has('authRequest'))) compounds.push('offerWithVerification');
  const stages = [
    has('attractiveOffer'),
    has('urgency') || has('deadline'),
    has('employmentVerification'),
    urls.length > 0 || has('clickPrompt'),
    has('authRequest') || has('credential'),
  ].filter(Boolean).length;
  if (stages >= 4) compounds.push('socialEngineeringChain');

  // Recruitment lure: a job context, plus at least three of: high pay, little or no interview, ID/personal details,
  // pressure to finish quickly. It also needs either a request for ID or a link to apply through.
  const recruitmentSignals = [
    has('highCompensation'),
    has('fastHire'),
    has('identityDocRequest'),
    fraud.recruitUrgency || has('urgency') || has('deadline'),
  ].filter(Boolean).length;
  if (fraud.jobContext && recruitmentSignals >= 3 && (has('identityDocRequest') || urls.length > 0)) compounds.push('recruitmentScamPattern');

  // Payment diversion: a payment instruction plus at least two of: changed bank details, an unavailable sender,
  // secrecy, urgency. An ordinary invoice or a vendor notice has a payment but none of the others.
  const paymentSignals = [has('changedBankDetails'), has('executivePretext'), has('secrecy'), has('urgentPayment')].filter(Boolean).length;
  if (has('paymentInstruction') && paymentSignals >= 2) compounds.push('paymentFraudPattern');
  if ((has('paymentInstruction') || has('payment')) && urls.length > 0 && linkIsOpaque) compounds.push('paymentViaUnverifiedLink');

  for (const c of compounds) {
    score += COMPOUND_WEIGHTS[c];
    indicators.push(COMPOUND_REASONS[c]);
  }

  return {
    urls,
    worstUrl,
    categories,
    compounds,
    claimedInstitutions,
    sender,
    linkRelations,
    indicators,
    textLength,
    score,
  };
}
