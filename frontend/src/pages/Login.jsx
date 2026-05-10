import React, { useState } from "react";
import axios from "axios";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthBackground from "../components/ui/AuthBackground.jsx";
import { EyeIcon, EyeOffIcon } from "../components/ui/Icons.jsx";
import { ButtonContent } from "../components/ui/Spinner.jsx";

export default function Login({ onLogin, message }) {
  const navigate = useNavigate();
  const location = useLocation();
  const routingMessage = message || location.state?.message;

  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await axios.post("/api/auth/login", form);
      if (onLogin) onLogin(response.data);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthBackground variant="primary" className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="relative rounded-4xl glass-strong shadow-strong p-8 overflow-hidden">
          {/* Logo glow halo */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-primary-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center mb-8 relative">
            <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 ring-2 ring-primary-500/30 shadow-glow-primary">
              <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold auth-heading">Welcome back</h1>
            <p className="text-gray-400 mt-1.5 text-sm">Your workspace is waiting.</p>
          </div>

          {routingMessage && !error && (
            <div className="mb-6 p-3.5 bg-primary-900/30 border border-primary-500/25 rounded-xl">
              <p className="text-primary-400 text-sm text-center">{routingMessage}</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-3.5 bg-red-900/25 border border-red-500/25 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 input-icon z-10">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  className="input"
                  placeholder="Enter your username"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">Password</label>
                <Link to="/forgot-password" className="text-xs text-primary-500 hover:text-primary-400 font-medium link-underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 input-icon z-10">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  className="input pr-10"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition z-10"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full py-3 rounded-full btn-primary font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ButtonContent loading={loading} loadingLabel="Authenticating…">Sign in</ButtonContent>
            </button>
          </form>

          <p className="mt-6 text-center text-gray-400 text-sm">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary-400 hover:text-primary-300 font-semibold link-underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </AuthBackground>
  );
}