import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import LearnCard from '../components/LearnCard.jsx';
import { LEARN_HEADER_ART, LEARN_INCIDENTS, LEARN_TOPICS } from './learnContent.js';

export default function Vulnerabilities() {
  const [expandedCard, setExpandedCard] = useState(null);
  const [activeTab, setActiveTab] = useState('vulnerabilities');
  const location = useLocation();

  const toggleCard = (id) => setExpandedCard((prev) => (prev === id ? null : id));

  useEffect(() => {
    if (!location.hash) return;

    const hash = location.hash.replace('#', '');
    const match = LEARN_TOPICS.find((v) => v.slug === hash);
    if (!match) return;

    setExpandedCard(match.id);

    const el = document.getElementById(match.slug);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="rounded-2xl border border-slate-800 bg-dark-200 p-6 sm:p-8 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/15 to-secondary-500/10 dark:from-primary-500/20 dark:to-secondary-500/15" />
        <div className="absolute -top-24 -right-24 w-[340px] h-[340px] rounded-full bg-primary-500/10 blur-3xl" />
        <div className="absolute -bottom-28 -left-28 w-[360px] h-[360px] rounded-full bg-secondary-500/10 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">
              Learning centre
            </h1>
            <p className="text-sm text-gray-500 mt-2 max-w-2xl">
              Quick notes on common web issues. Keep it simple: understand it, fix it, verify it.
            </p>
            <p className="text-xs text-gray-500 mt-2 max-w-2xl">
              Images are optional. Add <span className="font-mono">/learn/&lt;slug&gt;.png</span> (or jpg/jpeg) in <span className="font-mono">frontend/public/learn</span>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <TabButton active={activeTab === 'vulnerabilities'} onClick={() => setActiveTab('vulnerabilities')}>
              Topics
            </TabButton>
            <TabButton active={activeTab === 'breaches'} onClick={() => setActiveTab('breaches')}>
              Incidents
            </TabButton>
            <Link to="/new" className="btn btn-primary text-sm px-4 py-2">
              New scan
            </Link>
          </div>
        </div>
      </div>

      {activeTab === 'vulnerabilities' && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-dark-200 p-5">
            <h2 className="text-sm font-semibold text-gray-200">Common topics</h2>
            <p className="text-sm text-gray-500 mt-2">
              Expand a card for a short explanation and a fix checklist.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {LEARN_TOPICS.map((topic) => {
              const art = LEARN_HEADER_ART[topic.slug] || { from: 'from-primary-500/20', to: 'to-secondary-500/10' };
              const expanded = expandedCard === topic.id;

              return (
                <LearnCard
                  key={topic.id}
                  topic={topic}
                  art={art}
                  expanded={expanded}
                  onToggle={() => toggleCard(topic.id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'breaches' && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-dark-200 p-5">
            <h2 className="text-sm font-semibold text-gray-200">Security incidents</h2>
            <p className="text-sm text-gray-500 mt-2">
              A few examples that show the impact when security goes wrong.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {LEARN_INCIDENTS.map((b, i) => (
              <article key={i} className="rounded-xl border border-slate-800 bg-dark-200 p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-200">{b.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">{b.affected} • {b.impact}</p>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-gray-400 border border-slate-800">
                    {b.type}
                  </span>
                </div>

                <p className="text-sm text-gray-500 leading-relaxed">{b.description}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-full text-sm font-medium border transition ${
        active
          ? 'bg-primary-500/15 text-primary-400 border-primary-500/25'
          : 'bg-slate-500/10 text-gray-400 border-slate-800 hover:bg-black/5 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}