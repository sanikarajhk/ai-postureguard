import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import SessionPage from './pages/SessionPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import DebugPage from './pages/DebugPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import { useAuthStore } from './store/useAuthStore.js';

// Route protection component for authenticated users
function ProtectedRoute({ children }) {
  const { isAuthenticated, isInitialized } = useAuthStore();
  const location = useLocation();

  if (!isInitialized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="w-5 h-5 rounded-full border-2 border-slate-900 border-t-transparent animate-spin"></span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// Redirects already authenticated users away from Login/Register to /
function PublicOnlyRoute({ children }) {
  const { isAuthenticated, isInitialized } = useAuthStore();

  if (!isInitialized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="w-5 h-5 rounded-full border-2 border-slate-900 border-t-transparent animate-spin"></span>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function NavBar() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuthStore();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/' || location.pathname === '/session';
    return location.pathname.startsWith(path);
  };

  const navLinkClass = (path) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
      isActive(path)
        ? 'bg-slate-100 text-slate-900 font-semibold'
        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
    }`;

  const mobileNavLinkClass = (path) =>
    `block px-3.5 py-2.5 rounded-lg text-xs font-medium transition ${
      isActive(path)
        ? 'bg-slate-100 text-slate-900 font-semibold'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
    }`;

  return (
    <header className="bg-white/95 backdrop-blur-xs border-b border-slate-200/80 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs tracking-tight shadow-xs group-hover:bg-slate-800 transition">
            P
          </div>
          <span className="font-semibold text-slate-900 tracking-tight text-sm">
            PostureGuard
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1.5">
          <Link to="/" className={navLinkClass('/')}>
            Session
          </Link>
          <Link to="/dashboard" className={navLinkClass('/dashboard')}>
            Dashboard
          </Link>
          <Link to="/reports" className={navLinkClass('/reports')}>
            Reports
          </Link>
          <Link to="/settings" className={navLinkClass('/settings')}>
            Settings
          </Link>
          <Link to="/debug" className={navLinkClass('/debug')}>
            Diagnostics
          </Link>
        </nav>

        {/* Right Desktop Auth Actions */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-600 font-medium flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center text-[11px] font-semibold">
                  {user?.name ? user.name[0].toUpperCase() : 'U'}
                </span>
                <span>{user?.name || 'Account'}</span>
              </span>
              <button
                onClick={logout}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition cursor-pointer"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition shadow-xs"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Menu Toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white px-4 py-3 space-y-1 shadow-sm">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass('/')}
          >
            Session Studio
          </Link>
          <Link
            to="/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass('/dashboard')}
          >
            Analytics Dashboard
          </Link>
          <Link
            to="/reports"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass('/reports')}
          >
            Weekly Reports
          </Link>
          <Link
            to="/settings"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass('/settings')}
          >
            Settings
          </Link>
          <Link
            to="/debug"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass('/debug')}
          >
            Diagnostics (/debug)
          </Link>

          <div className="pt-2 mt-2 border-t border-slate-100">
            {isAuthenticated ? (
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-600 font-medium">
                  Signed in as <strong>{user?.name}</strong>
                </span>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="px-3 py-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 pt-1">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 text-center py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 text-center py-2 text-xs font-medium text-white bg-slate-900 rounded-lg shadow-xs"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200/80 bg-white py-6 mt-12 text-center text-xs text-slate-400">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-[9px]">
            P
          </div>
          <span className="font-medium text-slate-600">PostureGuard</span>
          <span>— On-device posture intelligence</span>
        </div>
        <p className="text-[11px] text-slate-400">
          Privacy guarantee: Webcam video is processed locally and never stored or uploaded.
        </p>
      </div>
    </footer>
  );
}

export default function App() {
  const { loadUser } = useAuthStore();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] flex flex-col selection:bg-slate-200 font-sans">
        <NavBar />
        <main className="flex-1">
          <Routes>
            {/* Protected Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <SessionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/session"
              element={<Navigate to="/" replace />}
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />

            {/* Public Developer Diagnostics */}
            <Route path="/debug" element={<DebugPage />} />

            {/* Public-only Authentication Routes */}
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicOnlyRoute>
                  <RegisterPage />
                </PublicOnlyRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
