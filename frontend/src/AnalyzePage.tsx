import { useEffect, useRef, useState } from 'react';
import { analyze, AnalyzeError } from './api';
import { EXAMPLES } from './content';
import { Info } from './icons';
import { RiskCard } from './RiskCard';
import type { Analysis, InputType, Route } from './types';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_MESSAGE = 5000;

const TABS: Array<{ id: InputType; label: string }> = [
  { id: 'message', label: 'Suspicious Message' },
  { id: 'url', label: 'URL' },
  { id: 'screenshot', label: 'Screenshot' },
];

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

export function AnalyzePage({ go }: { go: (r: Route) => void }) {
  const [tab, setTab] = useState<InputType>('message');
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    if (result) cardRef.current?.focus();
  }, [result]);

  const canSubmit = !loading && (tab === 'message' ? message.trim().length > 0 : tab === 'url' ? url.trim().length > 0 : !!file);

  function chooseTab(t: InputType) {
    setTab(t);
    setError(null);
    setResult(null);
  }

  function onFile(f: File | undefined) {
    setError(null);
    setResult(null);
    if (!f) return setFile(null);
    if (!IMAGE_TYPES.includes(f.type)) {
      setFile(null);
      return setError('Please choose a PNG, JPEG, WebP or GIF image.');
    }
    if (f.size > MAX_IMAGE_BYTES) {
      setFile(null);
      return setError('That image is larger than 3 MB. Try a smaller screenshot.');
    }
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (tab === 'screenshot' && file) {
        setResult(await analyze({ inputType: 'screenshot', content: await toBase64(file), metadata: { mimeType: file.type } }));
      } else {
        setResult(await analyze({ inputType: tab, content: tab === 'message' ? message : url }));
      }
    } catch (err) {
      setError(err instanceof AnalyzeError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const examples = EXAMPLES.filter((x) => x.type === tab);

  return (
    <>
      <div className="wrap">
        <section className="hero">
          <div className="hero-intro">
            <p className="kicker">Your AI cybersecurity coach</p>
            <h1>
              Spot the threat. <em>Understand</em> the risk. Build safer habits.
            </h1>
            <p className="lede">
              Paste a suspicious message or link. Safi checks it for common warning signs, explains in plain language why it may be risky, and helps
              you practice what to do next.
            </p>
          </div>

          <ol className="steps" aria-label="How Safi works">
              <li>
                <span>
                  <strong>Analyze.</strong>Paste a message, a link or a screenshot.
                </span>
              </li>
              <li>
                <span>
                  <strong>Explain.</strong>Get a plain-language report on what stood out.
                </span>
              </li>
              <li>
                <span>
                  <strong>Learn.</strong>Read short lessons on the tactic you just met.
                </span>
              </li>
              <li>
                <span>
                  <strong>Practice.</strong>Try everyday scenarios with no wrong answers.
                </span>
              </li>
              <li>
                <span>
                  <strong>Improve.</strong>Turn pausing and checking into a habit.
                </span>
              </li>
          </ol>

          <form className="checker" onSubmit={submit} aria-busy={loading}>
            <h2>Check something suspicious</h2>
            <p className="sub">Safi reads the text and the shape of a link. It never opens anything.</p>
            <div className="tabs" role="tablist" aria-label="What would you like to check?">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls="input-panel"
                  className={tab === t.id ? 'tab active' : 'tab'}
                  onClick={() => chooseTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div id="input-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
              {tab === 'message' && (
                <>
                  <label htmlFor="msg">Paste the message you received</label>
                  <textarea
                    id="msg"
                    rows={6}
                    maxLength={MAX_MESSAGE}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Paste the text of the email, text message or direct message here"
                  />
                  <p className="hint">
                    {message.length}/{MAX_MESSAGE}
                  </p>
                </>
              )}
              {tab === 'url' && (
                <>
                  <label htmlFor="url">Paste the link (do not open it)</label>
                  <input
                    id="url"
                    type="text"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://"
                  />
                  <p className="hint">Safi only reads the address. It never visits the link.</p>
                </>
              )}
              {tab === 'screenshot' && (
                <>
                  <label htmlFor="shot">Upload a screenshot of the message</label>
                  <input id="shot" type="file" accept={IMAGE_TYPES.join(',')} onChange={(e) => onFile(e.target.files?.[0])} />
                  <p className="hint">
                    PNG, JPEG, WebP or GIF, up to 3 MB. Screenshots are analyzed in memory and are not stored. Crop out personal details first.
                  </p>
                  {preview && <img className="preview" src={preview} alt="Preview of the screenshot you selected" />}
                </>
              )}
            </div>

            {examples.length > 0 && (
              <div className="examples">
                <span>Try an example:</span>
                {examples.map((x) => (
                  <button
                    key={x.label}
                    type="button"
                    className="chip-btn"
                    onClick={() => {
                      setError(null);
                      setResult(null);
                      if (x.type === 'message') setMessage(x.content);
                      else setUrl(x.content);
                    }}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            )}

            <p className="warning" role="note">
              <Info size={18} />
              <strong>Never submit passwords, authentication codes, private keys, or other highly sensitive information.</strong>
            </p>

            <button className="btn primary big" type="submit" disabled={!canSubmit}>
              {loading ? 'Safi is analyzing…' : 'Analyze with Safi'}
            </button>
          </form>
        </section>

        <div aria-live="polite">
          {loading && (
            <div className="status" role="status">
              <span className="spinner" aria-hidden="true" /> Checking for warning signs…
            </div>
          )}
          {error && (
            <div className="status error" role="alert">
              {error}
            </div>
          )}
          {result && <RiskCard ref={cardRef} analysis={result} onPractice={() => go('practice')} onLearn={() => go('learn')} />}
        </div>
      </div>

      <section className="band" aria-labelledby="sample-title">
        <div className="wrap band-grid">
          <div>
            <p className="kicker">An example</p>
            <h2 id="sample-title">
              How Safi <em>reads</em> a message
            </h2>
            <p className="lede">
              Scam messages rarely say &ldquo;this is a scam&rdquo;. They lean on a handful of tactics. Here is a made-up message with the details Safi
              would pick up on marked.
            </p>
            <ol className="notes">
              <li>
                <span>
                  <strong>A generic greeting</strong>
                  <span>Mass-sent messages often skip your name.</span>
                </span>
              </li>
              <li>
                <span>
                  <strong>A request to verify a password</strong>
                  <span>Real organizations do not ask for this by message.</span>
                </span>
              </li>
              <li>
                <span>
                  <strong>A ticking clock</strong>
                  <span>Deadlines are meant to stop you from checking first.</span>
                </span>
              </li>
              <li>
                <span>
                  <strong>A link that is not the real site</strong>
                  <span>No encryption, and a sign-in path on an unfamiliar address.</span>
                </span>
              </li>
            </ol>
          </div>
          <figure className="sample" aria-label="Example scam message with four warning signs marked">
            <div className="sample-meta">
              <div>
                <strong>From:</strong> Account Security &lt;no-reply@secure-notice.example&gt;
              </div>
              <div>
                <strong>Subject:</strong> Action required on your account
              </div>
            </div>
            <p>
              <mark>
                Dear customer<sup>1</sup>
              </mark>
              ,
            </p>
            <p>
              We noticed unusual activity on your account. Please{' '}
              <mark>
                verify your password<sup>2</sup>
              </mark>{' '}
              <mark>
                within 24 hours<sup>3</sup>
              </mark>{' '}
              or your account will be closed.
            </p>
            <p>
              <mark>
                http://secure-notice.example/login/verify<sup>4</sup>
              </mark>
            </p>
            <p>
              Thank you,
              <br />
              The Security Team
            </p>
          </figure>
        </div>
      </section>
    </>
  );
}
