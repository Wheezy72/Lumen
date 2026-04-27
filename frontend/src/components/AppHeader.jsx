import React from "react";
import { Link } from "react-router-dom";

import {
  BookIcon,
  ChevronDown,
  DashboardIcon,
  DiffIcon,
  LogoutIcon,
  MenuIcon,
  MoonIcon,
  PlusIcon,
  ScanIcon,
  SunIcon,
} from "./ui/Icons.jsx";

export default function AppHeader({
  user,
  theme,
  toggleTheme,
  pathname,
  mobileOpen,
  setMobileOpen,
  profileOpen,
  setProfileOpen,
  logout,
}) {
  const isActiveRoute = (path) => pathname === path;

  return (
    <header className="header-gradient-border sticky top-0 z-50 bg-white/85 dark:bg-dark-200/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">

          {/* Wordmark */}
          <Link to={user ? "/dashboard" : "/"} className="flex items-center space-x-3 group">
            <div className="h-9 w-9 rounded-xl overflow-hidden ring-2 ring-primary-500/30 shadow-soft transition group-hover:ring-primary-400/50">
              <img src="/logo.jpg" alt="Logo" className="h-full w-full object-cover" />
            </div>
            <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary-400 via-violet-400 to-teal-400 bg-clip-text text-transparent" style={{ letterSpacing: '-0.01em' }}>
              Lumen
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-2">
            <nav className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100/80 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5">
              <NavLink to="/learn" isActive={isActiveRoute("/learn")}>
                <BookIcon className="w-3.5 h-3.5 mr-1.5" />Learn
              </NavLink>

              {user && (
                <>
                  <NavLink to="/dashboard" isActive={isActiveRoute("/dashboard")}>
                    <DashboardIcon className="w-3.5 h-3.5 mr-1.5" />Dashboard
                  </NavLink>
                  <NavLink to="/scans" isActive={isActiveRoute("/scans")}>
                    <ScanIcon className="w-3.5 h-3.5 mr-1.5" />Scans
                  </NavLink>
                  <NavLink to="/changes" isActive={isActiveRoute("/changes") || isActiveRoute("/regressions")}>
                    <DiffIcon className="w-3.5 h-3.5 mr-1.5" />Changes
                  </NavLink>
                  <NavLink to="/new" isActive={isActiveRoute("/new")}>
                    <PlusIcon className="w-3.5 h-3.5 mr-1.5" />New Scan
                  </NavLink>
                </>
              )}
            </nav>

            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-white/10" />

            <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} />

            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-medium text-slate-600 dark:text-gray-400 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] transition ring-2 ring-primary-500/20 hover:ring-primary-400/35"
                  aria-label="Profile menu"
                >
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30 text-xs font-bold font-mono">
                    {(user.username || 'U').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden lg:inline max-w-[110px] truncate font-medium">{user.username}</span>
                  <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-dark-200/90 backdrop-blur-xl shadow-strong overflow-hidden" style={{ animation: 'cardEnter 0.22s cubic-bezier(0.16,1,0.3,1) both' }}>
                    <div className="px-4 py-3 border-b border-white/6">
                      <p className="text-xs text-gray-500">Signed in as</p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-gray-200 truncate font-mono">{user.username}</p>
                    </div>
                    <Link
                      to="/settings"
                      className="block px-4 py-2.5 text-sm text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5 transition"
                    >
                      Settings
                    </Link>
                    <button
                      type="button"
                      onClick={logout}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-400/80 hover:bg-red-900/10 hover:text-red-400 transition"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <NavLink to="/login" isActive={isActiveRoute("/login")}>Login</NavLink>
                <Link to="/register" className="ml-1 px-4 py-1.5 rounded-full text-sm font-semibold btn btn-primary">
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
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition"
              aria-label="Toggle menu"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden pb-4 pt-2 border-t border-white/6 animate-slide-up">
            <nav className="flex flex-col gap-1">
              <NavLink to="/learn" isActive={isActiveRoute("/learn")}>
                <BookIcon className="w-4 h-4 mr-1.5" />Learn
              </NavLink>

              {user ? (
                <>
                  <NavLink to="/dashboard" isActive={isActiveRoute("/dashboard")}>
                    <DashboardIcon className="w-4 h-4 mr-1.5" />Dashboard
                  </NavLink>
                  <NavLink to="/scans" isActive={isActiveRoute("/scans")}>
                    <ScanIcon className="w-4 h-4 mr-1.5" />Scans
                  </NavLink>
                  <NavLink to="/changes" isActive={isActiveRoute("/changes") || isActiveRoute("/regressions")}>
                    <DiffIcon className="w-4 h-4 mr-1.5" />Changes
                  </NavLink>
                  <NavLink to="/new" isActive={isActiveRoute("/new")}>
                    <PlusIcon className="w-4 h-4 mr-1.5" />New Scan
                  </NavLink>
                  <NavLink to="/settings" isActive={isActiveRoute("/settings")}>Settings</NavLink>
                  <button
                    onClick={logout}
                    className="mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-red-400/80 border border-red-900/30 hover:bg-red-900/10 hover:border-red-700/40 transition"
                  >
                    <LogoutIcon className="w-4 h-4" />Logout
                  </button>
                </>
              ) : (
                <>
                  <NavLink to="/login" isActive={isActiveRoute("/login")}>Login</NavLink>
                  <Link to="/register" className="mt-1 btn btn-primary w-full justify-center rounded-full">Get Started</Link>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

function NavLink({ to, children, isActive }) {
  return (
    <Link
      to={to}
      className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center ${
        isActive
          ? 'nav-pill-active text-primary-500 dark:text-primary-400'
          : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
      }`}
    >
      {children}
    </Link>
  );
}

export function ThemeToggleButton({ theme, toggleTheme, iconOnly = false }) {
  const sizing = iconOnly ? "h-9 w-9 px-0" : "h-9 px-3";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center justify-center gap-2 ${sizing} rounded-full text-sm font-medium text-slate-600 dark:text-gray-400 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] transition`}
      aria-label="Toggle theme"
      title={`Theme: ${theme}`}
    >
      {theme === "dark" ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
      {!iconOnly && <span className="hidden lg:inline">{theme === "dark" ? "Dark" : "Light"}</span>}
    </button>
  );
}
