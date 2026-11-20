# Safi: Bedrock inspection for us-east-1

Inspection date: 2026-10-01. Only read-only calls were made (`List*`, `Get*`, documentation reads). No AWS resources were created, changed or deleted, and no models were invoked.

## 1. Is Bedrock available in us-east-1?

Yes. `ListFoundationModels` returned 120 models, and the account has 93 system-defined inference profiles in the Region. All 13 candidate models I checked reported `regionAvailability: AVAILABLE` and `authorizationStatus: AUTHORIZED`.

## 2 and 3. Low-cost text models and Converse support

The AWS docs say Converse "works with all Amazon Bedrock models that support messages". I couldn't find a per-model Converse feature matrix, because the old "supported models and features" page now redirects to a plain model list. So the Converse column is the doc's general rule, not a per-model confirmation. Embedding, rerank and image-generation models are excluded.

| Model | Invocation | Notes |
|---|---|---|
| **Amazon Nova 2 Lite** (`amazon.nova-2-lite-v1:0`) | Inference profile only: `us.amazon.nova-2-lite-v1:0` or `global.amazon.nova-2-lite-v1:0` | Text, image and video input. Blog-cited price is about $0.30/M input and $2.50/M output. |
| **Amazon Nova Micro** (`amazon.nova-micro-v1:0`) | On-demand or inference profile | Text only, cheapest. Blog-cited price is $0.035/M input and $0.14/M output. |
| **Amazon Nova Lite** (`amazon.nova-lite-v1:0`) | On-demand or inference profile | Multimodal. |
| **Claude Haiku 4.5** (`anthropic.claude-haiku-4-5-20251001-v1:0`) | Inference profile only: `us.…` or `global.…` | Strongest of the cheap options, but it needs the first-time-use form. Price not retrieved; check the pricing page. |
| gpt-oss-20b and gpt-oss-120b, Qwen3 32B, Llama 3.3 70B, Ministral 8B, GLM 4.7 Flash | On-demand or inference profile | Cheap open-weight alternatives. All are authorized. |

If a model is "inference profile only", passing the bare model ID fails. Use the `us.` or `global.` ID.

Structured output: the AWS blog documents Converse `outputConfig.textFormat` with `json_schema`, using Claude Opus 4.5 in its example. I could not verify which other models support it, including Nova 2 Lite and Haiku 4.5. Tool use through `toolConfig` is the usual fallback, and its per-model support is also unverified.

## 4. Access and first-time-use requirements

- **Model access:** serverless models are enabled by default. All candidates show `AUTHORIZED` and `entitlementAvailability: AVAILABLE`.
- **Anthropic first-time-use form: not submitted in this account.** `GetUseCaseForModelAccess` returned "You have not filled out the request form". Claude calls will fail until someone submits it, either in the Bedrock playground or through `PutUseCaseForModelAccess`. If you use AWS Organizations, submitting through the API from the management account covers the child accounts.
- **Third-party models:** the first call starts a background Marketplace subscription, which can take up to 15 minutes. The calling IAM role needs `aws-marketplace:Subscribe`, `Unsubscribe` and `ViewSubscriptions`, and the account needs a valid payment method. IAM permissions and payment method were not checked.
- **Amazon Nova:** no form or Marketplace step is needed.
- The Anthropic models show `agreementAvailability: NOT_AVAILABLE`. It is unclear what this means for them, so no conclusion is drawn from it.

## 5. Recommendation: Nova 2 Lite

Use `us.amazon.nova-2-lite-v1:0` for the first prototype.

- **Cost:** it costs cents per thousand coaching turns.
- **Ready now:** there's no Anthropic form to submit and no Marketplace subscription to wait on.
- **Capability:** it's a current-generation model with room to grow into multimodal input, such as screenshots of phishing emails.
- **Latency:** not measured. Nova Micro is the fastest and cheapest fallback if only short text replies are needed.

Add Claude Haiku 4.5 as the comparison model. It's the likelier winner on nuanced explanations and on reliably following a JSON schema, but only after the form is submitted. Keep the model ID in config so switching is a one-line change.

These recommendations rest on model size, tier and general reputation. Neither model was tested on cybersecurity education content.

Suggested next step: run a small test of about 20 Safi-style prompts against both models. It would check schema compliance, quality, latency and refusals on security topics. Defensive content like phishing awareness and incident preparedness can trigger refusals on some models. The test makes real invocations, which cost a few cents, so it has not been run.

## 6. Sources

- Converse API: https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html
- Model access and Anthropic form: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html
- Model catalog: https://docs.aws.amazon.com/help-panel/bedrock/latest/console/hp-model-catalog.html
- Simplified model access: https://aws.amazon.com/blogs/security/simplified-amazon-bedrock-model-access/
- Models at a glance: https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html
- Structured outputs: https://aws.amazon.com/blogs/machine-learning/structured-outputs-on-amazon-bedrock-schema-compliant-ai-responses/
- Nova 2 Lite pricing: https://aws.amazon.com/blogs/machine-learning/pair-nova-2-lite-with-claude-for-cost-optimized-document-processing/
- Nova Micro pricing: https://aws.amazon.com/blogs/machine-learning/cost-efficient-custom-text-to-sql-using-amazon-nova-micro-and-amazon-bedrock-on-demand-inference/

The prices come from blog posts, not the official pricing page, so confirm them at https://aws.amazon.com/bedrock/pricing/.
