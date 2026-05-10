import React, { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import AuthBackground from "../components/ui/AuthBackground.jsx";
import { EyeIcon, EyeOffIcon } from "../components/ui/Icons.jsx";
import { ButtonContent } from "../components/ui/Spinner.jsx";

export default function Register({ onRegister }) {
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: "", password: "", confirmPassword: "", email: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const checks = {
    length: form.password.length >= 8,
    lower: /[a-z]/.test(form.password),
    upper: /[A-Z]/.test(form.password),
    special: /[^A-Za-z0-9]/.test(form.password),
  };
  const allChecksPass = checks.length && checks.lower && checks.upper && checks.special;
  const showRules = pwFocused || (form.password.length > 0 && !allChecksPass);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) { setError("Passwords do not match"); return; }
    if (!allChecksPass) { setError("Password does not meet the requirements"); return; }
    setLoading(true);
    try {
      const response = await axios.post("/api/auth/register", {
        username: form.username, password: form.password, email: form.email,
      });
      if (onRegister) onRegister(response.data);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthBackground variant="secondary" className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="relative rounded-4xl glass-strong shadow-strong p-8 overflow-hidden">
          {/* Logo glow halo */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-secondary-500/15 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center mb-8 relative">
            <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 ring-2 ring-secondary-500/30 shadow-soft">
              <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold auth-heading">Create account</h1>
            <p className="text-gray-400 mt-1.5 text-sm">Ready to run your first scan.</p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-900/25 border border-red-500/25 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 input-icon z-10">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input type="text" name="username" value={form.username} onChange={handleChange} className="input" placeholder="Choose a username" required autoFocus />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 input-icon z-10">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
                <input type="email" name="email" value={form.email} onChange={handleChange} className="input" placeholder="you@example.com" required />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 input-icon z-10">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input type={showPassword ? "text" : "password"} name="password" value={form.password} onChange={handleChange} onFocus={() => setPwFocused(true)} onBlur={() => setPwFocused(false)} className="input pr-10" placeholder="Create a password" required minLength={8} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition z-10" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {showRules && (
                <div className="mt-2 rounded-xl border border-slate-800 bg-black/5 dark:bg-black/25 p-3">
                  <p className="text-xs text-gray-500 mb-2">Password must include:</p>
                  <ul className="space-y-1">
                    <PasswordRule ok={checks.length} label="At least 8 characters" />
                    <PasswordRule ok={checks.lower} label="A lowercase letter" />
                    <PasswordRule ok={checks.upper} label="An uppercase letter" />
                    <PasswordRule ok={checks.special} label="A special character" />
                  </ul>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Confirm password</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 input-icon z-10">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <input type={showConfirm ? "text" : "password"} name="confirmPassword" value={form.confirmPassword} onChange={handleChange} className="input pr-10" placeholder="Confirm your password" required minLength={8} />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition z-10" aria-label={showConfirm ? "Hide password" : "Show password"}>
                  {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full py-3 rounded-full btn-primary font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              <ButtonContent loading={loading} loadingLabel="Creating…">Create Account</ButtonContent>
            </button>
          </form>

          <p className="mt-6 text-center text-gray-400 text-sm">
            Already have an account?{" "}
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-semibold link-underline">Sign in</Link>
          </p>
        </div>
      </div>
    </AuthBackground>
  );
}

function PasswordRule({ ok, label }) {
  return (
    <li className={`flex items-center gap-2 text-xs ${ok ? 'text-emerald-400' : 'text-gray-500'}`}>
      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${ok ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-800 bg-black/5 dark:bg-black/25'}`}>
        {ok ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-gray-500/70" />
        )}
      </span>
      <span>{label}</span>
    </li>
  );
}