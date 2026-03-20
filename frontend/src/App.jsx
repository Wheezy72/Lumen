import React, { useEffect, useState } from "react";
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import Landing from "./pages/Landing.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Scans from "./pages/Scans.jsx";
import Changes from "./pages/Changes.jsx";
import NewScan from "./pages/NewScan.jsx";
import ReportView from "./pages/ReportView.jsx";
import Vulnerabilities from "./pages/Vulnerabilities.jsx";
import Settings from "./pages/Settings.jsx";
import NotFound from "./pages/NotFound.jsx";
import ErrorPage from "./pages/ErrorPage.jsx";
import { useTheme } from "./theme/ThemeProvider.jsx";

axios.defaults.withCredentials = true;

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    // Check for existing session
    const checkAuth = async () => {
      try {
        const { data } = await axios.get("/api/auth/me");
        setUser(data);
      } catch {
        // No active session.
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  const logout = async () => {
    try {
      await axios.post("/api/auth/logout");
      setUser(null);
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-dark-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <div className="text-white text-lg">Loading…</div>
        </div>
      </div>
    );
  }

  const isActiveRoute = (path) => location.pathname === path;

  // On auth routes, we want full-width background (no max-width container)
  const isAuthRoute =
    location.pathname === "/login"
    || location.pathname === "/register"
    || location.pathname === "/forgot-password"
    || location.pathname === "/reset-password";

  return (
    <div className="min-h-screen app-shell text-white">
      {isAuthRoute ? (
        <div className="fixed top-5 right-5 z-50">
          <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} iconOnly />
        </div>
      ) : (
        <header className="bg-dark-200 backdrop-blur-lg border-b border-slate-800 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <>
              <div className="flex justify-between items-center h-16">
                <Link to={user ? "/dashboard" : "/"} className="flex items-center space-x-3">
                  <div className="h-9 w-9 rounded-xl overflow-hidden ring-1 ring-black/10 dark:ring-white/10 shadow-soft">
                    <img src="/logo.jpg" alt="Logo" className="h-full w-full object-cover" />
                  </div>
                  <span className="text-xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">
                    Lumen
                  </span>
                </Link>

                <div className="hidden md:flex items-center gap-2">
                  <nav className="flex items-center space-x-1">
                    <NavLink to="/learn" isActive={isActiveRoute("/learn")}>
                      Learn
                    </NavLink>

                    {user && (
                      <>
                        <NavLink to="/dashboard" isActive={isActiveRoute("/dashboard")}>
                          <DashboardIcon className="w-4 h-4 mr-1.5" />
                          Dashboard
                        </NavLink>
                        <NavLink to="/scans" isActive={isActiveRoute("/scans")}>
                          <ScanIcon className="w-4 h-4 mr-1.5" />
                          Scans
                        </NavLink>
                        <NavLink to="/changes" isActive={isActiveRoute("/changes") || isActiveRoute("/regressions")}>
                          <DiffIcon className="w-4 h-4 mr-1.5" />
                          Changes
                        </NavLink>
                        <NavLink to="/new" isActive={isActiveRoute("/new")}>
                          <PlusIcon className="w-4 h-4 mr-1.5" />
                          New Scan
                        </NavLink>
                      </>
                    )}
                  </nav>

                  <div className="mx-2 h-6 w-px bg-slate-800/70" />

                  <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} />

                  {user ? (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setProfileOpen((v) => !v)}
                        className="inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium text-gray-400 border border-slate-800 bg-dark-200 hover:bg-black/5 dark:hover:bg-slate-800 transition"
                        aria-label="Profile menu"
                      >
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary-500/15 text-primary-400 border border-primary-500/25 text-xs font-semibold">
                          {(user.username || 'U').slice(0, 1).toUpperCase()}
                        </span>
                        <span className="hidden lg:inline max-w-[110px] truncate">{user.username}</span>
                        <ChevronDown className="w-4 h-4 opacity-70" />
                      </button>

                      {profileOpen && (
                        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-800 bg-dark-200 shadow-lg overflow-hidden">
                          <Link
                            to="/settings"
                            className="block px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-black/5 dark:hover:bg-slate-800 transition"
                          >
                            Settings
                          </Link>
                          <button
                            type="button"
                            onClick={logout}
                            className="w-full text-left px-4 py-2.5 text-sm text-red-500/80 hover:bg-red-900/10 hover:text-red-400 transition"
                          >
                            Logout
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <NavLink to="/login" isActive={isActiveRoute("/login")}>
                        Login
                      </NavLink>
                      <Link to="/register" className="ml-1 px-4 py-1.5 rounded-lg text-sm font-semibold btn btn-primary">
                        Get Started
                      </Link>
                    </>
                  )}
                </div>

                {/* Mobile */}
                <div className="md:hidden flex items-center gap-2">
                  <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} iconOnly />
                  <button
                    type="button"
                    onClick={() => setMobileOpen((v) => !v)}
                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-black/5 dark:hover:bg-slate-800 transition"
                    aria-label="Toggle menu"
                  >
                    <MenuIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {mobileOpen && (
                <div className="md:hidden pb-4 pt-2 border-t border-slate-800">
                  <nav className="flex flex-col gap-1">
                    <NavLink to="/learn" isActive={isActiveRoute("/learn")}>
                      Learn
                    </NavLink>

                    {user ? (
                      <>
                        <NavLink to="/dashboard" isActive={isActiveRoute("/dashboard")}>
                          <DashboardIcon className="w-4 h-4 mr-1.5" />
                          Dashboard
                        </NavLink>
                        <NavLink to="/scans" isActive={isActiveRoute("/scans")}>
                          <ScanIcon className="w-4 h-4 mr-1.5" />
                          Scans
                        </NavLink>
                        <NavLink to="/changes" isActive={isActiveRoute("/changes") || isActiveRoute("/regressions")}>
                          <DiffIcon className="w-4 h-4 mr-1.5" />
                          Changes
                        </NavLink>
                        <NavLink to="/new" isActive={isActiveRoute("/new")}>
                          <PlusIcon className="w-4 h-4 mr-1.5" />
                          New Scan
                        </NavLink>
                        <NavLink to="/settings" isActive={isActiveRoute("/settings")}>
                          Settings
                        </NavLink>
                        <button
                          onClick={logout}
                          className="mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-500/80 border border-red-900/30 hover:bg-red-900/10 hover:border-red-700/40 transition"
                        >
                          <LogoutIcon className="w-4 h-4" />
                          Logout
                        </button>
                      </>
                    ) : (
                      <>
                        <NavLink to="/login" isActive={isActiveRoute("/login")}>
                          Login
                        </NavLink>
                        <Link to="/register" className="mt-1 btn btn-primary w-full justify-center">
                          Get Started
                        </Link>
                      </>
                    )}
                  </nav>
                </div>
              )}
            </>
          </div>
        </header>
      )}

      <main className={isAuthRoute ? "min-h-screen" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"}>
        <div className="animate-fade-in">
          <Routes>
            <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
            <Route path="/learn" element={<Vulnerabilities />} />
            <Route
              path="/dashboard"
              element={user ? <Dashboard /> : <Login onLogin={setUser} message="Please sign in to view the dashboard." />}
            />
            <Route path="/scans" element={user ? <Scans /> : <Login onLogin={setUser} message="Please sign in to view your scans." />} />
            <Route path="/changes" element={user ? <Changes /> : <Login onLogin={setUser} message="Please sign in to view changes." />} />
            {/* Alias kept for older links */}
            <Route path="/regressions" element={user ? <Changes /> : <Login onLogin={setUser} message="Please sign in to view changes." />} />
            <Route path="/new" element={user ? <NewScan /> : <Login onLogin={setUser} message="Please sign in to start a new scan." />} />
            <Route
              path="/settings"
              element={user ? <Settings user={user} onUpdateUser={setUser} /> : <Login onLogin={setUser} message="Please sign in to manage your settings." />}
            />
            <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={setUser} />} />
            <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register onRegister={setUser} />} />
            <Route path="/forgot-password" element={user ? <Navigate to="/dashboard" replace /> : <ForgotPassword />} />
            <Route path="/reset-password" element={user ? <Navigate to="/dashboard" replace /> : <ResetPassword />} />
            <Route
              path="/report/:scanId"
              element={user ? <ReportView /> : <Login onLogin={setUser} message="Please sign in to view this report." />}
            />
            <Route path="/error" element={<ErrorPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

// Navigation Link Component
function NavLink({ to, children, isActive }) {
  return (
    <Link
      to={to}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center ${
        isActive
          ? 'bg-primary-500/10 text-primary-700 dark:bg-primary-900/50 dark:text-primary-400'
          : 'text-gray-400 hover:text-white hover:bg-black/5 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </Link>
  );
}

function ThemeToggleButton({ theme, toggleTheme, iconOnly = false }) {
  const sizing = iconOnly ? "h-9 w-9 px-0" : "h-9 px-3";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center justify-center gap-2 ${sizing} rounded-lg text-sm font-medium text-gray-400 border border-slate-800 bg-dark-200 hover:bg-black/5 dark:hover:bg-slate-800 transition`}
      aria-label="Toggle theme"
      title={`Theme: ${theme}`}
    >
      {theme === "dark" ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
      {!iconOnly && <span className="hidden lg:inline">{theme === "dark" ? "Dark" : "Light"}</span>}
    </button>
  );
}

// Icon Components (Simple SVG icons)
function DashboardIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v10a2 2 0 01-2 2H10a2 2 0 01-2-2V5z" />
    </svg>
  );
}

function ScanIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function DiffIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 17h10" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l-2 2 2 2" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l2 2-2 2" />
    </svg>
  );
}

function PlusIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  );
}

function LogoutIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

function MenuIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function ChevronDown({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function SunIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364-1.414 1.414M7.05 16.95l-1.414 1.414m0-12.728 1.414 1.414m10.9 10.9 1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z"
      />
    </svg>
  );
}

function MoonIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
      />
    </svg>
  );
}
