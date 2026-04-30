import { AuthProvider, useAuth } from './lib/AuthContext';
import { DriveProvider } from './lib/DriveContext';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';

function AppContent() {
  const { user } = useAuth();
  
  return (
    <DriveProvider key={user?.uid || 'anonymous'}>
      {!user ? <AuthPage /> : <Dashboard />}
    </DriveProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
