/**
 * Does a message ASK the reader for a secret, or merely MENTION one?
 *
 * "Reply with your password" asks. "Never share your password" and "you will be asked for a verification
 * code later" mention. Matching the word "password" anywhere (the previous behaviour) rated a security
 * notice that warns against phishing the same as the phishing it warns about.
 *
 * The decision is made one sentence at a time, in this order:
 *   1. protective   "never share / we will never ask for / do not send ... <secret>"       -> not a request
 *   2. informational "you will be asked for / a code will be required", or a description of what
 *                    scammers do, with no verb asking the reader to provide it            -> not a request
 *   3. request      a verb that asks the reader to provide, confirm, reset or enter it     -> a request
 *   4. otherwise    a bare mention                                                         -> ignored
 *
 * Deterministic and pure: no network, no dates.
 */

// A secret the sender should never need to ask for by message.
const SECRET = String.raw`(?:\bpass(?:word|code|phrase)s?\b|\bone[- ]time[- ](?:code|passcode|password|pin)s?\b|\b(?:verification|security|authentication|authenticator|confirmation|access|login|log-in|sign-in|sms)\s+codes?\b|\botps?\b|\bpins?\b|\b(?:2fa|mfa)\b(?:\s+codes?)?|\bcredentials?\b|\bssn\b|\bsocial\s+security(?:\s+numbers?)?|\bcvv\b|\bcard\s+(?:number|details)\b|\brecovery\s+(?:key|phrase|code)s?\b|\bseed\s+phrase\b)`;

// Account-level things that are not secrets but are what "verify your account" phishing is about.
// Deliberately excludes bare "details": "employment details" or "contact details" are ordinary information.
const ACCOUNT_OBJECT = String.raw`(?:\baccount\b|\bidentity\b|\blog-?in\b|\bbilling\b|\bcard\b|\bpayment\s+(?:info|information|details)\b|\b(?:account|login|card|billing|bank|banking|security|identity|payment)\s+(?:details|information|info)\b)`;

// Verbs that ask the reader to hand over, confirm or reset something.
const REQUEST_VERB = String.raw`(?:enter|re-?enter|provide|send|submit|share|give|supply|type|input|forward|disclose|reveal|tell|read(?:\s+out)?|text|email|reply(?:\s+with)?|confirm|verify|validate|update|reset|change|renew|restore|unlock|authenticate)`;

const re = (source: string) => new RegExp(source, 'i');

/** "Enter your verification code", "reply with your password", "send us the OTP". */
const REQUEST_SECRET = re(String.raw`\b${REQUEST_VERB}\b[^.!?\n]{0,60}?${SECRET}`);
/** "Verify your account", "confirm your identity", "update your billing information". */
const REQUEST_ACCOUNT = re(String.raw`\b(?:verify|confirm|update|validate|re-?enter|restore)\b[^.!?\n]{0,45}?${ACCOUNT_OBJECT}`);
/** "Sign in with your work email and password", "log in ... using your credentials". */
const REQUEST_SIGNIN = re(String.raw`\b(?:sign|log)[- ]?in\b[^.!?\n]{0,60}?\b(?:with|using|via|through)\b[^.!?\n]{0,30}?${SECRET}`);
/** "Your password is required", "SSN needed". Not "a code will be required". */
const REQUIRED_SECRET = re(String.raw`${SECRET}\s+(?:(?:is|are)\s+)?(?:now\s+|also\s+)?(?:required|needed|necessary|mandatory)\b`);
/** "We need your password". */
const WE_NEED_SECRET = re(String.raw`\b(?:we|i)\s+(?:will\s+)?(?:need|require)\b[^.!?\n]{0,30}?${SECRET}`);

const PROTECTIVE_VERB = String.raw`(?:ask|request|share|send|give|disclose|reveal|tell|provide|enter|reply|email|text|forward|read|submit|type|supply|divulge|post|hand|release|use|click)\w*`;
const NEGATION = String.raw`\b(?:never|not|don'?t|won'?t|can'?t|cannot|shouldn'?t|mustn'?t|no\s+one|nobody)`;

/** "Never share your X", "we will never ask for X", "do not send X by email". `object` is a regex source. */
function protectivePattern(object: string): RegExp {
  const forward = String.raw`${NEGATION}\s+(?:\w+\s+){0,3}?${PROTECTIVE_VERB}(?:\s+[\w']+){0,6}?\s+${object}`;
  const passive = String.raw`${object}(?:\s+[\w']+){0,4}?\s+(?:should|must|will|would|can|may)\s+(?:never|not)\b`;
  return re(`${forward}|${passive}`);
}
const PROTECTIVE = protectivePattern(`(?:${SECRET}|${ACCOUNT_OBJECT})`);

/** "You will be asked for ...", "a code will be required", "will be sent to your phone". */
const FUTURE_USE = re(
  String.raw`(?:\bwill|\bmay|\bmight|\bwould|\bcould|\bcan|'ll)\s+(?:also\s+|then\s+|soon\s+|later\s+)?(?:be\s+)?(?:need|needs|needed|require|required|asked|prompted|requested|expected|sent|receive|given|issued|displayed)\b`,
);
/** "Scammers often ask for your password". Describes the threat, does not make it. */
const DESCRIBES_THREAT = re(
  String.raw`\b(?:scammers?|attackers?|phishers?|fraudsters?|criminals?|hackers?|phishing\s+(?:emails?|messages?|attempts?|attacks?)|fake\s+(?:emails?|messages?|websites?))\b[^.!?\n]{0,60}?\b(?:ask|request|trick|try|demand)\w*`,
);

const MENTIONS_OBJECT = re(`${SECRET}|${ACCOUNT_OBJECT}`);

export interface CredentialLanguage {
  /** At least one sentence genuinely asks the reader to provide, confirm, reset or enter a secret. */
  request: boolean;
  /** At least one sentence warns against sharing a secret ("never share your password"). */
  protective: boolean;
  /** At least one sentence only describes future or generic use ("you will be asked for a code"). */
  informational: boolean;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function classifyCredentialLanguage(text: string): CredentialLanguage {
  const out: CredentialLanguage = { request: false, protective: false, informational: false };
  for (const sentence of splitSentences(text)) {
    if (!MENTIONS_OBJECT.test(sentence)) continue;
    if (PROTECTIVE.test(sentence)) {
      out.protective = true;
      continue;
    }
    const asks =
      REQUEST_SECRET.test(sentence) ||
      REQUEST_ACCOUNT.test(sentence) ||
      REQUEST_SIGNIN.test(sentence) ||
      REQUIRED_SECRET.test(sentence) ||
      WE_NEED_SECRET.test(sentence);
    if (!asks && (FUTURE_USE.test(sentence) || DESCRIBES_THREAT.test(sentence))) {
      out.informational = true;
      continue;
    }
    if (asks) out.request = true;
  }
  return out;
}

// Identity documents and sensitive personal details. Not secrets, but a lure that collects them is
// collecting what identity theft needs. "Verify your employment details" is not on this list.
const IDENTITY_DOCUMENT = String.raw`(?:\bdate\s+of\s+birth\b|\bdob\b|\bbirth\s?date\b|\bgovernment(?:[- ]issued)?(?:\s+photo)?\s+(?:id|identification)\b|\bgovernment[- ]issued\b|\bphoto\s?id\b|\bid\s+(?:card|document|scan|photo)s?\b|\bpassport(?:\s+(?:number|copy|scan|photo))?\b|\bdriver'?s?\s+licen[sc]e\b|\bnational\s+id(?:entity)?(?:\s+(?:card|number))?\b|\bidentity\s+(?:card|document)s?\b|\bcopy\s+of\s+your\s+id\b|\bproof\s+of\s+identity\b)`;
const IDENTITY_VERB = String.raw`(?:upload|submit|send|provide|attach|share|confirm|enter|supply|scan|photograph|include|give|email|reply\s+with|verify|complete)`;
const REQUEST_IDENTITY = re(String.raw`\b${IDENTITY_VERB}\b[^.!?\n]{0,70}?${IDENTITY_DOCUMENT}`);
const PROTECTIVE_IDENTITY = protectivePattern(IDENTITY_DOCUMENT);

/** Does the message ask the reader to upload or provide an ID document or date of birth? */
export function requestsIdentityDocuments(text: string): boolean {
  return splitSentences(text).some((s) => REQUEST_IDENTITY.test(s) && !PROTECTIVE_IDENTITY.test(s));
}
