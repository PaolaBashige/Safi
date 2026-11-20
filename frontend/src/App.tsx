import { useCallback, useEffect, useState } from 'react';
import { AboutPage } from './AboutPage';
import { AnalyzePage } from './AnalyzePage';
import { LearnPage } from './LearnPage';
import { PracticePage } from './PracticePage';
import type { Route } from './types';

const NAV: Array<{ id: Route; label: string }> = [
  { id: 'analyze', label: 'Analyze' },
  { id: 'learn', label: 'Learn' },
  { id: 'practice', label: 'Practice' },
  { id: 'about', label: 'About Safi' },
];

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (NAV.find((n) => n.id === h)?.id ?? 'analyze') as Route;
}

export function App() {
  const [route, setRoute] = useState<Route>(routeFromHash());

  useEffect(() => {
    const onHash = () => {
      setRoute(routeFromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((r: Route) => {
    window.location.hash = `/${r}`;
  }, []);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="strip">
        <div className="wrap">
          <p>A free educational tool. What you paste is checked in memory and never stored.</p>
        </div>
      </div>
      <header className="site-header">
        <div className="wrap bar">
          <a className="brand" href="#/analyze" aria-label="Safi home">
            Safi<span>.</span>
          </a>
          <nav aria-label="Main">
            <ul>
              {NAV.map((n) => (
                <li key={n.id}>
                  <a href={`#/${n.id}`} aria-current={route === n.id ? 'page' : undefined} className={route === n.id ? 'active' : ''}>
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main">
        {route === 'analyze' && <AnalyzePage go={go} />}
        {route === 'learn' && <LearnPage />}
        {route === 'practice' && <PracticePage />}
        {route === 'about' && <AboutPage />}
      </main>

      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div>
            <a className="brand" href="#/analyze" aria-label="Safi home">
              Safi<span>.</span>
            </a>
            <p>Spot the threat. Understand the risk. Build safer habits. A cybersecurity coach for individuals, communities and small teams.</p>
          </div>
          <div>
            <h2>Explore</h2>
            <ul>
              {NAV.map((n) => (
                <li key={n.id}>
                  <a href={`#/${n.id}`}>{n.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Good to know</h2>
            <ul>
              <li>Safi never asks for your passwords or authentication codes.</li>
              <li>Safi does not open the links you give it.</li>
              <li>When in doubt, contact the sender using details you already trust.</li>
            </ul>
          </div>
        </div>
        <div className="wrap footer-base">
          <p>Safi is an educational tool and does not guarantee that anything is safe or malicious. Never share passwords or authentication codes.</p>
        </div>
      </footer>
    </>
  );
}
