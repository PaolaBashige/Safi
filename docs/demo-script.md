# Safi demo script (2 to 3 minutes)

**Setup:** open the live site on the Analyze page. Have the Learn and Practice tabs ready.

## 1. Introduce Safi (20s)
"Phishing and social engineering hit everyone, and most people never get taught how to spot them. Safi is an AI cybersecurity coach that helps people analyze a threat, understand why it is risky, and practice what to do. Social Good, Education, Community."

## 2. Paste a suspicious message (20s)
Pick **Account suspended message** under *Try an example* (or paste):
> URGENT: Your bank account has been suspended. Verify your account immediately: https://example.com/verify

Click **Analyze with Safi**. Point out the warning not to enter passwords or codes.

## 3. Show the HIGH RISK result (20s)
"Safi returns a Risk Card, not a chat reply: a clear level, the threat type, and a plain-language summary."

## 4. Explain why it is risky (30s)
Walk through **Why Safi thinks this** and **Signals found**: urgency, fear of a suspended account, a request to verify, a link to follow. "Each point is a specific, checkable sign, not a vague 'looks bad'."

## 5. Recommended actions (15s)
"It tells you what to do: don't click, don't enter anything, go to the official site yourself, report it. And it is honest about uncertainty, with a confidence note and a disclaimer. It never says a link is definitely safe."

Optional contrast: analyze **Ordinary team message** (LOW RISK, low confidence) and **Shortened link** under the URL tab.

## 6. Open Learn (15s)
"Six short lessons: what it is, what to look for, what to do, including what to do if you already clicked."

## 7. Open Practice (25s)
Run the **suspicious login message** scenario. Choose the risky answer first, then show the non-punitive feedback and lesson. "It builds the habit of pausing and verifying."

## 8. The AWS architecture (30s)
"React on S3 behind CloudFront over HTTPS. API Gateway calls a Lambda that does two things: deterministic security checks, and an Amazon Bedrock adapter using Nova 2 Lite through the Converse API. Model output is validated in code before it reaches the user. Nothing is stored. We built it so the same app runs with rule-based analysis or Bedrock by changing one configuration value."

## 9. The key idea (10s)
"Safi combines deterministic security checks with AI education: reliable signals first, then clear coaching on top."

## Honest notes if asked
- The deployed demo runs in rule-based mode while the AWS account verification for Bedrock inference is pending. The Bedrock path is implemented, tested with an injected model, and switches on with `MockAi=false`.
- Screenshot analysis needs Bedrock; in rule-based mode it asks the user to paste the text.
