import { analyzeMessage, COMPOUND_REASONS, type MessageCategory, type MessageSignals } from './messageSignals';
import { analyzeUrl } from './urlAnalysis';
import { DISCLAIMER, type Analysis, type AnalyzeRequest, type Confidence, type RiskLevel, type UrlSignals } from './types';

/**
 * Deterministic, rule-based analysis. Used when MOCK_AI=true, and as the safe fallback when
 * the AI response cannot be obtained or validated. Same input always gives the same output.
 */

export interface Deterministic {
  url: UrlSignals | null;
  message: MessageSignals | null;
}

export function runDeterministic(req: AnalyzeRequest): Deterministic {
  if (req.inputType === 'url') return { url: analyzeUrl(req.content), message: null };
  if (req.inputType === 'message') {
    const message = analyzeMessage(req.content);
    return { url: message.worstUrl, message };
  }
  return { url: null, message: null };
}

const TOPICS: Record<string, string> = {
  credential: 'Why real companies never ask for your password by message',
  urgency: 'How urgency and fear are used to rush your decisions',
  fear: 'How urgency and fear are used to rush your decisions',
  payment: 'Spotting fake payment and invoice requests',
  prize: 'Why "too good to be true" offers are a red flag',
  delivery: 'Delivery-notification scams and how to check a parcel safely',
  link: 'How to inspect a link before you click it',
  basics: 'The basics of spotting phishing',
  fraud: 'Fake invoices, changed bank details and impersonated executives',
  recruitment: 'Fake job offers and how to check a recruiter',
};

const THREAT: Record<string, string> = {
  credential: 'Credential phishing',
  payment: 'Payment or invoice scam',
  prize: 'Prize or reward scam',
  delivery: 'Delivery scam',
  link: 'Suspicious link',
  generic: 'Possible phishing',
  fraud: 'Payment fraud or impersonation',
  recruitment: 'Fake job offer',
};

function pick(order: MessageCategory[], cats: MessageCategory[]): string | null {
  return order.find((c) => cats.includes(c)) ?? null;
}

const WHY: Record<MessageCategory, string> = {
  urgency: 'It pushes you to act quickly, which is meant to stop you from thinking it through.',
  credential: 'It asks for account details or a way to sign in. Real organizations do not ask for these by message.',
  fear: 'It uses fear (a locked or suspended account, or a threat) to pressure you.',
  payment: 'It asks for money or an unusual form of payment.',
  prize: 'It offers something valuable that you did not ask for.',
  greeting: 'It does not address you by name, which is common in mass-sent scams.',
  secrecy: 'It asks you to keep things secret, which stops you from getting a second opinion.',
  clickPrompt: 'It pressures you to click a link instead of going to the official site yourself.',
  delivery: 'It claims a delivery problem, a very common cover story for scam links.',
  deadline: 'It sets a deadline or limited availability, a common way to rush you into acting before you check.',
  attractiveOffer: 'It offers an unusually generous package (large savings, easy admission and exclusivity), which is a common lure.',
  employmentVerification: 'It asks you to verify your job or eligibility, which can be used to make a sign-in request seem routine.',
  authRequest: 'It asks you to sign in or use single sign-on (SSO) credentials on a page it supplies.',
  institutionMismatch: 'It names a well-known institution, but the link does not lead to a site that appears to belong to it.',
  senderLookalike: 'A web address in the message imitates the sender or a name it claims to be, but it is a different domain.',
  senderDomainMismatch: "It asks for something important but sends you to a website that is not the sender's own.",
  identityDocRequest: 'It asks for an ID document or personal details such as your date of birth, which are what identity theft needs.',
  highCompensation: 'The pay on offer is unusually high.',
  fastHire: 'It promises a job with little or no interview, which real employers rarely do.',
  paymentInstruction: 'It asks you to send or process a payment or transfer.',
  changedBankDetails: 'It says bank or payment details have changed, the central trick of invoice fraud.',
  executivePretext: 'It says the sender cannot be called, so you cannot easily check the request.',
  urgentPayment: 'It wants the payment made right away, before anyone can check.',
};

const actionsHigh = (hasLink: boolean) => [
  hasLink ? 'Do not click the link or open any attachment.' : 'Do not reply or follow any instructions in the message.',
  'Do not enter your password, codes or card details.',
  "Open the organization's official website or app yourself (type the address, don't use the message) to check for real notices.",
  'Report the message as phishing in your email or messaging app, then delete it.',
  'If you already clicked or shared something, change that password now and tell someone who can help (see the Learn section).',
];

const actionsSuspicious = [
  'Pause. Do not click links or reply until you have checked.',
  "Contact the sender using a phone number or website you already trust, not one from the message.",
  'Look closely at the sender address and the link destination for small differences.',
  'If it still feels off, report it and delete it.',
];

const actionsLow = [
  'Keep your usual caution: do not share passwords or codes with anyone who contacts you first.',
  'If anything about it later feels odd, verify with the sender through a separate channel.',
];

const actionsUnable = [
  'Add more detail, such as the full message text or the full link, and analyze it again.',
  'Until you are sure, do not click links or share personal information.',
  'If you know the sender, confirm with them using another channel such as a phone call.',
];

function base(partial: Partial<Analysis> & Pick<Analysis, 'riskLevel' | 'summary'>): Analysis {
  return {
    threatType: THREAT.generic as string,
    whyRisky: [],
    indicators: [],
    recommendedActions: [],
    educationalTopic: TOPICS.basics as string,
    confidence: 'low',
    assessmentMode: 'mock',
    urlSignals: [],
    urlChecks: null,
    disclaimer: DISCLAIMER,
    ...partial,
  };
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 6) return 'HIGH RISK';
  if (score >= 3) return 'SUSPICIOUS';
  return 'LOW RISK';
}

function analyzeMessageMock(m: MessageSignals, url: UrlSignals | null): Analysis {
  const urlFields = { urlSignals: url?.signals ?? [], urlChecks: url };
  const linkOnly = m.urls.length > 0 && m.textLength < 15;

  if (m.textLength + m.urls.join('').length < 10) {
    return base({
      riskLevel: 'UNABLE TO ASSESS',
      threatType: 'Not enough information',
      summary: 'There is not enough text here for Safi to give a useful assessment.',
      whyRisky: ['A very short message or a bare link gives too little context to judge.'],
      recommendedActions: actionsUnable,
      educationalTopic: TOPICS.basics as string,
      ...urlFields,
    });
  }

  if (linkOnly && m.score < 6) {
    const hasSignals = (url?.score ?? 0) > 0;
    return base({
      riskLevel: hasSignals ? 'SUSPICIOUS' : 'UNABLE TO ASSESS',
      threatType: hasSignals ? THREAT.link : 'Not enough information',
      summary: hasSignals
        ? 'The message is mostly a link, and the link shows some warning signs. Treat it with caution.'
        : 'The message is mostly a link with no context, so Safi cannot judge it with confidence.',
      whyRisky: ['A link with little or no explanation gives you no way to judge why it was sent.'],
      indicators: url?.signals ?? [],
      recommendedActions: hasSignals ? actionsSuspicious : actionsUnable,
      educationalTopic: TOPICS.link as string,
      confidence: 'low',
      ...urlFields,
    });
  }

  // HIGH RISK needs more than a high score: several independent text signals, a credential request,
  // or a link that is itself strongly suspicious. Otherwise two weak signals plus a short link would over-alarm.
  let level = levelFromScore(m.score);
  const strongEvidence =
    m.categories.length >= 3 || m.categories.includes('credential') || m.compounds.length > 0 || (url?.score ?? 0) >= 5;
  if (level === 'HIGH RISK' && !strongEvidence) level = 'SUSPICIOUS';
  const authLure = m.compounds.includes('authViaUnverifiedLink') || m.compounds.includes('socialEngineeringChain');
  const fraudLure = m.compounds.includes('paymentFraudPattern') || m.compounds.includes('paymentViaUnverifiedLink');
  const dominant: string | null = authLure
    ? 'credential'
    : fraudLure
      ? 'fraud'
      : m.compounds.includes('recruitmentScamPattern')
        ? 'recruitment'
        : (pick(['credential', 'payment', 'prize', 'delivery', 'fear', 'urgency'], m.categories) ??
          (m.categories.includes('changedBankDetails') ? 'fraud' : null));
  const topicKey = dominant ?? (m.urls.length ? 'link' : 'basics');
  const threatKey = dominant && dominant in THREAT ? dominant : m.urls.length ? 'link' : 'generic';
  // Combined signals are the strongest explanation, so they come first.
  const whyRisky = [...m.compounds.map((c) => COMPOUND_REASONS[c]), ...m.categories.map((c) => WHY[c])].slice(0, 10);
  // Compound reasons are already listed in whyRisky; indicators keep the individual observations.
  const indicators = m.indicators.filter((i) => !Object.values(COMPOUND_REASONS).includes(i)).slice(0, 10);
  const confidence: Confidence = level === 'HIGH RISK' && m.score >= 9 && m.categories.length >= 3 && m.urls.length > 0 ? 'high' : level === 'LOW RISK' ? 'low' : 'medium';

  if (level === 'HIGH RISK') {
    return base({
      riskLevel: level,
      threatType: THREAT[threatKey] ?? (THREAT.generic as string),
      summary: 'This message shows several strong signs of phishing. Do not follow its instructions.',
      whyRisky,
      indicators,
      recommendedActions: actionsHigh(m.urls.length > 0),
      educationalTopic: TOPICS[topicKey] ?? (TOPICS.basics as string),
      confidence,
      ...urlFields,
    });
  }
  if (level === 'SUSPICIOUS') {
    return base({
      riskLevel: level,
      threatType: THREAT[threatKey] ?? (THREAT.generic as string),
      summary: 'This message has some warning signs, but not enough to be sure. Check before you act.',
      whyRisky: whyRisky.length ? whyRisky : ['Some details look like common scam tactics.'],
      indicators,
      recommendedActions: actionsSuspicious,
      educationalTopic: TOPICS[topicKey] ?? (TOPICS.basics as string),
      confidence,
      ...urlFields,
    });
  }
  return base({
    riskLevel: 'LOW RISK',
    threatType: 'No clear threat identified',
    summary: 'Safi did not find common phishing warning signs in this message. That is not a guarantee, so stay alert.',
    whyRisky: [],
    indicators,
    recommendedActions: actionsLow,
    educationalTopic: TOPICS.basics as string,
    confidence: 'low',
    ...urlFields,
  });
}

function analyzeUrlMock(u: UrlSignals): Analysis {
  const urlFields = { urlSignals: u.signals, urlChecks: u };
  if (!u.valid) {
    return base({
      riskLevel: 'UNABLE TO ASSESS',
      threatType: 'Not enough information',
      summary: 'Safi could not read this as a web address. Check that you pasted the full link.',
      whyRisky: [],
      indicators: u.signals,
      recommendedActions: actionsUnable,
      educationalTopic: TOPICS.link as string,
      ...urlFields,
    });
  }
  const level = levelFromScore(u.score);
  const why: string[] = [];
  if (u.lookalikeOf) why.push(`It imitates the name of a well-known brand (${u.lookalikeOf}) but is not on that brand's own domain.`);
  if (u.usesIpAddress) why.push('Real organizations almost always use a website name, not a bare number address.');
  if (u.isShortened) why.push('Shortened links hide where you will end up until after you click.');
  if (u.hasCredentialPath) why.push('The address points to a sign-in or verification step, a common way to steal passwords.');
  if (u.hasUserInfo) why.push('Text before an "@" can make a link look like it goes to a trusted site when it does not.');
  if (u.hasPunycode) why.push('Special characters can make a fake address look identical to a real one.');
  if (!u.isHttps && u.signals.some((s) => s.includes('HTTPS'))) why.push('Without HTTPS, anything you type can be seen by others on the network.');

  if (level === 'HIGH RISK') {
    return base({
      riskLevel: level,
      threatType: u.lookalikeOf || u.hasCredentialPath ? 'Credential phishing link' : 'Suspicious link',
      summary: 'This link shows several strong warning signs. Do not open it or enter any information.',
      whyRisky: why,
      indicators: u.signals,
      recommendedActions: actionsHigh(true),
      educationalTopic: TOPICS.link as string,
      confidence: u.score >= 8 ? 'high' : 'medium',
      ...urlFields,
    });
  }
  if (level === 'SUSPICIOUS') {
    return base({
      riskLevel: level,
      threatType: 'Suspicious link',
      summary: 'This link has some warning signs. Be careful and check where it really leads before opening it.',
      whyRisky: why.length ? why : ['A few details of this address match common scam patterns.'],
      indicators: u.signals,
      recommendedActions: actionsSuspicious,
      educationalTopic: TOPICS.link as string,
      confidence: 'medium',
      ...urlFields,
    });
  }
  return base({
    riskLevel: 'LOW RISK',
    threatType: 'No clear threat identified',
    summary:
      'Safi found no common warning signs in this address. Basic checks cannot confirm a site is safe, so only enter personal details if you trust where the link came from.',
    whyRisky: [],
    indicators: [],
    recommendedActions: actionsLow,
    educationalTopic: TOPICS.link as string,
    confidence: 'low',
    ...urlFields,
  });
}

export function mockAnalysis(req: AnalyzeRequest, det: Deterministic = runDeterministic(req)): Analysis {
  if (req.inputType === 'screenshot') {
    return base({
      riskLevel: 'UNABLE TO ASSESS',
      threatType: 'Not enough information',
      summary:
        'Safi cannot read text from screenshots in this mode. Paste the message text or the link into Safi instead for a full check.',
      whyRisky: [],
      recommendedActions: [
        'Copy the text of the message (or the link) and use the Suspicious Message or URL tab.',
        'Until you know it is genuine, do not click links or share personal information.',
        'Crop out personal details before sharing screenshots with anyone.',
      ],
      educationalTopic: TOPICS.basics as string,
    });
  }
  if (req.inputType === 'url') return analyzeUrlMock(det.url ?? analyzeUrl(req.content));
  return analyzeMessageMock(det.message ?? analyzeMessage(req.content), det.url);
}
