import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
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
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { useTheme } from "./theme/ThemeProvider.jsx";

import AppHeader, { ThemeToggleButton } from "./components/AppHeader.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { AppFooter } from "./components/Footer.jsx";
import BackToTop from "./components/ui/BackToTop.jsx";
import TopLoadingBar from "./components/ui/TopLoadingBar.jsx";

axios.defaults.withCredentials = true;

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const MIN_NAV_DURATION_FOR_ANIMATION = 50;
  const navTimestampRef = useRef({ prevTime: 0, currentTime: Date.now(), key: null });
  if (navTimestampRef.current.key !== location.key) {
    navTimestampRef.current = {
      prevTime: navTimestampRef.current.currentTime,
      currentTime: Date.now(),
      key: location.key,
    };
  }
  const navElapsed = navTimestampRef.current.currentTime - navTimestampRef.current.prevTime;
  const shouldAnimatePage = navElapsed > MIN_NAV_DURATION_FOR_ANIMATION;

  useEffect(() => {
    // Check for existing session
    const loadCurrentUser = async () => {
      try {
        const { data } = await axios.get("/api/auth/me");
        setUser(data);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadCurrentUser();
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
    window.scrollTo(0, 0);
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

  // On auth routes, we want full-width background (no max-width container)
  const isAuthRoute =
    location.pathname === "/login"
    || location.pathname === "/register"
    || location.pathname === "/forgot-password"
    || location.pathname === "/reset-password";

  return (
    <div className="min-h-screen app-shell text-white flex flex-col">
      <TopLoadingBar />
      {isAuthRoute ? (
        <div className="fixed top-5 right-5 z-50">
          <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} iconOnly />
        </div>
      ) : (
        <AppHeader
          user={user}
          theme={theme}
          toggleTheme={toggleTheme}
          pathname={location.pathname}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          profileOpen={profileOpen}
          setProfileOpen={setProfileOpen}
          logout={logout}
        />
      )}

      <main className={`flex-1 ${isAuthRoute ? "min-h-screen" : "max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8"}`}>
        <ErrorBoundary key={location.pathname}>
          <div key={location.key} className={shouldAnimatePage ? "animate-fade-in" : "opacity-100"}>
            <Routes>
              <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
              <Route path="/learn" element={<Vulnerabilities />} />

              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute user={user} message="Please sign in to view the dashboard.">
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/scans"
                element={
                  <ProtectedRoute user={user} message="Please sign in to view your scans.">
                    <Scans />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/changes"
                element={
                  <ProtectedRoute user={user} message="Please sign in to view changes.">
                    <Changes />
                  </ProtectedRoute>
                }
              />
              {/* Alias kept for older links */}
              <Route
                path="/regressions"
                element={
                  <ProtectedRoute user={user} message="Please sign in to view changes.">
                    <Changes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/new"
                element={
                  <ProtectedRoute user={user} message="Please sign in to start a new scan.">
                    <NewScan />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute user={user} message="Please sign in to manage your settings.">
                    <Settings user={user} onUpdateUser={setUser} />
                  </ProtectedRoute>
                }
              />

              <Route path="/login" element={<Login onLogin={setUser} />} />
              <Route path="/register" element={<Register onRegister={setUser} />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route
                path="/report/:scanId"
                element={
                  <ProtectedRoute user={user} message="Please sign in to view this report.">
                    <ReportView />
                  </ProtectedRoute>
                }
              />

              <Route path="/error" element={<ErrorPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </ErrorBoundary>
      </main>

      {!isAuthRoute && location.pathname !== '/' && <AppFooter />}

      <BackToTop />
    </div>
  );
}
