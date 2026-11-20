# Detection evaluation: email corpus (baseline)

Status: the sections below are the **original baseline**, taken before any detector changes. See the update directly below for the results after recommendations 1 to 4. Rules, weights and thresholds are exactly as deployed on 2026-10-02 (`MOCK_AI=true`, rule-based engine).

## Update: after recommendations 1 to 4

The detector was then changed in four places, all without touching thresholds: credential-request semantics, host-versus-path link scoring, a sender-domain versus link-domain signal, and recruitment and payment-fraud signals. See `backend/src/credentialLanguage.ts`, `senderDomain.ts`, `fraudSignals.ts` and `messageSignals.ts`.

Result on this corpus: **16 pass, 9 borderline, 0 false positives, 0 false negatives** (was 13 / 8 / 2 / 2).

| Fixture | Before | After | Why |
|---|---|---|---|
| A1-password-reset | HIGH RISK (12) | HIGH RISK (17) | Link on a look-alike of the sender name now adds a signal and the compound sign-in rule. |
| A2-bank-security-alert | HIGH RISK (15) | HIGH RISK (17) | Sender domain imitates the displayed bank name ("firstharbor-secure"). |
| B1-recruitment-identity-theft | LOW RISK (1) | HIGH RISK (9) | Recruitment pattern: high pay + no interview + ID and date of birth + deadline. |
| B2-alumni-scholarship-lookalike | SUSPICIOUS (3) | HIGH RISK (8) | Sender domain names a university but is not in an education namespace, and asks for a sign-in. |
| B3-ceo-payment-request | LOW RISK (1) | HIGH RISK (10) | Payment fraud pattern: changed bank details + urgency + secrecy + unavailable sender. |
| B5-benefits-credential-request | SUSPICIOUS (3) | HIGH RISK (6) | "Log in ... with your company credentials" is now read as a credential request. |
| D1-sso-migration-notice | SUSPICIOUS (4) | LOW RISK (1) | "Never share your password" is protective, not a request. |
| D2-mfa-enrollment | HIGH RISK (11) | SUSPICIOUS (3) | "You will be asked for a verification code" is informational; the /mfa path no longer counts on a normal host. |
| D4-annual-records-update | HIGH RISK (6) | SUSPICIOUS (3) | "Verify your employment details (address, emergency contact)" is ordinary information, not a secret. |

Still borderline (legitimate mail rated `SUSPICIOUS`, plus A5): C1, C2, C3, D2, D3, D4, E2, E5 and A5. These are the deferred items (greeting and prize wording, shortener policy, marketing urgency, the evidence gate for fee scams) and the threshold itself: C3, D2, D3 and D4 each score exactly 3, which is the `SUSPICIOUS` threshold.

New caveats: `B5` is rated high because "log in with your company credentials" now counts as a credential request, so legitimate mail using that exact phrase will also score higher. `B2` relies on a university-named domain outside `.edu` / `.ac.xx`. Both need more fixtures before they can be trusted. The sections below describe the **original baseline** and are kept for comparison.

## What was evaluated

25 fictional email fixtures in five groups of five, run through the same deterministic path the Lambda uses (`mockAnalysis` in `backend/src/mock.ts`, which calls `analyzeMessage`). Bedrock is not involved.

| Group | Fixtures | Human expectation |
|---|---|---|
| A. Obvious phishing | A1 to A5 | `HIGH RISK` |
| B. Sophisticated phishing | B1 to B5 | at least `SUSPICIOUS` |
| C. Legitimate university / education | C1 to C5 | `LOW RISK` |
| D. Legitimate HR / security / SSO | D1 to D5 | `LOW RISK` |
| E. Legitimate marketing / promotional | E1 to E5 | `LOW RISK` |

How a result is judged (it compares levels only, never which rules fired):

- **PASS** means the level meets the expectation.
- **BORDERLINE** means a legitimate message was rated `SUSPICIOUS`, or an obvious phishing message was rated only `SUSPICIOUS`.
- **FALSE POSITIVE** means a legitimate message was rated `HIGH RISK`.
- **FALSE NEGATIVE** means a phishing message was rated `LOW RISK`.

## Caveats

- 25 fixtures is a smoke-level sample. Percentages from it are not measurements.
- The corpus was written by the same assistant that wrote the detector. The fixtures were written before they were run, but the author's blind spots may be shared.
- Fixtures are English, well-formed, and include `From:` and `Subject:` lines. Real pasted messages often lack headers or lose their links.
- "Expected" is a judgement. Several legitimate fixtures (password-expiry style notices, records updates) are the kind of message real security teams also advise caution about.

## Summary

| Group | PASS | BORDERLINE | FALSE NEG | FALSE POS |
|---|---|---|---|---|
| A. Obvious phishing | 4 | 1 | 0 | 0 |
| B. Sophisticated phishing | 3 | 0 | 2 | 0 |
| C. Legit university | 2 | 3 | 0 | 0 |
| D. Legit HR / SSO | 1 | 2 | 0 | 2 |
| E. Legit marketing | 3 | 2 | 0 | 0 |
| **Total (25)** | **13** | **8** | **2** | **2** |

## Full results

| ID | Group | Expected | Actual | Confidence | Score | Key signals | Result |
|---|---|---|---|---|---|---|---|
| A1-password-reset | A | HIGH RISK | HIGH RISK | high | 12 | urgency, credential, fear, greeting, no-https, credential-path | PASS |
| A2-bank-security-alert | A | HIGH RISK | HIGH RISK | high | 15 | urgency, credential, fear, greeting, authRequest, authViaUnverifiedLink (+compound), credential-path | PASS |
| A3-fake-invoice | A | HIGH RISK | HIGH RISK | high | 9 | urgency, fear, payment, greeting, no-https | PASS |
| A4-mailbox-credential-harvest | A | HIGH RISK | HIGH RISK | medium | 6 | credential, credential-path | PASS |
| A5-parcel-fee-shortlink | A | HIGH RISK | SUSPICIOUS | medium | 6 | urgency, delivery, shortener | BORDERLINE |
| B1-recruitment-identity-theft | B | SUSPICIOUS+ | LOW RISK | low | 1 | none (link only) | FALSE NEGATIVE |
| B2-alumni-scholarship-lookalike | B | SUSPICIOUS+ | SUSPICIOUS | medium | 3 | deadline, authRequest | PASS |
| B3-ceo-payment-request | B | SUSPICIOUS+ | LOW RISK | low | 1 | secrecy | FALSE NEGATIVE |
| B4-document-share-login | B | SUSPICIOUS+ | HIGH RISK | medium | 7 | urgency, credential, authRequest | PASS |
| B5-benefits-credential-request | B | SUSPICIOUS+ | SUSPICIOUS | medium | 3 | deadline, authRequest | PASS |
| C1-admissions-deadline | C | LOW RISK | SUSPICIOUS | medium | 3 | greeting, deadline | BORDERLINE |
| C2-scholarship-award | C | LOW RISK | SUSPICIOUS | medium | 4 | prize, authRequest | BORDERLINE |
| C3-course-registration | C | LOW RISK | SUSPICIOUS | medium | 3 | deadline, authRequest | BORDERLINE |
| C4-campus-newsletter | C | LOW RISK | LOW RISK | low | 1 | none (link only) | PASS |
| C5-program-promotion | C | LOW RISK | LOW RISK | low | 2 | deadline | PASS |
| D1-sso-migration-notice | D | LOW RISK | SUSPICIOUS | medium | 4 | credential, authRequest | BORDERLINE |
| D2-mfa-enrollment | D | LOW RISK | HIGH RISK | high | 11 | credential, deadline, authRequest, authViaUnverifiedLink (+compound), credential-path | FALSE POSITIVE |
| D3-open-enrollment | D | LOW RISK | SUSPICIOUS | medium | 3 | deadline, authRequest | BORDERLINE |
| D4-annual-records-update | D | LOW RISK | HIGH RISK | medium | 6 | credential, employmentVerification, authRequest | FALSE POSITIVE |
| D5-security-training-reminder | D | LOW RISK | LOW RISK | low | 2 | authRequest | PASS |
| E1-seasonal-sale | E | LOW RISK | LOW RISK | low | 2 | deadline | PASS |
| E2-weekly-picks-tracking-link | E | LOW RISK | SUSPICIOUS | medium | 3 | shortener | BORDERLINE |
| E3-saas-trial-ending | E | LOW RISK | LOW RISK | low | 1 | none (link only) | PASS |
| E4-webinar-invite | E | LOW RISK | LOW RISK | low | 1 | none (link only) | PASS |
| E5-flash-sale-urgency | E | LOW RISK | SUSPICIOUS | medium | 4 | urgency, deadline | BORDERLINE |

Key signals: category names are the engine's internal signal categories; `+compound` marks a compound signal. `shortener` and `credential-path` come from the link analysis.

## Findings

### False positives (legitimate mail rated HIGH RISK): 2

**D2, MFA enrollment notice (score 11, high confidence).** A genuine rollout notice that links to the company intranet.
- "verification code" is treated as a request for a secret (`credential`, +3), although the message only says users will be asked for one later.
- The link path ends in `/mfa`, which the link check reads as a login or verification path (+2). That pushes the link score to 2, which the compound rule `authViaUnverifiedLink` treats as an "opaque" link (+3). So one word in a path is counted twice, and the link is on a normal `.example` host.
- The deadline and the sign-in wording add the rest.

**D4, annual records update (score 6, medium confidence).** A genuine HR task with an explicit "HR will never ask you to send these details by replying" warning.
- "verify their employment details" matches the credential pattern (`verify ... details`, +3) although the details are a home address and emergency contact, not secrets.
- Employment verification (+1), SSO (+1) and a link (+1) bring it to 6, and the "credential request" alone lets it past the high-risk gate.

### False negatives (phishing rated LOW RISK): 2

**B1, recruitment lure with identity verification (score 1).** The only signal is that a link exists. The message offers a very high salary with no interview, asks for date of birth, home address and a photo ID upload, and sets a Thursday deadline. None of this is recognized: there is no request for a password, so the credential rules never fire, and "by Thursday" is not read as a deadline.

**B3, executive impersonation with a payment request (score 1).** Only `secrecy` ("keep this between us") fires. There is no link and no credential request, so nothing else matches. The engine has no concept of a payment request with changed bank details, an executive who "cannot take calls", or a large amount to send today.

### Borderline cases: 8

Legitimate messages rated `SUSPICIOUS` (7):

| ID | Score | Why it landed there |
|---|---|---|
| C1 admissions deadline | 3 | "Dear applicant" counts as a generic greeting (+1), deadline (+1), link (+1) |
| C2 scholarship award | 4 | "Congratulations! You have been selected" matches the prize pattern (+2), SSO (+1), link (+1) |
| C3 course registration | 3 | deadline (+1), SSO (+1), link (+1) |
| D1 SSO migration notice | 4 | "never share your password" matches the credential pattern (+3), SSO (+1). The word appears in protective advice. |
| D3 open enrollment | 3 | deadline (+1), SSO (+1), link (+1) |
| E2 weekly picks | 3 | a bit.ly tracking link (+2) plus the link (+1) is the only signal |
| E5 flash sale | 4 | urgency wording (+2), "offer expires" (+1), link (+1) |

An obvious phishing message rated only `SUSPICIOUS` (1):

| ID | Score | Why |
|---|---|---|
| A5 parcel-fee scam | 6 | The score reaches the high-risk threshold, but the evidence gate (needs 3 categories, a credential request, or a strongly suspicious link) holds it at `SUSPICIOUS`. "Unpaid customs fee" is not recognized as a payment demand, so only urgency and delivery fire. |

### Phishing that passed with little margin

- **B2, alumni scholarship (score 3).** It passes only because the minimum for `SUSPICIOUS` is 3. The link is a look-alike (`westbrook-university-programs.example`), but the institution check treats a hostname that contains the institution's name as related, so the mismatch signal never fires.
- **B5, HR benefits lure (score 3).** It has exactly the same signals as the legitimate D3 and C3: deadline, sign-in wording, link. The only difference is that the link goes to an unrelated domain, and the engine has no way to see that without a claimed institution.

## The central issue

The engine's features cannot currently tell **B5 (phishing)** from **D3 (legitimate)**, or **B2 (phishing)** from **C3 (legitimate)**. Each pair has the same categories and the same score. The distinguishing evidence is where the link goes relative to who the message says it is from, and the engine only checks that when it can extract an institution name from "University of X"-style wording. Because the two pairs sit at the same score, any change that makes the phishing side stricter would also catch the legitimate side unless the domain relationship is added as a feature.

A second pattern: single words carry too much weight in isolation. "password", "verification code" and "verify ... details" each add +3 regardless of whether the message is asking for the secret or warning against sharing it.

## Recommendations (not implemented)

In rough order of value:

1. **Separate "asks for a secret" from "mentions a secret".** Treat `password` / `verification code` as a credential request only when the sentence asks the reader to provide or enter it, and not when it follows "never share", "will never ask", or "do not give". Narrow `verify ... details` so it needs a sensitive object (card, password, SSN, banking) and not generic "details". This addresses D1 and D4.
2. **Stop double-counting credential-like link paths.** The `/mfa` path should not both add to the link score and then make the link "opaque" for the compound rule. `authViaUnverifiedLink` should depend on the link's host (shortener, IP, unrelated or look-alike domain), not on path wording. This addresses D2.
3. **Add a sender-versus-link domain check.** When a `From:` line is present, compare its domain with the link domains. Flag links that differ, and flag hyphenated look-alikes that embed the sender's or institution's name (`westbrook-university-programs.example`). This is the feature that separates B5 from D3 and B2 from C3. Behaviour needs a fallback for pasted text that has no headers.
4. **Add financial-request and identity-document signals.** Payment instructions with changed bank details, an executive who is unavailable by phone, urgency to pay today (B3). Requests for date of birth, ID upload, or SSN-style data, and "no interview" offers (B1). Keep them as combinable signals, not stand-alone verdicts.
5. **Review the evidence gate for fee scams (A5).** Add small-fee and customs wording to the payment patterns, and consider treating urgency + delivery + shortener as strong evidence.
6. **Tune the prize pattern and the greeting rule.** "Congratulations ... selected" should need an unsolicited-prize context (claim, win, free), and "Dear applicant" should not count as a generic greeting by itself (C1, C2).
7. **Decide the policy for shorteners and flash sales.** A shortened tracking link alone (E2) and ordinary urgent marketing (E5) both land at `SUSPICIOUS`, which is defensible ("Safi can't see where the link goes"). Decide whether the product wants that, or a softer outcome such as `LOW RISK` with a caution note, before changing weights.
8. **Calibrate the thresholds only after 1 to 4.** Seven legitimate messages score 3 or 4, and two phishing messages score exactly 3. Moving the `SUSPICIOUS` threshold now would trade one error for the other.
9. **Grow the corpus** before tuning: more examples per group, messages with the link stripped or no headers, other languages, and a few more near-miss pairs like B5/D3.

## Reproducing

```bash
cd backend
npx vitest run test/corpus.test.ts                              # corpus checks and pinned behaviour
CORPUS_REPORT_FILE=eval.json npx vitest run test/corpus.test.ts # also writes the full results as JSON
```

The tests pin each fixture's current risk level in `test/fixtures/corpus-baseline.json`. They do **not** assert the human expectation, so a detector weakness does not break the build. If a later change alters any result, the matching test fails, and the baseline has to be updated on purpose along with this document.

Files: `backend/test/fixtures/corpus.ts` (fixtures), `backend/test/fixtures/corpus-baseline.json` (pinned levels), `backend/test/corpus-eval.ts` (harness), `backend/test/corpus.test.ts` (tests).
