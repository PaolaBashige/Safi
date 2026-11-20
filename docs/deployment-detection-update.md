# Deployment report: detection-engine update

Date: 2026-10-02. Region: `us-east-1`. Mode: `MOCK_AI=true` (Bedrock not enabled).

## Summary

The detection-engine changes (credential-request semantics, host-versus-path link scoring, sender-domain versus link-domain analysis, recruitment and payment-fraud signals) are live. The live API returned results **identical to the local engine in every field** for all 26 messages tested, and the live browser suite passes 17 of 17.

Only the backend Lambda was deployed. The frontend, thresholds, Bedrock configuration and infrastructure were not touched.

## Deployment

| Item | Value |
|---|---|
| Workflow | `infra/README.md`, "Updating the Lambda code": package, upload the zip to the same S3 key, update the function |
| Package command | `cd backend && npm run package` (writes `dist/safi-analyze.zip`) |
| Upload | zip to `lambda/safi-analyze.zip` in the artifacts bucket (S3 presigned `PUT`) |
| Update | Lambda `UpdateFunctionCode` on `safi-analyze` from that S3 object |
| Why not the AWS CLI | no CLI is installed on the build machine, so the same two calls were made through the AWS MCP connection, as in earlier deploys |
| Function | `safi-analyze`, Node.js 22, arm64, 256 MB, 25 s timeout (all unchanged) |
| Deployed at | 2026-10-02 14:37:34 UTC (Lambda `LastModified`) |
| Version | `$LATEST` (no published version) |
| Deployed code hash | `WH3z+oFzo1U2aoo1OOY+XzotwUX3fTxJLaekQ5db7BY=` (18,043 bytes) |
| Matches local zip | yes, byte for byte |
| Previous code hash | `hLKd/AOAkh8059enXyJ2zOI36CKU3CDYZc8G+v9Yix8=` (12,739 bytes) |
| `MOCK_AI` | `true` (unchanged); environment variables unchanged |

### Checks before deploying

- The detection-engine source files and `test/signals.test.ts` were present in the working tree.
- `npm run typecheck`: pass.
- `npx vitest run`: **161 of 161 pass** (57 original, 34 corpus, 70 focused signal tests).

### Rollback

The previously deployed build was copied aside before the upload:

- `lambda/safi-analyze.before-detection-update.zip`: the build that ran immediately before this deploy
- `lambda/safi-analyze.previous.zip`: an older build, from before the Stark & Co. fix

To roll back, copy the chosen object over `lambda/safi-analyze.zip` and run `UpdateFunctionCode` again.

## Live API versus local

All 26 messages (the Stark & Co. regression email plus the 25-message corpus) were sent to the live `POST /analyze` endpoint. All returned HTTP 200, and every field of every response equalled the local engine's output.

Representative fixtures:

| ID | Local result | Live result | Match? |
|---|---|---|---|
| B1 recruitment lure | HIGH RISK / high | HIGH RISK / high | yes |
| B3 executive payment request | HIGH RISK / medium | HIGH RISK / medium | yes |
| D2 legitimate MFA enrollment | SUSPICIOUS / medium | SUSPICIOUS / medium | yes |
| D4 legitimate records update | SUSPICIOUS / medium | SUSPICIOUS / medium | yes |
| B5 benefits lure | HIGH RISK / medium | HIGH RISK / medium | yes |
| D3 legitimate enrollment / SSO | SUSPICIOUS / medium | SUSPICIOUS / medium | yes |
| B2 alumni look-alike | HIGH RISK / medium | HIGH RISK / medium | yes |
| C3 legitimate course registration | SUSPICIOUS / medium | SUSPICIOUS / medium | yes |

## Stark & Co. regression (live)

**HIGH RISK**, threat type **Credential phishing**, confidence **high**, assessment mode rule-based. The link check reports host `bit.ly`, shortened. The local score is 17. The live response is identical to the local one.

Signals found:

- Uses a generic greeting instead of your name.
- Sets a deadline or limited availability to rush your decision.
- Offers an unusually generous benefit (discounts, savings, easy admission, exclusivity).
- Asks you to verify your job, employer or eligibility.
- Asks you to sign in or use single sign-on (SSO) credentials through its own link.
- Names an institution but the link does not appear to belong to it.
- Contains a link you are being asked to follow.
- Uses a link shortener, which hides the real destination.

Why Safi thinks this:

1. It asks you to sign in through a link whose real destination is hidden or unrelated to who the message claims to be.
2. A very attractive offer is paired with a request to verify your job or eligibility, a common way to get you to sign in.
3. It walks you through a familiar scam sequence: attractive offer, deadline, eligibility check, link, then sign-in.
4. It does not address you by name, which is common in mass-sent scams.
5. It sets a deadline or limited availability, a common way to rush you into acting before you check.
6. It offers an unusually generous package (large savings, easy admission and exclusivity), which is a common lure.
7. It asks you to verify your job or eligibility, which can be used to make a sign-in request seem routine.
8. It asks you to sign in or use single sign-on (SSO) credentials on a page it supplies.
9. It names a well-known institution, but the link does not lead to a site that appears to belong to it.

## Browser tests (live site)

```bash
cd frontend
SAFI_SITE=https://d1gyl6fsx526cc.cloudfront.net \
CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" \
node e2e/e2e.mjs
```

**17 of 17 pass**, including the two partnership-portal checks, with no unexpected console or network errors. The two network errors the script reports come from its deliberate "API unreachable" test.

## Problems encountered

- **Upload failed twice with HTTP 400** (`InvalidToken`) before succeeding. The signed upload URL contains long runs of `%2F`, and the run lengths were mistyped when the URL was copied. Nothing was written, and the live function was never affected. The third attempt tried the plausible run lengths and S3 accepted 11 and 10. No code or configuration changed to resolve it.
- **Not checked:** CloudWatch logs were not re-inspected after this deploy. The logging code is unchanged from the version previously checked for metadata-only output.

## Not changed

Risk thresholds, frontend code, Bedrock configuration (still off), IAM, the CloudFormation stack, and test expectations.

## Related documents

- `docs/detection-evaluation.md`: the 25-message corpus evaluation, before and after the detection changes
- `docs/build-report.md`: the original build and deployment report
- `infra/README.md`: deployment steps
