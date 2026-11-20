# Safi: your AI cybersecurity coach

> Spot the threat. Understand the risk. Build safer habits.

Safi is an AI-powered cybersecurity education and preparedness coach. It helps individuals, communities and early-stage organizations recognize phishing and social-engineering threats, understand why they are dangerous, and build practical digital-safety skills.

**Hackathon:** Social Good · Education · Community.
Small teams and early-stage organizations are an important future audience, but they do not change the category.

**Live demo:** https://d1gyl6fsx526cc.cloudfront.net (currently running in rule-based mode, see [Mock mode](#mock-mode-default)).

## Product flow

```
Analyze  →  Explain  →  Learn  →  Practice  →  Improve
```

1. **Analyze** a suspicious message, a URL, or a screenshot.
2. **Explain** with a Risk Card: risk level, threat type, why it looks risky, the signals found, and what to do.
3. **Learn** from six short lessons (phishing, social engineering, suspicious links, credential protection, urgency and manipulation, what to do after clicking).
4. **Practice** with non-punitive "What would you do?" scenarios.

Risk levels: `HIGH RISK`, `SUSPICIOUS`, `LOW RISK`, `UNABLE TO ASSESS`. Safi never claims certainty it does not have and never calls a link "safe".

## Architecture

```
Browser ─► CloudFront (HTTPS) ─► S3 (React/Vite static site)
   │
   └────► API Gateway HTTP API ─► Lambda (safi-analyze)
                                      ├─ deterministic checks (URL + message signals)
                                      ├─ Bedrock adapter (Converse, disabled while MOCK_AI=true)
                                      └─ strict JSON validation ─► Risk Card
```

See [docs/architecture.md](docs/architecture.md) for the diagram and design notes.

### AWS services used
Amazon S3, Amazon CloudFront, Amazon API Gateway (HTTP API), AWS Lambda (Node.js 22, arm64), Amazon CloudWatch Logs, AWS IAM (one least-privilege Lambda role), AWS CloudFormation, and Amazon Bedrock Runtime (Converse API; behind a switch). No databases: submissions are never stored.

## Repository layout

```
frontend/   React + Vite + TypeScript single-page app
backend/    Lambda source (TypeScript), unit tests, packaging script
infra/      CloudFormation template (template.yaml) and deployment notes
docs/       architecture, demo script, hackathon evidence
```

## Local development

Requirements: Node.js 20+.

```bash
# backend: tests, typecheck, build the Lambda bundle + zip
cd backend
npm install
npm test
npm run typecheck
npm run package          # dist/index.js and dist/safi-analyze.zip

# frontend
cd ../frontend
npm install
npm run dev              # http://localhost:5173
npm run build            # typecheck + production build into dist/
```

The frontend reads the API address at runtime from `/config.json` (`{ "apiUrl": "https://..." }`). For local work, point it at a deployed API or run the handler in a small local server of your own. Cross-origin requests from `http://localhost:5173` are allowed by the API's CORS configuration.

## Environment variables (Lambda)

| Variable | Default | Purpose |
|---|---|---|
| `MOCK_AI` | `true` | `true` = rule-based analysis only, Bedrock is never called. Only the literal string `false` enables Bedrock. |
| `BEDROCK_MODEL_ID` | `us.amazon.nova-2-lite-v1:0` | Model or inference profile for Converse. |
| `AWS_REGION` | set by Lambda (`us-east-1`) | Region for the Bedrock client. |

No credentials are stored anywhere. Lambda uses its execution role. See `backend/.env.example`.

## Mock mode (default)

With `MOCK_AI=true` the deterministic engine produces every result. It is not a canned response: the output depends on the input.

- Urgency + credential request + suspicious link → `HIGH RISK`
- Some warning signs, not enough evidence → `SUSPICIOUS`
- Ordinary content → `LOW RISK` (low confidence, never "safe")
- Too little to judge → `UNABLE TO ASSESS`
- Screenshots → `UNABLE TO ASSESS` with guidance to paste the text, because the rule engine cannot read images

Results are labelled "Rule-based analysis" in the Risk Card.

## Bedrock integration

Implemented in `backend/src/bedrock.ts`, disabled by default.

- Model: `us.amazon.nova-2-lite-v1:0` in `us-east-1`, via the Bedrock Runtime **Converse** API.
- Nova 2 Lite is prompted for JSON. This is ordinary prompt-based JSON generation followed by application-side validation. It is **not** native Bedrock Structured Outputs.
- `backend/src/validate.ts` parses the reply, enforces enums, caps array sizes and string lengths, strips markup, applies safe defaults, and sets `assessmentMode`, `urlSignals` and the disclaimer itself (never from the model).
- A safety floor stops the model from rating an input below `SUSPICIOUS` when deterministic checks found strong warning signs.
- If the model call fails or returns something unusable, the rule-based result is returned instead, so the UI never breaks.
- Screenshots are sent to the model as image bytes in the same Converse call when Bedrock is enabled.
- The Lambda role already allows `bedrock:InvokeModel` on only this model and its US inference profile.

### Switching from mock to real Bedrock
Once the AWS account verification hold has cleared and a Converse call succeeds:

1. Update the stack with `MockAi=false` (see deployment). The frontend does not change.
2. Analyze a phishing example and check that the Risk Card says "AI-assisted analysis".

## Deployment

`infra/template.yaml` is a single CloudFormation stack (S3 + CloudFront with Origin Access Control, HTTP API, Lambda, IAM role, log group). Details and the exact steps used are in [infra/README.md](infra/README.md).

## Security considerations

- HTTPS only (CloudFront redirects HTTP; HSTS and a strict Content-Security-Policy are set).
- S3 bucket is private; CloudFront reads it through Origin Access Control.
- Lambda role: log writes to its own log group plus `bedrock:InvokeModel` on one model. No other permissions, no credentials in code.
- Request bodies are validated: JSON only, size limits (32 KB text, 5 MB screenshots), image type checked by declared type and file signature.
- Submissions are processed in memory and never stored. Logs contain metadata only (input type, length, risk level, timing), never content.
- Errors return safe messages with no stack traces.
- CORS is limited to the site's own origin (and localhost for development).
- API throttling (10 requests/second, burst 20) limits abuse and cost.
- Safi never fetches the URLs it analyzes (no SSRF surface) and does no external threat-intelligence lookups.

## Known limitations

- Rule-based checks are heuristics. They cannot prove a link is malicious or safe.
- Screenshots cannot be analyzed until Bedrock is enabled.
- No user accounts or progress tracking. Practice scores are not saved.
- English only. Brand look-alike detection covers a short list of commonly impersonated brands.
- No automated browser tests; the UI was verified manually.

## Roadmap

- Enable and evaluate Nova 2 Lite (and compare Claude Haiku 4.5) for richer explanations.
- Optional progress tracking with explicit consent.
- Localization and community-organization lesson packs.
- Guided incident-response checklists for small teams.
- "Report this" helpers for common platforms.

## License

Hackathon prototype. Add a license before wider distribution.
