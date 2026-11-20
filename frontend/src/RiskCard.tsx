import { forwardRef } from 'react';
import { RiskIcon } from './icons';
import type { Analysis, RiskLevel } from './types';

const LEVEL_CLASS: Record<RiskLevel, string> = {
  'HIGH RISK': 'high',
  SUSPICIOUS: 'warn',
  'LOW RISK': 'low',
  'UNABLE TO ASSESS': 'unknown',
};

const CONFIDENCE_TEXT = {
  low: 'Low confidence. Treat this as a starting point, not a verdict.',
  medium: 'Medium confidence, based on the signs found.',
  high: 'Higher confidence, because several signs point the same way.',
} as const;

interface Props {
  analysis: Analysis;
  onPractice: () => void;
  onLearn: () => void;
}

export const RiskCard = forwardRef<HTMLElement, Props>(function RiskCard({ analysis: a, onPractice, onLearn }, ref) {
  const signals = a.urlSignals.length > 0 ? a.urlSignals : [];
  const indicators = a.indicators.filter((i) => !signals.includes(i));
  const found = [...indicators, ...signals];

  return (
    <article ref={ref} tabIndex={-1} className={`risk-card ${LEVEL_CLASS[a.riskLevel]}`} aria-labelledby="risk-title">
      <header className="risk-head">
        <span className="risk-icon">
          <RiskIcon level={a.riskLevel} />
        </span>
        <div>
          <p className="risk-label" id="risk-title">
            {a.riskLevel}
          </p>
          <p className="threat-type">{a.threatType}</p>
        </div>
      </header>

      <p className="risk-summary">{a.summary}</p>

      <div className="risk-body">
        <div>
          {a.whyRisky.length > 0 && (
            <section>
              <h3>Why Safi thinks this</h3>
              <ul>
                {a.whyRisky.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          {found.length > 0 && (
            <section>
              <h3>Signals found</h3>
              <ul className="chips">
                {found.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div>
          <section>
            <h3>What to do</h3>
            <ol className="todo">
              {a.recommendedActions.map((r) => (
                <li key={r}>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="learn-strip">
            <h3>Learn</h3>
            <p>{a.educationalTopic}</p>
          </section>
        </div>
      </div>

      <p className="confidence">
        <strong>Assessment:</strong> {CONFIDENCE_TEXT[a.confidence]}{' '}
        <span className="mode">{a.assessmentMode === 'ai' ? 'AI-assisted analysis.' : 'Rule-based analysis.'}</span>
      </p>

      <div className="risk-actions">
        <button type="button" className="btn primary" onClick={onPractice}>
          Test yourself
        </button>
        <button type="button" className="btn" onClick={onLearn}>
          Open Learn
        </button>
      </div>

      <p className="disclaimer">{a.disclaimer}</p>
    </article>
  );
});
