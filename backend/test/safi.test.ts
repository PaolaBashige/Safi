import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { analyze, loadConfig, type Config } from '../src/analysis';
import { createHandler } from '../src/handler';
import { analyzeMessage, institutionNameFragments } from '../src/messageSignals';
import { mockAnalysis } from '../src/mock';
import { analyzeUrl, extractUrls } from '../src/urlAnalysis';
import { ApiError, extractJson, ModelOutputError, sanitizeModelOutput, validateRequest } from '../src/validate';

const MOCK: Config = { mockAi: true, region: 'us-east-1', modelId: 'test-model' };
const LIVE: Config = { mockAi: false, region: 'us-east-1', modelId: 'test-model' };

const PHISH =
  'URGENT: Your bank account has been suspended. Verify your account immediately: https://example.com/verify';

function event(body: unknown, overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /analyze',
    rawPath: '/analyze',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    isBase64Encoded: false,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    requestContext: { requestId: 'test', http: { method: 'POST', path: '/analyze' } } as APIGatewayProxyEventV2['requestContext'],
    ...overrides,
  } as APIGatewayProxyEventV2;
}

describe('URL analysis', () => {
  it('flags nothing on an ordinary https URL', () => {
    const s = analyzeUrl('https://www.python.org/downloads/');
    expect(s.valid).toBe(true);
    expect(s.isHttps).toBe(true);
    expect(s.score).toBe(0);
    expect(s.signals).toEqual([]);
  });

  it('detects http, IP address, credential path', () => {
    const s = analyzeUrl('http://192.168.4.7/secure/login/verify');
    expect(s.isHttps).toBe(false);
    expect(s.usesIpAddress).toBe(true);
    expect(s.hasCredentialPath).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(5);
  });

  it('detects shorteners, punycode, excessive subdomains, odd TLDs and userinfo', () => {
    expect(analyzeUrl('https://bit.ly/3xYz').isShortened).toBe(true);
    expect(analyzeUrl('https://xn--pypal-4ve.com').hasPunycode).toBe(true);
    expect(analyzeUrl('https://a.b.c.d.example.com/').hasExcessiveSubdomains).toBe(true);
    expect(analyzeUrl('https://free-prize.xyz/').hasSuspiciousTld).toBe(true);
    expect(analyzeUrl('https://paypal.com@evil.example/').hasUserInfo).toBe(true);
  });

  it('detects suspicious encoding and unusual length', () => {
    expect(analyzeUrl('https://example.com/%61%62%63%64%65').hasSuspiciousEncoding).toBe(true);
    expect(analyzeUrl(`https://example.com/${'a'.repeat(200)}`).isUnusuallyLong).toBe(true);
  });

  it('detects look-alike domains but not the real brand site', () => {
    expect(analyzeUrl('https://paypa1.com/signin').lookalikeOf).toBe('paypal');
    expect(analyzeUrl('https://paypal.com.account-check.top/').lookalikeOf).toBe('paypal');
    expect(analyzeUrl('https://secure-microsoft-login.com/').lookalikeOf).toBe('microsoft');
    expect(analyzeUrl('https://www.paypal.com/').lookalikeOf).toBeNull();
    expect(analyzeUrl('https://login.microsoftonline.com/').lookalikeOf).toBeNull();
    expect(analyzeUrl('https://s3.amazonaws.com/').lookalikeOf).toBeNull();
  });

  it('handles bad input without throwing', () => {
    expect(analyzeUrl('not a url').valid).toBe(false);
    expect(analyzeUrl('javascript:alert(1)').score).toBeGreaterThan(0);
    expect(analyzeUrl('').valid).toBe(false);
  });
});

describe('mock analysis', () => {
  it('rates a classic phishing message HIGH RISK', async () => {
    const { analysis } = await analyze({ inputType: 'message', content: PHISH }, MOCK);
    expect(analysis.riskLevel).toBe('HIGH RISK');
    expect(analysis.assessmentMode).toBe('mock');
    expect(analysis.whyRisky.length).toBeGreaterThan(1);
    expect(analysis.recommendedActions.join(' ')).toMatch(/not click/i);
  });

  it('rates an ordinary message LOW RISK', async () => {
    const { analysis } = await analyze({ inputType: 'message', content: 'Hi team, lunch is at noon tomorrow in the break room.' }, MOCK);
    expect(analysis.riskLevel).toBe('LOW RISK');
  });

  it('is cautious about uncertain cases', async () => {
    const delivery = await analyze(
      { inputType: 'message', content: 'Your package could not be delivered. Click here to reschedule: http://bit.ly/3xYz' },
      MOCK,
    );
    expect(delivery.analysis.riskLevel).toBe('SUSPICIOUS');

    const tooShort = await analyze({ inputType: 'message', content: 'hello' }, MOCK);
    expect(tooShort.analysis.riskLevel).toBe('UNABLE TO ASSESS');

    const bareLink = await analyze({ inputType: 'message', content: 'https://example.org/page' }, MOCK);
    expect(bareLink.analysis.riskLevel).toBe('UNABLE TO ASSESS');
  });

  it('gives different answers for different inputs', async () => {
    const a = await analyze({ inputType: 'message', content: PHISH }, MOCK);
    const b = await analyze({ inputType: 'message', content: 'Reminder: the quarterly report is due on Friday afternoon.' }, MOCK);
    expect(a.analysis.riskLevel).not.toBe(b.analysis.riskLevel);
  });

  it('never calls a URL definitively safe', async () => {
    const { analysis } = await analyze({ inputType: 'url', content: 'https://www.python.org/' }, MOCK);
    expect(analysis.riskLevel).toBe('LOW RISK');
    expect(analysis.summary).toMatch(/cannot confirm|not a guarantee|basic checks/i);
    expect(analysis.confidence).toBe('low');
  });

  it('rates a stacked-signal URL HIGH RISK and returns structured checks', async () => {
    const { analysis } = await analyze({ inputType: 'url', content: 'http://paypa1-secure-login.top/verify/account' }, MOCK);
    expect(analysis.riskLevel).toBe('HIGH RISK');
    expect(analysis.urlChecks?.lookalikeOf).toBe('paypal');
    expect(analysis.urlSignals.length).toBeGreaterThan(2);
  });

  it('does not pretend to read screenshots in mock mode', async () => {
    const { analysis } = await analyze({ inputType: 'screenshot', content: 'AAAA', metadata: { mimeType: 'image/png' } }, MOCK);
    expect(analysis.riskLevel).toBe('UNABLE TO ASSESS');
  });
});

describe('request validation', () => {
  it('accepts valid requests', () => {
    expect(validateRequest({ inputType: 'url', content: ' https://example.com ' }).content).toBe('https://example.com');
  });

  it('rejects bad shapes and enums', () => {
    expect(() => validateRequest(null)).toThrow(ApiError);
    expect(() => validateRequest([])).toThrow(ApiError);
    expect(() => validateRequest({ inputType: 'video', content: 'x' })).toThrow(ApiError);
    expect(() => validateRequest({ inputType: 'message' })).toThrow(ApiError);
    expect(() => validateRequest({ inputType: 'message', content: '   ' })).toThrow(ApiError);
  });

  it('enforces length limits', () => {
    expect(() => validateRequest({ inputType: 'message', content: 'a'.repeat(5001) })).toThrow(/limited/);
    expect(() => validateRequest({ inputType: 'url', content: `https://x.com/${'a'.repeat(2100)}` })).toThrow(/limited/);
  });

  it('validates screenshots by declared type, base64 and magic bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
    expect(validateRequest({ inputType: 'screenshot', content: png, metadata: { mimeType: 'image/png' } }).inputType).toBe('screenshot');
    expect(() => validateRequest({ inputType: 'screenshot', content: png, metadata: { mimeType: 'image/jpeg' } })).toThrow(/claims/);
    expect(() => validateRequest({ inputType: 'screenshot', content: png, metadata: { mimeType: 'application/pdf' } })).toThrow(/PNG/);
    expect(() => validateRequest({ inputType: 'screenshot', content: '!!!notbase64', metadata: { mimeType: 'image/png' } })).toThrow(ApiError);
    const big = Buffer.alloc(4 * 1024 * 1024, 1).toString('base64');
    expect(() => validateRequest({ inputType: 'screenshot', content: big, metadata: { mimeType: 'image/png' } })).toThrow(/smaller/);
  });
});

describe('handler', () => {
  const h = createHandler({ config: () => MOCK });

  it('returns analysis JSON for a valid request', async () => {
    const res = await h(event({ inputType: 'message', content: PHISH }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.riskLevel).toBe('HIGH RISK');
    expect(body.disclaimer).toBeTruthy();
  });

  it('rejects invalid requests with safe errors', async () => {
    const bad = await h(event({ inputType: 'nope', content: 'x' }));
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body as string).error.code).toBe('invalid_input_type');

    const notJson = await h(event('{oops'));
    expect(notJson.statusCode).toBe(400);

    const wrongType = await h(event({}, { headers: { 'content-type': 'text/plain' } }));
    expect(wrongType.statusCode).toBe(415);

    const noBody = await h(event('', { body: undefined }));
    expect(noBody.statusCode).toBe(400);
  });

  it('rejects oversized requests', async () => {
    const res = await h(event({ inputType: 'message', content: 'a'.repeat(40_000) }));
    expect(res.statusCode).toBe(413);
  });

  it('routes health, unknown paths and wrong methods', async () => {
    const health = await h(event('', { rawPath: '/health', requestContext: { http: { method: 'GET' } } as APIGatewayProxyEventV2['requestContext'] }));
    expect(health.statusCode).toBe(200);
    expect((await h(event({}, { rawPath: '/nope' }))).statusCode).toBe(404);
    const wrongMethod = await h(event({}, { requestContext: { http: { method: 'GET' } } as APIGatewayProxyEventV2['requestContext'] }));
    expect(wrongMethod.statusCode).toBe(405);
  });

  it('does not log submitted content', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await h(event({ inputType: 'message', content: 'my secret password is hunter2, please verify' }));
    const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
    spy.mockRestore();
    expect(logged).not.toMatch(/hunter2/);
    expect(logged).toMatch(/analyzed/);
  });

  it('returns a generic 500 and no stack trace on unexpected failure', async () => {
    const boom = createHandler({
      config: () => {
        throw new Error('internal secret detail');
      },
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await boom(event({ inputType: 'message', content: 'hello there friend' }));
    errSpy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(res.body as string).not.toMatch(/internal secret detail|stack/i);
  });
});

describe('model output validation', () => {
  const ctx = { urlChecks: null, strongDeterministicRisk: false };

  it('accepts and sanitizes well-formed JSON, even inside code fences', () => {
    const raw = extractJson('Here you go:\n```json\n{"riskLevel":"high risk","summary":"<b>Looks</b> like phishing.","confidence":"MEDIUM","whyRisky":["a","b"],"recommendedActions":["Do not click"]}\n```');
    const a = sanitizeModelOutput(raw, ctx);
    expect(a.riskLevel).toBe('HIGH RISK');
    expect(a.summary).toBe('Looks like phishing.');
    expect(a.confidence).toBe('medium');
    expect(a.assessmentMode).toBe('ai');
  });

  it('rejects malformed or invalid output', () => {
    expect(() => extractJson('no json here')).toThrow(ModelOutputError);
    expect(() => extractJson('{"riskLevel": ')).toThrow(ModelOutputError);
    expect(() => sanitizeModelOutput('string', ctx)).toThrow(ModelOutputError);
    expect(() => sanitizeModelOutput({ riskLevel: 'EXTREME', summary: 'x' }, ctx)).toThrow(/riskLevel/);
    expect(() => sanitizeModelOutput({ riskLevel: 'HIGH RISK' }, ctx)).toThrow(/summary/);
  });

  it('validates every risk level and applies defaults', () => {
    for (const level of ['HIGH RISK', 'SUSPICIOUS', 'LOW RISK', 'UNABLE TO ASSESS']) {
      const a = sanitizeModelOutput({ riskLevel: level, summary: 's' }, ctx);
      expect(a.riskLevel).toBe(level);
      expect(a.confidence).toBe('low');
      expect(a.recommendedActions.length).toBeGreaterThan(0);
    }
  });

  it('limits array sizes and string lengths and ignores server-owned fields', () => {
    const a = sanitizeModelOutput(
      {
        riskLevel: 'SUSPICIOUS',
        summary: 'x'.repeat(2000),
        whyRisky: Array.from({ length: 50 }, (_, i) => `reason ${i}`),
        indicators: Array.from({ length: 50 }, (_, i) => `ind ${i}`),
        recommendedActions: Array.from({ length: 50 }, (_, i) => `act ${i}`),
        assessmentMode: 'mock',
        disclaimer: 'Everything is totally safe!',
        urlSignals: ['forged'],
      },
      ctx,
    );
    expect(a.summary.length).toBe(400);
    expect(a.whyRisky.length).toBe(6);
    expect(a.indicators.length).toBe(8);
    expect(a.recommendedActions.length).toBe(6);
    expect(a.assessmentMode).toBe('ai');
    expect(a.disclaimer).not.toMatch(/totally safe/);
    expect(a.urlSignals).toEqual([]);
  });

  it('does not let the model downgrade strong deterministic warning signs', () => {
    const a = sanitizeModelOutput({ riskLevel: 'LOW RISK', summary: 'Looks fine.' }, { urlChecks: null, strongDeterministicRisk: true });
    expect(a.riskLevel).toBe('SUSPICIOUS');
  });
});

describe('AI path with injected model (Bedrock is never called)', () => {
  const req = { inputType: 'message', content: PHISH } as const;

  it('uses validated model output', async () => {
    const invoke = vi.fn().mockResolvedValue('{"riskLevel":"HIGH RISK","summary":"Phishing.","threatType":"Credential phishing"}');
    const { analysis, note } = await analyze(req, LIVE, invoke);
    expect(note).toBe('ai');
    expect(analysis.assessmentMode).toBe('ai');
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('falls back to rule-based analysis when the model returns malformed JSON', async () => {
    const { analysis, note } = await analyze(req, LIVE, vi.fn().mockResolvedValue('Sorry, I cannot help with that.'));
    expect(note).toBe('ai_fallback_invalid');
    expect(analysis.assessmentMode).toBe('mock');
    expect(analysis.riskLevel).toBe('HIGH RISK');
  });

  it('falls back when the model call throws (for example while the account is being verified)', async () => {
    const { note, analysis } = await analyze(req, LIVE, vi.fn().mockRejectedValue(new Error('AccessDeniedException')));
    expect(note).toBe('ai_fallback_error');
    expect(analysis.riskLevel).toBe('HIGH RISK');
  });

  it('does not call the model in mock mode', async () => {
    const invoke = vi.fn();
    await analyze(req, MOCK, invoke);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('config', () => {
  it('defaults to mock mode and only disables it on the literal "false"', () => {
    expect(loadConfig({}).mockAi).toBe(true);
    expect(loadConfig({ MOCK_AI: 'true' }).mockAi).toBe(true);
    expect(loadConfig({ MOCK_AI: 'yes' }).mockAi).toBe(true);
    expect(loadConfig({ MOCK_AI: 'false' }).mockAi).toBe(false);
    expect(loadConfig({}).modelId).toBe('us.amazon.nova-2-lite-v1:0');
  });
});

// ---------------------------------------------------------------------------------------------
// Composable phishing signals: regression for the Stark & Co. "partnership portal" email.
// Everything here is deterministic: no network, no Bedrock, no dependence on the current date.
// ---------------------------------------------------------------------------------------------

const STARK = readFileSync(fileURLToPath(new URL('./fixtures/stark-email.txt', import.meta.url)), 'utf8');
const STARK_NO_LINK = STARK.replace('https://bit.ly/4i7u2kf', '');

const severity = (level: string) => ['LOW RISK', 'SUSPICIOUS', 'HIGH RISK'].indexOf(level);
const run = (content: string) => mockAnalysis({ inputType: 'message', content });

describe('URL extraction', () => {
  it('finds links in Markdown, next to arrows and emoji, and scheme-less shorteners', () => {
    expect(extractUrls('See [the portal](https://bit.ly/4i7u2kf) now')).toEqual(['https://bit.ly/4i7u2kf']);
    expect(extractUrls('Access Partnership Portal → https://bit.ly/4i7u2kf')).toEqual(['https://bit.ly/4i7u2kf']);
    expect(extractUrls('Tap 👉https://bit.ly/4i7u2kf👈 today.')).toEqual(['https://bit.ly/4i7u2kf']);
    expect(extractUrls('<a href="https://bit.ly/4i7u2kf">Portal</a>')).toEqual(['https://bit.ly/4i7u2kf']);
    expect(extractUrls('Go to bit.ly/4i7u2kf to continue.')).toEqual(['https://bit.ly/4i7u2kf']);
  });

  it('does not invent links from ordinary text', () => {
    expect(extractUrls('Use e.g. node.js or visit example dot com. Mail me at a@bit.ly/')).toEqual([]);
  });
});

describe('message signals (each signal on its own)', () => {
  it('detects the shortened link from the regression email', () => {
    const m = analyzeMessage(STARK);
    expect(m.urls).toEqual(['https://bit.ly/4i7u2kf']);
    expect(m.worstUrl?.isShortened).toBe(true);
    expect(run(STARK).urlSignals.join(' ')).toMatch(/shortener/i);
  });

  it('detects authentication / SSO requests', () => {
    expect(analyzeMessage('Please sign in with your corporate email.').categories).toContain('authRequest');
    expect(analyzeMessage('The portal uses your enterprise Single Sign-On (SSO) credentials.').categories).toContain('authRequest');
    expect(analyzeMessage('Complete the authentication step.').categories).toContain('authRequest');
  });

  it('detects deadlines and scarcity', () => {
    expect(analyzeMessage('The application window closes on September 15, 2026 (13 days from now).').categories).toContain('deadline');
    expect(analyzeMessage('Act quickly to secure your spot.').categories).toContain('deadline');
  });

  it('detects employment / eligibility verification', () => {
    expect(analyzeMessage('Verify your employment status through the portal.').categories).toContain('employmentVerification');
    expect(analyzeMessage('Complete a brief eligibility assessment.').categories).toContain('employmentVerification');
  });

  it('needs several independent offer features before calling something an attractive offer', () => {
    expect(analyzeMessage('Enjoy 40% off everything this weekend.').categories).not.toContain('attractiveOffer');
    expect(analyzeMessage('An exclusive 40% discount for members.').categories).not.toContain('attractiveOffer');
    expect(analyzeMessage(STARK).categories).toContain('attractiveOffer');
  });

  it('compares the institution a message names with where its link goes, without a list of institutions', () => {
    const msg = (link: string) => `Greetings from the University of Springfield Business Office. Please renew your enrollment at ${link}`;
    expect(institutionNameFragments(msg(''))).toContain('springfield');
    expect(analyzeMessage(msg('https://bit.ly/abc123')).categories).toContain('institutionMismatch');
    expect(analyzeMessage(msg('https://portal.unrelated-host.example/renew')).categories).toContain('institutionMismatch');
    expect(analyzeMessage(msg('https://springfield.edu/renew')).categories).not.toContain('institutionMismatch');
    expect(analyzeMessage(msg('https://renew.springfield-university.example/')).categories).not.toContain('institutionMismatch');
  });
});

describe('Stark & Co. regression email', () => {
  const m = analyzeMessage(STARK);
  const a = run(STARK);

  it('is not LOW RISK and is HIGH RISK', () => {
    expect(a.riskLevel).not.toBe('LOW RISK');
    expect(a.riskLevel).toBe('HIGH RISK');
    expect(a.threatType).toBe('Credential phishing');
    expect(a.assessmentMode).toBe('mock');
  });

  it('recognises every independent signal', () => {
    expect(m.categories).toEqual(
      expect.arrayContaining(['greeting', 'deadline', 'attractiveOffer', 'employmentVerification', 'authRequest', 'institutionMismatch']),
    );
    expect(m.claimedInstitutions).toEqual(expect.arrayContaining(['berkeley', 'haas']));
  });

  it('combines them into compound signals', () => {
    expect(m.compounds).toEqual(['authViaUnverifiedLink', 'offerWithVerification', 'socialEngineeringChain']);
  });

  it('scores higher than the same email with any one ingredient removed', () => {
    const withoutLink = analyzeMessage(STARK_NO_LINK).score;
    const withoutAuth = analyzeMessage(STARK.replace(/Authentication Note:.*\n/, '')).score;
    const withoutDeadline = analyzeMessage(STARK.replace(/Important: .*\n/, '')).score;
    const withoutOffer = analyzeMessage(STARK.replace(/\* .*\n/g, '')).score;
    for (const lower of [withoutLink, withoutAuth, withoutDeadline, withoutOffer]) expect(m.score).toBeGreaterThan(lower);
  });

  it('combined signals add more risk than the individual signals alone', () => {
    const compoundPoints = m.compounds.length;
    expect(compoundPoints).toBeGreaterThanOrEqual(3);
    const individualOnly = m.categories.length + 1 + (m.worstUrl?.score ?? 0);
    expect(m.score).toBeGreaterThan(individualOnly);
  });

  it('explains the decision in plain language', () => {
    const text = [...a.whyRisky, ...a.indicators, ...a.urlSignals].join('\n');
    expect(text).toMatch(/link shortener/i);
    expect(text).toMatch(/sign in|single sign-on|SSO/i);
    expect(text).toMatch(/deadline|limited availability/i);
    expect(text).toMatch(/verify your job or eligibility/i);
    expect(text).toMatch(/does not lead to a site that appears to belong to it/i);
    expect(a.whyRisky[0]).toMatch(/sign in through a link/i); // the strongest, combined reason comes first
    expect(text).not.toMatch(/regex|weights?|score|categor/i); // no implementation details
    expect(a.recommendedActions.join(' ')).toMatch(/do not click the link/i);
  });

  it('returns the same answer whatever the current date is', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
      const early = run(STARK);
      vi.setSystemTime(new Date('2031-06-30T00:00:00Z'));
      const late = run(STARK);
      expect(early).toEqual(late);
      expect(early).toEqual(a);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is still flagged (at least SUSPICIOUS) when a copy-paste drops the link', () => {
    const r = run(STARK_NO_LINK);
    expect(severity(r.riskLevel)).toBeGreaterThanOrEqual(1);
    expect(r.confidence).not.toBe('high'); // no link to inspect, so less certain
  });

  it('works end to end through the handler in mock mode, never calling a model', async () => {
    const invoke = vi.fn();
    const handler = createHandler({ config: () => MOCK, invoke });
    const res = (await handler(event({ inputType: 'message', content: STARK }))) as { statusCode: number; body: string };
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.riskLevel).toBe('HIGH RISK');
    expect(body.urlSignals.join(' ')).toMatch(/shortener/i);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('false-positive guards (one signal is not enough)', () => {
  it('a university announcement with an application deadline stays LOW RISK', () => {
    const r = run('Dear students, the University of Michigan application deadline for the spring term is March 1. Apply at https://admissions.umich.edu/apply');
    expect(r.riskLevel).toBe('LOW RISK');
  });

  it('a legitimate HR email that mentions SSO stays LOW RISK, with or without an ordinary company link', () => {
    const text = 'Hi team, reminder that you can sign in with SSO to open the benefits portal. Contact the IT help desk if you have trouble.';
    expect(run(text).riskLevel).toBe('LOW RISK');
    expect(run(`${text} https://hr.example-corp.com/benefits`).riskLevel).toBe('LOW RISK');
  });

  it('a normal discount email is not flagged by the discount', () => {
    expect(run('Spring sale: enjoy 40% off all running shoes this weekend. Visit https://www.example-shoes.com/sale').riskLevel).toBe('LOW RISK');
    expect(analyzeMessage('An exclusive 40% discount for newsletter members.').compounds).toEqual([]);
  });

  it('a shortened tracking link with no sign-in request is never HIGH RISK and never an authentication lure', () => {
    const text = 'Thanks for your order #1234. You can follow your shipment here: https://bit.ly/abc123. Questions? Just reply to this email.';
    const m = analyzeMessage(text);
    expect(m.categories).not.toContain('authRequest');
    expect(m.compounds).toEqual([]);
    expect(run(text).riskLevel).not.toBe('HIGH RISK');
  });

  it('a Bitly link alone is a signal, not a verdict', () => {
    expect(run('Here are the slides from today: https://bit.ly/abc123 Let me know what you think of them.').riskLevel).not.toBe('HIGH RISK');
  });

  it('a deadline, an offer or SSO on their own never produce a compound signal', () => {
    for (const t of [
      'The registration window closes on Friday, so please sign up soon.',
      'Our exclusive tuition discount saves families $2,000 with no application fee.',
      'Use single sign-on (SSO) to log in to the staff directory.',
    ]) {
      expect(analyzeMessage(t).compounds).toEqual([]);
      expect(run(t).riskLevel).not.toBe('HIGH RISK');
    }
  });

  it('sign-in requests through a hidden link do combine into a stronger signal', () => {
    const t = 'Quick note: please sign in with your SSO credentials here https://bit.ly/abc123 to keep your access.';
    expect(analyzeMessage(t).compounds).toContain('authViaUnverifiedLink');
    expect(severity(run(t).riskLevel)).toBeGreaterThanOrEqual(1);
  });
});
