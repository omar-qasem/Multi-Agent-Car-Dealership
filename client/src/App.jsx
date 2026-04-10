import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

// ── Lazy load pages to avoid white screen on fast navigation ─────────────────
const Dashboard        = lazy(() => import('./pages/Dashboard'));
const Conversations    = lazy(() => import('./pages/Conversations'));
const Analytics        = lazy(() => import('./pages/Analytics'));
const Settings         = lazy(() => import('./pages/Settings'));
const Bookings         = lazy(() => import('./pages/Bookings'));
const CarsInventory    = lazy(() => import('./pages/CarsInventory'));
const PartsInventory   = lazy(() => import('./pages/PartsInventory'));
const Branches         = lazy(() => import('./pages/Branches'));
const SupportTickets   = lazy(() => import('./pages/SupportTickets'));
const PurchaseInquiries= lazy(() => import('./pages/PurchaseInquiries'));

// ── Loading spinner ──────────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <span className="text-gray-500 dark:text-gray-400 text-sm">جاري التحميل...</span>
    </div>
  </div>
);

// ── Error Boundary — prevents white screen ───────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-64" dir="rtl">
          <div className="text-center p-6 bg-red-50 dark:bg-red-900/20 rounded-xl max-w-md">
            <p className="text-red-600 dark:text-red-400 text-lg font-bold mb-2">حدث خطأ غير متوقع</p>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{this.state.error?.message || 'خطأ في تحميل الصفحة'}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Protected Route ──────────────────────────────────────────────────────────
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// ── Layout with sidebar ──────────────────────────────────────────────────────
const DashboardLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ${sidebarOpen ? 'lg:mr-64' : 'mr-0'}`}>
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              {children}
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
};

function AppContent() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Routes>
                  <Route path="/"              element={<Dashboard />} />
                  <Route path="/conversations" element={<Conversations />} />
                  <Route path="/analytics"     element={<Analytics />} />
                  <Route path="/settings"      element={<Settings />} />
                  <Route path="/bookings"      element={<Bookings />} />
                  <Route path="/cars"          element={<CarsInventory />} />
                  <Route path="/parts"         element={<PartsInventory />} />
                  <Route path="/branches"      element={<Branches />} />
                  <Route path="/tickets"       element={<SupportTickets />} />
                  <Route path="/inquiries"     element={<PurchaseInquiries />} />
                  <Route path="*"              element={<Navigate to="/" replace />} />
                </Routes>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
