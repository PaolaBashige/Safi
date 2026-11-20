import { describe, expect, it } from 'vitest';
import { classifyCredentialLanguage, requestsIdentityDocuments } from '../src/credentialLanguage';
import { detectFraudFlags } from '../src/fraudSignals';
import { analyzeMessage } from '../src/messageSignals';
import { mockAnalysis } from '../src/mock';
import { checkSenderDomain, parseSender, relateLink } from '../src/senderDomain';
import { analyzeUrl } from '../src/urlAnalysis';
import { CORPUS } from './fixtures/corpus';

const level = (content: string) => mockAnalysis({ inputType: 'message', content }).riskLevel;
const severity = (l: string) => ['LOW RISK', 'SUSPICIOUS', 'HIGH RISK'].indexOf(l);
const fixture = (id: string) => CORPUS.find((c) => c.id === id)!.content;

// ---------------------------------------------------------------------------------------------
// 1. Credential and request semantics
// ---------------------------------------------------------------------------------------------
describe('credential language: actual requests for secrets stay strong', () => {
  it.each([
    'Reply with your password.',
    'Enter your verification code.',
    'Send us the OTP.',
    'Provide your MFA code.',
    'Enter your credentials here.',
    'Please confirm your password to keep your account active.',
    'Sign in with your work email and password to view the file.',
    'Your password is required to continue.',
    'We need your PIN to release the payment.',
    'You will need to enter your password again to continue.',
  ])('%s', (text) => {
    expect(classifyCredentialLanguage(text).request).toBe(true);
    expect(analyzeMessage(text).categories).toContain('credential');
  });

  it('still treats "verify your account" and "confirm your identity" as requests', () => {
    expect(classifyCredentialLanguage('Verify your account immediately.').request).toBe(true);
    expect(classifyCredentialLanguage('Please confirm your identity within 24 hours.').request).toBe(true);
    expect(classifyCredentialLanguage('You must reset your password today.').request).toBe(true);
  });

  it('a request beside protective advice is still a request', () => {
    const t = 'Never share your password with anyone. To keep your account, enter your password below.';
    const r = classifyCredentialLanguage(t);
    expect(r.protective).toBe(true);
    expect(r.request).toBe(true);
  });

  it('"do not delay, enter your password" is a request, not protection', () => {
    expect(classifyCredentialLanguage('Do not ignore this, enter your password now.').request).toBe(true);
  });
});

describe('credential language: protective security advice is not a request', () => {
  it.each([
    'Never share your password with anyone.',
    'We will never ask for your password.',
    'IT will never ask for your password or authentication codes by email or chat.',
    'Do not send verification codes by email.',
    'You should never disclose your MFA code.',
    "Don't give out your PIN to anyone who calls you.",
    'Passwords should never be shared.',
    'Your one-time passcode must not be forwarded to anyone.',
  ])('%s', (text) => {
    const r = classifyCredentialLanguage(text);
    expect(r.request).toBe(false);
    expect(r.protective).toBe(true);
    expect(analyzeMessage(text).categories).not.toContain('credential');
  });
});

describe('credential language: future or generic use is not a request', () => {
  it.each([
    'You will need your verification code during enrollment.',
    'A verification code will be required.',
    'You may be asked for your MFA code.',
    'From then on you will be asked for a verification code each time you sign in.',
    'A one-time code will be sent to your phone.',
    'Scammers often ask for your password by email.',
  ])('%s', (text) => {
    const r = classifyCredentialLanguage(text);
    expect(r.request).toBe(false);
    expect(r.informational).toBe(true);
    expect(analyzeMessage(text).categories).not.toContain('credential');
  });

  it('a bare mention is neither a request nor flagged', () => {
    expect(classifyCredentialLanguage('Your password expires in the Settings page under Security.').request).toBe(false);
    expect(classifyCredentialLanguage('The training covers creating strong passwords.').request).toBe(false);
  });
});

describe('credential language: ordinary details are not secrets', () => {
  it('verifying employment details or confirming an address is not credential harvesting', () => {
    for (const t of [
      'Please verify your employment details by Friday.',
      'Confirm your address and emergency contact in the employee portal.',
      'Update your contact details and preferred name.',
    ]) {
      expect(classifyCredentialLanguage(t).request).toBe(false);
      expect(analyzeMessage(t).categories).not.toContain('credential');
    }
    expect(analyzeMessage('Please verify your employment details by Friday.').categories).toContain('employmentVerification');
  });

  it('requests for an ID document or date of birth are a separate, weaker signal', () => {
    for (const t of ['Please upload your government ID.', 'Provide your date of birth and a photo ID.', 'Send a copy of your passport.']) {
      expect(requestsIdentityDocuments(t)).toBe(true);
      expect(analyzeMessage(t).categories).toContain('identityDocRequest');
      expect(analyzeMessage(t).categories).not.toContain('credential');
    }
    expect(requestsIdentityDocuments('Never send a photo of your passport by email.')).toBe(false);
    expect(requestsIdentityDocuments('Please bring your passport to your first day.')).toBe(false);
  });

  it('corpus D1, D2 and D4 are no longer treated as requests for secrets', () => {
    for (const id of ['D1-sso-migration-notice', 'D2-mfa-enrollment', 'D4-annual-records-update']) {
      expect(analyzeMessage(fixture(id)).categories, id).not.toContain('credential');
      expect(level(fixture(id)), id).not.toBe('HIGH RISK');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 2. URL path versus host
// ---------------------------------------------------------------------------------------------
describe('link paths: the host matters, not login-style wording in the path', () => {
  it('splits a link score into host, path and the rest, without changing the total', () => {
    const plain = analyzeUrl('https://legitimate.example.com/mfa');
    expect(plain.hostScore).toBe(0);
    expect(plain.pathScore).toBe(2);
    expect(plain.score).toBe(2);
    const ip = analyzeUrl('http://192.168.4.7/secure/login/verify');
    expect(ip.hostScore).toBe(3);
    expect(ip.pathScore).toBe(2);
    expect(ip.score).toBe(ip.hostScore + ip.pathScore + 1); // +1 for http
  });

  const HOME = 'From: IT Service Desk <it@corp-acme.example>\nSubject: Set up MFA\n\n';

  it('1. a company host with /mfa adds nothing to the message score', () => {
    const msg = `${HOME}Please set up MFA at https://intranet.corp-acme.example/security/mfa when you can.`;
    const m = analyzeMessage(msg);
    expect(m.worstUrl?.score).toBe(0);
    expect(m.worstUrl?.signals).toEqual([]);
    expect(m.compounds).toEqual([]);
    expect(level(msg)).toBe('LOW RISK');
    // Same without any header: the host alone decides.
    const bare = analyzeMessage('Please set up MFA at https://intranet.corp-acme.example/security/mfa when you can.');
    expect(bare.worstUrl?.score).toBe(0);
    expect(bare.compounds).toEqual([]);
  });

  it('3. a company host with /login is also not suspicious because of its path', () => {
    const msg = `${HOME}Sign in with SSO at https://sso.corp-acme.example/login to see your tasks.`;
    const m = analyzeMessage(msg);
    expect(m.worstUrl?.pathScore).toBe(0);
    expect(m.compounds).not.toContain('authViaUnverifiedLink');
    expect(severity(level(msg))).toBeLessThanOrEqual(1);
  });

  it('2. an unrelated or look-alike host with /mfa keeps its path weight and the compound signal', () => {
    const msg = `${HOME}Sign in with SSO to finish MFA setup: https://corp-acme-mfa.example/mfa`;
    const m = analyzeMessage(msg);
    expect(m.linkRelations[0]?.relation).toBe('lookalike');
    expect(m.worstUrl?.pathScore).toBe(2);
    expect(m.compounds).toContain('authViaUnverifiedLink');
    expect(severity(level(msg))).toBe(2);
  });

  it('4. a shortened link with an authentication path keeps both and is flagged', () => {
    const msg = 'Sign in with your SSO to confirm your access: https://bit.ly/login-verify';
    const m = analyzeMessage(msg);
    expect(m.worstUrl?.isShortened).toBe(true);
    expect(m.worstUrl?.pathScore).toBe(2);
    expect(m.compounds).toContain('authViaUnverifiedLink');
  });

  it('a raw IP host with /login keeps its path weight', () => {
    const m = analyzeMessage('Sign in with SSO here: http://192.168.4.7/secure/login/verify');
    expect(m.worstUrl?.pathScore).toBe(2);
    expect(m.compounds).toContain('authViaUnverifiedLink');
  });

  it('a message that really asks for a secret keeps the path weight even on a plain host', () => {
    const m = analyzeMessage('Enter your password to continue: https://account-check.example/login/verify');
    expect(m.categories).toContain('credential');
    expect(m.worstUrl?.pathScore).toBe(2);
  });

  it('the stand-alone URL check is unchanged', () => {
    expect(analyzeUrl('https://legitimate.example.com/mfa').score).toBe(2);
    expect(analyzeUrl('https://www.python.org/downloads/').score).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Sender domain versus link domain
// ---------------------------------------------------------------------------------------------
describe('sender header parsing', () => {
  it('reads a name and address, a bare address, and a name without an address', () => {
    expect(parseSender('From: Hollis Weekly <news@hollis-state.edu>\n\nBody')?.registrable).toBe('hollis-state.edu');
    expect(parseSender('From: "Ops, Team" <ops@mail.corp-acme.example>\n\nBody')?.registrable).toBe('corp-acme.example');
    expect(parseSender('From: person@corp-acme.example\n\nBody')?.domain).toBe('corp-acme.example');
    const noAddress = parseSender('From: Stark & Co. Legal Partners\nSubject: x\n\nBody');
    expect(noAddress).not.toBeNull();
    expect(noAddress?.domain).toBeNull();
  });

  it('only reads headers at the very top, never from the body', () => {
    expect(parseSender('Hello,\n\nFrom: boss@evil.example\n\nPlease pay.')).toBeNull();
    expect(parseSender('Just a note.\nSubject: hi\nFrom: a@b.example')).toBeNull();
    expect(parseSender('no headers here at all')).toBeNull();
  });
});

describe('link relation to the sender', () => {
  const s = parseSender('From: Registrar <registrar@university.example>\n\nx')!;
  it('same registrable domain, including subdomains', () => {
    expect(relateLink('university.example', s)).toBe('same');
    expect(relateLink('portal.university.example', s)).toBe('same');
  });
  it('look-alike: the sender name plus extra words, or the same name with another ending', () => {
    expect(relateLink('university-login-security.example', s)).toBe('lookalike');
    expect(relateLink('university.net', s)).toBe('lookalike');
    expect(relateLink('login-university.example', s)).toBe('lookalike');
  });
  it('a service that only has the sender name in a subdomain is a tenant, not a look-alike', () => {
    expect(relateLink('university.identity-provider.example', s)).toBe('tenant');
  });
  it('a different domain with no visible connection is unrelated; a shortener is its own case', () => {
    expect(relateLink('survey-tool.example', s)).toBe('unrelated');
    expect(relateLink('bit.ly', s)).toBe('shortener');
  });
  it('is unknown with no sender, no address, or a free-mail sender', () => {
    expect(relateLink('anything.example', null)).toBe('unknown');
    expect(relateLink('anything.example', parseSender('From: Stark & Co. Legal Partners\n\nx'))).toBe('unknown');
    expect(relateLink('anything.example', parseSender('From: Dana <dana@gmail.com>\n\nx'))).toBe('unknown');
  });
});

describe('message-level sender-domain signals', () => {
  const FROM = 'From: Hollis Registrar <registrar@university.example>\nSubject: Account notice\n\n';

  it('same sender and link domain: no domain signal', () => {
    const m = analyzeMessage(`${FROM}Sign in with SSO to view your record: https://portal.university.example/records`);
    expect(m.linkRelations[0]?.relation).toBe('same');
    expect(m.categories).not.toContain('senderLookalike');
    expect(m.categories).not.toContain('senderDomainMismatch');
  });

  it('a legitimate external service is not flagged when nothing sensitive is asked', () => {
    const m = analyzeMessage(`${FROM}We would love your feedback on the spring term. Take the 3-minute survey: https://forms.survey-tool.example/s/42`);
    expect(m.linkRelations[0]?.relation).toBe('unrelated');
    expect(m.categories).not.toContain('senderDomainMismatch');
    expect(level(`${FROM}We would love your feedback on the spring term. Take the 3-minute survey: https://forms.survey-tool.example/s/42`)).toBe('LOW RISK');
  });

  it('a legitimate invoice that links to a payment processor is not flagged', () => {
    const msg = 'From: Billing <billing@vendor-co.example>\nSubject: Invoice 1042\n\nYour invoice 1042 for $1,200 is attached. Payment is due November 30. You can pay online at https://pay.card-processor.example/vendor-co.';
    const m = analyzeMessage(msg);
    expect(m.categories).not.toContain('senderDomainMismatch');
    expect(m.categories).not.toContain('senderLookalike');
    expect(severity(level(msg))).toBeLessThanOrEqual(1);
  });

  it('a tenant on an identity provider is not flagged', () => {
    const m = analyzeMessage(`${FROM}Sign in with SSO to see your tasks: https://university.identity-provider.example/app/login`);
    expect(m.linkRelations[0]?.relation).toBe('tenant');
    expect(m.categories).not.toContain('senderDomainMismatch');
  });

  it('an unrelated destination plus an authentication request is flagged', () => {
    const msg = `${FROM}Sign in with SSO to review your benefits: https://benefits-portal.example/login`;
    const m = analyzeMessage(msg);
    expect(m.linkRelations[0]?.relation).toBe('unrelated');
    expect(m.categories).toContain('senderDomainMismatch');
    expect(severity(level(msg))).toBeGreaterThanOrEqual(1);
  });

  it('a look-alike destination containing the sender name is flagged, with or without a sensitive request', () => {
    const a = analyzeMessage(`${FROM}Sign in with SSO to see your record: https://university-login-security.example/signin`);
    expect(a.categories).toContain('senderLookalike');
    expect(a.compounds).toContain('authViaUnverifiedLink');
    const b = analyzeMessage(`${FROM}Your spring newsletter is ready: https://university-news-hub.example/spring`);
    expect(b.categories).toContain('senderLookalike');
  });

  it('with sender headers absent the sender-domain signals never fire', () => {
    const body = 'Sign in with SSO to see your record: https://university-login-security.example/signin';
    const m = analyzeMessage(body);
    expect(m.sender).toBeNull();
    expect(m.linkRelations.every((r) => r.relation === 'unknown')).toBe(true);
    expect(m.categories).not.toContain('senderLookalike');
    expect(m.categories).not.toContain('senderDomainMismatch');
  });

  it('with a sender but no sender domain the signals never fire', () => {
    const m = analyzeMessage('From: Hollis Registrar\nSubject: Notice\n\nSign in with SSO to see your record: https://university-login-security.example/signin');
    expect(m.sender?.domain).toBeNull();
    expect(m.linkRelations[0]?.relation).toBe('unknown');
    expect(m.categories).not.toContain('senderLookalike');
  });

  it('with several links, only the suspicious one is flagged', () => {
    const msg = `${FROM}Sign in with SSO to view your record. Policies: https://policies.university.example/index and sign in at https://university-account-login.example/signin`;
    const m = analyzeMessage(msg);
    expect(m.linkRelations.map((r) => r.relation)).toEqual(['same', 'lookalike']);
    expect(m.categories).toContain('senderLookalike');
    const clean = analyzeMessage(`${FROM}Sign in with SSO to view your record. Policies: https://policies.university.example/index and https://portal.university.example/records`);
    expect(clean.linkRelations.map((r) => r.relation)).toEqual(['same', 'same']);
    expect(clean.categories).not.toContain('senderLookalike');
  });

  it('a sender domain that imitates its own displayed name is flagged only when something sensitive is asked', () => {
    const SENDER = 'From: FirstHarbor Bank Security <alerts@firstharbor-secure.example>\n\n';
    expect(checkSenderDomain(parseSender(SENDER)!)).toBe('lookalike');
    const asks = analyzeMessage(`${SENDER}Please verify your identity within 24 hours: https://firstharbor-secure.example/verify`);
    expect(asks.categories).toContain('senderLookalike');
    const informs = analyzeMessage(`${SENDER}Our branches are closed on Monday for the holiday. See hours at https://firstharbor-secure.example/hours`);
    expect(informs.categories).not.toContain('senderLookalike');
  });

  it('a name that matches its own domain is not flagged', () => {
    const SENDER = 'From: GreenLeaf Garden Co. <events@greenleaf-garden.example>\n\n';
    expect(checkSenderDomain(parseSender(SENDER)!)).toBe('none');
    expect(checkSenderDomain(parseSender('From: Hollis State Weekly <news@hollis-state.edu>\n\n')!)).toBe('none');
  });

  it('revisits B5, D3, B2 and C3: the distinctions the engine can now make', () => {
    const b5 = analyzeMessage(fixture('B5-benefits-credential-request'));
    const d3 = analyzeMessage(fixture('D3-open-enrollment'));
    // B5 asks the reader to log in with company credentials; D3 only mentions SSO.
    expect(b5.categories).toContain('credential');
    expect(d3.categories).not.toContain('credential');
    expect(severity(level(fixture('B5-benefits-credential-request')))).toBeGreaterThan(severity(level(fixture('D3-open-enrollment'))));
    // B2: the sender's university-named domain is not in an education namespace, and it asks for a sign-in.
    const b2 = analyzeMessage(fixture('B2-alumni-scholarship-lookalike'));
    expect(b2.categories).toContain('senderLookalike');
    const c3 = analyzeMessage(fixture('C3-course-registration'));
    expect(c3.categories).not.toContain('senderLookalike');
    expect(c3.categories).not.toContain('senderDomainMismatch');
    expect(severity(level(fixture('B2-alumni-scholarship-lookalike')))).toBeGreaterThan(severity(level(fixture('C3-course-registration'))));
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Recruitment lures and payment fraud
// ---------------------------------------------------------------------------------------------
describe('recruitment lure signals', () => {
  it('detects each signal on its own', () => {
    expect(detectFraudFlags('This role pays a salary of $145,000 per year.').highCompensation).toBe(true);
    expect(detectFraudFlags('You can earn $5,000 a week from home in this position.').highCompensation).toBe(true);
    expect(detectFraudFlags('Our job pays a salary of $62,000 per year.').highCompensation).toBe(false);
    expect(detectFraudFlags('Tickets are $145,000 per seat.').highCompensation).toBe(false); // no job context
    expect(detectFraudFlags('There is no formal interview process for this role.').fastHire).toBe(true);
    expect(detectFraudFlags('Positions like this fill fast.').recruitUrgency).toBe(true);
    for (const t of ['No formal interview process.', 'Upload your passport.']) {
      const cats = analyzeMessage(t).categories;
      expect(cats.includes('fastHire') || cats.includes('identityDocRequest')).toBe(true);
    }
  });

  it('B1 is no longer rated LOW RISK and its risk increases materially', () => {
    const m = analyzeMessage(fixture('B1-recruitment-identity-theft'));
    expect(m.categories).toEqual(expect.arrayContaining(['highCompensation', 'fastHire', 'identityDocRequest']));
    expect(m.compounds).toContain('recruitmentScamPattern');
    expect(m.score).toBeGreaterThanOrEqual(6); // was 1
    expect(severity(level(fixture('B1-recruitment-identity-theft')))).toBeGreaterThanOrEqual(1);
  });

  it('no single phrase, and no two of them, make the pattern', () => {
    for (const t of [
      'Our new analyst role pays $145,000 per year with a great team.',
      'There is no formal interview needed for this internal transfer role, just a short chat with your manager.',
      'To finish onboarding for this position, please upload your passport.',
      'This role pays $145,000 per year. Positions like this fill fast.',
    ]) {
      expect(analyzeMessage(t).compounds, t).not.toContain('recruitmentScamPattern');
    }
    const legitOnboarding = 'Welcome aboard! Your salary is $150,000 per year. Please upload your passport for I-9 verification before your start date.';
    expect(analyzeMessage(legitOnboarding).compounds).not.toContain('recruitmentScamPattern');
    expect(level(legitOnboarding)).not.toBe('HIGH RISK');
  });
});

describe('payment fraud signals', () => {
  it('detects each building block', () => {
    const f = detectFraudFlags('Our vendor has changed their bank details. Please send the payment of $9,500 today. I am in meetings and cannot take calls.');
    expect(f.changedBankDetails).toBe(true);
    expect(f.paymentInstruction).toBe(true);
    expect(f.urgentPayment).toBe(true);
    expect(f.executivePretext).toBe(true);
  });

  it('an ordinary legitimate invoice is not flagged', () => {
    const t = 'Hi, attached is invoice 1042 for $1,200 for October services, due November 30. Our banking details are unchanged and are on the invoice. Thanks, Priya';
    const m = analyzeMessage(t);
    expect(m.compounds).toEqual([]);
    expect(m.categories).not.toContain('changedBankDetails');
    expect(level(t)).toBe('LOW RISK');
  });

  it('a vendor notification without changed payment instructions is not flagged', () => {
    const t = 'Harlow Supply holiday schedule: our office is closed November 27 and 28. Orders placed after November 22 ship on December 1. Payment terms remain net 30 and there are no changes to our banking details.';
    const m = analyzeMessage(t);
    expect(m.categories).not.toContain('changedBankDetails');
    expect(m.compounds).toEqual([]);
    expect(level(t)).toBe('LOW RISK');
  });

  it('changed bank details plus an urgent payment instruction is flagged', () => {
    const t = 'Our bank details have changed. Please send all future payments to the new account immediately.';
    const m = analyzeMessage(t);
    expect(m.categories).toEqual(expect.arrayContaining(['changedBankDetails', 'paymentInstruction', 'urgentPayment']));
    expect(m.compounds).toContain('paymentFraudPattern');
    expect(severity(level(t))).toBeGreaterThanOrEqual(1);
  });

  it('an executive payment request with secrecy is flagged, and B3 is no longer LOW RISK', () => {
    const t = 'I am in meetings all day and cannot take calls. Please wire the payment of $9,500 to this new vendor today and keep this between us.';
    expect(analyzeMessage(t).compounds).toContain('paymentFraudPattern');
    expect(severity(level(t))).toBeGreaterThanOrEqual(1);
    const b3 = analyzeMessage(fixture('B3-ceo-payment-request'));
    expect(b3.compounds).toContain('paymentFraudPattern');
    expect(b3.score).toBeGreaterThanOrEqual(6); // was 1
    expect(severity(level(fixture('B3-ceo-payment-request')))).toBeGreaterThanOrEqual(1);
  });

  it('a payment request with an unrelated or look-alike link is flagged', () => {
    const FROM = 'From: Finance <finance@corp-acme.example>\nSubject: Payment\n\n';
    const unrelated = analyzeMessage(`${FROM}Please process the payment of $9,800 today using this link: https://pay-secure.example/transfer`);
    expect(unrelated.categories).toContain('senderDomainMismatch');
    expect(severity(level(`${FROM}Please process the payment of $9,800 today using this link: https://pay-secure.example/transfer`))).toBeGreaterThanOrEqual(1);
    const lookalike = analyzeMessage(`${FROM}Please process the payment of $9,800 today using this link: https://corp-acme-payments.example/transfer`);
    expect(lookalike.compounds).toContain('paymentViaUnverifiedLink');
  });

  it('no single phrase makes the pattern', () => {
    for (const t of [
      'Please send the payment today.',
      'Our bank details have changed.',
      'I am in meetings all afternoon and cannot take calls.',
      'Let us keep this between us.',
    ]) {
      expect(analyzeMessage(t).compounds, t).toEqual([]);
      expect(level(t), t).not.toBe('HIGH RISK');
    }
    // A changed-bank-details notice on its own earns caution, not a high-risk verdict.
    expect(level('Our bank details have changed.')).toBe('SUSPICIOUS');
  });

  it('warnings about fraud are not instructions', () => {
    const t = 'Beware of invoice fraud. Never send a payment to a new account without calling us first, and do not trust changed bank details in an email.';
    const m = analyzeMessage(t);
    expect(m.categories).not.toContain('paymentInstruction');
    expect(m.categories).not.toContain('changedBankDetails');
  });
});

describe('determinism', () => {
  it('gives identical results for identical input', () => {
    for (const c of CORPUS) {
      expect(analyzeMessage(c.content)).toEqual(analyzeMessage(c.content));
      expect(mockAnalysis({ inputType: 'message', content: c.content })).toEqual(mockAnalysis({ inputType: 'message', content: c.content }));
    }
  });
});
