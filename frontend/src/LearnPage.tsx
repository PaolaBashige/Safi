import { LESSONS } from './content';

export function LearnPage() {
  return (
    <div className="wrap">
      <section className="page-head">
        <p className="kicker">Learn</p>
        <h1>
          Short lessons, <em>practical</em> answers
        </h1>
        <p className="lede">Each lesson covers what the threat is, what to look for, and what to do. Read one in two minutes.</p>
      </section>
      <div className="lesson-list section">
        {LESSONS.map((l, i) => (
          <article key={l.id} className="lesson" id={l.id}>
            <div>
              <span className="lesson-num">{String(i + 1).padStart(2, '0')}</span>
              <h2>{l.title}</h2>
              <h3 className="sr-only">What it is</h3>
              <p className="lesson-what">{l.what}</p>
            </div>
            <div className="lesson-cols">
              <div>
                <h3>What to look for</h3>
                <ul>
                  {l.lookFor.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>What to do</h3>
                <ul className="do">
                  {l.doThis.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
