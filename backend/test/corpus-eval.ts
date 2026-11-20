import { analyzeMessage } from '../src/messageSignals';
import { mockAnalysis } from '../src/mock';
import type { Confidence, RiskLevel } from '../src/types';
import { CORPUS, type CorpusItem, type Expected } from './fixtures/corpus';

/** How an actual result compares with the broad human expectation. */
export type Verdict = 'PASS' | 'BORDERLINE' | 'FALSE_NEGATIVE' | 'FALSE_POSITIVE';

export interface EvalRow {
  id: string;
  group: CorpusItem['group'];
  expected: Expected;
  actual: RiskLevel;
  confidence: Confidence;
  threatType: string;
  score: number;
  categories: string[];
  compounds: string[];
  urlSignals: string[];
  reasons: string[];
  verdict: Verdict;
}

/**
 * Pass/fail rules. They compare the actual level with the human expectation only; they never look at
 * which rules fired.
 *  - phishing expected HIGH RISK: HIGH passes, SUSPICIOUS is borderline, anything lower is a false negative
 *  - phishing expected SUSPICIOUS+: SUSPICIOUS or HIGH passes, anything lower is a false negative
 *  - legitimate: LOW passes, SUSPICIOUS or UNABLE TO ASSESS is borderline, HIGH is a false positive
 */
export function judge(expected: Expected, actual: RiskLevel): Verdict {
  if (expected === 'LOW RISK') {
    if (actual === 'LOW RISK') return 'PASS';
    if (actual === 'HIGH RISK') return 'FALSE_POSITIVE';
    return 'BORDERLINE';
  }
  if (expected === 'SUSPICIOUS+') {
    return actual === 'HIGH RISK' || actual === 'SUSPICIOUS' ? 'PASS' : 'FALSE_NEGATIVE';
  }
  if (actual === 'HIGH RISK') return 'PASS';
  return actual === 'SUSPICIOUS' ? 'BORDERLINE' : 'FALSE_NEGATIVE';
}

/** Runs one fixture through the same deterministic path the Lambda uses in MOCK_AI mode. */
export function evaluate(item: CorpusItem): EvalRow {
  const analysis = mockAnalysis({ inputType: 'message', content: item.content });
  const signals = analyzeMessage(item.content);
  return {
    id: item.id,
    group: item.group,
    expected: item.expected,
    actual: analysis.riskLevel,
    confidence: analysis.confidence,
    threatType: analysis.threatType,
    score: signals.score,
    categories: signals.categories,
    compounds: signals.compounds,
    urlSignals: analysis.urlSignals,
    reasons: analysis.whyRisky,
    verdict: judge(item.expected, analysis.riskLevel),
  };
}

export const evaluateAll = (): EvalRow[] => CORPUS.map(evaluate);
