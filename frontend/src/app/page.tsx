'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/api';
import { TrendingUp, ArrowRight } from 'lucide-react';
import Dashboard from '@/components/Dashboard';

type AuthTab = 'login' | 'register';

const FEATURES = [
  { icon: '↻', title: 'Subscription Detection', desc: 'MAD clustering across recurring merchant charges — finds monthly/annual billing automatically.' },
  { icon: '⚡', title: 'Anomaly Detection', desc: 'Isolation Forest on per-category baselines with 6 signal layers including velocity and time-of-day.' },
  { icon: '💧', title: 'Money Leak Detection', desc: 'Surfaces forgotten subscriptions and zombie recurring charges draining your account.' },
];

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('token');
    const email = localStorage.getItem('userEmail');
    if (token) {
      setIsAuthenticated(true);
      setUserEmail(email || '');
    }
  }, []);

  if (!mounted) return (
    <div style={{ minHeight: '100vh', background: '#FAF9F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 24, height: 24, border: '2px solid #E4E2DC', borderTopColor: '#22304A', borderRadius: '50%', animation: 'sp 0.7s linear infinite' }} />
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (activeTab === 'register' && password !== confirmPassword) {
      setError('Passwords do not match'); return;
    }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      const res = activeTab === 'login'
        ? await auth.login(email, password)
        : await auth.register(email, password);
      localStorage.setItem('token', res.token);
      localStorage.setItem('userEmail', res.user.email);
      setIsAuthenticated(true);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Show Dashboard if authenticated
  if (isAuthenticated) {
    return <Dashboard userEmail={userEmail} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FAF9F6', color: '#1C1C1A', fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif" }}>

      {/* ── Left: Brand panel ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '52px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', borderRight: '1px solid #E4E2DC', overflow: 'hidden', background: '#FAF9F6' }}>

        {/* Brand mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
          <TrendingUp size={22} color="#22304A" strokeWidth={2} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1C1C1A', letterSpacing: '-0.02em' }}>Ledgerline</div>
            <div style={{ fontSize: 11, color: '#6B6A64', marginTop: 1 }}>Applied ML for real money decisions</div>
          </div>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.07, marginBottom: 20, color: '#1C1C1A', letterSpacing: '-0.035em', maxWidth: 420 }}>
          Smarter than a<br />
          <span style={{ color: '#22304A' }}>basic tracker.</span>
        </h1>
        <p style={{ fontSize: 16, color: '#6B6A64', lineHeight: 1.7, marginBottom: 44, maxWidth: 400 }}>
          Detects subscriptions, money leaks, and anomalies automatically — trained ML models, not rules or prompts.
        </p>

        {/* Feature list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 18px', background: '#F1F0EC', borderRadius: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{f.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1C1A', marginBottom: 3 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: '#6B6A64', lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: Auth form ──────────────────────────────────────────────────── */}
      <div style={{ width: 420, flexShrink: 0, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 40px', borderLeft: '1px solid #E4E2DC' }}>
        <div style={{ width: '100%', maxWidth: 340 }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', background: '#F1F0EC', border: '1px solid #E4E2DC', borderRadius: 10, padding: 4, marginBottom: 28, gap: 4 }}>
            {(['login', 'register'] as AuthTab[]).map(t => (
              <button key={t} id={`tab-${t}`} onClick={() => { setActiveTab(t); setError(''); }}
                style={{ flex: 1, padding: '9px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s', background: activeTab === t ? '#fff' : 'transparent', color: activeTab === t ? '#1C1C1A' : '#6B6A64', boxShadow: activeTab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', fontFamily: 'inherit' }}>
                {t === 'login' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 5, color: '#1C1C1A', letterSpacing: '-0.025em' }}>
            {activeTab === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p style={{ fontSize: 13, color: '#6B6A64', marginBottom: 24, lineHeight: 1.5 }}>
            {activeTab === 'login' ? 'Sign in to your dashboard' : 'Start detecting subscriptions & anomalies'}
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6B6A64', display: 'block', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Email</label>
              <input id="email-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"
                className="input" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6B6A64', display: 'block', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Password</label>
              <input id="password-input" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="min. 6 characters" autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
                className="input" style={{ width: '100%' }} />
            </div>
            {activeTab === 'register' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6B6A64', display: 'block', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Confirm password</label>
                <input id="confirm-password-input" type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="repeat password" autoComplete="new-password"
                  className="input" style={{ width: '100%' }} />
              </div>
            )}

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(184,92,56,0.08)', border: '1px solid rgba(184,92,56,0.25)', borderRadius: 8, fontSize: 13, color: '#B85C38' }}>
                {error}
              </div>
            )}

            <button id="auth-submit-btn" type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 2, fontSize: 14 }}>
              {loading ? (
                <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'sp 0.7s linear infinite', display: 'inline-block' }} />
              ) : (
                <ArrowRight size={14} strokeWidth={2.5} />
              )}
              {loading ? (activeTab === 'login' ? 'Signing in…' : 'Creating account…') : (activeTab === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          {/* Demo hint */}
          <div style={{ marginTop: 22, padding: '12px 14px', borderRadius: 8, background: '#F1F0EC', fontSize: 12, color: '#6B6A64', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: '#1C1C1A', marginBottom: 3 }}>Demo mode — no real bank data needed</div>
            Register any account → <strong style={{ color: '#22304A' }}>Load Demo Data</strong> → <strong style={{ color: '#22304A' }}>Run Analysis</strong>
          </div>

          <style>{`
            @keyframes sp { to { transform: rotate(360deg); } }
            input:-webkit-autofill {
              -webkit-box-shadow: 0 0 0 30px #FAF9F6 inset !important;
              -webkit-text-fill-color: #1C1C1A !important;
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}
