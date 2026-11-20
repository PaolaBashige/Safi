# Infrastructure and deployment

`template.yaml` is one CloudFormation stack named `safi` in `us-east-1`:

| Resource | Purpose |
|---|---|
| `WebBucket` (S3) | Private bucket for the static site |
| `Distribution` (CloudFront) + OAC | Public HTTPS URL; reads the bucket via Origin Access Control |
| `SecurityHeaders` | HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| `AnalyzeFunction` (Lambda, Node.js 22, arm64) | `safi-analyze`, 256 MB, 25 s timeout |
| `FunctionRole` (IAM) | Log writes to its own log group + `bedrock:InvokeModel` on one model/profile |
| `FunctionLogGroup` | 14-day retention |
| `HttpApi`, routes, `$default` stage | `POST /analyze`, `GET /health`, CORS, throttling (10 rps, burst 20) |

The stack needs an existing S3 bucket that holds the Lambda zip (parameters `CodeBucket`, `CodeKey`). That bucket is created separately so the stack can reference the zip before it exists.

## Deploy (AWS CLI)

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=safi-artifacts-$ACCOUNT-us-east-1

# 1. Build and package
(cd backend && npm ci && npm test && npm run package)
(cd frontend && npm ci && npm run build)

# 2. Artifacts bucket (one time)
aws s3 mb s3://$BUCKET --region us-east-1
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3 cp backend/dist/safi-analyze.zip s3://$BUCKET/lambda/safi-analyze.zip

# 3. Stack (MockAi=true until Bedrock is available)
aws cloudformation deploy --region us-east-1 --stack-name safi \
  --template-file infra/template.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides MockAi=true CodeBucket=$BUCKET CodeKey=lambda/safi-analyze.zip

# 4. Publish the frontend with the runtime API URL
API=$(aws cloudformation describe-stacks --stack-name safi --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
echo "{ \"apiUrl\": \"$API\" }" > frontend/dist/config.json
WEB=$(aws cloudformation describe-stacks --stack-name safi --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='WebBucketName'].OutputValue" --output text)
aws s3 sync frontend/dist s3://$WEB --delete
```

`index.html` and `config.json` are served with caching disabled, and hashed assets are cached, so no invalidation is needed for normal releases.

## Updating the Lambda code

Upload a new zip to the same key, then update the function (the stack parameter alone does not redeploy changed code at the same key):

```bash
aws s3 cp backend/dist/safi-analyze.zip s3://$BUCKET/lambda/safi-analyze.zip
aws lambda update-function-code --function-name safi-analyze --s3-bucket $BUCKET --s3-key lambda/safi-analyze.zip
```

## Switching to Bedrock

Only after a Converse smoke test succeeds in the account:

```bash
aws cloudformation deploy --region us-east-1 --stack-name safi \
  --template-file infra/template.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides MockAi=false CodeBucket=$BUCKET CodeKey=lambda/safi-analyze.zip
```

If the model call ever fails, the Lambda returns the rule-based result, so the site keeps working.

## Teardown

```bash
aws s3 rm s3://$WEB --recursive
aws cloudformation delete-stack --stack-name safi --region us-east-1
aws s3 rb s3://$BUCKET --force
```
