import { useState } from 'react';
import { SCENARIOS } from './content';
import { Check, Triangle } from './icons';

export function PracticePage() {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [saferCount, setSaferCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const scenario = SCENARIOS[index];
  if (!scenario) return null;
  const choice = picked !== null ? scenario.choices[picked] : null;

  function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    if (scenario?.choices[i]?.safer) setSaferCount((c) => c + 1);
  }

  function next() {
    if (index + 1 >= SCENARIOS.length) return setFinished(true);
    setIndex(index + 1);
    setPicked(null);
  }

  function restart() {
    setIndex(0);
    setPicked(null);
    setSaferCount(0);
    setFinished(false);
  }

  if (finished) {
    return (
      <div className="wrap">
        <section className="finish">
          <p className="kicker">All done</p>
          <h1>
            Nice <em>work</em>
          </h1>
          <p className="lede">
            You picked the safer response in {saferCount} of {SCENARIOS.length} scenarios. There are no grades here. The goal is to build the habit of
            pausing and verifying.
          </p>
          <button className="btn primary" type="button" onClick={restart}>
            Practice again
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="wrap">
      <section className="page-head">
        <p className="kicker">Practice</p>
        <h1>
          Test <em>yourself</em>
        </h1>
        <p className="lede">There are no wrong answers, only chances to learn. Pick what you would do.</p>
      </section>

      <section className="scenario section" aria-labelledby="scenario-title">
        <div>
          <p className="progress">
            Scenario {index + 1} of {SCENARIOS.length}
          </p>
          <h2 id="scenario-title">{scenario.title}</h2>
          <p>{scenario.setup}</p>
          <blockquote className="sample-message">{scenario.message}</blockquote>
        </div>

        <div>
          <p className="question">What would you do?</p>
          <ul className="choices">
            {scenario.choices.map((c, i) => {
              const state = picked === null ? '' : picked === i ? (c.safer ? 'safer' : 'riskier') : c.safer ? 'safer-ghost' : '';
              return (
                <li key={c.text}>
                  <button type="button" className={`choice ${state}`} onClick={() => pick(i)} disabled={picked !== null && picked !== i} aria-pressed={picked === i}>
                    <span>{c.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div aria-live="polite">
            {choice && (
              <div className={`feedback ${choice.safer ? 'safer' : 'riskier'}`}>
                <p className="verdict">
                  {choice.safer ? <Check size={20} /> : <Triangle size={20} />}
                  {choice.safer ? 'Safer choice' : 'Riskier choice'}
                </p>
                <p>{choice.feedback}</p>
                <p className="lesson-line">
                  <strong>Lesson:</strong> {scenario.lesson}
                </p>
                <button type="button" className="btn primary" onClick={next}>
                  {index + 1 >= SCENARIOS.length ? 'Finish' : 'Next scenario'}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
