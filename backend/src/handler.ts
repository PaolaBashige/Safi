import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { analyze, loadConfig, type Config, type ModelInvoker } from './analysis';
import { ApiError, LIMITS, validateRequest } from './validate';

/**
 * API Gateway HTTP API (payload v2) handler.
 *   POST /analyze   -> analysis JSON
 *   GET  /health    -> { status: "ok" }
 * CORS is configured on the API Gateway side (see infra/template.yaml).
 * Logging is metadata only: user submissions are never written to logs.
 */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

const respond = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

const errorBody = (code: string, message: string) => ({ error: { code, message } });

export function createHandler(opts: { config?: () => Config; invoke?: ModelInvoker } = {}) {
  const getConfig = opts.config ?? (() => loadConfig());

  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const started = Date.now();
    const method = event.requestContext?.http?.method ?? 'GET';
    const path = event.rawPath ?? '/';
    const requestId = event.requestContext?.requestId ?? 'n/a';

    try {
      if (method === 'GET' && path === '/health') return respond(200, { status: 'ok' });

      if (path !== '/analyze') return respond(404, errorBody('not_found', 'Not found.'));
      if (method !== 'POST') return respond(405, errorBody('method_not_allowed', 'Use POST for /analyze.'));

      const contentType = (event.headers?.['content-type'] ?? event.headers?.['Content-Type'] ?? '').toLowerCase();
      if (!contentType.includes('application/json')) {
        throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
      }

      const rawBody = event.body ?? '';
      const bodyBytes = event.isBase64Encoded ? Buffer.from(rawBody, 'base64') : Buffer.from(rawBody, 'utf8');
      if (bodyBytes.length === 0) throw new ApiError(400, 'empty_body', 'Request body is required.');
      if (bodyBytes.length > LIMITS.bodyBytesImage) {
        throw new ApiError(413, 'payload_too_large', 'The request is too large.');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyBytes.toString('utf8'));
      } catch {
        throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
      }

      // Text requests have a much smaller cap than screenshot requests.
      const declaredType = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).inputType : undefined;
      if (declaredType !== 'screenshot' && bodyBytes.length > LIMITS.bodyBytesText) {
        throw new ApiError(413, 'payload_too_large', 'The request is too large.');
      }

      const request = validateRequest(parsed);
      const { analysis, note } = await analyze(request, getConfig(), opts.invoke);

      console.log(
        JSON.stringify({
          msg: 'analyzed',
          requestId,
          inputType: request.inputType,
          contentLength: request.content.length,
          riskLevel: analysis.riskLevel,
          mode: analysis.assessmentMode,
          note,
          ms: Date.now() - started,
        }),
      );
      return respond(200, analysis);
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(JSON.stringify({ msg: 'rejected', requestId, code: err.code, status: err.status }));
        return respond(err.status, errorBody(err.code, err.message));
      }
      // Never expose internals; log only the error type.
      console.error(JSON.stringify({ msg: 'unhandled_error', requestId, type: err instanceof Error ? err.name : 'unknown' }));
      return respond(500, errorBody('internal_error', 'Something went wrong on our side. Please try again.'));
    }
  };
}

export const handler = createHandler();
