import { useState, useEffect } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { TecnicoApp } from './components/TecnicoApp';
import { SupervisorApp } from './components/SupervisorApp';
import { SuperAdmApp } from './components/SuperAdmApp';
import { loadFromBackend } from './data/store';
import { initUpdateCheck } from '@/utils/checkForUpdates';
import { usePeriodSync } from '@/hooks/usePeriodSync';

export type UserRole = 'tecnico' | 'supervisor' | 'superadm' | null;

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    // Restaurar usuário do localStorage (persistir sessão)
    const stored = localStorage.getItem('inspec360_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [backendReady, setBackendReady] = useState(false);

  // Sincronizar dados periodicamente — só depois de autenticado, já que
  // toda rota de sincronização exige um token válido.
  usePeriodSync(!!user);

  useEffect(() => {
    loadFromBackend().finally(() => setBackendReady(true));
    // Verificar atualizações periodicamente (sem fazer reload)
    initUpdateCheck();
  }, []);

  // Salvar usuário no localStorage quando mudar
  useEffect(() => {
    if (user) {
      localStorage.setItem('inspec360_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('inspec360_user');
    }
  }, [user]);

  if (!backendReady) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        height: '100vh', background: '#193A2A', gap: '16px',
      }}>
        <div style={{ color: '#AA8933', fontSize: '24px', fontWeight: 700, fontFamily: 'sans-serif' }}>
          INSPEC360
        </div>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          border: '3px solid #AA893355', borderTopColor: '#AA8933',
          animation: 'spin 0.8s linear infinite',
        }} />
        <div style={{ color: '#ffffff88', fontSize: '13px', fontFamily: 'sans-serif' }}>
          Sincronizando dados...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const handleLogin = (userData: User) => setUser(userData);
  const handleLogout = () => setUser(null);

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  function AppContent() {
    switch (user.role) {
      case 'tecnico':   return <TecnicoApp user={user} onLogout={handleLogout} />;
      case 'supervisor': return <SupervisorApp user={user} onLogout={handleLogout} />;
      case 'superadm':  return <SuperAdmApp user={user} onLogout={handleLogout} />;
      default:          return <LoginScreen onLogin={handleLogin} />;
    }
  }

  return <AppContent />;
}
