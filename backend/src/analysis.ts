import { invokeBedrock } from './bedrock';
import { mockAnalysis, runDeterministic, type Deterministic } from './mock';
import type { Analysis, AnalyzeRequest } from './types';
import { extractJson, sanitizeModelOutput } from './validate';

export interface Config {
  /** When true, Bedrock is never called. Default is true. */
  mockAi: boolean;
  region: string;
  modelId: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    // Anything other than the literal string "false" keeps Bedrock disabled (fail safe).
    mockAi: (env.MOCK_AI ?? 'true').trim().toLowerCase() !== 'false',
    region: env.AWS_REGION || 'us-east-1',
    modelId: env.BEDROCK_MODEL_ID || 'us.amazon.nova-2-lite-v1:0',
  };
}

export type ModelInvoker = (req: AnalyzeRequest, det: Deterministic, cfg: Config) => Promise<string>;

const defaultInvoker: ModelInvoker = (req, det, cfg) =>
  invokeBedrock(req, det, { region: cfg.region, modelId: cfg.modelId });

export interface AnalyzeOutcome {
  analysis: Analysis;
  /** Short machine-readable note for logs (never includes user content). */
  note: 'mock' | 'ai' | 'ai_fallback_error' | 'ai_fallback_invalid';
}

/**
 * Deterministic checks always run. With MOCK_AI=true the rule-based engine produces the result.
 * With MOCK_AI=false the model is asked for JSON, which is parsed and strictly validated;
 * if the model call or validation fails, the rule-based result is returned instead.
 */
export async function analyze(req: AnalyzeRequest, cfg: Config, invoke: ModelInvoker = defaultInvoker): Promise<AnalyzeOutcome> {
  const det = runDeterministic(req);

  if (cfg.mockAi) {
    return { analysis: mockAnalysis(req, det), note: 'mock' };
  }

  let text: string;
  try {
    text = await invoke(req, det, cfg);
  } catch {
    return { analysis: mockAnalysis(req, det), note: 'ai_fallback_error' };
  }

  try {
    const analysis = sanitizeModelOutput(extractJson(text), {
      urlChecks: det.url,
      strongDeterministicRisk: (det.url?.score ?? 0) >= 5 || (det.message?.score ?? 0) >= 6,
    });
    return { analysis, note: 'ai' };
  } catch {
    return { analysis: mockAnalysis(req, det), note: 'ai_fallback_invalid' };
  }
}
