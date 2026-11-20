import {
  CONFIDENCE_LEVELS,
  DISCLAIMER,
  INPUT_TYPES,
  RISK_LEVELS,
  type Analysis,
  type AnalyzeRequest,
  type Confidence,
  type RiskLevel,
  type UrlSignals,
} from './types';

export const LIMITS = {
  messageChars: 5000,
  urlChars: 2048,
  /** Max decoded screenshot size in bytes. */
  imageBytes: 3.5 * 1024 * 1024,
  /** Max raw request body size in bytes (screenshot base64 is ~4/3 of the image size). */
  bodyBytesText: 32 * 1024,
  bodyBytesImage: 5 * 1024 * 1024,
} as const;

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
type ImageMime = (typeof ALLOWED_IMAGE_TYPES)[number];

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function sniffImage(bytes: Buffer): ImageMime | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Validate and normalize an incoming /analyze request body. Throws ApiError on any problem. */
export function validateRequest(body: unknown): AnalyzeRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ApiError(400, 'invalid_request', 'Request body must be a JSON object.');
  }
  const { inputType, content, metadata } = body as Record<string, unknown>;

  if (typeof inputType !== 'string' || !(INPUT_TYPES as readonly string[]).includes(inputType)) {
    throw new ApiError(400, 'invalid_input_type', 'inputType must be "message", "url" or "screenshot".');
  }
  if (typeof content !== 'string') {
    throw new ApiError(400, 'invalid_content', 'content must be a string.');
  }
  const type = inputType as AnalyzeRequest['inputType'];

  if (type === 'message') {
    const text = content.replace(/\u0000/g, '').trim();
    if (text.length === 0) throw new ApiError(400, 'empty_content', 'Please enter a message to analyze.');
    if (text.length > LIMITS.messageChars) {
      throw new ApiError(413, 'content_too_long', `Messages are limited to ${LIMITS.messageChars} characters.`);
    }
    return { inputType: type, content: text };
  }

  if (type === 'url') {
    const text = content.replace(/\u0000/g, '').trim();
    if (text.length === 0) throw new ApiError(400, 'empty_content', 'Please enter a URL to analyze.');
    if (text.length > LIMITS.urlChars) {
      throw new ApiError(413, 'content_too_long', `URLs are limited to ${LIMITS.urlChars} characters.`);
    }
    return { inputType: type, content: text };
  }

  // screenshot
  const claimedMime =
    typeof metadata === 'object' && metadata !== null && typeof (metadata as Record<string, unknown>).mimeType === 'string'
      ? ((metadata as Record<string, unknown>).mimeType as string).toLowerCase()
      : '';
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(claimedMime)) {
    throw new ApiError(415, 'unsupported_image_type', 'Screenshots must be PNG, JPEG, WebP or GIF images.');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content) || content.length === 0) {
    throw new ApiError(400, 'invalid_image', 'The screenshot data could not be read.');
  }
  const bytes = Buffer.from(content, 'base64');
  if (bytes.length > LIMITS.imageBytes) {
    throw new ApiError(413, 'image_too_large', 'Screenshots must be smaller than 3.5 MB.');
  }
  const sniffed = sniffImage(bytes);
  if (!sniffed || sniffed !== claimedMime) {
    throw new ApiError(415, 'unsupported_image_type', 'The file does not look like the image type it claims to be.');
  }
  return { inputType: type, content, metadata: { mimeType: claimedMime } };
}

// ---------------------------------------------------------------------------------------------
// Model output validation
// ---------------------------------------------------------------------------------------------

export class ModelOutputError extends Error {}

const clean = (value: unknown, max: number): string =>
  String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/<[^>]*>/g, '') // strip anything tag-like
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

function stringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' && typeof item !== 'number') continue;
    const s = clean(item, maxLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

const RISK_ORDER: Record<RiskLevel, number> = { 'LOW RISK': 0, 'UNABLE TO ASSESS': 1, SUSPICIOUS: 2, 'HIGH RISK': 3 };

function normalizeRiskLevel(value: unknown): RiskLevel | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toUpperCase().replace(/[_-]+/g, ' ');
  return (RISK_LEVELS as readonly string[]).includes(v) ? (v as RiskLevel) : null;
}

/**
 * Extract the first JSON object from model text. Models sometimes wrap JSON in code fences or add prose.
 */
export function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) throw new ModelOutputError('No JSON object found in model output.');
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    throw new ModelOutputError('Model output was not valid JSON.');
  }
}

export interface SanitizeContext {
  urlChecks: UrlSignals | null;
  /** Deterministic checks found strong warning signs; the model may not rate the input below SUSPICIOUS. */
  strongDeterministicRisk: boolean;
}

/**
 * Validate and sanitize a parsed model response. Never trusts the model for: assessmentMode,
 * urlSignals/urlChecks, or the disclaimer, which are all set by the server.
 */
export function sanitizeModelOutput(raw: unknown, ctx: SanitizeContext): Analysis {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ModelOutputError('Model output was not a JSON object.');
  }
  const r = raw as Record<string, unknown>;

  let riskLevel = normalizeRiskLevel(r.riskLevel);
  if (!riskLevel) throw new ModelOutputError('Model output had a missing or invalid riskLevel.');

  const summary = typeof r.summary === 'string' ? clean(r.summary, 400) : '';
  if (!summary) throw new ModelOutputError('Model output had no summary.');

  const confidenceRaw = typeof r.confidence === 'string' ? r.confidence.toLowerCase().trim() : '';
  let confidence: Confidence = (CONFIDENCE_LEVELS as readonly string[]).includes(confidenceRaw)
    ? (confidenceRaw as Confidence)
    : 'low';

  const whyRisky = stringArray(r.whyRisky, 6, 220);
  const indicators = stringArray(r.indicators, 8, 180);
  let recommendedActions = stringArray(r.recommendedActions, 6, 220);
  if (recommendedActions.length === 0) {
    recommendedActions = [
      'Do not click links or share personal information until you have verified the message.',
      'Contact the sender using a phone number or website you already trust.',
    ];
  }

  // Safety floor: the model must not downgrade strong deterministic warning signs.
  if (ctx.strongDeterministicRisk && RISK_ORDER[riskLevel] < RISK_ORDER.SUSPICIOUS) {
    riskLevel = 'SUSPICIOUS';
    confidence = 'low';
    whyRisky.unshift('Basic checks on the link found strong warning signs, so Safi is advising caution.');
  }

  return {
    riskLevel,
    threatType: clean(r.threatType ?? 'Possible phishing', 60) || 'Possible phishing',
    summary,
    whyRisky: whyRisky.slice(0, 6),
    indicators,
    recommendedActions,
    educationalTopic: clean(r.educationalTopic ?? 'The basics of spotting phishing', 100) || 'The basics of spotting phishing',
    confidence,
    assessmentMode: 'ai',
    urlSignals: ctx.urlChecks?.signals ?? [],
    urlChecks: ctx.urlChecks,
    disclaimer: DISCLAIMER,
  };
}
