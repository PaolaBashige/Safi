# Safi MVP: build and deployment report

Date: 2026-10-01. Region: `us-east-1`. Mode: `MOCK_AI=true` (Bedrock integration built, switched off).

## Summary

Safi is deployed and working end to end in rule-based mode. The Bedrock adapter is implemented and tested with an injected model. It has not been run against live Bedrock because the AWS account is still being verified. Bedrock inference was not retried during this build.

- **Public URL:** https://d1gyl6fsx526cc.cloudfront.net
- **API URL:** https://5e5jr4k6g0.execute-api.us-east-1.amazonaws.com (`POST /analyze`, `GET /health`)

## 1. Environment found before building

- The working directory held only the earlier Bedrock inspection report, so this was a fresh start.
- Node.js 24, npm 11, Python 3.14 and git were installed.
- The AWS CLI, SAM, CDK, Amplify CLI and Terraform were not installed. There was no `~/.aws` directory.
- The AWS MCP connection (`aws-mcp`) worked and was signed in as the account root user.
- The account was empty in `us-east-1`: no Lambda functions, S3 buckets, HTTP APIs or CloudFront distributions.
- Because there was no CLI, deployment went through the MCP using CloudFormation, with files uploaded through presigned S3 URLs.

## 2. Project structure

```
safi/
  README.md
  frontend/    React + Vite + TypeScript app, e2e/ browser smoke test
  backend/     Lambda source (TypeScript), tests, packaging script
  infra/       template.yaml (CloudFormation), README.md (deploy steps)
  docs/        architecture.md, demo-script.md, hackathon-evidence.md,
               bedrock-inspection.md, build-report.md
```

## 3. What was built

### Backend (`backend/src`)
| File | Purpose |
|---|---|
| `urlAnalysis.ts` | Deterministic URL checks: HTTPS, IP host, shorteners, punycode, subdomain depth, odd TLDs, encoding tricks, `@` userinfo, length, credential-themed paths, brand look-alikes. Pure string analysis, no network calls. |
| `messageSignals.ts` | Message checks: urgency, credential requests, fear, payment pressure, prizes, secrecy, click prompts, delivery themes. |
| `mock.ts` | Rule-based engine that picks the risk level from the signals. Output depends on the input. |
| `validate.ts` | Request validation and strict model-output validation (enums, array and string limits, markup stripping, safe defaults). |
| `bedrock.ts` | Converse call to `us.amazon.nova-2-lite-v1:0`, prompt-based JSON (not native Structured Outputs), screenshot support. Loaded only when `MOCK_AI=false`. |
| `analysis.ts` | Orchestrator. Only the literal string `false` enables Bedrock. Falls back to the rule engine on model error or invalid output. |
| `handler.ts` | API Gateway handler: routing, size limits, safe errors, metadata-only logging. |

### Frontend (`frontend/src`)
- **Analyze:** tabs for Suspicious Message, URL and Screenshot. The screenshot tab checks type and size and shows a preview. There are example inputs, the sensitive-information warning, and loading and error states.
- **Risk Card:** risk level, threat type, summary, why Safi thinks this, signals found, recommended actions, a Learn topic, a confidence note and a "Test yourself" button. It labels the analysis "Rule-based" or "AI-assisted".
- **Learn:** six lessons, each with what it is, what to look for and what to do.
- **Practice:** four non-punitive scenarios (suspicious login text, urgent payment request, shortened link, code request).
- **About:** the required statement, with no unsupported impact claims.
- **Accessibility:** skip link, keyboard-operable tabs, `aria-live` regions, focus moves to the result, dark mode, and a mobile layout.
- The API address is read at runtime from `/config.json`, so the same build works in any environment.

### Mock-mode behavior
| Input | Result |
|---|---|
| Urgency + credential request + suspicious link | `HIGH RISK` |
| Some warning signs, not enough evidence (for example a delivery message with a shortened link) | `SUSPICIOUS` |
| Ordinary message or a clean-looking URL | `LOW RISK` with low confidence, and never a claim of safety |
| Very short text or a bare link with no context | `UNABLE TO ASSESS` |
| Screenshot | `UNABLE TO ASSESS`, with advice to paste the text |

One design decision from testing: the first version rated a short delivery message with a shortened `http` link as `HIGH RISK`. That was too aggressive for two weak signals. `HIGH RISK` for messages now needs several independent signals, a credential request, or a strongly suspicious link.

## 4. AWS resources created

All in `us-east-1`, tagged `Project=safi`.

**CloudFormation stack `safi`** (`CAPABILITY_IAM`, `MockAi=true`):
- S3 web bucket: private, encrypted, public access blocked.
- CloudFront distribution with Origin Access Control, redirect to HTTPS, HTTP/2 and 3, and `PriceClass_100`.
- Response-headers policy: HSTS, CSP, X-Frame-Options DENY, nosniff and referrer policy.
- Lambda `safi-analyze`: Node.js 22, arm64, 256 MB, 25 s timeout.
- IAM execution role, with two inline policies:
  - Log writes to its own log group only.
  - `bedrock:InvokeModel` on `amazon.nova-2-lite-v1:0` and its US inference profile only. Inert while `MOCK_AI=true`.
- CloudWatch log group with 14-day retention.
- HTTP API with `POST /analyze` and `GET /health`, CORS limited to the CloudFront origin and `http://localhost:5173`, throttled to 10 requests per second with a burst of 20.

**Outside the stack:**
- One private S3 bucket, `safi-artifacts-<account>-us-east-1`, holding the Lambda zip and the template.

No IAM resources were modified. No database, NAT gateway, Marketplace subscription or account upgrade.

## 5. Tests and results

| Check | Result |
|---|---|
| Backend unit tests | 33 of 33 pass |
| Backend typecheck (used as lint) | clean |
| Frontend typecheck and production build | pass (about 246 kB JS, 78 kB gzipped) |
| Live Lambda invoked in mock mode | phishing example returned `HIGH RISK`; invalid request returned a clean 400; `/health` returned ok |
| HTTP to HTTPS | 301 redirect |
| Security headers on the site | HSTS, CSP, X-Frame-Options, nosniff and referrer policy all present |
| Direct S3 URL | 403 |
| CORS preflight | allowed origin receives the header; `https://evil.example` does not |
| Secret scan of served JavaScript | clean |
| CloudWatch logs (first 35 events sampled) | metadata only, no submitted content |
| Headless Chrome against the live site | 15 of 15 checks pass, no unexpected console or network errors |

The browser run covered the analyze flow, the Risk Card contents, focus handling, the URL tab, a low-risk message, the screenshot tab, Learn (six lessons), Practice, About, no horizontal scroll at 390 px, and a friendly error when the API is blocked. The script is `frontend/e2e/e2e.mjs`.

One check failed on its first run and was a flaw in my test, not in the product. Its pattern matched the disclaimer's "not a guarantee that something is safe or malicious". I narrowed the pattern and the rerun passed.

## 6. Problems encountered and how they were fixed

- **No AWS CLI locally.** Deployed through the AWS MCP with CloudFormation and presigned S3 uploads instead.
- **A long signed URL was mistyped** on the first template upload, giving a 400. I requested a fresh URL and the upload succeeded.
- **A long wait on the stack timed out the MCP script.** I switched to short, bounded status checks. CloudFront was not blocked by the account verification.
- **The browser test first failed to start,** because the shell removed the backslashes in the Chrome path. Forward slashes fixed it.

## 7. Known limitations

- Screenshots cannot be analyzed until Bedrock is enabled.
- The Bedrock request, JSON validation and fallback are tested only with an injected model, not against live Bedrock. In particular, Nova 2 Lite's compliance with the JSON-only instruction is unverified.
- URL and message checks are heuristics, can be wrong, and never prove anything is safe or malicious.
- English only. Brand look-alike detection covers a short list of brands.
- Practice progress is not saved, and there are no accounts.
- The deployment uses the AWS root user's credentials through the MCP connection. For anything beyond the hackathon, use a least-privilege IAM identity.
- The log check read only the first page of results (35 events).

## 8. Remaining blocker and next actions

**Blocker:** Bedrock inference is blocked until AWS finishes verifying the account. The earlier smoke test failed with `AccessDeniedException: Your account is currently being verified`.

1. Wait for verification. AWS says it normally takes under 2 hours. If it still blocks after that, email `aws-verification@amazon.com`.
2. Re-run the single Nova 2 Lite smoke test.
3. If it passes, update the stack with `MockAi=false` (see `infra/README.md`) and confirm a phishing example shows "AI-assisted analysis". The frontend does not change.
4. Before submitting, attach screenshots to `docs/hackathon-evidence.md`: `/mcp` showing `aws-mcp` connected, the CloudFormation resources, and the live Risk Card.
