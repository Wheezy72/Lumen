import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

const MIN_PASSWORD_LENGTH = 12;

function evaluatePassword(password) {
  const checks = {
    length: (password || '').length >= MIN_PASSWORD_LENGTH,
    lowercase: /[a-z]/.test(password || ''),
    uppercase: /[A-Z]/.test(password || ''),
    number: /\d/.test(password || ''),
    special: /[^a-zA-Z0-9]/.test(password || ''),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  // Score 0..5
  const score = passed;

  return { checks, score };
}

export default function Register({ onRegister }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    name: ''
  });
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState([]);
  const [loading, setLoading] = useState(false);

  const pwEval = useMemo(() => evaluatePassword(form.password), [form.password]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setErrorDetails([]);

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const { checks } = pwEval;
    const unmet = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([key]) => key);

    if (unmet.length) {
      setError('Password does not meet security requirements');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post('/api/auth/register', {
        username: form.username,
        password: form.password,
        email: form.email || undefined,
        name: form.name || undefined
      });

      // Pass the user data back up to App.jsx to unlock the dashboard
      if (onRegister) {
        onRegister(response.data);
      }

      navigate('/dashboard');
    } catch (err) {
      const message = err.response?.data?.error || 'Registration failed. Please try again.';
      const details = Array.isArray(err.response?.data?.details) ? err.response.data.details : [];
      setError(message);
      setErrorDetails(details);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-300 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-dark-200 border border-slate-800 rounded-lg shadow-neon p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 cyber-glow">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-primary-500">Create account</h1>
            <p className="text-gray-400 mt-2">Get started with Lumen</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm text-center">{error}</p>
              {errorDetails.length > 0 && (
                <ul className="mt-3 text-red-300 text-xs list-disc list-inside space-y-1">
                  {errorDetails.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username <span className="text-primary-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  className="input pl-10"
                  placeholder="Choose a username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Full Name <span className="text-gray-500 text-xs">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="input pl-10"
                  placeholder="Your full name"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email <span className="text-gray-500 text-xs">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="input pl-10"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password <span className="text-primary-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  className="input pl-10"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </div>

              {/* Strength meter */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                  <span>Password strength</span>
                  <span>{pwEval.score}/5</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded">
                  <div
                    className={`h-2 rounded transition-all ${
                      pwEval.score <= 2
                        ? 'bg-red-600'
                        : pwEval.score === 3
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${(pwEval.score / 5) * 100}%` }}
                  />
                </div>

                <ul className="mt-3 text-xs space-y-1">
                  <li className={pwEval.checks.length ? 'text-green-400' : 'text-gray-500'}>
                    {pwEval.checks.length ? '✓' : '•'} {MIN_PASSWORD_LENGTH}+ characters
                  </li>
                  <li className={pwEval.checks.lowercase ? 'text-green-400' : 'text-gray-500'}>
                    {pwEval.checks.lowercase ? '✓' : '•'} Lowercase letter
                  </li>
                  <li className={pwEval.checks.uppercase ? 'text-green-400' : 'text-gray-500'}>
                    {pwEval.checks.uppercase ? '✓' : '•'} Uppercase letter
                  </li>
                  <li className={pwEval.checks.number ? 'text-green-400' : 'text-gray-500'}>
                    {pwEval.checks.number ? '✓' : '•'} Number
                  </li>
                  <li className={pwEval.checks.special ? 'text-green-400' : 'text-gray-500'}>
                    {pwEval.checks.special ? '✓' : '•'} Special character
                  </li>
                </ul>

                <p className="mt-3 text-[11px] text-gray-500">
                  We also check passwords against known breached passwords (HaveIBeenPwned).
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password <span className="text-primary-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <input
                  type="password"
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  className="input pl-10"
                  placeholder="Confirm your password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 btn-primary transition disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Executing...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-center text-gray-400">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-500 hover:text-primary-400 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}