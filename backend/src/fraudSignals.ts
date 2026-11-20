import { splitSentences } from './credentialLanguage';

/**
 * Building blocks for two fraud patterns that carry no password request and often no link:
 *  - recruitment lures (an attractive offer that ends in ID and personal-detail collection), and
 *  - payment diversion / business email compromise (a payment request with changed bank details,
 *    urgency, secrecy, or an "executive" who cannot be reached).
 *
 * Each flag is a weak, ordinary signal on its own (plenty of real jobs pay well, and real invoices ask
 * for payment). They only mean something in combination, which messageSignals.ts decides.
 */

export interface FraudFlags {
  /** The text is about a job, role, hiring or pay. Context for the recruitment flags, never a risk by itself. */
  jobContext: boolean;
  highCompensation: boolean;
  /** "No interview", "hired immediately", "guaranteed position". */
  fastHire: boolean;
  /** Pressure to finish a job application step quickly ("positions fill fast", "complete this by Thursday"). */
  recruitUrgency: boolean;
  /** Asks the reader to send, wire, process or release a payment or transfer. */
  paymentInstruction: boolean;
  /** Says bank or payment details changed, or asks to update them. */
  changedBankDetails: boolean;
  /** The sender says they are in meetings, cannot take calls, or are otherwise hard to verify. */
  executivePretext: boolean;
  /** A payment instruction that must happen today / immediately. */
  urgentPayment: boolean;
}

const JOB_CONTEXT =
  /\b(?:job|role|position|opening|vacancy|opportunity|hiring|recruit(?:er|ment|ing)?|candidate|employer|career|salary|compensation|offer\s+(?:letter|paperwork)|onboarding|talent)\b/i;

const FAST_HIRE = new RegExp(
  [
    String.raw`\bno\s+(?:formal\s+)?interviews?\b`,
    String.raw`\bwithout\s+(?:an?\s+)?(?:formal\s+)?interviews?\b`,
    String.raw`\b(?:skip|waive)\w*\s+(?:the\s+)?interviews?\b`,
    String.raw`\bno\s+(?:experience|resume|cv|qualifications?)\s+(?:needed|required|necessary)\b`,
    String.raw`\b(?:hired|hire\s+you|start)\s+(?:immediately|on\s+the\s+spot|right\s+away)\b`,
    String.raw`\bimmediate(?:ly)?\s+(?:hir(?:e|ing)|start)\b`,
    String.raw`\bdirect(?:ly)?\s+hir(?:e|ing)\b`,
    String.raw`\bguaranteed\s+(?:job|position|interview|hire)\b`,
  ].join('|'),
  'i',
);

const RECRUIT_URGENCY = new RegExp(
  [
    String.raw`\bfill(?:s|ed)?\s+(?:up\s+)?(?:fast|quickly)\b`,
    String.raw`\bfilling\s+(?:up\s+)?(?:fast|quickly)\b`,
    String.raw`\binterviews?\s+(?:are|is)\s+being\s+scheduled\b`,
    String.raw`\blimited\s+(?:openings|positions|spots)\b`,
    String.raw`\bcomplete\s+this\s+(?:by|today|now|within)\b`,
    String.raw`\bapply\s+(?:today|now|immediately)\b`,
    String.raw`\brespond\s+(?:today|within|immediately)\b`,
  ].join('|'),
  'i',
);

const ANNUAL_FACTOR: Record<string, number> = {
  year: 1, yr: 1, annum: 1, annual: 1, annually: 1, yearly: 1,
  month: 12, mo: 12, monthly: 12,
  week: 52, wk: 52, weekly: 52,
  hour: 2080, hr: 2080, hourly: 2080,
};
const HIGH_PAY_ANNUAL = 120_000;
const PAY_WORDS = /(?:salary|compensation|pay|paid|earn|income|wage|offer|package|rate|base|bonus)/i;

/** Pay figures in the text, converted to a yearly equivalent, compared with a high threshold. */
function mentionsHighPay(text: string): boolean {
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?(k\b)?/gi)) {
    const idx = m.index ?? 0;
    const before = text.slice(Math.max(0, idx - 60), idx);
    const after = text.slice(idx + m[0].length, idx + m[0].length + 30);
    if (!PAY_WORDS.test(before + ' ' + after)) continue;
    let amount = Number((m[1] ?? '0').replace(/,/g, ''));
    if (m[2]) amount *= 1000;
    const unit = /(?:per|a|\/|each)\s*(year|yr|annum|month|mo|week|wk|hour|hr)\b|\b(annually|yearly|monthly|weekly|hourly)\b/i.exec(after);
    const factor = unit ? (ANNUAL_FACTOR[(unit[1] ?? unit[2] ?? '').toLowerCase()] ?? 1) : amount >= 50_000 ? 1 : 0;
    if (factor > 0 && amount * factor >= HIGH_PAY_ANNUAL) return true;
  }
  return false;
}

// "Send the payment", "wire the funds", "process the invoice", "make a transfer of $18,400".
const PAYMENT_INSTRUCTION =
  /\b(?:send|wire|transfer|process|release|remit|make|initiate|arrange|issue)\b[^.!?\n]{0,40}?\b(?:payments?|funds|wires?|transfers?|invoices?|[$£€]\s?\d[\d,]*(?:\.\d{1,2})?)/i;

// Changed bank details: "their bank details have changed", "new account details", "update the banking information".
const CHANGED_BANK = new RegExp(
  [
    String.raw`\b(?:changed|changing|updated|updating|revised|new|different|switched|moved)\b[^.!?\n]{0,30}?\b(?:bank|banking|account|payment|payee|wire|remittance|iban|routing)\b[^.!?\n]{0,20}?\b(?:details|information|info|instructions|number|account)\b`,
    String.raw`\b(?:bank|banking|payment|remittance|wire)\s+(?:details|information|info|instructions|account)\b[^.!?\n]{0,25}?\b(?:have\s+|has\s+|had\s+)?(?:changed|been\s+(?:changed|updated|revised)|are\s+(?:now\s+)?different)\b`,
    String.raw`\bupdate\s+(?:the\s+|their\s+|our\s+|your\s+)?(?:bank|banking|payment|remittance|wire)\b[^.!?\n]{0,15}(?:details|information|info|instructions)`,
    String.raw`\b(?:send|pay|wire|transfer|remit)\b[^.!?\n]{0,40}\b(?:to|into)\s+(?:the\s+|our\s+|this\s+)?(?:new|different|updated|following)\s+(?:bank\s+)?(?:account|iban|details)`,
  ].join('|'),
  'i',
);
/** "Bank details unchanged", "no changes to our banking details": not a change. */
const NOT_CHANGED = /\b(?:no|not|never|without)\s+(?:\w+\s+){0,2}?(?:chang\w+|updat\w+)|\bunchanged\b|\bremain(?:s|ed)?\s+(?:the\s+same|unchanged)\b|\bhaven'?t\s+changed\b/i;

const EXECUTIVE_PRETEXT = new RegExp(
  [
    String.raw`\b(?:i(?:'m|\s+am)|we(?:'re|\s+are))\s+(?:currently\s+|still\s+)?(?:tied\s+up|stuck|unavailable|travell?ing|traveling|in\s+(?:a\s+|back[- ]to[- ]back\s+)?(?:meetings?|conference|training|court)|on\s+(?:a\s+|the\s+)?(?:flight|plane|trip))`,
    String.raw`\b(?:can(?:'t|not)|unable\s+to|won'?t\s+be\s+able\s+to)\s+(?:take|answer|talk|speak|accept|receive|make)\s+(?:any\s+)?(?:calls?|phone|a\s+call|the\s+phone)`,
    String.raw`\bonly\s+(?:reachable|available|contactable)\s+(?:by|via)\s+(?:email|text)`,
    String.raw`\b(?:don'?t|do\s+not)\s+call\s+(?:me|the\s+office)`,
  ].join('|'),
  'i',
);

const URGENT_WORD =
  /\b(?:today|now|immediately|asap|right\s+away|urgent(?:ly)?|this\s+(?:afternoon|morning)|tonight|by\s+(?:end\s+of\s+day|eod|close\s+of\s+business|cob|noon)|as\s+soon\s+as\s+possible|before\s+(?:end\s+of\s+day|eod|close\s+of\s+business|cob|noon)|same\s+day)\b/i;

/** A warning ("never send payment to a new account") is not an instruction. */
const WARNING_SENTENCE = /\b(?:never|do\s+not|don'?t|will\s+not|won'?t|beware|scam|fraud)\b/i;

export function detectFraudFlags(text: string): FraudFlags {
  const flags: FraudFlags = {
    jobContext: JOB_CONTEXT.test(text),
    highCompensation: JOB_CONTEXT.test(text) && mentionsHighPay(text),
    fastHire: FAST_HIRE.test(text),
    recruitUrgency: RECRUIT_URGENCY.test(text),
    paymentInstruction: false,
    changedBankDetails: false,
    executivePretext: false,
    urgentPayment: false,
  };
  for (const sentence of splitSentences(text)) {
    if (WARNING_SENTENCE.test(sentence)) continue;
    if (PAYMENT_INSTRUCTION.test(sentence)) {
      flags.paymentInstruction = true;
      if (URGENT_WORD.test(sentence)) flags.urgentPayment = true;
    }
    if (CHANGED_BANK.test(sentence) && !NOT_CHANGED.test(sentence)) flags.changedBankDetails = true;
    if (EXECUTIVE_PRETEXT.test(sentence)) flags.executivePretext = true;
  }
  return flags;
}
