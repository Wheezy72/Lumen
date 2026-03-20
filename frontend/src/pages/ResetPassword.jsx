import React, { useMemo, useState } from "react";
import axios from "axios";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthBackground from "../components/ui/AuthBackground.jsx";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const query = useQuery();

  const [form, setForm] = useState({
    email: query.get("email") || "",
    code: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const checks = {
    length: form.password.length >= 8,
    lower: /[a-z]/.test(form.password),
    upper: /[A-Z]/.test(form.password),
    special: /[^A-Za-z0-9]/.test(form.password),
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!checks.length || !checks.lower || !checks.upper || !checks.special) {
      setError("Password does not meet the requirements");
      return;
    }

    setLoading(true);

    try {
      await axios.post("/api/auth/reset-password", {
        email: form.email,
        code: form.code,
        password: form.password,
      });

      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthBackground variant="secondary" className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-dark-200 border border-slate-800 rounded-lg shadow-soft p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 ring-1 ring-black/10 dark:ring-white/10 shadow-soft">
              <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Enter reset code</h1>
            <p className="text-gray-400 mt-2">Enter the 6-digit code and choose a new password.</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="input input-plain"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Reset code</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                className="input input-plain"
                placeholder="123456"
                inputMode="numeric"
                pattern="\\d{6}"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">New password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="input input-plain"
                placeholder="New password"
                required
              />

              <div className="mt-2 rounded-lg border border-slate-800 bg-black/5 dark:bg-black/25 p-3">
                <p className="text-xs text-gray-500 mb-2">Password must include:</p>
                <ul className="space-y-1">
                  <PasswordRule ok={checks.length} label="At least 8 characters" />
                  <PasswordRule ok={checks.lower} label="A lowercase letter" />
                  <PasswordRule ok={checks.upper} label="An uppercase letter" />
                  <PasswordRule ok={checks.special} label="A special character" />
                </ul>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Confirm new password</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                className="input input-plain"
                placeholder="Confirm new password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 btn-primary transition disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Resetting..." : "Reset password"}
            </button>
          </form>

          <p className="mt-6 text-center text-gray-400 text-sm">
            <Link to="/login" className="text-primary-500 hover:text-primary-400 font-medium">
              Back to sign in
            </Link>
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
