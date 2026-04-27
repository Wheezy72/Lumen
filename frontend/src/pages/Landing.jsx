import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useScrollReveal } from '../hooks/useScrollReveal.js';
import { LandingFooter } from '../components/Footer.jsx';

/* ─── Animated counter (runs once on mount) ──────────────────────────────── */
function useCounter(target, duration = 1600) {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setCount(Math.floor(ease * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return count;
}

/* ─── Parallax hook — subtle vertical shift on scroll ─────────────────────── */
function useParallax(speed = 0.12) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      el.style.transform = `translateY(${window.scrollY * speed}px)`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [speed]);
  return ref;
}

/* ─── Reveal with custom direction ───────────────────────────────────────── */
function useRevealDir(dir = 'up') {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const transforms = {
      up:    'translateY(28px)',
      down:  'translateY(-28px)',
      left:  'translateX(-32px)',
      right: 'translateX(32px)',
      scale: 'scale(0.93) translateY(16px)',
    };
    el.style.opacity = '0';
    el.style.transform = transforms[dir] || transforms.up;
    el.style.transition = 'opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = '1';
          el.style.transform = dir === 'scale' ? 'scale(1) translateY(0)' : 'translateY(0) translateX(0)';
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [dir]);
  return ref;
}

/* ─── Stat chip ──────────────────────────────────────────────────────────── */
function StatChip({ label, value, suffix = '' }) {
  const count = useCounter(value);
  return (
    <div className="glass rounded-full px-5 py-2.5 flex items-center gap-2.5 font-mono text-sm border border-white/10 hover:border-primary-400/30 transition-colors duration-300">
      <span className="text-primary-400 font-bold text-base">{count}{suffix}</span>
      <span className="text-gray-400">{label}</span>
    </div>
  );
}

/* ─── Feature bullet SVG icons ───────────────────────────────────────────── */
const FEATURE_BULLETS = [
  {
    text: 'Live progress — findings stream as each check completes',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    color: 'text-primary-400 bg-primary-500/12 border-primary-500/20',
  },
  {
    text: 'Export as PDF or CSV — ready for your team or client',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    color: 'text-violet-400 bg-violet-500/12 border-violet-500/20',
  },
  {
    text: 'Track regressions — compare results across multiple scans',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    color: 'text-teal-400 bg-teal-500/12 border-teal-500/20',
  },
  {
    text: '10+ OWASP-aligned checks — XSS, headers, cookies, TLS and more',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    color: 'text-amber-400 bg-amber-500/12 border-amber-500/20',
  },
];

/* ─── Marquee items ───────────────────────────────────────────────────────── */
const MARQUEE_ITEMS = [
  'Reflected XSS', 'Security Headers', 'Cookie Flags', 'Open Redirect',
  'TLS / HTTPS', 'Information Leakage', 'CSRF Exposure', 'Directory Listing',
  'Clickjacking', 'Mixed Content', 'Subdomain Takeover', 'CORS Misconfiguration',
];

export default function Landing() {
  const findingsRef    = useScrollReveal();
  const ctaRef         = useScrollReveal();
  const heroLeftRef    = useRevealDir('left');
  const heroRightRef   = useRevealDir('right');
  const findingsLeftRef  = useRevealDir('left');
  const findingsRightRef = useRevealDir('scale');
  const marqueeRef     = useRevealDir('up');
  const parallaxRef    = useParallax(0.08);

  const FINDINGS = [
    { label: 'Reflected XSS',           sev: 'Critical', sevClass: 'severity-row-critical', badge: 'bg-red-500/15 text-red-400 border border-red-500/25' },
    { label: 'Missing security headers', sev: 'High',     sevClass: 'severity-row-high',     badge: 'bg-orange-500/15 text-orange-400 border border-orange-500/25' },
    { label: 'Insecure session cookie',  sev: 'Medium',   sevClass: 'severity-row-medium',   badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/25' },
    { label: 'Verbose error messages',   sev: 'Low',      sevClass: 'severity-row-low',      badge: 'bg-blue-500/15 text-blue-400 border border-blue-500/25' },
    { label: 'TLS version acceptable',   sev: 'Info',     sevClass: 'severity-row-info',     badge: 'bg-gray-500/15 text-gray-400 border border-gray-500/25' },
  ];

  return (
    <div className="min-h-screen text-slate-900 dark:text-white overflow-x-hidden">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-8 pb-10 relative">

        {/* Parallax background blobs */}
        <div ref={parallaxRef} className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
          <div className="absolute -top-20 -left-20 w-96 h-96 bg-primary-600/15 rounded-full blur-3xl" />
          <div className="absolute -top-10 right-0 w-80 h-80 bg-violet-600/12 rounded-full blur-3xl" />
        </div>

        {/* Shimmer badge */}
        <div className="flex justify-center mb-10">
          <div className="shimmer-badge">
            <span className="shimmer-badge-inner">Built for devs who ship fast</span>
          </div>
        </div>

        {/* Two-column split */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* Left: copy */}
          <div ref={heroLeftRef} className="text-left">
            <h1 className="text-5xl sm:text-6xl font-bold leading-[1.06] tracking-tight">
              <span className="text-slate-900 dark:text-white block">Quick security</span>
              <span className="text-slate-900 dark:text-white block">checks for your</span>
              <span className="block bg-gradient-to-r from-primary-400 via-violet-400 to-teal-400 bg-clip-text text-transparent mt-1">
                web app.
              </span>
            </h1>

            <p className="mt-6 text-lg text-slate-600 dark:text-gray-400 leading-relaxed max-w-lg">
              Drop a URL. Get a full security report in under a minute —
              complete with severity ratings, evidence, and remediation guidance.
              No setup. No agent. No noise.
            </p>

            {/* Feature bullets — SVG icons, no emojis */}
            <ul className="mt-7 space-y-3">
              {FEATURE_BULLETS.map(({ text, icon, color }) => (
                <li key={text} className="flex items-start gap-3 text-sm text-slate-600 dark:text-gray-400">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg border shrink-0 mt-0.5 ${color}`}>
                    {icon}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>

            {/* CTAs */}
            <div className="mt-9 flex flex-wrap gap-4">
              <Link to="/register" className="btn btn-primary px-8 py-3.5 text-base font-semibold rounded-full">
                Get started — it's free
              </Link>
              <Link
                to="/login"
                className="px-8 py-3.5 text-base font-semibold rounded-full border border-slate-300 dark:border-white/15 text-slate-700 dark:text-gray-300 hover:border-primary-400/50 hover:text-slate-900 dark:hover:text-white hover:bg-white/5 transition"
              >
                Sign in
              </Link>
            </div>

            {/* Stat chips */}
            <div className="mt-8 flex flex-wrap gap-2.5">
              <StatChip value={10}  label="checks per scan" />
              <StatChip value={100} suffix="%" label="live progress" />
              <StatChip value={2}   label="export formats" />
            </div>
          </div>

          {/* Right: video */}
          <div ref={heroRightRef} className="relative group">
            {/* Outer glow ring */}
            <div className="absolute -inset-2 bg-gradient-to-br from-primary-500 via-violet-500 to-teal-500 rounded-3xl blur-xl opacity-20 group-hover:opacity-35 transition-opacity duration-700" />

            {/* Video frame */}
            <div className="relative rounded-2xl overflow-hidden border border-white/12 shadow-2xl bg-black">
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-900/90 border-b border-white/8">
                <span className="w-3 h-3 rounded-full bg-red-500/70" />
                <span className="w-3 h-3 rounded-full bg-amber-500/70" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
                <div className="ml-3 flex-1 bg-zinc-800/60 rounded-md px-3 py-1 text-xs text-gray-500 font-mono tracking-wide">
                  lumen · security scanner
                </div>
              </div>

              {/* <video src="/demo.mp4" autoPlay loop muted playsInline className="w-full aspect-video object-cover" /> */}

              {/* Placeholder */}
              <div className="aspect-video flex flex-col items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(rgba(59,130,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.3) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

                <button className="relative z-10 w-20 h-20 rounded-full bg-primary-500/20 border border-primary-400/30 text-primary-400 flex items-center justify-center hover:bg-primary-500/35 hover:scale-110 transition-all duration-300 shadow-lg shadow-primary-500/10">
                  <svg className="w-9 h-9 ml-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  <div className="absolute inset-0 rounded-full border border-primary-400/20 animate-ping opacity-30" />
                </button>

                <p className="relative z-10 mt-5 text-gray-500 font-mono text-xs tracking-widest uppercase">
                  Demo — drop in /public/demo.mp4
                </p>

                <div className="absolute bottom-4 left-4 glass border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 status-pulse" />
                  <span className="text-emerald-400 font-medium font-mono">Scan complete — 42s</span>
                </div>

                <div className="absolute top-4 right-4 glass border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400 font-mono font-semibold">
                  3 Critical
                </div>
              </div>
            </div>

            <p className="mt-3 text-center text-xs text-gray-500 font-mono tracking-wide">
              See a full scan from URL to report in real-time
            </p>
          </div>

        </div>
      </section>

      {/* ── Marquee ticker ─────────────────────────────────────────────────── */}
      <div ref={marqueeRef} className="border-y border-white/6 bg-white/[0.02] py-4 overflow-hidden relative">
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[var(--app-bg)] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[var(--app-bg)] to-transparent z-10 pointer-events-none" />

        <div className="marquee-track flex gap-0 whitespace-nowrap">
          {/* Duplicate for seamless loop */}
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-3 px-6 text-sm text-gray-500 font-mono">
              <span className="w-1 h-1 rounded-full bg-primary-400/60 shrink-0" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── Clear findings ─────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">

          <div ref={findingsLeftRef}>
            <span className="inline-block text-xs font-mono font-bold text-primary-400 tracking-widest uppercase mb-4">Sample output</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white leading-tight">
              Clear findings,<br />actionable fixes.
            </h2>
            <p className="mt-4 text-slate-600 dark:text-gray-400 text-base leading-relaxed">
              Every result shows what was checked, evidence collected, and concrete
              steps to reduce risk — not generic advice.
            </p>
            <ul className="mt-7 space-y-3 text-sm text-slate-600 dark:text-gray-400">
              {[
                'Grouped by severity — Critical to Info',
                'Evidence and request details per finding',
                'Remediation guidance you can act on',
                'PDF and CSV export for your team',
                'Compare against previous scans',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-500/15 text-primary-400 shrink-0 mt-0.5">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div ref={findingsRightRef} className="rounded-2xl glass border border-white/8 p-0 overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-white/6 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-mono">OWASP Juice Shop · latest scan</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 status-pulse" />
                <span className="text-[11px] text-emerald-400 font-medium">Completed</span>
              </div>
            </div>

            <ul className="divide-y divide-white/5">
              {FINDINGS.map(({ label, sev, sevClass, badge }) => (
                <li key={label} className={`severity-row ${sevClass} flex items-center justify-between px-5 py-3.5 text-sm hover:bg-white/[0.03] transition-colors cursor-default`}>
                  <span className="text-slate-700 dark:text-gray-300">{label}</span>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${badge}`}>{sev}</span>
                </li>
              ))}
            </ul>

            <div className="px-5 py-3 border-t border-white/6 flex items-center justify-between text-xs text-gray-500">
              <span className="font-mono">5 findings</span>
              <span className="font-mono">Completed in 42s</span>
            </div>

            <div className="px-5 pb-4">
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full w-full bg-gradient-to-r from-primary-500 via-violet-500 to-teal-400 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section ref={ctaRef} className="reveal max-w-5xl mx-auto px-6 py-10 text-center">
        <div className="rounded-3xl overflow-hidden relative px-8 py-20" style={{ background: 'linear-gradient(135deg, rgba(29,78,216,0.9) 0%, rgba(9,9,11,0.95) 50%, rgba(13,148,136,0.3) 100%)' }}>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary-600/25 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-teal-600/20 rounded-full blur-3xl" />
          </div>
          <div className="relative z-10">
            <div className="inline-block mb-5">
              <div className="shimmer-badge">
                <span className="shimmer-badge-inner">Free forever · No agent required</span>
              </div>
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
              Start securing your app<br />in under a minute.
            </h2>
            <p className="text-blue-200/70 text-base mb-10 max-w-md mx-auto">
              Runs locally on your machine. No SaaS, no billing, no surprises.
            </p>
            <Link
              to="/register"
              className="inline-block btn btn-primary px-12 py-4 text-base font-semibold rounded-full hover:scale-105 transition-transform duration-200"
            >
              Create a free account
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}