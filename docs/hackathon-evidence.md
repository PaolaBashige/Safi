# Hackathon evidence: Claude Code connected to AWS

This checklist records proof that the coding agent worked against a real AWS account through the `aws-mcp` connection. Attach real screenshots or terminal output where marked. Do not include credentials, account IDs, session tokens or presigned URLs.

## 1. Claude Code ↔ AWS MCP connection
- [x] `aws-mcp` server connected in Claude Code (`/mcp` showed "Authentication successful. Connected to aws-mcp"). Initial calls failed with "needs you to sign in again" until re-authenticated.
- [ ] Attach: screenshot of `/mcp` showing `aws-mcp` connected.

## 2. AWS Region inspection
- [x] `list_regions` returned the AWS Region catalog (37 Regions).
- [x] Account Region status checked with the Account API (`ListRegions`): 17 Regions enabled by default, 17 opt-in Regions disabled.
- [x] Development Region chosen: `us-east-1`.
- [ ] Attach: screenshot or transcript of the Region list and opt-in status.

## 3. Bedrock model inspection (read-only)
- [x] `ListFoundationModels` (120 models) and `ListInferenceProfiles` (93 profiles) in `us-east-1`.
- [x] `GetFoundationModelAvailability` for 13 candidate models: all `AUTHORIZED`.
- [x] Anthropic first-time-use form checked: not submitted (`GetUseCaseForModelAccess` → ResourceNotFound).
- [x] Documentation sources read (see `docs/bedrock-inspection.md`).
- [x] Recommendation: `us.amazon.nova-2-lite-v1:0` via Converse.

## 4. Bedrock smoke test
- [x] One `Converse` call to `us.amazon.nova-2-lite-v1:0` in `us-east-1`.
- [x] Result: **failed**, `AccessDeniedException`: "Your account is currently being verified. Verification normally takes less than 2 hours." Not retried.
- [ ] Re-run once after verification clears and record the result here: `____`

## 5. AWS deployment actions
- [x] Pre-deployment inventory: no existing Lambda functions, S3 buckets, HTTP APIs or CloudFront distributions in `us-east-1`.
- [x] Created artifacts bucket `safi-artifacts-<account>-us-east-1` (private, tagged `Project=safi`).
- [x] Uploaded the Lambda package and CloudFormation template via presigned URLs.
- [x] `ValidateTemplate`, then `CreateStack` named `safi` (`CAPABILITY_IAM`, `MockAi=true`).
- [x] Stack `safi` reached `CREATE_COMPLETE` (S3 web bucket, CloudFront distribution + OAC + security-headers policy, Lambda `safi-analyze`, IAM role, log group, HTTP API with `POST /analyze` and `GET /health`).
- [x] Built frontend uploaded to the web bucket via presigned URLs (5 files). No invalidation needed: the distribution was new.
- [x] Deployed Lambda invoked directly in mock mode (HIGH RISK for the phishing example, 400 for an invalid request, `/health` ok). No Bedrock call made.
- [ ] Attach: CloudFormation stack resources screenshot.

## 6. Final live URLs
- Site: https://d1gyl6fsx526cc.cloudfront.net
- API: https://5e5jr4k6g0.execute-api.us-east-1.amazonaws.com
- Current mode: `MOCK_AI=true` (Bedrock integration implemented, not yet enabled)

## 7. Test evidence
- [x] Backend unit tests: 33 passing (`cd backend && npm test`); typecheck clean.
- [x] Frontend production build succeeds (`cd frontend && npm run build`); bundle contains no AWS credentials.
- [x] Live site checks (2026-10-01): HTTPS 200; HTTP redirects to HTTPS; HSTS, CSP, X-Frame-Options, nosniff and referrer headers present; direct S3 URL returns 403.
- [x] Live API checks: CORS allows only the CloudFront origin (preflight from another origin gets no `access-control-allow-origin`); responses are valid JSON; invalid input returns a safe 400.
- [x] Headless Chrome run against the live site (`frontend/e2e/e2e.mjs`): 15 of 15 checks pass, no unexpected console or network errors. Covers the analyze flow, URL tab, Learn (6 lessons), Practice, About, no horizontal scroll at 390 px, and the error state.
- [x] CloudWatch logs sampled: metadata only, no submitted content found.
- [ ] Attach: screenshot of the live Risk Card.
