import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { AthleteList } from './components/Athletes/AthleteList';
import { AthleteProfile } from './components/Athletes/AthleteProfile';
import { ResultsTable } from './components/Results/ResultsTable';
import { DeviceList } from './components/Devices/DeviceList';
import { Spinner } from './components/ui/Spinner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isLoggedIn ? <Navigate to="/" replace /> : <Login />
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="athletes" element={<AthleteList />} />
        <Route path="athletes/:id" element={<AthleteProfile />} />
        <Route path="results" element={<ResultsTable />} />
        <Route path="devices" element={<DeviceList />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
