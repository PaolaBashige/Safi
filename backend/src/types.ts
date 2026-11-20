export const RISK_LEVELS = ['HIGH RISK', 'SUSPICIOUS', 'LOW RISK', 'UNABLE TO ASSESS'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const INPUT_TYPES = ['message', 'url', 'screenshot'] as const;
export type InputType = (typeof INPUT_TYPES)[number];

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export type AssessmentMode = 'mock' | 'ai';

export interface AnalyzeRequest {
  inputType: InputType;
  content: string;
  metadata?: { mimeType?: string };
}

/** Structured result of the deterministic URL checks. These are signals, not proof. */
export interface UrlSignals {
  valid: boolean;
  hostname: string | null;
  isHttps: boolean;
  usesIpAddress: boolean;
  isShortened: boolean;
  hasPunycode: boolean;
  hasExcessiveSubdomains: boolean;
  hasSuspiciousTld: boolean;
  hasSuspiciousEncoding: boolean;
  hasUserInfo: boolean;
  isUnusuallyLong: boolean;
  hasCredentialPath: boolean;
  lookalikeOf: string | null;
  /** Weighted sum of the signals above. Higher means more warning signs. */
  score: number;
  /** Part of `score` that comes from the host itself (IP, shortener, look-alike, odd TLD, ...). */
  hostScore: number;
  /** Part of `score` that comes only from login/verify wording in the path. Weak evidence on its own. */
  pathScore: number;
  /** Plain-language descriptions of each signal found. */
  signals: string[];
}

export interface Analysis {
  riskLevel: RiskLevel;
  threatType: string;
  summary: string;
  whyRisky: string[];
  indicators: string[];
  recommendedActions: string[];
  educationalTopic: string;
  confidence: Confidence;
  assessmentMode: AssessmentMode;
  /** Plain-language URL signals (empty when no URL was checked). */
  urlSignals: string[];
  /** Structured URL checks (null when no URL was checked). */
  urlChecks: UrlSignals | null;
  disclaimer: string;
}

export const DISCLAIMER =
  'Safi is an educational tool. Its assessment is based on common warning signs and is not a guarantee ' +
  'that something is safe or malicious. When in doubt, contact the organization using a phone number or ' +
  'website you already trust, not one from the message.';
