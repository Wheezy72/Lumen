import React, { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import AuthBackground from "../components/ui/AuthBackground.jsx";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await axios.post("/api/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send reset code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthBackground variant="primary" className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="relative rounded-4xl glass-strong shadow-strong p-8 overflow-hidden">
          {/* Glow halo */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-primary-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center mb-8 relative">
            <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 ring-2 ring-primary-500/30 shadow-soft">
              <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reset your password</h1>
            <p className="text-gray-400 mt-1.5 text-sm">We'll email you a 6-digit code.</p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-900/25 border border-red-500/25 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {sent ? (
            <div className="space-y-5">
              <div className="p-4 bg-emerald-900/20 border border-emerald-500/25 rounded-xl">
                <p className="text-emerald-300 text-sm text-center">
                  If that email is registered, a reset code has been sent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/reset-password?email=${encodeURIComponent(email)}`)}
                className="w-full py-3 rounded-full btn-primary font-semibold transition"
              >
                Enter reset code
              </button>
              <p className="text-center text-gray-400 text-sm">
                <Link to="/login" className="text-primary-400 hover:text-primary-300 font-semibold link-underline">Back to sign in</Link>
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 input-icon z-10">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" required autoFocus />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 rounded-full btn-primary font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? "Sending…" : "Send reset code"}
              </button>
              <p className="text-center text-gray-400 text-sm">
                <Link to="/login" className="text-primary-400 hover:text-primary-300 font-semibold link-underline">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </AuthBackground>
  );
}
