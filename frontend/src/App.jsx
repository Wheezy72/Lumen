import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Landing from './pages/Landing.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Scans from './pages/Scans.jsx';
import NewScan from './pages/NewScan.jsx';
import ReportView from './pages/ReportView.jsx';
import Vulnerabilities from './pages/Vulnerabilities.jsx';
import NotFound from './pages/NotFound.jsx';
import ErrorPage from './pages/ErrorPage.jsx';

axios.defaults.withCredentials = true;

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check for existing session
    const checkAuth = async () => {
      try {
        const { data } = await axios.get('/api/auth/me');
        setUser(data);
      } catch (error) {
        console.log('No active session');
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout');
      setUser(null);
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-dark-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <div className="text-white text-lg">Loading Lumen Scanner...</div>
        </div>
      </div>
    );
  }

  const isActiveRoute = (path) => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="placeholder-logo cyber-glow"></div>
              <Link 
                to="/" 
                className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent"
              >
                Lumen Scanner
              </Link>
            </div>
            
            <nav className="hidden md:flex items-center space-x-1">
              <NavLink to="/learn" isActive={isActiveRoute('/learn')}>
                Learn
              </NavLink>
              {user ? (
                <>
                  <NavLink to="/dashboard" isActive={isActiveRoute('/dashboard')}>
                    <DashboardIcon className="w-4 h-4 mr-2" />
                    Dashboard
                  </NavLink>
                  <NavLink to="/scans" isActive={isActiveRoute('/scans')}>
                    <ScanIcon className="w-4 h-4 mr-2" />
                    Scans
                  </NavLink>
                  <NavLink to="/new" isActive={isActiveRoute('/new')}>
                    <PlusIcon className="w-4 h-4 mr-2" />
                    New Scan
                  </NavLink>
                  <div className="ml-4 pl-4 border-l border-gray-300">
                    <button 
                      onClick={logout} 
                      className="btn-danger text-sm"
                    >
                      <LogoutIcon className="w-4 h-4 mr-2" />
                      Logout
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <NavLink to="/login" isActive={isActiveRoute('/login')}>
                    Login
                  </NavLink>
                  <Link to="/register" className="btn-primary ml-2">
                    Get Started
                  </Link>
                </>
              )}
            </nav>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100">
                <MenuIcon className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-fade-in">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/learn" element={<Vulnerabilities />} />
            <Route
              path="/dashboard"
              element={user ? <Dashboard /> : <Login onLogin={setUser} message="Please sign in to view the dashboard." />}
            />
            <Route
              path="/scans"
              element={user ? <Scans /> : <Login onLogin={setUser} message="Please sign in to view your scans." />}
            />
            <Route
              path="/new"
              element={user ? <NewScan /> : <Login onLogin={setUser} message="Please sign in to start a new scan." />}
            />
            <Route path="/login" element={<Login onLogin={setUser} />} />
            <Route path="/register" element={<Register onRegister={setUser} />} />
            <Route
              path="/report/:scanId"
              element={user ? <ReportView /> : <Login onLogin={setUser} message="Please sign in to view this report." />}
            />
            <Route path="/error" element={<ErrorPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center text-gray-600">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="placeholder-logo"></div>
              <span className="font-semibold">Lumen Vulnerability Scanner</span>
            </div>
            <p className="text-sm">
              Secure your applications with comprehensive vulnerability scanning
            </p>
          </div>
        </div>
      </footer>
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
          ? 'bg-primary-100 text-primary-700 shadow-soft'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      {children}
    </Link>
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
