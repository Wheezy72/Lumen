import React from "react";
import { Link } from "react-router-dom";

import {
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
    <header className="bg-dark-200 backdrop-blur-lg border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
        </div>
    </header>
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

export function ThemeToggleButton({ theme, toggleTheme, iconOnly = false }) {
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
